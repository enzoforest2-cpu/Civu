import "server-only";
// Executor das automações: monta a fotografia dos processos, chama o avaliador puro e aplica os disparos.
// Sem agendador: as regras rodam quando alguém aciona "rodar agora" (o agendamento fica para a fase de filas).
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { eventos, gestaoAlertas, gestaoExecucoes, gestaoRegras, processos, setores, type GestaoRegra } from "@/db/schema";
import type { SessaoUsuario } from "@/lib/auth";
import { ErroFluxo, avancar, carregarProcesso, receber, tramitar } from "@/lib/engine";
import { getEstado, type WorkflowDef } from "@/lib/workflow";
import { avaliarRegra, type Disparo, type FotoProcesso, type RegraAvaliavel } from "./avaliador";
import { registrarAuditoria } from "./auditoria";

export type ResultadoItem = {
  processoId: string;
  numero: string;
  motivo: string;
  resultado: "ALERTA_CRIADO" | "JA_ALERTADO" | "SUGERIDO" | "ENCAMINHADO" | "IGNORADO" | "FALHA";
  detalhe?: string;
};

export const RESULTADO_ROTULO: Record<ResultadoItem["resultado"], string> = {
  ALERTA_CRIADO: "Alerta criado",
  JA_ALERTADO: "Já havia alerta aberto",
  SUGERIDO: "Sugestão registrada",
  ENCAMINHADO: "Encaminhado",
  IGNORADO: "Não aplicado",
  FALHA: "Falha",
};

const TIPOS_MOVIMENTO = ["ABERTURA", "MUDANCA_ESTADO", "DEVOLUCAO", "ENVIO", "RECEBIMENTO"];

/** Fotografia dos processos do município para o avaliador. */
export async function fotografarProcessos(municipioId: string): Promise<FotoProcesso[]> {
  const ultimo = db
    .select({ processoId: eventos.processoId, em: sql<Date>`max(${eventos.criadoEm})`.as("em") })
    .from(eventos)
    .where(inArray(eventos.tipo, TIPOS_MOVIMENTO))
    .groupBy(eventos.processoId)
    .as("ult");
  const rows = await db
    .select({ p: processos, setorSigla: setores.sigla, setorNome: setores.nome, ultima: ultimo.em })
    .from(processos)
    .leftJoin(setores, eq(processos.setorAtualId, setores.id))
    .leftJoin(ultimo, eq(ultimo.processoId, processos.id))
    .where(and(eq(processos.municipioId, municipioId), isNull(processos.encerradoEm)));
  const tipos = await db.query.tiposProcesso.findMany({ where: (t, { eq }) => eq(t.municipioId, municipioId) });
  return rows.map(({ p, setorSigla, setorNome, ultima }) => {
    const tipo = tipos.find((t) => t.id === p.tipoId);
    const def = tipo?.definicao as WorkflowDef | undefined;
    const est = def ? getEstado(def, p.estadoAtual) : undefined;
    const prox = def && est?.avancos[0] ? getEstado(def, est.avancos[0].para) : undefined;
    const ex = (p.metadados as Record<string, unknown> | null)?.exigencia as { texto: string; prazo: string } | undefined;
    return {
      id: p.id,
      numero: p.numero,
      assunto: p.assunto,
      descricao: p.descricao,
      tipoChave: tipo?.chave ?? "",
      estadoAtual: p.estadoAtual,
      aguardandoDistribuicao: !!est && est.setor !== "LIVRE" && prox?.setor === "LIVRE",
      setorSigla,
      setorNome,
      encerrado: !!p.encerradoEm,
      ultimaMovimentacao: ultima ? new Date(ultima) : p.abertoEm,
      exigencia: ex ? { texto: ex.texto, prazo: new Date(ex.prazo) } : null,
    };
  });
}

export function comoAvaliavel(r: GestaoRegra): RegraAvaliavel {
  return {
    id: r.id,
    nome: r.nome,
    gatilho: r.gatilho as RegraAvaliavel["gatilho"],
    parametros: r.parametros as RegraAvaliavel["parametros"],
    acao: r.acao as RegraAvaliavel["acao"],
    acaoParametros: r.acaoParametros as RegraAvaliavel["acaoParametros"],
    nivel: r.nivel as RegraAvaliavel["nivel"],
  };
}

/** Encaminha pelo motor: distribui (se o requerimento ainda está no protocolo) e envia ao setor de destino. */
async function encaminhar(u: SessaoUsuario, regra: GestaoRegra, d: Disparo): Promise<ResultadoItem> {
  const base = { processoId: d.processoId, numero: d.numero, motivo: d.motivo };
  try {
    const destino = await db.query.setores.findFirst({ where: and(eq(setores.municipioId, u.municipioId), eq(setores.sigla, d.setorDestino!)) });
    if (!destino) return { ...base, resultado: "FALHA", detalhe: `Setor ${d.setorDestino} não existe no município.` };
    const texto = `${d.despacho?.trim() || `Encaminhado a ${destino.nome}.`} (Automação "${regra.nome}", versão ${regra.versao}, acionada por ${u.nome}.)`;
    let p = await carregarProcesso(u.municipioId, d.processoId);
    if (!p) return { ...base, resultado: "FALHA", detalhe: "Processo não encontrado." };
    if (p.estado.setor !== "LIVRE") {
      const prox = p.estado.avancos[0] ? getEstado(p.def, p.estado.avancos[0].para) : undefined;
      if (prox?.setor !== "LIVRE") return { ...base, resultado: "IGNORADO", detalhe: "Nesta etapa o processo só se movimenta pelo fluxo." };
      if (!p.recebidoEm) await receber(u, p.id);
      await avancar(u, p.id, prox.chave, texto);
      p = (await carregarProcesso(u.municipioId, d.processoId))!;
    }
    await tramitar(u, p.id, destino.id, texto);
    return { ...base, resultado: "ENCAMINHADO", detalhe: `Enviado a ${destino.nome}.` };
  } catch (e) {
    if (e instanceof ErroFluxo) return { ...base, resultado: "FALHA", detalhe: e.message };
    throw e;
  }
}

/** Avalia uma regra agora e aplica o resultado; grava a execução e a auditoria. */
export async function executarRegra(u: SessaoUsuario, regraId: string, origem: "MANUAL" | "DEMO" = "MANUAL") {
  const regra = await db.query.gestaoRegras.findFirst({ where: and(eq(gestaoRegras.id, regraId), eq(gestaoRegras.municipioId, u.municipioId)) });
  if (!regra) throw new ErroFluxo("Regra não encontrada.");
  if (!regra.ativa) throw new ErroFluxo("A regra está suspensa. Ative-a antes de rodar.");
  const fotos = await fotografarProcessos(u.municipioId);
  const { avaliados, disparos } = avaliarRegra(comoAvaliavel(regra), fotos, new Date());

  const abertos = await db
    .select({ processoId: gestaoAlertas.processoId })
    .from(gestaoAlertas)
    .where(and(eq(gestaoAlertas.regraId, regra.id), eq(gestaoAlertas.situacao, "ABERTO")));
  const jaAlertados = new Set(abertos.map((a) => a.processoId));

  const itens: ResultadoItem[] = [];
  const novosAlertas: (typeof gestaoAlertas.$inferInsert)[] = [];
  for (const d of disparos) {
    const base = { processoId: d.processoId, numero: d.numero, motivo: d.motivo };
    if (d.acao === "ENCAMINHAR" && regra.nivel === "EXECUTAR") {
      itens.push(await encaminhar(u, regra, d));
      continue;
    }
    if (jaAlertados.has(d.processoId)) {
      itens.push({ ...base, resultado: "JA_ALERTADO" });
      continue;
    }
    const sugestao = d.acao === "ENCAMINHAR";
    novosAlertas.push({
      municipioId: u.municipioId,
      regraId: regra.id,
      processoId: d.processoId,
      gravidade: d.gravidade,
      tipo: sugestao ? "SUGESTAO" : "ALERTA",
      titulo: sugestao ? `Sugestão: encaminhar ${d.numero} a ${d.setorDestino}` : d.titulo,
      detalhe: d.motivo,
    });
    itens.push({ ...base, resultado: sugestao ? "SUGERIDO" : "ALERTA_CRIADO" });
  }

  return db.transaction(async (tx) => {
    const [ex] = await tx
      .insert(gestaoExecucoes)
      .values({ municipioId: u.municipioId, regraId: regra.id, regraVersao: regra.versao, usuarioId: u.id, origem, avaliados, disparos: disparos.length, itens })
      .returning();
    if (novosAlertas.length) await tx.insert(gestaoAlertas).values(novosAlertas.map((a) => ({ ...a, execucaoId: ex.id })));
    await registrarAuditoria(
      {
        municipioId: u.municipioId,
        autorId: u.id,
        acao: "REGRA_EXECUTADA",
        objetoTipo: "REGRA",
        objetoId: regra.id,
        objetoRotulo: regra.nome,
        depois: { avaliados, disparos: disparos.length, versao: regra.versao },
        origem: "AUTOMACAO",
      },
      tx,
    );
    return ex;
  });
}

export async function listarRegras(municipioId: string) {
  return db.query.gestaoRegras.findMany({
    where: eq(gestaoRegras.municipioId, municipioId),
    orderBy: [desc(gestaoRegras.ativa), gestaoRegras.criadoEm],
    with: { execucoes: { orderBy: (e, { desc }) => [desc(e.criadoEm)], limit: 1, with: { usuario: true } } },
  });
}

export async function listarExecucoes(municipioId: string, limite = 30) {
  return db.query.gestaoExecucoes.findMany({
    where: eq(gestaoExecucoes.municipioId, municipioId),
    orderBy: desc(gestaoExecucoes.criadoEm),
    limit: limite,
    with: { regra: true, usuario: true },
  });
}

export async function alertasAbertos(municipioId: string) {
  return db.query.gestaoAlertas.findMany({
    where: and(eq(gestaoAlertas.municipioId, municipioId), eq(gestaoAlertas.situacao, "ABERTO")),
    orderBy: desc(gestaoAlertas.criadoEm),
    with: { regra: true, processo: true },
  });
}

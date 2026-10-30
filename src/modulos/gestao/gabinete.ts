import "server-only";
// Painel do prefeito: o que exige decisão do gabinete, decisão em lote pelo motor e dados do resumo semanal.
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { processos, setores } from "@/db/schema";
import type { SessaoUsuario } from "@/lib/auth";
import { confirmarSenha } from "@/lib/auth";
import { ErroFluxo, assinarDocumento, avancar, avaliarGates, carregarProcesso, despachar, feriadosDo, juntarDocumento, receber, type ProcessoCompleto } from "@/lib/engine";
import { DOCUMENTO_TIPOS, avancosDisponiveis, getEstado, nomeEtapa, type Gate, type Papel, type WorkflowDef } from "@/lib/workflow";
import { fmtData } from "@/lib/dates";
import { registrarAuditoria } from "./auditoria";
import { MODELOS, preencher } from "./modelos";

const DIA = 86400_000;

export type AcaoPrincipal = { para: string; rotulo: string; gerar: { tipo: string; nome: string; assinar: boolean }[] };

export type ItemGabinete = {
  id: string;
  numero: string;
  assunto: string;
  urgencia: string;
  etapa: string;
  tipoNome: string;
  prazo: Date | null;
  recebido: boolean;
  interessado: string | null;
  valor: number | null;
  acao: AcaoPrincipal | null;
  bloqueio: string | null;
};

/** Gates que o próprio ordenador consegue cumprir na hora (documento sem assinatura ou assinado só por ele). */
function cumprivelPeloOrdenador(g: Gate) {
  if (g.tipo !== "documento") return false;
  const exige = [...(g.assinadoPor ?? [])];
  if (exige.some((p) => p !== "ORDENADOR")) return false;
  if (g.assinadoPorQualquer?.length && !g.assinadoPorQualquer.includes("ORDENADOR")) return false;
  return true;
}

/** O que dá para fazer em lote com este processo e, se nada, por quê. */
export function analisarItem(p: ProcessoCompleto, feriados: Set<string>): { acao: AcaoPrincipal | null; bloqueio: string | null } {
  const av = avancosDisponiveis(p.def, p.estado, p.metadados as Record<string, unknown> | null)[0];
  if (!av) return { acao: null, bloqueio: "Etapa sem avanço disponível." };
  if (!p.estado.papeis.includes("ORDENADOR") && !p.estado.papeis.includes("ADMIN")) return { acao: null, bloqueio: "Etapa não é de decisão do ordenador." };
  const gerar: AcaoPrincipal["gerar"] = [];
  for (const r of avaliarGates(p, feriados)) {
    if (r.ok) continue;
    if (!cumprivelPeloOrdenador(r.gate)) return { acao: null, bloqueio: r.gate.tipo === "documento" ? `Falta ${DOCUMENTO_TIPOS[r.gate.documentoTipo] ?? r.gate.documentoTipo}: ${r.motivo.toLowerCase()}.` : r.motivo };
    const g = r.gate as Extract<Gate, { tipo: "documento" }>;
    const precisaAssinar = (g.assinadoPor ?? []).includes("ORDENADOR") || (g.assinadoPorQualquer ?? []).includes("ORDENADOR");
    gerar.push({ tipo: g.documentoTipo, nome: DOCUMENTO_TIPOS[g.documentoTipo] ?? g.documentoTipo, assinar: precisaAssinar });
  }
  return { acao: { para: av.para, rotulo: av.rotulo, gerar }, bloqueio: null };
}

/** Processos no gabinete aguardando decisão, mais urgentes e com prazo mais curto primeiro. */
export async function itensGabinete(municipioId: string): Promise<ItemGabinete[]> {
  const gab = await db.query.setores.findFirst({ where: and(eq(setores.municipioId, municipioId), eq(setores.sigla, "GAB")) });
  if (!gab) return [];
  const lista = await db.query.processos.findMany({
    where: and(eq(processos.municipioId, municipioId), eq(processos.setorAtualId, gab.id), isNull(processos.encerradoEm)),
    columns: { id: true },
  });
  const itens: ItemGabinete[] = [];
  const fer = await feriadosDo(municipioId);
  for (const { id } of lista) {
    const p = await carregarProcesso(municipioId, id);
    if (!p) continue;
    const meta = (p.metadados ?? {}) as Record<string, unknown>;
    const { acao, bloqueio } = analisarItem(p, fer);
    itens.push({
      id: p.id,
      numero: p.numero,
      assunto: p.assunto,
      urgencia: p.urgencia,
      etapa: nomeEtapa(p.estado.nome),
      tipoNome: p.tipo.nome,
      prazo: p.prazoEtapaEm,
      recebido: !!p.recebidoEm,
      interessado: typeof meta.interessado === "string" ? meta.interessado : null,
      valor: meta.valorEstimado != null ? Number(meta.valorEstimado) : null,
      acao,
      bloqueio,
    });
  }
  const peso = (u: string) => (u === "URGENTE" ? 0 : u === "PRIORITARIO" ? 1 : 2);
  return itens.sort((a, b) => peso(a.urgencia) - peso(b.urgencia) || (a.prazo?.getTime() ?? Infinity) - (b.prazo?.getTime() ?? Infinity));
}

/** Documentos juntados em outros setores que esperam a assinatura do ordenador para o processo seguir. */
export async function assinaturasPendentes(municipioId: string) {
  const tipos = await db.query.tiposProcesso.findMany({ where: (t, { eq }) => eq(t.municipioId, municipioId) });
  const lista = await db.query.processos.findMany({
    where: and(eq(processos.municipioId, municipioId), isNull(processos.encerradoEm)),
    with: { setorAtual: true, documentos: { with: { assinaturas: true } } },
  });
  const out: { id: string; numero: string; assunto: string; setor: string; documento: string; prazo: Date | null }[] = [];
  for (const p of lista) {
    const def = tipos.find((t) => t.id === p.tipoId)?.definicao as WorkflowDef | undefined;
    const est = def ? getEstado(def, p.estadoAtual) : undefined;
    if (!est || est.setor === "GAB") continue;
    for (const g of est.gates) {
      if (g.tipo !== "documento") continue;
      const exigeOrd = (g.assinadoPor ?? []).includes("ORDENADOR") || (g.assinadoPorQualquer ?? []).includes("ORDENADOR");
      if (!exigeOrd) continue;
      const doc = p.documentos.filter((d) => d.tipo === g.documentoTipo).at(-1);
      if (doc && !doc.assinaturas.some((a) => a.papel === "ORDENADOR"))
        out.push({ id: p.id, numero: p.numero, assunto: p.assunto, setor: p.setorAtual?.nome ?? "—", documento: DOCUMENTO_TIPOS[g.documentoTipo] ?? g.documentoTipo, prazo: p.prazoEtapaEm });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Decisão em lote
// ---------------------------------------------------------------------------
export type ResultadoLote = { processoId: string; numero: string; ok: boolean; mensagem: string }[];

function textoDocumento(tipo: string, p: ProcessoCompleto, u: SessaoUsuario, despacho: string) {
  const valores = {
    numero: p.numero,
    assunto: p.assunto,
    municipio: u.municipio.nome,
    data: fmtData(new Date()),
    autor: u.nome,
    cargo: u.cargo ?? "Ordenador(a) de despesa",
  };
  if (tipo === "DESPACHO_AUTORIZACAO") {
    const base = preencher(MODELOS.find((m) => m.chave === "autorizacao")!.corpo, valores).texto;
    return despacho ? base.replace("\n\n" + valores.municipio, `\n\n${despacho}\n\n${valores.municipio}`) : base;
  }
  return `${DOCUMENTO_TIPOS[tipo] ?? tipo}\n\nProcesso nº ${p.numero} — ${p.assunto}\n\n${despacho || "Decisão registrada pelo gabinete."}\n\n${u.municipio.nome}, ${valores.data}.\n\n${u.nome}\n${valores.cargo}`;
}

/**
 * Aplica a decisão a vários processos do gabinete, um a um, sempre pelo motor (receber, juntar, assinar, avançar
 * ou despachar). Exige a senha de quem decide. Cada passo vai para a trilha do processo; o lote, para a auditoria.
 */
export async function decidirEmLote(u: SessaoUsuario, input: { ids: string[]; modo: "AVANCAR" | "DESPACHAR"; texto: string; senha: string }): Promise<ResultadoLote> {
  if (!input.ids.length) throw new ErroFluxo("Selecione ao menos um processo.");
  if (input.ids.length > 30) throw new ErroFluxo("Decida no máximo 30 processos por vez.");
  if (!(await confirmarSenha(u.id, input.senha))) throw new ErroFluxo("Senha incorreta. Nada foi alterado.");
  const texto = input.texto.trim();
  if (input.modo === "DESPACHAR" && texto.length < 5) throw new ErroFluxo("Escreva o despacho.");

  const res: ResultadoLote = [];
  const fer = await feriadosDo(u.municipioId);
  for (const id of input.ids) {
    const p = await carregarProcesso(u.municipioId, id);
    if (!p) {
      res.push({ processoId: id, numero: "—", ok: false, mensagem: "Processo não encontrado." });
      continue;
    }
    if (p.setorAtual?.sigla !== "GAB") {
      res.push({ processoId: id, numero: p.numero, ok: false, mensagem: "Não está mais no gabinete." });
      continue;
    }
    try {
      if (!p.recebidoEm) await receber(u, p.id);
      if (input.modo === "DESPACHAR") {
        await despachar(u, p.id, texto);
        res.push({ processoId: id, numero: p.numero, ok: true, mensagem: "Despacho registrado." });
        continue;
      }
      const { acao, bloqueio } = analisarItem(p, fer);
      if (!acao) {
        res.push({ processoId: id, numero: p.numero, ok: false, mensagem: bloqueio ?? "Sem ação disponível." });
        continue;
      }
      for (const g of acao.gerar) {
        const doc = await juntarDocumento(u, p.id, g.tipo, `${g.nome} — ${p.numero}`, textoDocumento(g.tipo, p, u, texto));
        if (g.assinar) await assinarDocumento(u, doc.id, "ORDENADOR" as Papel);
      }
      await avancar(u, p.id, acao.para, texto || `${acao.rotulo} (decisão em lote no painel do prefeito).`);
      res.push({ processoId: id, numero: p.numero, ok: true, mensagem: `${acao.rotulo}.` });
    } catch (e) {
      if (!(e instanceof ErroFluxo)) throw e;
      res.push({ processoId: id, numero: p.numero, ok: false, mensagem: e.message });
    }
  }
  await registrarAuditoria({
    municipioId: u.municipioId,
    autorId: u.id,
    acao: "DECISAO_LOTE",
    objetoTipo: "PROCESSOS",
    objetoRotulo: res.map((r) => r.numero).join(", "),
    depois: { modo: input.modo, resultados: res.map((r) => ({ numero: r.numero, ok: r.ok, mensagem: r.mensagem })) },
    justificativa: texto || null,
  });
  return res;
}

/** Contagens semanais para o resumo (semana atual e anterior). */
export async function numerosDaSemana(municipioId: string) {
  const [r] = await db
    .select({
      abertos: sql<number>`count(*) filter (where ${processos.abertoEm} >= now() - interval '7 days')::int`,
      abertosAnterior: sql<number>`count(*) filter (where ${processos.abertoEm} >= now() - interval '14 days' and ${processos.abertoEm} < now() - interval '7 days')::int`,
      concluidos: sql<number>`count(*) filter (where ${processos.encerradoEm} >= now() - interval '7 days')::int`,
      concluidosAnterior: sql<number>`count(*) filter (where ${processos.encerradoEm} >= now() - interval '14 days' and ${processos.encerradoEm} < now() - interval '7 days')::int`,
      estoque: sql<number>`count(*) filter (where ${processos.encerradoEm} is null)::int`,
      estoqueAnterior: sql<number>`count(*) filter (where ${processos.abertoEm} <= now() - interval '7 days' and (${processos.encerradoEm} is null or ${processos.encerradoEm} > now() - interval '7 days'))::int`,
      atrasados: sql<number>`count(*) filter (where ${processos.encerradoEm} is null and ${processos.prazoEtapaEm} < now())::int`,
    })
    .from(processos)
    .where(eq(processos.municipioId, municipioId));
  const porSetor = await db
    .select({
      nome: setores.nome,
      n: sql<number>`count(*)::int`,
      atrasados: sql<number>`count(*) filter (where ${processos.prazoEtapaEm} < now())::int`,
    })
    .from(processos)
    .innerJoin(setores, eq(processos.setorAtualId, setores.id))
    .where(and(eq(processos.municipioId, municipioId), isNull(processos.encerradoEm)))
    .groupBy(setores.nome)
    .orderBy(sql`3 desc, 2 desc`)
    .limit(1);
  return { ...r, setorMaisCarregado: porSetor[0] ?? null, inicio: new Date(Date.now() - 7 * DIA), fim: new Date() };
}

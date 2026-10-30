import "server-only";
import { createHash, randomUUID } from "crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { assinaturas, documentos, eventos, feriados, processos, setores, tiposProcesso } from "@/db/schema";
import type { SessaoUsuario } from "./auth";
import { temPapel } from "./auth";
import { addDiasUteis } from "./dates";
import { FONTES, MODALIDADES, avancosDisponiveis, getEstado, type EstadoDef, type Gate, type Papel, type WorkflowDef } from "./workflow";
import {
  MIN_JUSTIFICATIVA,
  impugnacaoTempestiva,
  prazosRecurso,
  regraAvisoDispensa,
  regraImpugnacoes,
  regraModalidadeDefinida,
  regraPesquisaPrecos,
  regraPrazoEdital,
  regraRecursos,
  regraResultado,
  regraRetornoBancario,
  type AvisoDispensa,
  type Edital,
  type Impugnacao,
  type PesquisaPrecos,
  type Recurso,
  type ResultadoRegra,
  type ResultadoSessao,
  type RetornoBancario,
  type FontePreco,
} from "./regras-fluxo";
import { analisarFracionamento, sistemaTce } from "./conformidade";
import { aFrenteNaFila, cnpjValido } from "./pagamentos";

export class ErroFluxo extends Error {}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function sha256(s: string) {
  return createHash("sha256").update(s).digest("hex");
}

/** JSON canônico (chaves ordenadas) — o jsonb do Postgres reordena chaves, então o hash usa esta forma. */
function canon(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
  const o = v as Record<string, unknown>;
  return (
    "{" +
    Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => JSON.stringify(k) + ":" + canon(o[k]))
      .join(",") +
    "}"
  );
}

export async function feriadosDo(municipioId: string): Promise<Set<string>> {
  const rows = await db.select({ data: feriados.data }).from(feriados).where(eq(feriados.municipioId, municipioId));
  return new Set(rows.map((r) => String(r.data)));
}

async function setorPorSigla(tx: Tx, municipioId: string, sigla: string) {
  const s = await tx.query.setores.findFirst({ where: and(eq(setores.municipioId, municipioId), eq(setores.sigla, sigla)) });
  if (!s) throw new ErroFluxo(`Setor ${sigla} não existe neste município. Cadastre-o em Configurações.`);
  return s;
}

/** Grava um evento no livro, encadeado ao anterior por hash. */
async function registrarEvento(
  tx: Tx,
  processoId: string,
  autorId: string,
  tipo: string,
  campos: { deEstado?: string | null; paraEstado?: string | null; deSetorId?: string | null; paraSetorId?: string | null; dados?: unknown },
) {
  const ultimo = await tx.query.eventos.findFirst({ where: eq(eventos.processoId, processoId), orderBy: desc(eventos.seq) });
  const seq = (ultimo?.seq ?? 0) + 1;
  const criadoEm = new Date();
  const norm: Record<string, unknown> = {};
  if (campos.deEstado != null) norm.deEstado = campos.deEstado;
  if (campos.paraEstado != null) norm.paraEstado = campos.paraEstado;
  if (campos.deSetorId != null) norm.deSetorId = campos.deSetorId;
  if (campos.paraSetorId != null) norm.paraSetorId = campos.paraSetorId;
  if (campos.dados != null) norm.dados = campos.dados;
  const corpo = canon({ processoId, seq, tipo, autorId, ...norm, criadoEm: criadoEm.toISOString() });
  const hash = sha256((ultimo?.hash ?? "") + corpo);
  const [ev] = await tx
    .insert(eventos)
    .values({
      processoId,
      seq,
      tipo,
      autorId,
      deEstado: campos.deEstado ?? null,
      paraEstado: campos.paraEstado ?? null,
      deSetorId: campos.deSetorId ?? null,
      paraSetorId: campos.paraSetorId ?? null,
      dados: (campos.dados as object) ?? null,
      hashAnterior: ultimo?.hash ?? null,
      hash,
      criadoEm,
    })
    .returning();
  return ev;
}

/** Setor responsável por um estado, dado o processo. */
async function setorDoEstado(tx: Tx, municipioId: string, estado: EstadoDef, requisitanteSetorId: string | null, setorAtualId: string | null) {
  if (estado.setor === "LIVRE") return setorAtualId; // continua onde está até alguém tramitar
  if (estado.setor === null) return requisitanteSetorId;
  return (await setorPorSigla(tx, municipioId, estado.setor)).id;
}

// ---------------------------------------------------------------------------
// Abertura
// ---------------------------------------------------------------------------
export async function abrirProcesso(
  u: SessaoUsuario,
  input: {
    tipoId: string;
    unidadeGestoraId: string;
    assunto: string;
    descricao?: string;
    urgencia?: string;
    metadados?: Record<string, unknown>;
    /** Processo aberto por pessoa ou empresa no portal (ou em nome dela). */
    externo?: { pessoaId: string; empresaId: string | null; canal: string; nomeExibicao: string };
  },
) {
  const tipo = await db.query.tiposProcesso.findFirst({ where: and(eq(tiposProcesso.id, input.tipoId), eq(tiposProcesso.municipioId, u.municipioId)) });
  if (!tipo || !tipo.ativo) throw new ErroFluxo("Tipo de processo inválido.");
  const def = tipo.definicao as WorkflowDef;
  const inicial = getEstado(def, def.estadoInicial)!;
  const fer = await feriadosDo(u.municipioId);
  // pedido externo: o interessado é quem pediu pelo portal
  if (input.externo && !input.metadados?.interessado) input = { ...input, metadados: { ...(input.metadados ?? {}), interessado: input.externo.nomeExibicao } };

  for (const c of def.camposAbertura ?? []) {
    if (c.obrigatorio && !input.metadados?.[c.chave]) throw new ErroFluxo(`Preencha o campo "${c.rotulo}".`);
  }

  // Limite de dispensa: registra no processo a situação no momento da abertura (art. 75, §1º)
  const meta: Record<string, unknown> = { ...(input.metadados ?? {}) };
  let alertaFracionamento: Record<string, unknown> | null = null;
  if (meta.natureza && meta.modalidade === "DISPENSA_VALOR") {
    const a = await analisarFracionamento({
      municipioId: u.municipioId,
      unidadeGestoraId: input.unidadeGestoraId,
      natureza: String(meta.natureza),
      valorNovo: Number(meta.valorEstimado),
    });
    meta.fracionamento = { comprometido: a.comprometido, limite: a.limite, total: a.total, situacao: a.situacao, verificadoEm: new Date().toISOString() };
    if (a.situacao !== "ok") alertaFracionamento = { situacao: a.situacao, total: a.total, limite: a.limite, natureza: a.natureza };
  }

  return db.transaction(async (tx) => {
    const ano = new Date().getFullYear();
    // numeração sequencial por município e ano, com lock da linha do município
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${u.municipioId + ":" + ano}))`);
    const [{ max }] = await tx
      .select({ max: sql<number>`coalesce(max(${processos.sequencial}), 0)` })
      .from(processos)
      .where(and(eq(processos.municipioId, u.municipioId), eq(processos.ano, ano)));
    const sequencial = Number(max) + 1;
    const numero = `${ano}/${String(sequencial).padStart(6, "0")}`;
    const setorAtualId = await setorDoEstado(tx, u.municipioId, inicial, u.setorId, u.setorId);
    const [p] = await tx
      .insert(processos)
      .values({
        municipioId: u.municipioId,
        unidadeGestoraId: input.unidadeGestoraId,
        tipoId: tipo.id,
        ano,
        sequencial,
        numero,
        assunto: input.assunto.trim(),
        descricao: input.descricao?.trim() || null,
        urgencia: input.urgencia ?? "NORMAL",
        estadoAtual: inicial.chave,
        setorAtualId,
        recebidoEm: new Date(),
        prazoEtapaEm: inicial.slaDiasUteis > 0 ? addDiasUteis(new Date(), inicial.slaDiasUteis, fer) : null,
        abertoPorId: u.id,
        metadados: Object.keys(meta).length ? meta : null,
        interessadoPessoaId: input.externo?.pessoaId ?? null,
        interessadoEmpresaId: input.externo?.empresaId ?? null,
        canal: input.externo?.canal ?? "INTERNO",
      })
      .returning();
    const dadosAbertura: Record<string, unknown> = { numero, tipo: tipo.chave };
    if (alertaFracionamento) dadosAbertura.alertaFracionamento = alertaFracionamento;
    if (input.externo) dadosAbertura.solicitante = { pessoaId: input.externo.pessoaId, empresaId: input.externo.empresaId, nome: input.externo.nomeExibicao, canal: input.externo.canal };
    await registrarEvento(tx, p.id, u.id, "ABERTURA", { paraEstado: inicial.chave, paraSetorId: setorAtualId, dados: dadosAbertura });
    return p;
  });
}

// ---------------------------------------------------------------------------
// Consulta com contexto de workflow
// ---------------------------------------------------------------------------
export async function carregarProcesso(municipioId: string, id: string) {
  const p = await db.query.processos.findFirst({
    where: and(eq(processos.id, id), eq(processos.municipioId, municipioId)),
    with: {
      tipo: true,
      setorAtual: true,
      unidadeGestora: true,
      abertoPor: { with: { setor: true } },
      eventos: { orderBy: (e, { asc }) => [asc(e.seq)], with: { autor: true, deSetor: true, paraSetor: true } },
      documentos: { orderBy: (d, { asc }) => [asc(d.criadoEm)], with: { criadoPor: true, assinaturas: { with: { usuario: true } } } },
    },
  });
  if (!p) return null;
  const def = p.tipo.definicao as WorkflowDef;
  const estado = getEstado(def, p.estadoAtual) ?? estadoDeReserva(p.estadoAtual);
  return { ...p, def, estado };
}
export type ProcessoCompleto = NonNullable<Awaited<ReturnType<typeof carregarProcesso>>>;

/** Processo parado numa etapa que saiu do fluxo (ex.: CONTRATACAO, antes da licitação em etapas): a página abre e só o administrador mexe. */
function estadoDeReserva(chave: string): EstadoDef {
  return { chave, nome: "Etapa antiga: " + chave, papeis: ["ADMIN"], avancos: [], devolucoes: [], gates: [], setor: "LIVRE", slaDiasUteis: 0 };
}

/** Data de hoje (AAAA-MM-DD) no fuso dos municípios atendidos, para as regras de prazo. */
export function hojeIso(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Fortaleza" });
}

/*
 * Travas do tipo "regra": cada uma lê um dado guardado em processos.metadados e chama a função pura de src/lib/regras-fluxo.ts.
 * Chaves de metadados (quem grava são as ações do motor da Tarefa 3):
 *   metadados.modalidade        string (MODALIDADES)       MODALIDADE_DEFINIDA → regraModalidadeDefinida; AVISO_DISPENSA usa para saber se é DISPENSA_VALOR
 *   metadados.pesquisaPrecos    PesquisaPrecos             PESQUISA_PRECOS     → regraPesquisaPrecos
 *   metadados.edital            Edital                     PRAZO_EDITAL        → regraPrazoEdital (com feriados)
 *   metadados.impugnacoes       Impugnacao[]               IMPUGNACOES         → regraImpugnacoes (com metadados.edital e hoje)
 *   metadados.resultadoSessao   ResultadoSessao            RESULTADO_SESSAO    → regraResultado
 *   metadados.recursos          Recurso[]                  RECURSOS            → regraRecursos
 *   metadados.avisoDispensa     AvisoDispensa              AVISO_DISPENSA      → regraAvisoDispensa (com hoje e feriados)
 *   metadados.retornoBancario   RetornoBancario            RETORNO_BANCARIO    → regraRetornoBancario
 */
function avaliarRegra(regra: Extract<Gate, { tipo: "regra" }>["regra"], meta: Record<string, unknown>, feriados: Set<string>, hoje: string): ResultadoRegra {
  const modalidade = typeof meta.modalidade === "string" ? meta.modalidade : undefined;
  switch (regra) {
    case "MODALIDADE_DEFINIDA":
      return regraModalidadeDefinida(modalidade);
    case "PESQUISA_PRECOS":
      return regraPesquisaPrecos(meta.pesquisaPrecos as PesquisaPrecos | undefined);
    case "PRAZO_EDITAL":
      return regraPrazoEdital(meta.edital as Edital | undefined, feriados);
    case "IMPUGNACOES":
      return regraImpugnacoes(meta.edital as Edital | undefined, (meta.impugnacoes as Impugnacao[] | undefined) ?? [], hoje);
    case "RESULTADO_SESSAO":
      return regraResultado(meta.resultadoSessao as ResultadoSessao | undefined);
    case "RECURSOS":
      return regraRecursos((meta.recursos as Recurso[] | undefined) ?? []);
    case "AVISO_DISPENSA":
      return regraAvisoDispensa(modalidade, meta.avisoDispensa as AvisoDispensa | undefined, hoje, feriados);
    case "RETORNO_BANCARIO":
      return regraRetornoBancario(meta.retornoBancario as RetornoBancario | undefined);
    default:
      return { ok: false, motivo: `Regra desconhecida: ${String(regra)}.` };
  }
}

/** Avalia cada gate do estado atual contra os documentos juntados, os metadados e as regras de prazo (dias úteis com os feriados do município). */
export function avaliarGates(p: ProcessoCompleto, feriados: Set<string>, hoje: string = hojeIso()): { gate: Gate; ok: boolean; motivo: string }[] {
  const meta = (p.metadados ?? {}) as Record<string, unknown>;
  return p.estado.gates.map((gate) => {
    if (gate.tipo === "regra") {
      const r = avaliarRegra(gate.regra, meta, feriados, hoje);
      return { gate, ok: r.ok, motivo: r.ok ? "ok" : r.motivo };
    }
    if (gate.tipo === "campo") {
      const ok = Boolean((p.metadados as Record<string, unknown> | null)?.[gate.campo]);
      return { gate, ok, motivo: ok ? "ok" : `Campo ${gate.campo} não preenchido` };
    }
    const docs = p.documentos.filter((d) => d.tipo === gate.documentoTipo);
    if (docs.length === 0) return { gate, ok: false, motivo: "Documento não juntado" };
    const ultimo = docs[docs.length - 1];
    if (gate.assinadoPorQualquer?.length && !gate.assinadoPorQualquer.some((papel) => ultimo.assinaturas.some((a) => a.papel === papel))) {
      return { gate, ok: false, motivo: `Falta assinatura de ${gate.assinadoPorQualquer.join(" ou ")}` };
    }
    const faltam = (gate.assinadoPor ?? []).filter((papel) => !ultimo.assinaturas.some((a) => a.papel === papel));
    return faltam.length ? { gate, ok: false, motivo: `Falta assinatura: ${faltam.join(", ")}` } : { gate, ok: true, motivo: "ok" };
  });
}

/** O usuário pode agir no estado atual? (papel compatível e, se o estado é de um setor, estar nele) */
export function podeAgir(u: SessaoUsuario, p: ProcessoCompleto): boolean {
  if (temPapel(u, "ADMIN")) return true;
  if (!temPapel(u, ...p.estado.papeis)) return false;
  if (p.estado.setor === "LIVRE") return true;
  if (p.estado.setor === null) return u.setorId === p.abertoPor.setorId || u.id === p.abertoPorId;
  return p.setorAtualId === u.setorId;
}

// ---------------------------------------------------------------------------
// Transições
// ---------------------------------------------------------------------------
export async function avancar(u: SessaoUsuario, processoId: string, paraEstado: string, despacho?: string) {
  const p = await carregarProcesso(u.municipioId, processoId);
  if (!p) throw new ErroFluxo("Processo não encontrado.");
  if (p.encerradoEm) throw new ErroFluxo("Processo já encerrado.");
  if (!podeAgir(u, p)) throw new ErroFluxo("Você não tem papel para agir nesta etapa.");
  if (!p.recebidoEm) throw new ErroFluxo("Confirme o recebimento antes de movimentar.");
  const meta = (p.metadados ?? {}) as Record<string, unknown>;
  const trans = avancosDisponiveis(p.def, p.estado, meta).find((t) => t.para === paraEstado);
  if (!trans) {
    const condicional = p.estado.avancos.find((t) => t.para === paraEstado && t.quando);
    if (condicional?.quando?.campo === "modalidade") {
      const m = typeof meta.modalidade === "string" ? meta.modalidade : "";
      throw new ErroFluxo(
        !m || m === "A_DEFINIR"
          ? "Compras precisa definir a modalidade da contratação (licitação ou contratação direta) antes de seguir."
          : `Este caminho não vale para a modalidade definida: ${MODALIDADES[m] ?? m}.`,
      );
    }
    throw new ErroFluxo("Transição inválida para o estado atual.");
  }
  const fer = await feriadosDo(u.municipioId);
  const pend = avaliarGates(p, fer).filter((g) => !g.ok);
  if (pend.length)
    throw new ErroFluxo(
      "Faltam requisitos desta etapa: " + pend.map((g) => (g.gate.tipo === "documento" ? `${g.gate.documentoTipo} (${g.motivo})` : g.motivo)).join("; "),
    );
  const destino = getEstado(p.def, paraEstado)!;

  // Ordem cronológica (art. 141): pagar antes de quem foi liquidado primeiro exige justificativa, que fica pública
  let quebraOrdem: { aFrente: string[]; justificativa: string } | null = null;
  if (p.estado.filaCronologica && p.estado.avancos[0]?.para === paraEstado) {
    const pos = await aFrenteNaFila(u.municipioId, p.id);
    if (pos && pos.aFrente.length > 0) {
      const just = despacho?.trim() ?? "";
      const nums = pos.aFrente.map((x) => x.numero);
      if (just.length < 20)
        throw new ErroFluxo(
          `Há ${nums.length === 1 ? "1 pagamento liquidado" : `${nums.length} pagamentos liquidados`} antes deste na fonte ${pos.fila.fonteNome} (${nums.join(", ")}). ` +
            "Pagar fora da ordem exige justificativa de pelo menos 20 caracteres no campo de observação (Lei 14.133, art. 141, §1º). A justificativa fica pública na fila de pagamentos.",
        );
      quebraOrdem = { aFrente: nums, justificativa: just };
    }
  }

  return db.transaction(async (tx) => {
    await moverEstado(tx, u, p, destino, fer, destino.final ? "ENCERRAMENTO" : "MUDANCA_ESTADO", quebraOrdem ? { rotulo: trans.rotulo, despacho: despacho?.trim() || null, quebraOrdem } : { rotulo: trans.rotulo, despacho: despacho?.trim() || null }, { encerra: true });
  });
}

/** Move o processo para outro estado dentro de uma transação: atualiza estado, setor e prazo e grava o evento. Único lugar que faz isso. */
async function moverEstado(
  tx: Tx,
  u: SessaoUsuario,
  p: ProcessoCompleto,
  destino: EstadoDef,
  fer: Set<string>,
  tipoEvento: string,
  dados: Record<string, unknown>,
  opts: { meta?: Record<string, unknown>; encerra?: boolean } = {},
) {
  const setorDestinoId = await setorDoEstado(tx, u.municipioId, destino, p.abertoPor.setorId, p.setorAtualId);
  await tx
    .update(processos)
    .set({
      estadoAtual: destino.chave,
      setorAtualId: setorDestinoId,
      recebidoEm: setorDestinoId === p.setorAtualId ? new Date() : null,
      prazoEtapaEm: destino.slaDiasUteis > 0 ? addDiasUteis(new Date(), destino.slaDiasUteis, fer) : null,
      ...(opts.encerra ? { encerradoEm: destino.final ? new Date() : null } : {}),
      ...(opts.meta ? { metadados: opts.meta } : {}),
    })
    .where(eq(processos.id, p.id));
  await registrarEvento(tx, p.id, u.id, tipoEvento, { deEstado: p.estadoAtual, paraEstado: destino.chave, deSetorId: p.setorAtualId, paraSetorId: setorDestinoId, dados });
}

const ETAPAS_DE_LICITACAO = new Set(["IMPUGNACOES", "SESSAO_DISPUTA", "RECURSOS", "HOMOLOGADO"]);

/**
 * Ao voltar uma etapa, o que valia na rodada anterior sai de `metadados` e vai para um histórico (os eventos continuam no livro).
 * Sem isso, um edital, um resultado de sessão ou um retorno do banco antigos continuariam satisfazendo as travas da etapa nova.
 */
function limparAoDevolver(meta: Record<string, unknown>, de: string, para: string): Record<string, unknown> {
  const m = { ...meta };
  const arquivar = (chave: string, item: unknown) => {
    m[chave] = [...((m[chave] as unknown[] | undefined) ?? []), { ...(item as object), arquivadoEm: new Date().toISOString() }];
  };
  const deLicitacao = ETAPAS_DE_LICITACAO.has(de);
  if (para === "PUBLICACAO_EDITAL" && (m.edital || m.impugnacoes)) {
    // Impugnação tempestiva ainda sem resposta não some: segue para o novo ciclo e continua bloqueando IMPUGNACOES
    const todas = (m.impugnacoes as Impugnacao[] | undefined) ?? [];
    arquivar("historicoEditais", { edital: m.edital ?? null, impugnacoes: todas });
    delete m.edital;
    const pendentes = todas.filter((i) => i.tempestiva && !i.resposta?.trim());
    if (pendentes.length) m.impugnacoes = pendentes;
    else delete m.impugnacoes;
  }
  // Licitação deserta ou fracassada volta à instrução: o edital inteiro (e o que dependia dele) é refeito
  if (para === "INSTRUCAO" && deLicitacao && (m.edital || m.impugnacoes)) {
    arquivar("historicoEditais", { edital: m.edital ?? null, impugnacoes: m.impugnacoes ?? [] });
    delete m.edital;
    delete m.impugnacoes;
  }
  if (["PUBLICACAO_EDITAL", "SESSAO_DISPUTA", "INSTRUCAO"].includes(para) && deLicitacao && (m.resultadoSessao || m.recursos)) {
    arquivar("historicoSessoes", { resultadoSessao: m.resultadoSessao ?? null, recursos: m.recursos ?? [], contratacao: m.contratacao ?? null });
    delete m.resultadoSessao;
    delete m.recursos;
    m.contratacao = semVencedor(m.contratacao);
    if (m.contratacao === undefined) delete m.contratacao;
  }
  if (de === "PAGAMENTO_ENVIADO" && para === "FILA_PAGAMENTO" && m.retornoBancario) {
    arquivar("historicoRetornos", m.retornoBancario);
    delete m.retornoBancario;
  }
  return m;
}

/** Tira de `contratacao` os dados do vencedor da sessão (fornecedor, CNPJ, valor), preservando o resto (ex.: fonte). Vazio vira undefined. */
function semVencedor(contratacao: unknown): Record<string, unknown> | undefined {
  if (!contratacao || typeof contratacao !== "object") return undefined;
  const { fornecedor: _f, cnpj: _c, valor: _v, ...resto } = contratacao as Record<string, unknown>;
  void _f; void _c; void _v;
  return Object.keys(resto).length ? resto : undefined;
}

/** Refaz a análise de limite e fracionamento da dispensa por valor (art. 75, §1º), sem contar o próprio processo. */
async function analiseDispensa(u: SessaoUsuario, p: ProcessoCompleto, meta: Record<string, unknown>) {
  const a = await analisarFracionamento({
    municipioId: u.municipioId,
    unidadeGestoraId: p.unidadeGestoraId,
    natureza: String(meta.natureza),
    valorNovo: Number(meta.valorEstimado),
    excluirProcessoId: p.id,
  });
  return {
    fracionamento: { comprometido: a.comprometido, limite: a.limite, total: a.total, situacao: a.situacao, verificadoEm: new Date().toISOString() },
    alerta: a.situacao !== "ok" ? { situacao: a.situacao, total: a.total, limite: a.limite, natureza: a.natureza } : null,
  };
}

export async function devolver(u: SessaoUsuario, processoId: string, paraEstado: string, motivo: string) {
  const p = await carregarProcesso(u.municipioId, processoId);
  if (!p) throw new ErroFluxo("Processo não encontrado.");
  if (!podeAgir(u, p)) throw new ErroFluxo("Você não tem papel para agir nesta etapa.");
  const trans = p.estado.devolucoes.find((t) => t.para === paraEstado);
  if (!trans) throw new ErroFluxo("Devolução inválida para o estado atual.");
  if (trans.motivoObrigatorio && !motivo?.trim()) throw new ErroFluxo("Informe o motivo da devolução.");
  const fer = await feriadosDo(u.municipioId);
  return db.transaction(async (tx) => {
    const meta = await travarMetadados(tx, p);
    await devolverNaTx(tx, u, p, trans.para, trans.rotulo, motivo ?? "", fer, meta);
  });
}

/** Devolução dentro de uma transação já aberta (usada por `devolver` e pelas ações que devolvem como consequência). */
async function devolverNaTx(tx: Tx, u: SessaoUsuario, p: ProcessoCompleto, paraEstado: string, rotulo: string, motivo: string, fer: Set<string>, meta: Record<string, unknown>) {
  const destino = getEstado(p.def, paraEstado)!;
  const limpo = limparAoDevolver(meta, p.estadoAtual, paraEstado);
  await moverEstado(tx, u, p, destino, fer, "DEVOLUCAO", { rotulo, motivo: motivo.trim() }, { meta: limpo });
}

/** Tramitação livre: envia o processo a outro setor sem mudar de estado (estados LIVRE ou despacho interno). */
export async function tramitar(u: SessaoUsuario, processoId: string, paraSetorId: string, despacho?: string) {
  const p = await carregarProcesso(u.municipioId, processoId);
  if (!p) throw new ErroFluxo("Processo não encontrado.");
  if (p.encerradoEm) throw new ErroFluxo("Processo já encerrado.");
  if (!getEstado(p.def, p.estadoAtual) && !temPapel(u, "ADMIN"))
    throw new ErroFluxo(`Este processo está numa etapa que saiu do fluxo ("${p.estadoAtual}"). Só o administrador pode movimentá-lo: peça a ele que o reencaminhe.`);
  if (p.estado.setor !== "LIVRE" && !temPapel(u, "ADMIN", "PROTOCOLO"))
    throw new ErroFluxo("Nesta etapa o processo só se movimenta pelo fluxo (avançar ou devolver).");
  if (p.setorAtualId && p.setorAtualId !== u.setorId && !temPapel(u, "ADMIN", "PROTOCOLO")) throw new ErroFluxo("O processo não está no seu setor.");
  const destino = await db.query.setores.findFirst({ where: and(eq(setores.id, paraSetorId), eq(setores.municipioId, u.municipioId)) });
  if (!destino) throw new ErroFluxo("Setor de destino inválido.");
  const fer = await feriadosDo(u.municipioId);
  return db.transaction(async (tx) => {
    await tx
      .update(processos)
      .set({ setorAtualId: destino.id, recebidoEm: null, prazoEtapaEm: addDiasUteis(new Date(), destino.slaPadraoDias, fer) })
      .where(eq(processos.id, p.id));
    await registrarEvento(tx, p.id, u.id, "ENVIO", { deSetorId: p.setorAtualId, paraSetorId: destino.id, dados: { despacho: despacho?.trim() || null } });
  });
}

/** O setor de destino confirma o recebimento (a unidade remetente responde até lá — IN de Cruz Machado). */
export async function receber(u: SessaoUsuario, processoId: string) {
  const p = await carregarProcesso(u.municipioId, processoId);
  if (!p) throw new ErroFluxo("Processo não encontrado.");
  if (p.recebidoEm) return;
  if (p.setorAtualId !== u.setorId && !temPapel(u, "ADMIN")) throw new ErroFluxo("O processo não está no seu setor.");
  return db.transaction(async (tx) => {
    await tx.update(processos).set({ recebidoEm: new Date() }).where(eq(processos.id, p.id));
    await registrarEvento(tx, p.id, u.id, "RECEBIMENTO", { paraSetorId: p.setorAtualId });
  });
}

// ---------------------------------------------------------------------------
// Documentos e assinaturas
// ---------------------------------------------------------------------------
export async function juntarDocumento(u: SessaoUsuario, processoId: string, tipo: string, titulo: string, conteudo: string) {
  const p = await carregarProcesso(u.municipioId, processoId);
  if (!p) throw new ErroFluxo("Processo não encontrado.");
  if (p.encerradoEm) throw new ErroFluxo("Processo já encerrado.");
  if (!titulo.trim() || !conteudo.trim()) throw new ErroFluxo("Título e conteúdo são obrigatórios.");
  const versao = p.documentos.filter((d) => d.tipo === tipo).length + 1;
  const hash = sha256(conteudo);
  return db.transaction(async (tx) => {
    const [d] = await tx.insert(documentos).values({ processoId: p.id, tipo, titulo: titulo.trim(), conteudo, versao, hash, criadoPorId: u.id }).returning();
    await registrarEvento(tx, p.id, u.id, "ANEXO", { dados: { documentoId: d.id, tipo, titulo: d.titulo, versao, hash } });
    return d;
  });
}

export async function assinarDocumento(u: SessaoUsuario, documentoId: string, papel: Papel) {
  const d = await db.query.documentos.findFirst({ where: eq(documentos.id, documentoId), with: { processo: true } });
  if (!d || d.processo.municipioId !== u.municipioId) throw new ErroFluxo("Documento não encontrado.");
  if (!temPapel(u, papel)) throw new ErroFluxo(`Você não tem o papel ${papel}.`);
  const carimbo = new Date().toISOString();
  const hashAssinado = sha256(`${d.hash}|${u.cpf}|${papel}|${carimbo}`);
  return db.transaction(async (tx) => {
    await tx.insert(assinaturas).values({ documentoId: d.id, usuarioId: u.id, papel, hashAssinado, criadoEm: new Date(carimbo) });
    await registrarEvento(tx, d.processoId, u.id, "ASSINATURA", { dados: { documentoId: d.id, tipo: d.tipo, papel, hashAssinado } });
  });
}

export async function despachar(u: SessaoUsuario, processoId: string, texto: string) {
  if (!texto.trim()) throw new ErroFluxo("Escreva o despacho.");
  const p = await carregarProcesso(u.municipioId, processoId);
  if (!p) throw new ErroFluxo("Processo não encontrado.");
  return db.transaction(async (tx) => {
    await registrarEvento(tx, p.id, u.id, "DESPACHO", { dados: { texto: texto.trim() } });
  });
}

/** Dados da contratação: alimentam a fila cronológica de pagamentos e a remessa ao Tribunal de Contas. */
export async function registrarContratacao(u: SessaoUsuario, processoId: string, input: { fornecedor: string; cnpj: string; valor: string; fonte: string }) {
  if (!temPapel(u, "COMPRAS", "CONTABILIDADE", "ADMIN")) throw new ErroFluxo("Só compras ou contabilidade registram os dados da contratação.");
  const p = await carregarProcesso(u.municipioId, processoId);
  if (!p) throw new ErroFluxo("Processo não encontrado.");
  if (p.encerradoEm) throw new ErroFluxo("Processo já encerrado.");
  const fornecedor = input.fornecedor.trim();
  const cnpj = input.cnpj.replace(/\D/g, "");
  const valor = Number(String(input.valor).replace(/\./g, "").replace(",", "."));
  if (fornecedor.length < 3) throw new ErroFluxo("Informe a razão social do fornecedor.");
  if (!cnpjValido(cnpj)) throw new ErroFluxo("CNPJ inválido. Confira os 14 dígitos.");
  if (!Number.isFinite(valor) || valor <= 0) throw new ErroFluxo("Informe o valor contratado.");
  if (!FONTES[input.fonte]) throw new ErroFluxo("Escolha a fonte de recurso.");
  const contratacao = { fornecedor, cnpj, valor: valor.toFixed(2), fonte: input.fonte };
  const meta = { ...((p.metadados ?? {}) as Record<string, unknown>), contratacao };
  return db.transaction(async (tx) => {
    await tx.update(processos).set({ metadados: meta }).where(eq(processos.id, p.id));
    await registrarEvento(tx, p.id, u.id, "DADOS_CONTRATACAO", { dados: contratacao });
  });
}

/** Registra o envio da contratação ao sistema do Tribunal de Contas, com o número do recibo. */
export async function registrarRemessaTce(u: SessaoUsuario, processoId: string, recibo: string) {
  if (!temPapel(u, "COMPRAS", "CONTROLE_INTERNO", "ADMIN")) throw new ErroFluxo("Só compras ou controle interno registram a remessa ao TCE.");
  const p = await carregarProcesso(u.municipioId, processoId);
  if (!p) throw new ErroFluxo("Processo não encontrado.");
  if (!recibo.trim()) throw new ErroFluxo("Informe o número do recibo ou protocolo do envio.");
  if (p.eventos.some((e) => e.tipo === "REMESSA_TCE")) throw new ErroFluxo("A remessa deste processo já foi registrada.");
  const mun = await db.query.municipios.findFirst({ where: (m, { eq }) => eq(m.id, u.municipioId) });
  const sistema = sistemaTce(mun?.uf ?? "", mun?.tce).nome;
  return db.transaction(async (tx) => {
    await registrarEvento(tx, p.id, u.id, "REMESSA_TCE", { dados: { sistema, recibo: recibo.trim() } });
  });
}

// ---------------------------------------------------------------------------
// Atendimento externo: pedidos do portal e exigências ao interessado
// ---------------------------------------------------------------------------

/** CPF reservado do usuário de sistema que registra o que chega pelos canais digitais. */
export const CPF_ATENDIMENTO_DIGITAL = "00000000000";

/** Usuário de sistema do município ("Atendimento digital"): autor técnico dos registros feitos pelo portal. */
export async function usuarioAtendimentoDigital(municipioId: string): Promise<SessaoUsuario> {
  const u = await db.query.usuarios.findFirst({
    where: (x, { and, eq }) => and(eq(x.municipioId, municipioId), eq(x.cpf, CPF_ATENDIMENTO_DIGITAL)),
    with: { setor: true, municipio: true },
  });
  if (!u) throw new ErroFluxo("Atendimento digital não configurado neste município.");
  return {
    id: u.id,
    nome: u.nome,
    cpf: u.cpf,
    email: u.email,
    cargo: u.cargo,
    papeis: u.papeis as Papel[],
    setorId: u.setorId,
    setor: u.setor ? { id: u.setor.id, sigla: u.setor.sigla, nome: u.setor.nome } : null,
    municipioId: u.municipioId,
    municipio: { id: u.municipio.id, nome: u.municipio.nome, uf: u.municipio.uf, slug: u.municipio.slug },
  };
}

/** Pedido feito no portal: abre o processo em nome da pessoa ou da empresa ativa. */
export async function abrirProcessoExterno(
  municipioId: string,
  externo: { pessoaId: string; empresaId: string | null; nomeExibicao: string; canal?: string },
  input: { tipoChave: string; assunto: string; descricao?: string; metadados?: Record<string, unknown>; urgencia?: string; ugCodigo?: string },
) {
  const sys = await usuarioAtendimentoDigital(municipioId);
  const tipo = await db.query.tiposProcesso.findFirst({
    where: (t, { and, eq }) => and(eq(t.municipioId, municipioId), eq(t.chave, input.tipoChave), eq(t.ativo, true)),
  });
  if (!tipo) throw new ErroFluxo("Este serviço não está disponível no município.");
  const ug = await db.query.unidadesGestoras.findFirst({ where: (g, { and, eq }) => and(eq(g.municipioId, municipioId), eq(g.codigo, input.ugCodigo ?? "01")) });
  if (!ug) throw new ErroFluxo("Unidade gestora não encontrada.");
  return abrirProcesso(sys, {
    tipoId: tipo.id,
    unidadeGestoraId: ug.id,
    assunto: input.assunto,
    descricao: input.descricao,
    urgencia: input.urgencia,
    metadados: input.metadados,
    externo: { ...externo, canal: externo.canal ?? "PORTAL" },
  });
}

export type Exigencia = { texto: string; prazo: string; abertaEm: string; autor: string };

/** O servidor pede ao interessado um complemento (documento ou informação), com prazo. */
export async function abrirExigencia(u: SessaoUsuario, processoId: string, texto: string, prazoDiasUteis: number) {
  const p = await carregarProcesso(u.municipioId, processoId);
  if (!p) throw new ErroFluxo("Processo não encontrado.");
  if (!p.interessadoPessoaId && !p.interessadoEmpresaId) throw new ErroFluxo("Este processo não tem interessado externo.");
  if (p.setorAtualId !== u.setorId && !temPapel(u, "ADMIN", "PROTOCOLO")) throw new ErroFluxo("O processo não está no seu setor.");
  if (!texto.trim()) throw new ErroFluxo("Escreva o que o interessado precisa enviar.");
  const fer = await feriadosDo(u.municipioId);
  const exig: Exigencia = { texto: texto.trim(), prazo: addDiasUteis(new Date(), Math.max(1, prazoDiasUteis), fer).toISOString(), abertaEm: new Date().toISOString(), autor: u.nome };
  const meta = { ...((p.metadados ?? {}) as Record<string, unknown>), exigencia: exig };
  return db.transaction(async (tx) => {
    await tx.update(processos).set({ metadados: meta }).where(eq(processos.id, p.id));
    await registrarEvento(tx, p.id, u.id, "EXIGENCIA", { dados: exig });
  });
}

/** O interessado responde a exigência pelo portal. Quem pode responder é checado por quem chama (sessão do portal). */
export async function responderExigencia(municipioId: string, processoId: string, resposta: { texto: string; pessoaId: string; nome: string }) {
  const p = await carregarProcesso(municipioId, processoId);
  if (!p) throw new ErroFluxo("Processo não encontrado.");
  const meta = { ...((p.metadados ?? {}) as Record<string, unknown>) };
  if (!meta.exigencia) throw new ErroFluxo("Não há pendência aberta neste processo.");
  if (!resposta.texto.trim()) throw new ErroFluxo("Escreva a resposta.");
  delete meta.exigencia;
  const sys = await usuarioAtendimentoDigital(municipioId);
  return db.transaction(async (tx) => {
    await tx.update(processos).set({ metadados: meta }).where(eq(processos.id, p.id));
    await registrarEvento(tx, p.id, sys.id, "RESPOSTA_EXIGENCIA", { dados: { texto: resposta.texto.trim(), pessoaId: resposta.pessoaId, nome: resposta.nome } });
  });
}

// ---------------------------------------------------------------------------
// Ações das etapas da contratação (licitação, contratação direta e pagamento)
// Cada ação checa papel e etapa, lê e grava `metadados` com a linha do processo travada
// e registra o evento na mesma transação. Quem lê as chaves são as travas de `avaliarRegra`.
// ---------------------------------------------------------------------------

/** Trava a linha do processo, confere que ele continua onde estava e devolve os metadados atuais (evita perder gravação concorrente). */
async function travarMetadados(tx: Tx, p: ProcessoCompleto): Promise<Record<string, unknown>> {
  const [atual] = await tx
    .select({ estado: processos.estadoAtual, setor: processos.setorAtualId, meta: processos.metadados })
    .from(processos)
    .where(eq(processos.id, p.id))
    .for("update");
  if (!atual || atual.estado !== p.estadoAtual || atual.setor !== p.setorAtualId)
    throw new ErroFluxo("O processo mudou de etapa enquanto você trabalhava. Recarregue a página e tente de novo.");
  return { ...((atual.meta as Record<string, unknown> | null) ?? {}) };
}

type CtxAcao = { tx: Tx; p: ProcessoCompleto; meta: Record<string, unknown>; fer: Set<string> };

async function agirNoProcesso<T>(u: SessaoUsuario, processoId: string, estados: string[], fn: (c: CtxAcao) => Promise<T>): Promise<T> {
  const p = await carregarProcesso(u.municipioId, processoId);
  if (!p) throw new ErroFluxo("Processo não encontrado.");
  if (p.encerradoEm) throw new ErroFluxo("Processo já encerrado.");
  if (!podeAgir(u, p)) throw new ErroFluxo("Você não tem papel para agir nesta etapa.");
  if (!estados.includes(p.estadoAtual)) {
    const nomes = estados.map((e) => getEstado(p.def, e)?.nome ?? e).join(" ou ");
    throw new ErroFluxo(`Esta ação só vale na etapa ${nomes}. O processo está em "${p.estado.nome}".`);
  }
  const fer = await feriadosDo(u.municipioId);
  return db.transaction(async (tx) => {
    const meta = await travarMetadados(tx, p);
    return fn({ tx, p, meta, fer });
  });
}

async function gravarMeta(tx: Tx, processoId: string, meta: Record<string, unknown>) {
  await tx.update(processos).set({ metadados: meta }).where(eq(processos.id, processoId));
}

function dataIso(v: unknown, rotulo: string): string {
  const s = typeof v === "string" ? v.trim() : "";
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + "T12:00:00Z") : null;
  if (!d || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) throw new ErroFluxo(`${rotulo}: informe uma data válida no formato AAAA-MM-DD.`);
  return s;
}

function texto(v: unknown, rotulo: string, min = 1): string {
  const s = typeof v === "string" ? v.trim() : "";
  if (s.length < min) throw new ErroFluxo(min > 1 ? `${rotulo}: escreva pelo menos ${min} caracteres.` : `Preencha: ${rotulo}.`);
  return s;
}

function mediana(valores: number[]): number {
  const v = [...valores].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return Math.round((v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2) * 100) / 100;
}

/** Compras define a forma de contratação (licitação ou direta); a escolha fica justificada no livro. */
export async function definirModalidade(u: SessaoUsuario, processoId: string, modalidade: string, justificativa: string) {
  if (!MODALIDADES[modalidade] || modalidade === "A_DEFINIR") throw new ErroFluxo("Escolha a modalidade: licitação, dispensa por valor ou outra contratação direta.");
  const just = texto(justificativa, "Justificativa da modalidade", MIN_JUSTIFICATIVA);
  return agirNoProcesso(u, processoId, ["INSTRUCAO"], async ({ tx, p, meta }) => {
    const anterior = typeof meta.modalidade === "string" ? meta.modalidade : null;
    const novo: Record<string, unknown> = { ...meta, modalidade, modalidadeJustificativa: just };
    const dados: Record<string, unknown> = { de: anterior, para: modalidade, justificativa: just };
    // Dispensa por valor: refaz a análise de limite e fracionamento (art. 75, §1º), como na abertura, sem contar este processo duas vezes
    if (modalidade === "DISPENSA_VALOR" && meta.natureza) {
      const r = await analiseDispensa(u, p, meta);
      novo.fracionamento = r.fracionamento;
      if (r.alerta) dados.alertaFracionamento = r.alerta;
    } else {
      delete novo.fracionamento;
    }
    await gravarMeta(tx, p.id, novo);
    await registrarEvento(tx, p.id, u.id, "MODALIDADE", { dados });
  });
}

/** Registra as fontes da pesquisa de preços (art. 23) e recalcula o valor estimado como a mediana delas. */
export async function registrarPesquisaPrecos(u: SessaoUsuario, processoId: string, input: PesquisaPrecos) {
  const fontes: FontePreco[] = (input.fontes ?? []).map((f, i) => {
    const valor = Number(f.valor);
    if (!Number.isFinite(valor) || valor <= 0) throw new ErroFluxo(`Fonte ${i + 1}: informe o valor pesquisado, maior que zero.`);
    return { fonte: texto(f.fonte, `Nome da fonte ${i + 1}`), data: dataIso(f.data, `Data da fonte ${i + 1}`), valor };
  });
  const justificativa = input.justificativa?.trim() || undefined;
  return agirNoProcesso(u, processoId, ["INSTRUCAO"], async ({ tx, p, meta }) => {
    const pesquisa: PesquisaPrecos = { fontes, ...(justificativa ? { justificativa } : {}) };
    const novo: Record<string, unknown> = { ...meta, pesquisaPrecos: pesquisa };
    let valorEstimado: string | null = null;
    let alertaFracionamento: unknown = null;
    if (fontes.length) {
      valorEstimado = mediana(fontes.map((f) => f.valor)).toFixed(2);
      novo.valorEstimado = valorEstimado;
      // O valor estimado mudou: numa dispensa por valor o limite e o fracionamento são conferidos de novo
      if (meta.modalidade === "DISPENSA_VALOR" && meta.natureza) {
        const r = await analiseDispensa(u, p, novo);
        novo.fracionamento = r.fracionamento;
        alertaFracionamento = r.alerta;
      }
    }
    await gravarMeta(tx, p.id, novo);
    await registrarEvento(tx, p.id, u.id, "PESQUISA_PRECOS", {
      dados: { ...pesquisa, valorEstimado, valorEstimadoAnterior: meta.valorEstimado ?? null, ...(alertaFracionamento ? { alertaFracionamento } : {}) },
    });
  });
}

/** Publica (ou corrige) o edital. Só passa se a abertura respeitar o prazo mínimo do art. 55. */
export async function publicarEdital(u: SessaoUsuario, processoId: string, input: Edital) {
  return agirNoProcesso(u, processoId, ["PUBLICACAO_EDITAL"], async ({ tx, p, meta, fer }) => {
    const edital: Edital = {
      numero: texto(input.numero, "Número do edital"),
      tipoObjeto: input.tipoObjeto,
      publicadoEm: dataIso(input.publicadoEm, "Data de publicação"),
      aberturaEm: dataIso(input.aberturaEm, "Data de abertura"),
      plataforma: texto(input.plataforma, "Plataforma de publicação"),
    };
    const r = regraPrazoEdital(edital, fer);
    if (!r.ok) throw new ErroFluxo(r.motivo);
    // Republicação: o prazo é novo, então a publicação precisa ser posterior à do edital arquivado
    const arquivado = [...((meta.historicoEditais as { edital: Edital | null }[] | undefined) ?? [])].reverse().find((h) => h.edital)?.edital;
    if (arquivado && edital.publicadoEm <= arquivado.publicadoEm) {
      const [ano, mes, dia] = arquivado.publicadoEm.split("-");
      throw new ErroFluxo(`Republicação com prazo novo: informe uma data de publicação posterior à do edital anterior (${dia}/${mes}/${ano}).`);
    }
    const anterior = (meta.edital as Edital | undefined)?.numero ?? null;
    // A abertura pode ter mudado: a tempestividade das impugnações registradas é recalculada
    const impugnacoes = ((meta.impugnacoes as Impugnacao[] | undefined) ?? []).map((i) => ({ ...i, tempestiva: impugnacaoTempestiva(i.recebidaEm, edital.aberturaEm, fer) }));
    await gravarMeta(tx, p.id, { ...meta, edital, ...(impugnacoes.length ? { impugnacoes } : {}) });
    await registrarEvento(tx, p.id, u.id, "EDITAL", { dados: { ...edital, substitui: anterior } });
  });
}

/** Registra uma impugnação recebida; a tempestividade (3 dias úteis antes da abertura, art. 164) é calculada aqui. */
export async function registrarImpugnacao(u: SessaoUsuario, processoId: string, input: { autor: string; texto: string; recebidaEm: string }) {
  return agirNoProcesso(u, processoId, ["PUBLICACAO_EDITAL", "IMPUGNACOES"], async ({ tx, p, meta, fer }) => {
    const edital = meta.edital as Edital | undefined;
    if (!edital) throw new ErroFluxo("Publique o edital antes de registrar impugnações.");
    const recebidaEm = dataIso(input.recebidaEm, "Data de recebimento");
    const imp: Impugnacao = {
      id: randomUUID(),
      autor: texto(input.autor, "Autor da impugnação"),
      texto: texto(input.texto, "Texto da impugnação"),
      recebidaEm,
      tempestiva: impugnacaoTempestiva(recebidaEm, edital.aberturaEm, fer),
    };
    const lista = [...((meta.impugnacoes as Impugnacao[] | undefined) ?? []), imp];
    await gravarMeta(tx, p.id, { ...meta, impugnacoes: lista });
    await registrarEvento(tx, p.id, u.id, "IMPUGNACAO", { dados: imp });
  });
}

/** Responde uma impugnação. Se for acolhida e mudar as propostas, o edital volta a ser publicado com prazo novo. */
export async function responderImpugnacao(u: SessaoUsuario, processoId: string, id: string, r: { resposta: string; acolhida: boolean; alteraPropostas: boolean }) {
  return agirNoProcesso(u, processoId, ["PUBLICACAO_EDITAL", "IMPUGNACOES"], async ({ tx, p, meta, fer }) => {
    const lista = (meta.impugnacoes as Impugnacao[] | undefined) ?? [];
    const alvo = lista.find((i) => i.id === id);
    if (!alvo) throw new ErroFluxo("Impugnação não encontrada neste processo. Atualize a página e escolha outra.");
    if (alvo.resposta?.trim()) throw new ErroFluxo("Esta impugnação já foi respondida.");
    const resposta = texto(r.resposta, "Resposta à impugnação");
    const respondida: Impugnacao = { ...alvo, resposta, acolhida: !!r.acolhida, alteraPropostas: !!r.acolhida && !!r.alteraPropostas, respondidaEm: hojeIso() };
    const novo = { ...meta, impugnacoes: lista.map((i) => (i.id === id ? respondida : i)) };
    await registrarEvento(tx, p.id, u.id, "RESPOSTA_IMPUGNACAO", {
      dados: { id, autor: alvo.autor, tempestiva: alvo.tempestiva, resposta, acolhida: respondida.acolhida, alteraPropostas: respondida.alteraPropostas },
    });
    if (!(respondida.acolhida && respondida.alteraPropostas)) return gravarMeta(tx, p.id, novo);
    // Acolhida com mudança nas propostas: o edital e as impugnações vão para o histórico e a publicação é refeita
    const motivo = "Impugnação acolhida: republicar o edital com prazo novo";
    if (p.estadoAtual === "IMPUGNACOES") return devolverNaTx(tx, u, p, "PUBLICACAO_EDITAL", "Republicar o edital", motivo, fer, novo);
    await gravarMeta(tx, p.id, limparAoDevolver(novo, p.estadoAtual, "PUBLICACAO_EDITAL"));
  });
}

/** Resultado da sessão pública. Com vencedor, os dados dele já preenchem a contratação. */
export async function registrarResultadoSessao(u: SessaoUsuario, processoId: string, input: ResultadoSessao) {
  if (!["VENCEDOR", "DESERTA", "FRACASSADA"].includes(input.situacao)) throw new ErroFluxo("Escolha a situação da sessão: vencedor, deserta ou fracassada.");
  const ataEm = dataIso(input.ataEm, "Data da ata");
  let resultado: ResultadoSessao = { situacao: input.situacao, ataEm };
  if (input.situacao === "VENCEDOR") {
    const cnpj = String(input.cnpj ?? "").replace(/\D/g, "");
    const valor = Number(input.valor);
    if (!cnpjValido(cnpj)) throw new ErroFluxo("CNPJ do vencedor inválido. Confira os 14 dígitos.");
    if (!Number.isFinite(valor) || valor <= 0) throw new ErroFluxo("Informe o valor da proposta vencedora, maior que zero.");
    resultado = { situacao: "VENCEDOR", fornecedor: texto(input.fornecedor, "Razão social do vencedor", 3), cnpj, valor, ataEm };
  }
  return agirNoProcesso(u, processoId, ["SESSAO_DISPUTA"], async ({ tx, p, meta }) => {
    const novo: Record<string, unknown> = { ...meta, resultadoSessao: resultado };
    if (resultado.situacao === "VENCEDOR") {
      const atual = (meta.contratacao as Record<string, unknown> | undefined) ?? {};
      novo.contratacao = { ...atual, fornecedor: resultado.fornecedor, cnpj: resultado.cnpj, valor: Number(resultado.valor).toFixed(2) };
    } else {
      // Sem vencedor: o vencedor de um resultado anterior deixa de valer
      const resto = semVencedor(meta.contratacao);
      if (resto) novo.contratacao = resto;
      else delete novo.contratacao;
    }
    await gravarMeta(tx, p.id, novo);
    await registrarEvento(tx, p.id, u.id, "RESULTADO_SESSAO", { dados: { ...resultado } });
  });
}

/** Intenção de recurso do licitante (art. 165): calcula os prazos de razões e contrarrazões. */
export async function registrarRecurso(u: SessaoUsuario, processoId: string, input: { recorrente: string; intencaoEm: string }) {
  return agirNoProcesso(u, processoId, ["SESSAO_DISPUTA", "RECURSOS"], async ({ tx, p, meta, fer }) => {
    if ((meta.resultadoSessao as ResultadoSessao | undefined)?.situacao !== "VENCEDOR") throw new ErroFluxo("Registre o resultado da sessão com vencedor antes de registrar recursos.");
    const intencaoEm = dataIso(input.intencaoEm, "Data da intenção de recorrer");
    const rec: Recurso = { id: randomUUID(), recorrente: texto(input.recorrente, "Nome do recorrente"), intencaoEm, ...prazosRecurso(intencaoEm, fer) };
    await gravarMeta(tx, p.id, { ...meta, recursos: [...((meta.recursos as Recurso[] | undefined) ?? []), rec] });
    await registrarEvento(tx, p.id, u.id, "RECURSO", { dados: rec });
  });
}

/** Decisão do recurso. Recurso provido devolve o processo à sessão para refazer o julgamento (art. 165). */
export async function decidirRecurso(u: SessaoUsuario, processoId: string, id: string, d: { decisao: string; provido: boolean }) {
  return agirNoProcesso(u, processoId, ["RECURSOS"], async ({ tx, p, meta, fer }) => {
    const lista = (meta.recursos as Recurso[] | undefined) ?? [];
    const alvo = lista.find((r) => r.id === id);
    if (!alvo) throw new ErroFluxo("Recurso não encontrado neste processo. Atualize a página e escolha outro.");
    if (alvo.decididoEm) throw new ErroFluxo("Este recurso já foi decidido.");
    const decisao = texto(d.decisao, "Decisão do recurso");
    const decidido: Recurso = { ...alvo, decisao, provido: !!d.provido, decididoEm: hojeIso() };
    const novo = { ...meta, recursos: lista.map((r) => (r.id === id ? decidido : r)) };
    await registrarEvento(tx, p.id, u.id, "DECISAO_RECURSO", { dados: { id, recorrente: alvo.recorrente, decisao, provido: decidido.provido } });
    // Recurso provido: o julgamento é refeito; a rodada anterior vai para o histórico
    if (decidido.provido) return devolverNaTx(tx, u, p, "SESSAO_DISPUTA", "Recurso provido: refazer o julgamento", "Recurso provido: refazer o julgamento", fer, novo);
    await gravarMeta(tx, p.id, novo);
  });
}

/** Aviso de contratação direta por dispensa de valor (art. 75, §3º), ou justificativa de por que não houve aviso. */
export async function publicarAvisoDispensa(u: SessaoUsuario, processoId: string, input: AvisoDispensa) {
  const publicadoEm = input.publicadoEm?.trim() ? dataIso(input.publicadoEm, "Data de publicação do aviso") : undefined;
  const justificativaSemAviso = input.justificativaSemAviso?.trim() || undefined;
  if (!publicadoEm && !justificativaSemAviso) throw new ErroFluxo(`Informe a data de publicação do aviso ou uma justificativa de pelo menos ${MIN_JUSTIFICATIVA} caracteres.`);
  if (justificativaSemAviso && justificativaSemAviso.length < MIN_JUSTIFICATIVA) throw new ErroFluxo(`Justificativa: escreva pelo menos ${MIN_JUSTIFICATIVA} caracteres.`);
  return agirNoProcesso(u, processoId, ["INSTRUCAO_DIRETA"], async ({ tx, p, meta }) => {
    const aviso: AvisoDispensa = { ...(publicadoEm ? { publicadoEm } : {}), ...(justificativaSemAviso ? { justificativaSemAviso } : {}) };
    await gravarMeta(tx, p.id, { ...meta, avisoDispensa: aviso });
    await registrarEvento(tx, p.id, u.id, "AVISO_DISPENSA", { dados: { ...aviso } });
  });
}

/**
 * Retorno do banco sobre o pagamento enviado. Aceito: o processo vai a PAGO. Rejeitado: volta à fila de pagamentos com o motivo,
 * a rejeição sai de `metadados.retornoBancario` (vai para `historicoRetornos`) e o reenvio começa limpo. A posição na fila não muda:
 * ela vem da data da liquidação, não da data da devolução (ver `filaDePagamentos`).
 */
export async function registrarRetornoBancario(u: SessaoUsuario, processoId: string, input: { aceito: boolean; autenticacao?: string; motivo?: string }) {
  const p0 = await carregarProcesso(u.municipioId, processoId);
  if (p0 && !p0.encerradoEm && p0.estadoAtual !== "PAGAMENTO_ENVIADO" && podeAgir(u, p0))
    throw new ErroFluxo("O retorno do banco só se registra com o pagamento enviado. Este processo não está aguardando retorno: se o pagamento já foi confirmado ou devolvido à fila, não há o que registrar.");
  return agirNoProcesso(u, processoId, ["PAGAMENTO_ENVIADO"], async ({ tx, p, meta, fer }) => {
    if (meta.retornoBancario) throw new ErroFluxo("Já existe retorno do banco para este envio.");
    const retorno: RetornoBancario = { aceito: !!input.aceito, em: new Date().toISOString() };
    if (input.aceito) {
      if (input.autenticacao?.trim()) retorno.autenticacao = input.autenticacao.trim();
    } else {
      retorno.motivo = texto(input.motivo, "Motivo da recusa do banco");
    }
    await registrarEvento(tx, p.id, u.id, "RETORNO_BANCARIO", { dados: { ...retorno } });
    if (retorno.aceito) {
      const pago = getEstado(p.def, "PAGO")!;
      return moverEstado(tx, u, p, pago, fer, "MUDANCA_ESTADO", { rotulo: "Banco confirmou o pagamento", despacho: retorno.autenticacao ?? null }, { meta: { ...meta, retornoBancario: retorno }, encerra: true });
    }
    await devolverNaTx(tx, u, p, "FILA_PAGAMENTO", "Banco recusou", `Banco recusou: ${retorno.motivo}`, fer, { ...meta, retornoBancario: retorno });
  });
}

/** Verifica a integridade da cadeia de hashes de um processo. */
export function verificarCadeia(
  evs: {
    seq: number;
    tipo: string;
    autorId: string;
    processoId: string;
    deEstado: string | null;
    paraEstado: string | null;
    deSetorId: string | null;
    paraSetorId: string | null;
    dados: unknown;
    hash: string;
    hashAnterior: string | null;
    criadoEm: Date;
  }[],
) {
  let anterior: string | null = null;
  for (const e of evs) {
    const campos: Record<string, unknown> = {};
    if (e.deEstado !== null) campos.deEstado = e.deEstado;
    if (e.paraEstado !== null) campos.paraEstado = e.paraEstado;
    if (e.deSetorId !== null) campos.deSetorId = e.deSetorId;
    if (e.paraSetorId !== null) campos.paraSetorId = e.paraSetorId;
    if (e.dados !== null && e.dados !== undefined) campos.dados = e.dados;
    const corpo = canon({ processoId: e.processoId, seq: e.seq, tipo: e.tipo, autorId: e.autorId, ...campos, criadoEm: e.criadoEm.toISOString() });
    if (e.hashAnterior !== anterior) return { ok: false, seq: e.seq };
    if (sha256((anterior ?? "") + corpo) !== e.hash) return { ok: false, seq: e.seq };
    anterior = e.hash;
  }
  return { ok: true, seq: evs.length };
}

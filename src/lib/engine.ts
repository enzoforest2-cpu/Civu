import "server-only";
import { createHash } from "crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { assinaturas, documentos, eventos, feriados, processos, setores, tiposProcesso } from "@/db/schema";
import type { SessaoUsuario } from "./auth";
import { temPapel } from "./auth";
import { addDiasUteis } from "./dates";
import { getEstado, type EstadoDef, type Gate, type Papel, type WorkflowDef } from "./workflow";

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

async function feriadosDo(municipioId: string): Promise<Set<string>> {
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
  input: { tipoId: string; unidadeGestoraId: string; assunto: string; descricao?: string; urgencia?: string; metadados?: Record<string, unknown> },
) {
  const tipo = await db.query.tiposProcesso.findFirst({ where: and(eq(tiposProcesso.id, input.tipoId), eq(tiposProcesso.municipioId, u.municipioId)) });
  if (!tipo || !tipo.ativo) throw new ErroFluxo("Tipo de processo inválido.");
  const def = tipo.definicao as WorkflowDef;
  const inicial = getEstado(def, def.estadoInicial)!;
  const fer = await feriadosDo(u.municipioId);

  for (const c of def.camposAbertura ?? []) {
    if (c.obrigatorio && !input.metadados?.[c.chave]) throw new ErroFluxo(`Preencha o campo "${c.rotulo}".`);
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
        metadados: input.metadados ?? null,
      })
      .returning();
    await registrarEvento(tx, p.id, u.id, "ABERTURA", { paraEstado: inicial.chave, paraSetorId: setorAtualId, dados: { numero, tipo: tipo.chave } });
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
  const estado = getEstado(def, p.estadoAtual)!;
  return { ...p, def, estado };
}
export type ProcessoCompleto = NonNullable<Awaited<ReturnType<typeof carregarProcesso>>>;

/** Avalia cada gate do estado atual contra os documentos juntados. */
export function avaliarGates(p: ProcessoCompleto): { gate: Gate; ok: boolean; motivo: string }[] {
  return p.estado.gates.map((gate) => {
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
  const trans = p.estado.avancos.find((t) => t.para === paraEstado);
  if (!trans) throw new ErroFluxo("Transição inválida para o estado atual.");
  const pend = avaliarGates(p).filter((g) => !g.ok);
  if (pend.length)
    throw new ErroFluxo(
      "Faltam requisitos desta etapa: " + pend.map((g) => (g.gate.tipo === "documento" ? `${g.gate.documentoTipo} (${g.motivo})` : g.motivo)).join("; "),
    );
  const destino = getEstado(p.def, paraEstado)!;
  const fer = await feriadosDo(u.municipioId);

  return db.transaction(async (tx) => {
    const setorDestinoId = await setorDoEstado(tx, u.municipioId, destino, p.abertoPor.setorId, p.setorAtualId);
    const mudaSetor = setorDestinoId !== p.setorAtualId;
    await tx
      .update(processos)
      .set({
        estadoAtual: destino.chave,
        setorAtualId: setorDestinoId,
        recebidoEm: mudaSetor ? null : new Date(),
        prazoEtapaEm: destino.slaDiasUteis > 0 ? addDiasUteis(new Date(), destino.slaDiasUteis, fer) : null,
        encerradoEm: destino.final ? new Date() : null,
      })
      .where(eq(processos.id, p.id));
    await registrarEvento(tx, p.id, u.id, destino.final ? "ENCERRAMENTO" : "MUDANCA_ESTADO", {
      deEstado: p.estadoAtual,
      paraEstado: destino.chave,
      deSetorId: p.setorAtualId,
      paraSetorId: setorDestinoId,
      dados: { rotulo: trans.rotulo, despacho: despacho?.trim() || null },
    });
  });
}

export async function devolver(u: SessaoUsuario, processoId: string, paraEstado: string, motivo: string) {
  const p = await carregarProcesso(u.municipioId, processoId);
  if (!p) throw new ErroFluxo("Processo não encontrado.");
  if (!podeAgir(u, p)) throw new ErroFluxo("Você não tem papel para agir nesta etapa.");
  const trans = p.estado.devolucoes.find((t) => t.para === paraEstado);
  if (!trans) throw new ErroFluxo("Devolução inválida para o estado atual.");
  if (trans.motivoObrigatorio && !motivo?.trim()) throw new ErroFluxo("Informe o motivo da devolução.");
  const destino = getEstado(p.def, paraEstado)!;
  const fer = await feriadosDo(u.municipioId);
  return db.transaction(async (tx) => {
    const setorDestinoId = await setorDoEstado(tx, u.municipioId, destino, p.abertoPor.setorId, p.setorAtualId);
    await tx
      .update(processos)
      .set({
        estadoAtual: destino.chave,
        setorAtualId: setorDestinoId,
        recebidoEm: setorDestinoId === p.setorAtualId ? new Date() : null,
        prazoEtapaEm: destino.slaDiasUteis > 0 ? addDiasUteis(new Date(), destino.slaDiasUteis, fer) : null,
      })
      .where(eq(processos.id, p.id));
    await registrarEvento(tx, p.id, u.id, "DEVOLUCAO", {
      deEstado: p.estadoAtual,
      paraEstado: destino.chave,
      deSetorId: p.setorAtualId,
      paraSetorId: setorDestinoId,
      dados: { rotulo: trans.rotulo, motivo: motivo.trim() },
    });
  });
}

/** Tramitação livre: envia o processo a outro setor sem mudar de estado (estados LIVRE ou despacho interno). */
export async function tramitar(u: SessaoUsuario, processoId: string, paraSetorId: string, despacho?: string) {
  const p = await carregarProcesso(u.municipioId, processoId);
  if (!p) throw new ErroFluxo("Processo não encontrado.");
  if (p.encerradoEm) throw new ErroFluxo("Processo já encerrado.");
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

import "server-only";
// Ordem cronológica de pagamentos (Lei 14.133, art. 141): uma fila por fonte de recurso,
// ordenada pela data em que a despesa foi liquidada e entrou na tesouraria.
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { processos, tiposProcesso } from "@/db/schema";
import { FONTES, type WorkflowDef } from "./workflow";

export type ItemFila = {
  processoId: string;
  numero: string;
  assunto: string;
  fonte: string;
  fonteNome: string;
  fornecedor: string | null;
  cnpj: string | null;
  valor: number | null;
  liquidadoEm: Date;
  posicao: number;
};

export type Contratacao = { fornecedor?: string; cnpj?: string; valor?: string | number; fonte?: string };

export const nomeFonte = (f: string) => FONTES[f] ?? "Fonte não informada";

/** Estados com fila cronológica e o estado de destino que representa o pagamento, por tipo de processo. */
async function estadosDeFila(municipioId: string) {
  const tipos = await db.query.tiposProcesso.findMany({ where: eq(tiposProcesso.municipioId, municipioId) });
  const m = new Map<string, { fila: string; pago: string }>();
  for (const t of tipos) {
    const def = t.definicao as WorkflowDef;
    const e = def.estados.find((x) => x.filaCronologica);
    if (e && e.avancos[0]) m.set(t.id, { fila: e.chave, pago: e.avancos[0].para });
  }
  return m;
}

/** Filas atuais, uma por fonte, já ordenadas e com a posição de cada pagamento. */
export async function filaDePagamentos(municipioId: string) {
  const estados = await estadosDeFila(municipioId);
  const lista = await db.query.processos.findMany({
    where: eq(processos.municipioId, municipioId),
    with: { eventos: { columns: { paraEstado: true, deEstado: true, criadoEm: true, seq: true } } },
  });
  const itens: Omit<ItemFila, "posicao">[] = [];
  for (const p of lista) {
    const cfg = estados.get(p.tipoId);
    if (!cfg || p.estadoAtual !== cfg.fila || p.encerradoEm) continue;
    // A posição é a data da liquidação: a volta do banco (deEstado = estado de envio) não conta como nova entrada na fila.
    const entrada = [...p.eventos].sort((a, b) => b.seq - a.seq).find((e) => e.paraEstado === cfg.fila && e.deEstado !== cfg.pago);
    const c = ((p.metadados as Record<string, unknown> | null)?.contratacao ?? {}) as Contratacao;
    const fonte = c.fonte ?? "SEM_FONTE";
    itens.push({
      processoId: p.id,
      numero: p.numero,
      assunto: p.assunto,
      fonte,
      fonteNome: nomeFonte(fonte),
      fornecedor: c.fornecedor ?? null,
      cnpj: c.cnpj ?? null,
      valor: c.valor != null && c.valor !== "" ? Number(c.valor) : null,
      liquidadoEm: entrada?.criadoEm ?? p.abertoEm,
    });
  }
  const porFonte = new Map<string, ItemFila[]>();
  for (const i of itens.sort((a, b) => a.liquidadoEm.getTime() - b.liquidadoEm.getTime() || a.numero.localeCompare(b.numero))) {
    const arr = porFonte.get(i.fonte) ?? [];
    arr.push({ ...i, posicao: arr.length + 1 });
    porFonte.set(i.fonte, arr);
  }
  return [...porFonte.entries()].map(([fonte, fila]) => ({ fonte, fonteNome: nomeFonte(fonte), fila, total: fila.reduce((s, x) => s + (x.valor ?? 0), 0) }));
}

/** Pagamentos que estão à frente de um processo na fila da mesma fonte. */
export async function aFrenteNaFila(municipioId: string, processoId: string) {
  const filas = await filaDePagamentos(municipioId);
  for (const f of filas) {
    const eu = f.fila.find((x) => x.processoId === processoId);
    if (eu) return { fila: f, eu, aFrente: f.fila.filter((x) => x.posicao < eu.posicao) };
  }
  return null;
}

/** Pagamentos feitos nos últimos `dias`: tempo entre liquidação e pagamento e quebras de ordem justificadas. */
export async function historicoDePagamentos(municipioId: string, dias = 180) {
  const estados = await estadosDeFila(municipioId);
  const desde = Date.now() - dias * 86400_000;
  const lista = await db.query.processos.findMany({
    where: eq(processos.municipioId, municipioId),
    with: { eventos: { orderBy: (e, { asc }) => [asc(e.seq)] } },
  });
  const pagos: {
    processoId: string;
    numero: string;
    assunto: string;
    fornecedor: string | null;
    fonteNome: string;
    pagoEm: Date;
    diasNaFila: number;
    quebra: { aFrente: string[]; justificativa: string } | null;
  }[] = [];
  for (const p of lista) {
    const cfg = estados.get(p.tipoId);
    if (!cfg) continue;
    const pg = p.eventos.find((e) => e.deEstado === cfg.fila && e.paraEstado === cfg.pago);
    if (!pg || pg.criadoEm.getTime() < desde) continue;
    const entrada = p.eventos.filter((e) => e.paraEstado === cfg.fila && e.seq < pg.seq).at(-1);
    const c = ((p.metadados as Record<string, unknown> | null)?.contratacao ?? {}) as Contratacao;
    const q = (pg.dados as { quebraOrdem?: { aFrente: string[]; justificativa: string } } | null)?.quebraOrdem ?? null;
    pagos.push({
      processoId: p.id,
      numero: p.numero,
      assunto: p.assunto,
      fornecedor: c.fornecedor ?? null,
      fonteNome: nomeFonte(c.fonte ?? "SEM_FONTE"),
      pagoEm: pg.criadoEm,
      diasNaFila: entrada ? Math.max(0, Math.round((pg.criadoEm.getTime() - entrada.criadoEm.getTime()) / 86400_000)) : 0,
      quebra: q,
    });
  }
  pagos.sort((a, b) => b.pagoEm.getTime() - a.pagoEm.getTime());
  const media = pagos.length ? Math.round(pagos.reduce((s, x) => s + x.diasNaFila, 0) / pagos.length) : null;
  return { pagos, mediaDias: media, quebras: pagos.filter((x) => x.quebra) };
}

/** Valida CNPJ numérico (dígitos verificadores). */
export function cnpjValido(v: string): boolean {
  const d = v.replace(/\D/g, "");
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const calc = (base: string) => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const s = base.split("").reduce((acc, n, i) => acc + Number(n) * pesos[i], 0);
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = calc(d.slice(0, 12));
  const d2 = calc(d.slice(0, 12) + d1);
  return d.endsWith(`${d1}${d2}`);
}

export function fmtCnpj(v: string | null | undefined): string {
  const d = (v ?? "").replace(/\D/g, "");
  if (d.length !== 14) return v ?? "—";
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}


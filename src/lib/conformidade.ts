import "server-only";
// Regras de conformidade que o sistema verifica sozinho:
//  - limite de dispensa por valor e risco de fracionamento (Lei 14.133, art. 75, §1º)
//  - obrigações de publicação no PNCP (art. 94) e remessa ao Tribunal de Contas
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { feriados, municipios, processos, tiposProcesso } from "@/db/schema";
import { addDiasUteis } from "./dates";
import { LIMITES_DISPENSA, NATUREZAS } from "./workflow";

// ---------------------------------------------------------------------------
// Fracionamento
// ---------------------------------------------------------------------------

export type SituacaoLimite = "ok" | "atencao" | "excede";

export type AnaliseFracionamento = {
  natureza: string;
  naturezaNome: string;
  limite: number;
  comprometido: number;
  valorNovo: number;
  total: number;
  pct: number;
  situacao: SituacaoLimite;
  itens: { id: string; numero: string; assunto: string; valor: number }[];
};

export function limiteDaNatureza(natureza: string) {
  return NATUREZAS[natureza]?.engenharia ? LIMITES_DISPENSA.engenharia : LIMITES_DISPENSA.comum;
}

export function situacaoDe(total: number, limite: number): SituacaoLimite {
  if (total > limite) return "excede";
  if (total >= limite * 0.8) return "atencao";
  return "ok";
}

/** Valor do processo: o contratado, quando já informado; senão o estimado no DFD. */
const valorSql = sql<string>`coalesce(nullif(${processos.metadados}->'contratacao'->>'valor', ''), nullif(${processos.metadados}->>'valorEstimado', ''))`;

/** Soma as dispensas por valor da mesma natureza, na mesma unidade gestora e no mesmo exercício. */
export async function analisarFracionamento(input: {
  municipioId: string;
  unidadeGestoraId: string;
  natureza: string;
  valorNovo: number;
  ano?: number;
  excluirProcessoId?: string;
}): Promise<AnaliseFracionamento> {
  const ano = input.ano ?? new Date().getFullYear();
  const rows = await db
    .select({ id: processos.id, numero: processos.numero, assunto: processos.assunto, valor: valorSql })
    .from(processos)
    .innerJoin(tiposProcesso, eq(tiposProcesso.id, processos.tipoId))
    .where(
      and(
        eq(processos.municipioId, input.municipioId),
        eq(processos.unidadeGestoraId, input.unidadeGestoraId),
        eq(processos.ano, ano),
        eq(tiposProcesso.chave, "COMPRA"),
        sql`${processos.metadados}->>'natureza' = ${input.natureza}`,
        sql`${processos.metadados}->>'modalidade' = 'DISPENSA_VALOR'`,
        input.excluirProcessoId ? sql`${processos.id} <> ${input.excluirProcessoId}` : sql`true`,
      ),
    )
    .orderBy(processos.abertoEm);
  const itens = rows.map((r) => ({ ...r, valor: Number(r.valor) || 0 }));
  const comprometido = itens.reduce((s, r) => s + r.valor, 0);
  const limite = limiteDaNatureza(input.natureza);
  const valorNovo = Number.isFinite(input.valorNovo) ? input.valorNovo : 0;
  const total = comprometido + valorNovo;
  return {
    natureza: input.natureza,
    naturezaNome: NATUREZAS[input.natureza]?.nome ?? input.natureza,
    limite,
    comprometido,
    valorNovo,
    total,
    pct: limite ? total / limite : 0,
    situacao: situacaoDe(total, limite),
    itens,
  };
}

/** Uso do limite de dispensa por unidade gestora e natureza no exercício (para o painel). */
export async function usoDoLimite(municipioId: string, ano = new Date().getFullYear()) {
  const rows = await db
    .select({
      ugId: processos.unidadeGestoraId,
      natureza: sql<string>`${processos.metadados}->>'natureza'`,
      n: sql<number>`count(*)::int`,
      soma: sql<string>`sum(case when ${valorSql} ~ '^[0-9]+(\\.[0-9]+)?$' then (${valorSql})::numeric else 0 end)`,
    })
    .from(processos)
    .innerJoin(tiposProcesso, eq(tiposProcesso.id, processos.tipoId))
    .where(
      and(
        eq(processos.municipioId, municipioId),
        eq(processos.ano, ano),
        eq(tiposProcesso.chave, "COMPRA"),
        sql`${processos.metadados}->>'modalidade' = 'DISPENSA_VALOR'`,
        sql`${processos.metadados}->>'natureza' is not null`,
      ),
    )
    .groupBy(processos.unidadeGestoraId, sql`${processos.metadados}->>'natureza'`);
  return rows
    .map((r) => {
      const limite = limiteDaNatureza(r.natureza);
      const soma = Number(r.soma) || 0;
      return { ...r, soma, limite, pct: soma / limite, situacao: situacaoDe(soma, limite), naturezaNome: NATUREZAS[r.natureza]?.nome ?? r.natureza };
    })
    .sort((a, b) => b.pct - a.pct);
}

// ---------------------------------------------------------------------------
// Obrigações: PNCP e Tribunal de Contas
// ---------------------------------------------------------------------------

type SistemaTce = { nome: string; prazoDiasUteis: number | null; base: string };

/** Sistema de remessa de licitações e contratos de cada Tribunal de Contas estadual. */
export function sistemaTce(uf: string, tce?: string | null): SistemaTce {
  if (uf === "RS") return { nome: "LicitaCon (TCE-RS)", prazoDiasUteis: 5, base: "Resolução TCE-RS 1.050/2015 e IN 13/2017" };
  if (uf === "MA") return { nome: "Sinc-Contrata (TCE-MA)", prazoDiasUteis: null, base: "IN TCE-MA 73/2022" };
  return { nome: `sistema do ${tce || `TCE-${uf}`}`, prazoDiasUteis: null, base: `Norma de remessa do ${tce || `TCE-${uf}`}` };
}

export type SituacaoObrigacao = "cumprida" | "vencida" | "vence" | "pendente";

export type Obrigacao = {
  chave: "PNCP" | "TCE";
  processoId: string;
  numero: string;
  assunto: string;
  titulo: string;
  base: string;
  inicio: Date;
  prazo: Date | null;
  situacao: SituacaoObrigacao;
  cumpridaEm: Date | null;
  detalhe: string | null;
};

function situacaoPrazo(prazo: Date | null, cumprida: boolean): SituacaoObrigacao {
  if (cumprida) return "cumprida";
  if (!prazo) return "pendente";
  const ms = prazo.getTime() - Date.now();
  if (ms < 0) return "vencida";
  if (ms < 3 * 86400_000) return "vence";
  return "pendente";
}

/** Deriva as obrigações legais de cada contratação a partir do que já está registrado no processo. */
export async function obrigacoes(municipioId: string): Promise<Obrigacao[]> {
  const mun = await db.query.municipios.findFirst({ where: eq(municipios.id, municipioId) });
  if (!mun) return [];
  const fer = new Set((await db.select({ d: feriados.data }).from(feriados).where(eq(feriados.municipioId, municipioId))).map((r) => String(r.d)));
  const tce = sistemaTce(mun.uf, mun.tce);
  const lista = await db.query.processos.findMany({
    where: eq(processos.municipioId, municipioId),
    with: {
      tipo: true,
      eventos: { orderBy: (e, { asc }) => [asc(e.seq)] },
      documentos: { columns: { tipo: true, criadoEm: true } },
    },
  });
  const out: Obrigacao[] = [];
  for (const p of lista) {
    if (p.tipo.chave !== "COMPRA") continue;
    const entrou = p.eventos.find((e) => e.paraEstado === "CONTRATADO");
    if (!entrou) continue;
    const saiu = p.eventos.find((e) => e.deEstado === "CONTRATADO" && e.paraEstado !== "CONTRATADO");
    const meta = (p.metadados ?? {}) as Record<string, unknown>;
    const direta = meta.modalidade !== "LICITACAO";

    // PNCP — art. 94: 20 dias úteis (licitação) ou 10 dias úteis (contratação direta) após a assinatura
    const contrato = p.documentos.find((d) => d.tipo === "CONTRATO");
    const pub = p.documentos.find((d) => d.tipo === "PUBLICACAO_PNCP");
    const inicioPncp = contrato?.criadoEm ?? entrou.criadoEm;
    const prazoPncp = addDiasUteis(inicioPncp, direta ? 10 : 20, fer);
    const pncpOk = !!pub || !!saiu;
    out.push({
      chave: "PNCP",
      processoId: p.id,
      numero: p.numero,
      assunto: p.assunto,
      titulo: "Publicar o contrato no PNCP",
      base: `Lei 14.133, art. 94 (${direta ? "10 dias úteis, contratação direta" : "20 dias úteis, licitação"}); sem publicação o contrato não tem eficácia`,
      inicio: inicioPncp,
      prazo: prazoPncp,
      situacao: situacaoPrazo(prazoPncp, pncpOk),
      cumpridaEm: pub?.criadoEm ?? saiu?.criadoEm ?? null,
      detalhe: pub ? "Comprovante juntado ao processo" : saiu ? "Etapa concluída com o comprovante exigido" : null,
    });

    // Tribunal de Contas — remessa da contratação
    const remessa = p.eventos.find((e) => e.tipo === "REMESSA_TCE");
    const prazoTce = tce.prazoDiasUteis ? addDiasUteis(entrou.criadoEm, tce.prazoDiasUteis, fer) : null;
    const dadosRem = (remessa?.dados ?? null) as { recibo?: string } | null;
    out.push({
      chave: "TCE",
      processoId: p.id,
      numero: p.numero,
      assunto: p.assunto,
      titulo: `Enviar ao ${tce.nome}`,
      base: tce.prazoDiasUteis ? `${tce.base}: ${tce.prazoDiasUteis} dias úteis após cada evento` : `${tce.base}. Prazo não configurado para este estado`,
      inicio: entrou.criadoEm,
      prazo: prazoTce,
      situacao: situacaoPrazo(prazoTce, !!remessa),
      cumpridaEm: remessa?.criadoEm ?? null,
      detalhe: remessa ? `Recibo ${dadosRem?.recibo ?? "registrado"}` : null,
    });
  }
  const ordem: Record<SituacaoObrigacao, number> = { vencida: 0, vence: 1, pendente: 2, cumprida: 3 };
  return out.sort((a, b) => ordem[a.situacao] - ordem[b.situacao] || (a.prazo?.getTime() ?? Infinity) - (b.prazo?.getTime() ?? Infinity));
}

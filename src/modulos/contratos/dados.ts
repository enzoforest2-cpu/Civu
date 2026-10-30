import "server-only";
// Consultas do módulo de contratos: lista, detalhe, situação de cada nota (até a fila cronológica) e alertas.
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { contratos, contratoNotas, feriados, processos, tiposProcesso } from "@/db/schema";
import { filaDePagamentos } from "@/lib/pagamentos";
import { diasUteisEntre } from "@/lib/dates";
import { analisarObra, ehObra, numeroContrato, resumoFinanceiro, rotuloMes } from "./regras";
import { CHAVE_PAGAMENTO_CONTRATO, ESTADOS_PAGO, TIPO_PAGAMENTO_CONTRATO } from "./fluxo";

/** Garante que o município tem o tipo de processo de pagamento de contrato e devolve o id. */
export async function garantirTipoPagamento(municipioId: string) {
  const t = await db.query.tiposProcesso.findFirst({
    where: and(eq(tiposProcesso.municipioId, municipioId), eq(tiposProcesso.chave, CHAVE_PAGAMENTO_CONTRATO), eq(tiposProcesso.ativo, true)),
    orderBy: desc(tiposProcesso.versao),
  });
  if (t) return t.id;
  const [n] = await db
    .insert(tiposProcesso)
    .values({ municipioId, chave: TIPO_PAGAMENTO_CONTRATO.chave, nome: TIPO_PAGAMENTO_CONTRATO.nome, descricao: TIPO_PAGAMENTO_CONTRATO.descricao, definicao: TIPO_PAGAMENTO_CONTRATO.definicao })
    .returning();
  return n.id;
}

export async function feriadosDe(municipioId: string) {
  const rows = await db.select({ data: feriados.data }).from(feriados).where(eq(feriados.municipioId, municipioId));
  return new Set(rows.map((r) => String(r.data)));
}

/** Contratos do município com resumo financeiro e, nas obras, a análise do cronograma. */
export async function listarContratos(municipioId: string) {
  const lista = await db.query.contratos.findMany({
    where: eq(contratos.municipioId, municipioId),
    with: {
      empresa: true,
      fiscal: { columns: { id: true, nome: true } },
      gestor: { columns: { id: true, nome: true } },
      setor: true,
      aditivos: true,
      apostilamentos: true,
      notas: { columns: { id: true, valor: true, situacao: true, criadoEm: true, numero: true, processoId: true } },
      etapas: true,
      medicoes: true,
    },
    orderBy: [desc(contratos.ano), desc(contratos.numero)],
  });
  return lista.map((c) => ({
    ...c,
    rotulo: numeroContrato(c),
    fin: resumoFinanceiro(c, c.aditivos, c.apostilamentos, c.notas),
    obra: ehObra(c.natureza) ? analisarObra(c, c.etapas, c.medicoes) : null,
  }));
}
export type ContratoLista = Awaited<ReturnType<typeof listarContratos>>[number];

export async function carregarContrato(municipioId: string, id: string) {
  const c = await db.query.contratos.findFirst({
    where: and(eq(contratos.id, id), eq(contratos.municipioId, municipioId)),
    with: {
      empresa: true,
      unidadeGestora: true,
      processoOrigem: { columns: { id: true, numero: true, assunto: true, estadoAtual: true } },
      setor: true,
      fiscal: { columns: { id: true, nome: true, cargo: true } },
      gestor: { columns: { id: true, nome: true, cargo: true } },
      aditivos: { orderBy: (a, { asc }) => [asc(a.numero)] },
      apostilamentos: { orderBy: (a, { asc }) => [asc(a.numero)] },
      notas: { orderBy: (n, { desc }) => [desc(n.competencia), desc(n.criadoEm)], with: { atestadaPor: { columns: { nome: true } }, enviadaPor: { columns: { nome: true } } } },
      etapas: { orderBy: (e, { asc }) => [asc(e.ordem)] },
      medicoes: { orderBy: (m, { asc }) => [asc(m.competencia)], with: { registradaPor: { columns: { nome: true } } } },
      diario: { orderBy: (d, { desc }) => [desc(d.data), desc(d.criadoEm)], with: { autor: { columns: { nome: true } } } },
    },
  });
  if (!c) return null;
  const fin = resumoFinanceiro(c, c.aditivos, c.apostilamentos, c.notas);
  const obra = ehObra(c.natureza) ? analisarObra(c, c.etapas, c.medicoes) : null;
  const status = await situacaoDasNotas(municipioId, c.notas);
  return { ...c, rotulo: numeroContrato(c), fin, obra, status };
}
export type ContratoCompleto = NonNullable<Awaited<ReturnType<typeof carregarContrato>>>;

// ---------------------------------------------------------------------------
// Onde está o dinheiro: situação de cada nota, inclusive a posição na fila cronológica
// ---------------------------------------------------------------------------
export type EtapaPagamento = "ATESTO" | "GLOSADA" | "ATESTADA" | "LIQUIDACAO" | "FILA" | "PAGO";
export type SituacaoNota = {
  etapa: EtapaPagamento;
  texto: string;
  tone: "ok" | "warn" | "bad" | "neutral" | "brand";
  detalhe?: string;
  diasUteisSemAtesto?: number;
  fila?: { posicao: number; total: number; aFrente: number; valorAFrente: number; fonteNome: string; liquidadoEm: Date };
  pagoEm?: Date | null;
  processo?: { id: string; numero: string } | null;
};

export const ETAPAS_PAGAMENTO: { chave: EtapaPagamento; rotulo: string }[] = [
  { chave: "ATESTO", rotulo: "Atesto do fiscal" },
  { chave: "LIQUIDACAO", rotulo: "Liquidação" },
  { chave: "FILA", rotulo: "Fila cronológica" },
  { chave: "PAGO", rotulo: "Pago" },
];

type NotaBase = { id: string; situacao: string; processoId: string | null; criadoEm: Date; pagaEm?: Date | null; glosaMotivo?: string | null };

export async function situacaoDasNotas(municipioId: string, notas: NotaBase[]): Promise<Record<string, SituacaoNota>> {
  const ids = [...new Set(notas.map((n) => n.processoId).filter((x): x is string => !!x))];
  const [procs, filas, fer] = await Promise.all([
    ids.length
      ? db.query.processos.findMany({
          where: and(eq(processos.municipioId, municipioId), inArray(processos.id, ids)),
          columns: { id: true, numero: true, estadoAtual: true },
          with: { eventos: { columns: { paraEstado: true, criadoEm: true } } },
        })
      : Promise.resolve([]),
    ids.length ? filaDePagamentos(municipioId) : Promise.resolve([]),
    feriadosDe(municipioId),
  ]);
  const porProc = new Map(procs.map((p) => [p.id, p]));
  const posicao = new Map<string, SituacaoNota["fila"]>();
  for (const f of filas)
    for (const x of f.fila) {
      const frente = f.fila.filter((y) => y.posicao < x.posicao);
      posicao.set(x.processoId, {
        posicao: x.posicao,
        total: f.fila.length,
        aFrente: frente.length,
        valorAFrente: frente.reduce((s, y) => s + (y.valor ?? 0), 0),
        fonteNome: f.fonteNome,
        liquidadoEm: x.liquidadoEm,
      });
    }
  const out: Record<string, SituacaoNota> = {};
  const agora = new Date();
  for (const n of notas) {
    const p = n.processoId ? porProc.get(n.processoId) : undefined;
    const proc = p ? { id: p.id, numero: p.numero } : null;
    if (n.situacao === "AGUARDANDO_ATESTO") {
      const d = diasUteisEntre(n.criadoEm, agora, fer);
      out[n.id] = { etapa: "ATESTO", texto: "Aguardando atesto", tone: d > 5 ? "bad" : "warn", diasUteisSemAtesto: d, detalhe: d === 0 ? "Recebida hoje" : `Há ${d} ${d === 1 ? "dia útil" : "dias úteis"}` };
    } else if (n.situacao === "GLOSADA") {
      out[n.id] = { etapa: "GLOSADA", texto: "Glosada", tone: "bad", detalhe: n.glosaMotivo ?? undefined };
    } else if (n.situacao === "ATESTADA") {
      out[n.id] = { etapa: "ATESTADA", texto: "Atestada", tone: "brand", detalhe: "Aguardando envio à liquidação" };
    } else if (n.situacao === "PAGA" && !p) {
      out[n.id] = { etapa: "PAGO", texto: "Pago", tone: "ok", pagoEm: n.pagaEm ?? null, detalhe: "Pagamento registrado antes do Civu" };
    } else if (p) {
      if (ESTADOS_PAGO.includes(p.estadoAtual)) {
        const ev = p.eventos.filter((e) => e.paraEstado === "PAGO").sort((a, b) => b.criadoEm.getTime() - a.criadoEm.getTime())[0];
        out[n.id] = { etapa: "PAGO", texto: "Pago", tone: "ok", pagoEm: ev?.criadoEm ?? null, processo: proc };
      } else if (posicao.has(p.id)) {
        const f = posicao.get(p.id)!;
        out[n.id] = { etapa: "FILA", texto: `Na fila: ${f.posicao}º de ${f.total}`, tone: "brand", fila: f, processo: proc, detalhe: f.fonteNome };
      } else {
        out[n.id] = { etapa: "LIQUIDACAO", texto: "Em liquidação", tone: "brand", processo: proc, detalhe: "Contabilidade conferindo" };
      }
    } else {
      out[n.id] = { etapa: "LIQUIDACAO", texto: "Em liquidação", tone: "brand" };
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Alertas
// ---------------------------------------------------------------------------
export type Alerta = { chave: string; tipo: "VIGENCIA" | "SALDO" | "ATESTO" | "OBRA" | "ADITIVO"; tone: "bad" | "warn"; titulo: string; detalhe: string; href: string };

export async function alertasContratos(municipioId: string, lista?: ContratoLista[]) {
  const cs = lista ?? (await listarContratos(municipioId));
  const fer = await feriadosDe(municipioId);
  const agora = new Date();
  const out: Alerta[] = [];
  for (const c of cs) {
    const href = `/contratos/${c.id}`;
    const nome = `Contrato ${c.rotulo} — ${c.empresa.nomeFantasia ?? c.empresa.razaoSocial}`;
    if (c.fin.ativo && c.fin.diasParaVencer <= 90)
      out.push({
        chave: c.id + "v",
        tipo: "VIGENCIA",
        tone: c.fin.diasParaVencer <= 30 ? "bad" : "warn",
        titulo: `${nome}: vigência termina em ${c.fin.diasParaVencer} ${c.fin.diasParaVencer === 1 ? "dia" : "dias"}`,
        detalhe: `${c.objeto}. Decida a tempo entre prorrogar (se cabível) ou abrir nova contratação.`,
        href,
      });
    if (c.fin.ativo && c.fin.pctSaldo < 10)
      out.push({
        chave: c.id + "s",
        tipo: "SALDO",
        tone: c.fin.pctSaldo < 5 ? "bad" : "warn",
        titulo: `${nome}: saldo de ${c.fin.pctSaldo.toFixed(1).replace(".", ",")}%`,
        detalhe: `Restam ${c.fin.saldo.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} de ${c.fin.valorAtual.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.`,
        href,
      });
    if (c.fin.acimaDoLimite && c.situacao === "ATIVO")
      out.push({
        chave: c.id + "a",
        tipo: "ADITIVO",
        tone: "bad",
        titulo: `${nome}: acréscimos somam ${c.fin.acrescimoPct.toFixed(1).replace(".", ",")}% do valor inicial`,
        detalhe: `Acima do limite de ${c.fin.limite}% do art. 125 da Lei 14.133. Revise os aditivos com a procuradoria.`,
        href,
      });
    for (const n of c.notas) {
      if (n.situacao !== "AGUARDANDO_ATESTO") continue;
      const d = diasUteisEntre(n.criadoEm, agora, fer);
      if (d > 5)
        out.push({
          chave: n.id,
          tipo: "ATESTO",
          tone: "bad",
          titulo: `Nota ${n.numero} sem atesto há ${d} dias úteis`,
          detalhe: `${nome}. Fiscal: ${c.fiscal?.nome ?? "não designado"}.`,
          href: `${href}#notas`,
        });
    }
    if (c.obra && c.situacao === "ATIVO" && (c.obra.desvio > 10 || c.obra.situacao === "PARALISADA"))
      out.push({
        chave: c.id + "o",
        tipo: "OBRA",
        tone: "bad",
        titulo:
          c.obra.situacao === "PARALISADA"
            ? `Obra paralisada: ${c.objeto}`
            : `Obra com desvio de ${c.obra.desvio.toFixed(1).replace(".", ",")} pontos: ${c.objeto}`,
        detalhe: `Previsto ${c.obra.previstoRef.toFixed(1).replace(".", ",")}% até ${c.obra.refMes ? rotuloMes(c.obra.refMes) : "—"}; medido ${c.obra.realizadoRef.toFixed(1).replace(".", ",")}%.`,
        href: `${href}#obra`,
      });
  }
  const ordem = { ATESTO: 0, OBRA: 1, ADITIVO: 2, SALDO: 3, VIGENCIA: 4 };
  return out.sort((a, b) => (a.tone === b.tone ? ordem[a.tipo] - ordem[b.tipo] : a.tone === "bad" ? -1 : 1));
}

// ---------------------------------------------------------------------------
// Portal do fornecedor e página pública
// ---------------------------------------------------------------------------
export async function contratosDaEmpresa(empresaId: string) {
  const lista = await db.query.contratos.findMany({
    where: eq(contratos.empresaId, empresaId),
    with: {
      municipio: true,
      aditivos: { orderBy: (a, { asc }) => [asc(a.numero)] },
      apostilamentos: true,
      notas: { orderBy: (n, { desc }) => [desc(n.competencia), desc(n.criadoEm)] },
      fiscal: { columns: { nome: true } },
      setor: true,
      etapas: true,
      medicoes: { orderBy: (m, { asc }) => [asc(m.competencia)] },
    },
    orderBy: [desc(contratos.ano), desc(contratos.numero)],
  });
  return lista.map((c) => ({
    ...c,
    rotulo: numeroContrato(c),
    fin: resumoFinanceiro(c, c.aditivos, c.apostilamentos, c.notas),
    obra: ehObra(c.natureza) ? analisarObra(c, c.etapas, c.medicoes) : null,
  }));
}

/** Notas da empresa com a situação de pagamento, agrupando a consulta da fila por município. */
export async function pagamentosDaEmpresa(empresaId: string) {
  const cs = await contratosDaEmpresa(empresaId);
  const porMun = new Map<string, typeof cs>();
  for (const c of cs) porMun.set(c.municipioId, [...(porMun.get(c.municipioId) ?? []), c]);
  const itens: { nota: (typeof cs)[number]["notas"][number]; contrato: (typeof cs)[number]; sit: SituacaoNota }[] = [];
  for (const [mun, lista] of porMun) {
    const notas = lista.flatMap((c) => c.notas);
    const sit = await situacaoDasNotas(mun, notas);
    for (const c of lista) for (const n of c.notas) itens.push({ nota: n, contrato: c, sit: sit[n.id] });
  }
  return { contratos: cs, itens };
}

/** Obras públicas do município para a página de transparência. */
export async function obrasPublicas(municipioId: string) {
  const lista = await listarContratos(municipioId);
  return lista.filter((c) => c.obra && c.situacao !== "RESCINDIDO");
}

export async function contratoPorNota(notaId: string) {
  return db.query.contratoNotas.findFirst({ where: eq(contratoNotas.id, notaId), with: { contrato: { with: { empresa: true } } } });
}

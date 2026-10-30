import "server-only";
// Consultas e regras do módulo de finanças. Tudo é calculado a partir dos lançamentos (dotação, crédito, reserva,
// empenho, liquidação, pagamento, receita e extrato), para que todas as telas mostrem os mesmos números.
import { cache } from "react";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  finContas,
  finCreditos,
  finDotacoes,
  finEmpenhos,
  finLiquidacoes,
  finPagamentos,
  finProcessoEmpenho,
  finReceitas,
  finReservas,
  processos,
  tiposProcesso,
  unidadesGestoras,
} from "@/db/schema";
import { getEstado, type WorkflowDef } from "@/lib/workflow";
import {
  CATEGORIAS_RECEITA,
  FUNCOES,
  GRUPOS_FONTE,
  LIMITES,
  ehPessoal,
  grupoDaFonte,
  type GrupoFonte,
} from "./classificacao";

const r2 = (n: number) => Math.round(n * 100) / 100;
const soma = <T>(xs: T[], f: (x: T) => number) => r2(xs.reduce((s, x) => s + f(x), 0));

/** Data de hoje (aaaa-mm-dd) no horário de Brasília. */
export function hojeIso(d = new Date()): string {
  return d.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
}
export const addDiasIso = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const fmtIso = (iso: string | null | undefined) => (iso ? iso.split("-").reverse().join("/") : "—");

// ---------------------------------------------------------------------------
// Carga única por requisição
// ---------------------------------------------------------------------------
export const carregar = cache(async (municipioId: string, ano: number) => {
  const [dotacoes, ugs, contas, receitas] = await Promise.all([
    db.query.finDotacoes.findMany({ where: and(eq(finDotacoes.municipioId, municipioId), eq(finDotacoes.ano, ano)) }),
    db.query.unidadesGestoras.findMany({ where: eq(unidadesGestoras.municipioId, municipioId) }),
    db.query.finContas.findMany({ where: eq(finContas.municipioId, municipioId), orderBy: (c, { asc }) => [asc(c.grupoFonte), asc(c.nome)] }),
    db.query.finReceitas.findMany({ where: and(eq(finReceitas.municipioId, municipioId), eq(finReceitas.ano, ano)) }),
  ]);
  const ids = dotacoes.map((d) => d.id);
  const [creditos, reservas, empenhos] = ids.length
    ? await Promise.all([
        db.query.finCreditos.findMany({ where: inArray(finCreditos.dotacaoId, ids), orderBy: (c, { asc }) => [asc(c.decretoData)] }),
        db.query.finReservas.findMany({ where: inArray(finReservas.dotacaoId, ids) }),
        db.query.finEmpenhos.findMany({ where: inArray(finEmpenhos.dotacaoId, ids) }),
      ])
    : [[], [], []];
  const eids = empenhos.map((e) => e.id);
  const liquidacoes = eids.length ? await db.query.finLiquidacoes.findMany({ where: inArray(finLiquidacoes.empenhoId, eids) }) : [];
  const lids = liquidacoes.map((l) => l.id);
  const pagamentos = lids.length ? await db.query.finPagamentos.findMany({ where: inArray(finPagamentos.liquidacaoId, lids) }) : [];
  const vinculos = eids.length ? await db.query.finProcessoEmpenho.findMany({ where: inArray(finProcessoEmpenho.empenhoId, eids) }) : [];
  return { dotacoes, ugs, contas, receitas, creditos, reservas, empenhos, liquidacoes, pagamentos, vinculos };
});

// ---------------------------------------------------------------------------
// Execução da despesa
// ---------------------------------------------------------------------------
export const execucao = cache(async (municipioId: string, ano: number) => {
  const c = await carregar(municipioId, ano);
  const pagosPorLiq = new Map<string, number>();
  for (const p of c.pagamentos) pagosPorLiq.set(p.liquidacaoId, (pagosPorLiq.get(p.liquidacaoId) ?? 0) + p.valor);

  const dotPorId = new Map(c.dotacoes.map((d) => [d.id, d]));
  const liqs = c.liquidacoes.map((l) => {
    const pago = r2(pagosPorLiq.get(l.id) ?? 0);
    return { ...l, pago, aPagar: r2(l.valor - pago) };
  });
  const liqsPorEmp = new Map<string, typeof liqs>();
  for (const l of liqs) liqsPorEmp.set(l.empenhoId, [...(liqsPorEmp.get(l.empenhoId) ?? []), l]);
  const procsPorEmp = new Map<string, string[]>();
  for (const v of c.vinculos) procsPorEmp.set(v.empenhoId, [...(procsPorEmp.get(v.empenhoId) ?? []), v.processoId]);

  const emps = c.empenhos.map((e) => {
    const ls = liqsPorEmp.get(e.id) ?? [];
    const liquido = r2(e.valor - e.valorAnulado);
    const liquidado = soma(ls, (l) => l.valor);
    const pago = soma(ls, (l) => l.pago);
    const d = dotPorId.get(e.dotacaoId)!;
    return {
      ...e,
      dotacao: d,
      grupo: grupoDaFonte(d.fonte),
      liquido,
      liquidado,
      pago,
      aLiquidar: r2(liquido - liquidado),
      aPagar: r2(liquidado - pago),
      liquidacoes: ls.sort((a, b) => a.data.localeCompare(b.data)),
      processoIds: procsPorEmp.get(e.id) ?? [],
    };
  });
  const empsPorDot = new Map<string, typeof emps>();
  for (const e of emps) empsPorDot.set(e.dotacaoId, [...(empsPorDot.get(e.dotacaoId) ?? []), e]);

  const reservas = c.reservas.map((r) => {
    const usado = soma(
      emps.filter((e) => e.reservaId === r.id),
      (e) => e.liquido,
    );
    const saldo = r.situacao === "ABERTA" ? r2(Math.max(0, r.valor - usado)) : 0;
    return { ...r, usado, saldo, dotacao: dotPorId.get(r.dotacaoId)! };
  });

  const ugNome = new Map(c.ugs.map((u) => [u.id, u]));
  const dotacoes = c.dotacoes
    .map((d) => {
      const cr = c.creditos.filter((x) => x.dotacaoId === d.id);
      const es = empsPorDot.get(d.id) ?? [];
      const creditos = soma(
        cr.filter((x) => x.valor > 0),
        (x) => x.valor,
      );
      const reducoes = soma(
        cr.filter((x) => x.valor < 0),
        (x) => -x.valor,
      );
      const atualizado = r2(d.valorInicial + creditos - reducoes);
      const reservado = soma(
        reservas.filter((r) => r.dotacaoId === d.id),
        (r) => r.saldo,
      );
      const empenhado = soma(es, (e) => e.liquido);
      const liquidado = soma(es, (e) => e.liquidado);
      const pago = soma(es, (e) => e.pago);
      return {
        ...d,
        ug: ugNome.get(d.unidadeGestoraId),
        grupo: grupoDaFonte(d.fonte),
        creditosLista: cr,
        creditos,
        reducoes,
        atualizado,
        reservado,
        empenhado,
        liquidado,
        pago,
        disponivel: r2(atualizado - empenhado - reservado),
      };
    })
    .sort((a, b) => a.unidade.localeCompare(b.unidade) || a.funcao.localeCompare(b.funcao) || a.acao.localeCompare(b.acao) || a.natureza.localeCompare(b.natureza));

  const totais = {
    inicial: soma(dotacoes, (d) => d.valorInicial),
    creditos: soma(dotacoes, (d) => d.creditos),
    reducoes: soma(dotacoes, (d) => d.reducoes),
    atualizado: soma(dotacoes, (d) => d.atualizado),
    reservado: soma(dotacoes, (d) => d.reservado),
    empenhado: soma(dotacoes, (d) => d.empenhado),
    liquidado: soma(dotacoes, (d) => d.liquidado),
    pago: soma(dotacoes, (d) => d.pago),
    disponivel: soma(dotacoes, (d) => d.disponivel),
  };
  return { ...c, dotacoes, empenhos: emps, liquidacoesCalc: liqs, reservasCalc: reservas, totais };
});
export type Execucao = Awaited<ReturnType<typeof execucao>>;
export type DotacaoCalc = Execucao["dotacoes"][number];
export type EmpenhoCalc = Execucao["empenhos"][number];

/** Orçado × executado por função de governo (transparência e visão geral). */
export async function porFuncao(municipioId: string, ano: number) {
  const ex = await execucao(municipioId, ano);
  const m = new Map<string, { funcao: string; atualizado: number; empenhado: number; liquidado: number; pago: number }>();
  for (const d of ex.dotacoes) {
    const cur = m.get(d.funcao) ?? { funcao: d.funcao, atualizado: 0, empenhado: 0, liquidado: 0, pago: 0 };
    cur.atualizado += d.atualizado;
    cur.empenhado += d.empenhado;
    cur.liquidado += d.liquidado;
    cur.pago += d.pago;
    m.set(d.funcao, cur);
  }
  return [...m.values()]
    .map((x) => ({ ...x, nome: FUNCOES[x.funcao]?.nome ?? x.funcao, simples: FUNCOES[x.funcao]?.simples ?? x.funcao }))
    .sort((a, b) => b.atualizado - a.atualizado);
}

// ---------------------------------------------------------------------------
// Receita
// ---------------------------------------------------------------------------
export const receita = cache(async (municipioId: string, ano: number) => {
  const c = await carregar(municipioId, ano);
  const hoje = hojeIso();
  const anoHoje = Number(hoje.slice(0, 4));
  /** meses com arrecadação lançada (o mês corrente conta como decorrido) */
  const mesesDecorridos = anoHoje > ano ? 12 : anoHoje < ano ? 0 : Number(hoje.slice(5, 7));
  const cats = Object.keys(CATEGORIAS_RECEITA).map((k) => {
    const linhas = c.receitas.filter((r) => r.categoria === k).sort((a, b) => a.mes - b.mes);
    const previstoAno = soma(linhas, (r) => r.previsto);
    const ate = linhas.filter((r) => r.mes <= mesesDecorridos);
    const previstoAte = soma(ate, (r) => r.previsto);
    const arrecadado = soma(ate, (r) => r.arrecadado ?? 0);
    const meses = Array.from({ length: 12 }, (_, i) => {
      const l = linhas.find((r) => r.mes === i + 1);
      return { mes: i + 1, previsto: l?.previsto ?? 0, arrecadado: i + 1 <= mesesDecorridos ? (l?.arrecadado ?? 0) : null };
    });
    return {
      categoria: k,
      ...CATEGORIAS_RECEITA[k],
      previstoAno,
      previstoAte,
      arrecadado,
      desempenho: previstoAte > 0 ? arrecadado / previstoAte : null,
      meses,
    };
  });
  const sum = (f: (x: (typeof cats)[number]) => boolean, k: "previstoAno" | "previstoAte" | "arrecadado") => soma(cats.filter(f), (x) => x[k]);
  const deducaoFundeb = r2(0.2 * sum((x) => x.deducaoFundeb, "arrecadado"));
  const deducaoFundebPrevista = r2(0.2 * sum((x) => x.deducaoFundeb, "previstoAno"));
  const totais = {
    previstoAno: sum(() => true, "previstoAno"),
    previstoAte: sum(() => true, "previstoAte"),
    arrecadado: sum(() => true, "arrecadado"),
    deducaoFundeb,
    deducaoFundebPrevista,
    /** receita de impostos e transferências de impostos (base dos mínimos de saúde e educação) */
    impostos: sum((x) => x.impostos, "arrecadado"),
    /** receita corrente líquida simplificada: correntes menos a dedução para o FUNDEB */
    rcl: r2(sum((x) => x.corrente, "arrecadado") - deducaoFundeb),
    fundeb: sum((x) => x.categoria === "FUNDEB", "arrecadado"),
  };
  const porMes = Array.from({ length: 12 }, (_, i) => ({
    mes: i + 1,
    previsto: soma(cats, (x) => x.meses[i].previsto),
    arrecadado: i + 1 <= mesesDecorridos ? soma(cats, (x) => x.meses[i].arrecadado ?? 0) : null,
  }));
  return { categorias: cats, totais, porMes, mesesDecorridos, hoje };
});

// ---------------------------------------------------------------------------
// Caixa por fonte
// ---------------------------------------------------------------------------
export const caixa = cache(async (municipioId: string, ano: number) => {
  const ex = await execucao(municipioId, ano);
  const pagosApos = new Map<string, number>();
  for (const c of ex.contas) {
    pagosApos.set(
      c.id,
      soma(
        ex.pagamentos.filter((p) => p.contaId === c.id && p.data > c.extratoEm),
        (p) => p.valor,
      ),
    );
  }
  const contas = ex.contas.map((c) => ({ ...c, debitosApos: pagosApos.get(c.id) ?? 0, saldoAtual: r2(c.saldoExtrato - (pagosApos.get(c.id) ?? 0)) }));
  const fontes = GRUPOS_FONTE.map((g) => {
    const cs = contas.filter((c) => c.grupoFonte === g);
    const es = ex.empenhos.filter((e) => e.grupo === g);
    const saldo = soma(cs, (c) => c.saldoAtual);
    const aPagar = soma(es, (e) => e.aPagar);
    const aLiquidar = soma(es, (e) => e.aLiquidar);
    const vencido = soma(
      ex.liquidacoesCalc.filter((l) => l.aPagar > 0 && l.vencimento < hojeIso() && es.some((e) => e.id === l.empenhoId)),
      (l) => l.aPagar,
    );
    return { grupo: g, contas: cs, saldo, aPagar, vencido, aLiquidar, aposLiquidadas: r2(saldo - aPagar), liquida: r2(saldo - aPagar - aLiquidar) };
  }).filter((f) => f.contas.length > 0 || f.aPagar > 0 || f.aLiquidar > 0);
  const totais = {
    saldo: soma(fontes, (f) => f.saldo),
    aPagar: soma(fontes, (f) => f.aPagar),
    aLiquidar: soma(fontes, (f) => f.aLiquidar),
    aposLiquidadas: soma(fontes, (f) => f.aposLiquidadas),
    liquida: soma(fontes, (f) => f.liquida),
  };
  return { contas, fontes, totais };
});

// ---------------------------------------------------------------------------
// Projeção de caixa (90 dias) por fonte
// ---------------------------------------------------------------------------
export type Cenario = "conservador" | "base" | "favoravel";
export const CENARIOS: Record<Cenario, { nome: string; explica: string }> = {
  conservador: { nome: "Conservador", explica: "Receitas 8% abaixo da previsão e convênios pela metade." },
  base: { nome: "Base", explica: "Previsão de cada receita corrigida pelo desempenho de janeiro até agora." },
  favoravel: { nome: "Favorável", explica: "Receitas 3% acima da previsão." },
};

export const projecao = cache(async (municipioId: string, ano: number, cenario: Cenario = "base", dias = 90) => {
  const [ex, rec, cx] = await Promise.all([execucao(municipioId, ano), receita(municipioId, ano), caixa(municipioId, ano)]);
  const hoje = hojeIso();
  const fim = addDiasIso(hoje, dias);
  const datas = Array.from({ length: dias + 1 }, (_, i) => addDiasIso(hoje, i));
  const idx = new Map(datas.map((d, i) => [d, i]));
  type Fluxo = { entradas: number[]; saidas: number[] };
  const fluxo = new Map<GrupoFonte, Fluxo>();
  const f = (g: GrupoFonte) => {
    if (!fluxo.has(g)) fluxo.set(g, { entradas: Array(dias + 1).fill(0), saidas: Array(dias + 1).fill(0) });
    return fluxo.get(g)!;
  };
  const lancar = (g: GrupoFonte, tipo: "entradas" | "saidas", dataIso: string, valor: number) => {
    if (valor <= 0) return;
    const i = dataIso <= hoje ? 0 : idx.get(dataIso);
    if (i == null) return;
    f(g)[tipo][i] += valor;
  };
  const espalhar = (g: GrupoFonte, tipo: "entradas" | "saidas", de: string, ate: string, valor: number) => {
    const ds = datas.filter((d) => d >= de && d <= ate);
    if (!ds.length || valor <= 0) return;
    for (const d of ds) lancar(g, tipo, d, valor / ds.length);
  };
  const ultimoDia = (a: number, m: number) => new Date(Date.UTC(a, m, 0)).getUTCDate();
  const iso = (a: number, m: number, d: number) => `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  // Entradas: previsão mensal de cada receita, ajustada pelo cenário
  const premissas: string[] = [];
  for (const cat of rec.categorias) {
    const fator =
      cenario === "conservador"
        ? cat.categoria === "CONVENIOS"
          ? 0.5
          : 0.92
        : cenario === "favoravel"
          ? 1.03
          : Math.min(1.1, Math.max(0.5, cat.desempenho ?? 1));
    const liquidoFundeb = cat.deducaoFundeb ? 0.8 : 1; // 20% já retidos para o FUNDEB
    // meses do período: do mês corrente até o mês do fim
    let a = Number(hoje.slice(0, 4));
    let m = Number(hoje.slice(5, 7));
    while (iso(a, m, 1) <= fim) {
      const ini = iso(a, m, 1);
      const fimMes = iso(a, m, ultimoDia(a, m));
      let valor: number;
      if (a === ano) {
        const linha = cat.meses[m - 1];
        valor = m === Number(hoje.slice(5, 7)) && a === Number(hoje.slice(0, 4)) ? Math.max(0, linha.previsto - (linha.arrecadado ?? 0)) : linha.previsto;
      } else {
        // exercício seguinte: mesmo mês deste ano + 4,5% (hipótese até a LOA seguinte ser carregada)
        valor = cat.meses[m - 1].previsto * 1.045;
      }
      espalhar(cat.grupo, "entradas", ini < hoje ? addDiasIso(hoje, 1) : ini, fimMes, valor * fator * liquidoFundeb);
      m += 1;
      if (m > 12) {
        m = 1;
        a += 1;
      }
    }
  }
  premissas.push(CENARIOS[cenario].explica);
  premissas.push("Receitas do mês entram distribuídas pelos dias; FPM, ICMS, IPVA e ITR entram já sem os 20% do FUNDEB.");
  premissas.push("Janeiro do ano seguinte: mesma previsão de janeiro deste ano mais 4,5%, até a nova LOA ser carregada.");

  // Saídas 1: despesas liquidadas a pagar, no vencimento (vencidas, hoje)
  for (const l of ex.liquidacoesCalc) {
    if (l.aPagar <= 0) continue;
    const e = ex.empenhos.find((x) => x.id === l.empenhoId)!;
    lancar(e.grupo, "saidas", l.vencimento, l.aPagar);
  }
  premissas.push("Despesas liquidadas e não pagas saem na data de vencimento (as vencidas, hoje).");

  // Saídas 2: empenhado a liquidar
  const folhas: string[] = [];
  {
    const a = Number(hoje.slice(0, 4));
    for (let m = 1; m <= 12; m++) {
      const d = iso(a, m, 28);
      if (d > hoje && a === ano) folhas.push(d);
    }
  }
  const decimo = `${ano}-12-18`;
  const nFolhas = folhas.length + (decimo > hoje ? 0.5 : 0);
  const folhaMensal = new Map<GrupoFonte, number>();
  for (const e of ex.empenhos) {
    if (e.aLiquidar <= 0) continue;
    if (ehPessoal(e.dotacao.natureza) && nFolhas > 0) {
      const F = e.aLiquidar / nFolhas;
      for (const d of folhas) lancar(e.grupo, "saidas", d, F);
      if (decimo > hoje) lancar(e.grupo, "saidas", decimo, F * 0.5);
      folhaMensal.set(e.grupo, (folhaMensal.get(e.grupo) ?? 0) + F);
    } else {
      espalhar(e.grupo, "saidas", addDiasIso(hoje, 15), addDiasIso(hoje, 75), e.aLiquidar);
    }
  }
  premissas.push("Folha de pagamento: saldo dos empenhos de pessoal pago no dia 28 de cada mês e a 2ª parcela do 13º em 18/12.");
  premissas.push("Demais empenhos a liquidar: pagos de forma uniforme entre 15 e 75 dias a partir de hoje.");

  // Saídas 3: exercício seguinte (custeio recorrente e folha), se o período passar de 31/12
  if (fim > `${ano}-12-31`) {
    const meses = Math.max(1, rec.mesesDecorridos);
    for (const g of GRUPOS_FONTE) {
      const custeioPago = soma(
        ex.empenhos.filter((e) => e.grupo === g && e.dotacao.natureza.startsWith("3.3.")),
        (e) => e.pago,
      );
      const diasNovoAno = datas.filter((d) => d > `${ano}-12-31`).length;
      espalhar(g, "saidas", `${ano + 1}-01-02`, fim, (custeioPago / meses) * (diasNovoAno / 30));
      const F = folhaMensal.get(g) ?? 0;
      for (let m = 1; m <= 3; m++) {
        const d = iso(ano + 1, m, 28);
        if (d <= fim) lancar(g, "saidas", d, F);
      }
    }
    premissas.push("A partir de 1º de janeiro: custeio pela média mensal paga neste ano e folha pela média atual, por fonte.");
  }

  const series = cx.fontes.map((fo) => {
    const fl = f(fo.grupo);
    let saldo = fo.saldo;
    const pontos = datas.map((d, i) => {
      saldo = saldo + fl.entradas[i] - fl.saidas[i];
      return { data: d, saldo: r2(saldo) };
    });
    const min = pontos.reduce((a, b) => (b.saldo < a.saldo ? b : a), pontos[0]);
    const primeiroNegativo = pontos.find((p) => p.saldo < 0) ?? null;
    return {
      grupo: fo.grupo,
      inicial: fo.saldo,
      entradas: soma(fl.entradas, (x) => x),
      saidas: soma(fl.saidas, (x) => x),
      final: pontos[pontos.length - 1].saldo,
      min,
      primeiroNegativo,
      pontos,
    };
  });
  return { hoje, fim, dias, cenario, series, premissas };
});

// ---------------------------------------------------------------------------
// Índices constitucionais e da LRF
// ---------------------------------------------------------------------------
export type Indice = {
  chave: "saude" | "mde" | "fundeb70" | "pessoal";
  titulo: string;
  base: string;
  numerador: number;
  denominador: number;
  realizado: number | null;
  projetado: number | null;
  numeradorProj: number;
  denominadorProj: number;
  minimo?: number;
  maximo?: number;
  prudencial?: number;
  alerta?: number;
  situacao: "ok" | "atencao" | "risco";
  mensagem: string;
  comoProjetado: string;
};

export const indices = cache(async (municipioId: string, ano: number) => {
  const [ex, rec] = await Promise.all([execucao(municipioId, ano), receita(municipioId, ano)]);
  const m = Math.max(1, rec.mesesDecorridos);
  const lin = (v: number) => (v / m) * 12;
  const liq = (f: (d: DotacaoCalc) => boolean) => soma(ex.dotacoes.filter(f), (d) => d.liquidado);
  const pct = (a: number, b: number) => (b > 0 ? (a / b) * 100 : null);
  const t = rec.totais;

  const saudeNum = liq((d) => d.funcao === "10" && d.fonte === "1500.1002");
  const mdeNum = r2(t.deducaoFundeb + liq((d) => d.funcao === "12" && d.fonte === "1500.1001"));
  const fundebNum = liq((d) => d.fonte === "1540.0000" && ehPessoal(d.natureza));
  const pessoalNum = liq((d) => ehPessoal(d.natureza));
  // folha média: o realizado inclui a 1ª parcela do 13º (meia folha, paga em julho)
  const folhaMedia = pessoalNum / (m + (m >= 7 ? 0.5 : 0));

  const lista: Indice[] = [];
  const mk = (i: Omit<Indice, "realizado" | "projetado" | "situacao" | "mensagem">, situar: (r: number, p: number) => [Indice["situacao"], string]) => {
    const realizado = pct(i.numerador, i.denominador);
    const projetado = pct(i.numeradorProj, i.denominadorProj);
    const [situacao, mensagem] = realizado == null || projetado == null ? (["atencao", "Sem dados suficientes."] as const) : situar(realizado, projetado);
    lista.push({ ...i, realizado, projetado, situacao, mensagem });
  };
  const fmt = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%`;
  const minimo = (min: number, nome: string) => (r: number, p: number): [Indice["situacao"], string] =>
    p < min
      ? ["risco", `No ritmo atual, ${nome} termina o ano em ${fmt(p)}, abaixo do mínimo de ${fmt(min)}.`]
      : p < min + 1.5
        ? ["atencao", `Projeção de ${fmt(p)}, muito perto do mínimo de ${fmt(min)}.`]
        : ["ok", `Acima do mínimo: ${fmt(r)} até agora e ${fmt(p)} projetado.`];

  mk(
    {
      chave: "saude",
      titulo: "Saúde (ASPS)",
      base: "Despesa liquidada em saúde com recursos próprios (fonte 1500.1002) ÷ receita de impostos e transferências de impostos. LC 141/2012, art. 7º.",
      numerador: saudeNum,
      denominador: t.impostos,
      numeradorProj: lin(saudeNum),
      denominadorProj: lin(t.impostos),
      minimo: LIMITES.saude,
      comoProjetado: "Linear: valor de janeiro até agora ÷ meses decorridos × 12, no numerador e no denominador.",
    },
    minimo(LIMITES.saude, "a saúde"),
  );
  mk(
    {
      chave: "mde",
      titulo: "Educação (MDE)",
      base: "Contribuição ao FUNDEB + despesa liquidada em educação com impostos (fonte 1500.1001) ÷ receita de impostos e transferências. CF, art. 212.",
      numerador: mdeNum,
      denominador: t.impostos,
      numeradorProj: lin(mdeNum),
      denominadorProj: lin(t.impostos),
      minimo: LIMITES.mde,
      comoProjetado: "Linear: valor de janeiro até agora ÷ meses decorridos × 12, no numerador e no denominador.",
    },
    minimo(LIMITES.mde, "a educação"),
  );
  mk(
    {
      chave: "fundeb70",
      titulo: "FUNDEB — profissionais da educação",
      base: "Remuneração de profissionais da educação paga com o FUNDEB (fonte 1540, pessoal) ÷ receita do FUNDEB. Lei 14.113/2020, art. 26.",
      numerador: fundebNum,
      denominador: t.fundeb,
      numeradorProj: lin(fundebNum),
      denominadorProj: lin(t.fundeb),
      minimo: LIMITES.fundeb70,
      comoProjetado: "Linear: valor de janeiro até agora ÷ meses decorridos × 12, no numerador e no denominador.",
    },
    minimo(LIMITES.fundeb70, "o FUNDEB 70%"),
  );
  mk(
    {
      chave: "pessoal",
      titulo: "Despesa com pessoal (Executivo)",
      base: "Despesa liquidada com pessoal (grupo 3.1) ÷ receita corrente líquida. Limite de 54%, prudencial de 51,3% e alerta de 48,6% (LRF, arts. 20, 22 e 59).",
      numerador: pessoalNum,
      denominador: t.rcl,
      numeradorProj: folhaMedia * 13,
      denominadorProj: lin(t.rcl),
      maximo: LIMITES.pessoalMax,
      prudencial: LIMITES.pessoalPrudencial,
      alerta: LIMITES.pessoalAlerta,
      comoProjetado: "Despesa: folha média mensal × 13 (12 folhas e o 13º salário). Receita: linear, valor até agora ÷ meses × 12.",
    },
    (r, p) =>
      p >= LIMITES.pessoalMax
        ? ["risco", `Projeção de ${fmt(p)} ultrapassa o limite máximo de 54%.`]
        : p >= LIMITES.pessoalPrudencial
          ? [
              "risco",
              `Hoje em ${fmt(r)}, acima do limite de alerta. Com o 13º salário, a projeção de ${fmt(p)} passa o limite prudencial de 51,3%: ficam vedados aumentos, novos cargos e horas extras (LRF, art. 22).`,
            ]
          : r >= LIMITES.pessoalAlerta || p >= LIMITES.pessoalAlerta
            ? ["atencao", `Acima do limite de alerta (48,6%): o Tribunal de Contas emite aviso. Projeção de ${fmt(p)}.`]
            : ["ok", `Abaixo do limite de alerta: ${fmt(r)} até agora e ${fmt(p)} projetado.`],
  );
  return { lista, receitaImpostos: t.impostos, rcl: t.rcl, fundeb: t.fundeb, deducaoFundeb: t.deducaoFundeb, meses: m };
});

// ---------------------------------------------------------------------------
// Processos de compra ligados à execução
// ---------------------------------------------------------------------------
/** Processos cujo fluxo já passou (ou está) na etapa de empenho, com os empenhos vinculados. */
export async function processosParaEmpenho(municipioId: string, ano: number) {
  const ex = await execucao(municipioId, ano);
  const tipos = await db.query.tiposProcesso.findMany({ where: eq(tiposProcesso.municipioId, municipioId) });
  const lista = await db.query.processos.findMany({
    where: and(
      eq(processos.municipioId, municipioId),
      inArray(
        processos.tipoId,
        tipos.map((t) => t.id),
      ),
    ),
  });
  const ordem = ["CONTRATADO", "EMPENHADO", "EXECUCAO", "LIQUIDADO", "FILA_PAGAMENTO", "PAGO", "ARQUIVADO"];
  return lista
    .filter((p) => ordem.includes(p.estadoAtual))
    .map((p) => {
      const t = tipos.find((x) => x.id === p.tipoId)!;
      const emps = ex.empenhos.filter((e) => e.processoIds.includes(p.id));
      const contratacao = ((p.metadados as Record<string, unknown> | null)?.contratacao ?? null) as { fornecedor?: string; cnpj?: string; valor?: string; fonte?: string } | null;
      return {
        id: p.id,
        numero: p.numero,
        assunto: p.assunto,
        estado: p.estadoAtual,
        estadoNome: getEstado(t.definicao as WorkflowDef, p.estadoAtual)?.nome ?? p.estadoAtual,
        contratacao,
        empenhos: emps,
        aguardando: emps.length === 0 && (p.estadoAtual === "CONTRATADO" || p.estadoAtual === "EMPENHADO"),
      };
    });
}

/** Alertas da visão geral, do mais grave ao mais leve. */
export async function alertas(municipioId: string, ano: number) {
  const [ex, rec, idx, proj, procs] = await Promise.all([
    execucao(municipioId, ano),
    receita(municipioId, ano),
    indices(municipioId, ano),
    projecao(municipioId, ano, "base"),
    processosParaEmpenho(municipioId, ano),
  ]);
  type Alerta = { nivel: "risco" | "atencao"; titulo: string; texto: string; href: string };
  const out: Alerta[] = [];
  for (const s of proj.series) {
    if (s.primeiroNegativo)
      out.push({
        nivel: "risco",
        titulo: `Caixa de ${nomeGrupoCurto(s.grupo)} fica negativo em ${fmtIso(s.primeiroNegativo.data)}`,
        texto: `Na projeção base, o saldo chega a ${moeda(s.min.saldo)} em ${fmtIso(s.min.data)}. Reprograme pagamentos ou cobre o repasse antes dessa data.`,
        href: "/financas/caixa#projecao",
      });
  }
  for (const i of idx.lista) if (i.situacao !== "ok") out.push({ nivel: i.situacao === "risco" ? "risco" : "atencao", titulo: i.titulo, texto: i.mensagem, href: "/financas/indices" });
  const hoje = hojeIso();
  const vencidas = ex.liquidacoesCalc.filter((l) => l.aPagar > 0 && l.vencimento < hoje);
  if (vencidas.length)
    out.push({
      nivel: "atencao",
      titulo: `${vencidas.length} ${vencidas.length === 1 ? "despesa liquidada vencida" : "despesas liquidadas vencidas"} sem pagamento`,
      texto: `Somam ${moeda(soma(vencidas, (l) => l.aPagar))}. Pague na ordem cronológica da fonte ou registre a justificativa.`,
      href: "/financas/empenhos?situacao=a-pagar",
    });
  const baixas = rec.categorias.filter((c) => c.desempenho != null && c.desempenho < 0.9 && c.previstoAte > 100000);
  for (const c of baixas)
    out.push({
      nivel: "atencao",
      titulo: `${c.nome} abaixo da previsão`,
      texto: `Arrecadado ${moeda(c.arrecadado)} de ${moeda(c.previstoAte)} previstos até agora (${Math.round((c.desempenho ?? 0) * 100)}%).`,
      href: "/financas/receita",
    });
  const apertadas = ex.dotacoes.filter((d) => d.atualizado > 50000 && d.disponivel / d.atualizado < 0.03 && !ehPessoal(d.natureza));
  if (apertadas.length)
    out.push({
      nivel: "atencao",
      titulo: `${apertadas.length} ${apertadas.length === 1 ? "dotação com menos" : "dotações com menos"} de 3% de saldo`,
      texto: apertadas
        .slice(0, 3)
        .map((d) => `${d.acaoNome} (${d.natureza})`)
        .join("; "),
      href: "/financas/orcamento?saldo=baixo",
    });
  const aguardando = procs.filter((p) => p.aguardando);
  if (aguardando.length)
    out.push({
      nivel: "atencao",
      titulo: `${aguardando.length} ${aguardando.length === 1 ? "processo de compra aguarda" : "processos de compra aguardam"} empenho`,
      texto: aguardando.map((p) => `${p.numero} — ${p.assunto}`).join("; "),
      href: "/financas/empenhos#aguardando",
    });
  return out.sort((a, b) => (a.nivel === b.nivel ? 0 : a.nivel === "risco" ? -1 : 1));
}

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const nomeGrupoCurto = (g: string) =>
  ({ ORDINARIOS: "recursos livres", SAUDE: "saúde (vinculados)", EDUCACAO: "educação", ASSISTENCIA: "assistência social", CONVENIOS: "convênios", OUTRAS: "outras vinculadas" })[g] ?? g;

export const anoCorrente = () => Number(hojeIso().slice(0, 4));

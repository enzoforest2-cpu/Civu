// Regras puras do módulo de contratos: saldo, vigência, limite de acréscimo (art. 125), cronograma e curva S.
// Sem acesso ao banco: usadas no servidor e em componentes do navegador.

export const NATUREZAS_CONTRATO: Record<string, { nome: string; obra?: boolean; limite: number }> = {
  COMPRA: { nome: "Compra (fornecimento de bens)", limite: 25 },
  SERVICO: { nome: "Serviço", limite: 25 },
  SERVICO_CONTINUO: { nome: "Serviço contínuo", limite: 25 },
  OBRA: { nome: "Obra ou serviço de engenharia", obra: true, limite: 25 },
  REFORMA: { nome: "Reforma de edifício ou equipamento", obra: true, limite: 50 },
};

export const MODALIDADES_CONTRATO: Record<string, string> = {
  PREGAO: "Pregão",
  CONCORRENCIA: "Concorrência",
  DISPENSA: "Dispensa de licitação",
  INEXIGIBILIDADE: "Inexigibilidade",
  ADESAO_ATA: "Adesão a ata de registro de preços",
  CHAMADA_PUBLICA: "Chamada pública (agricultura familiar)",
};

export const TIPOS_ADITIVO: Record<string, string> = {
  PRAZO: "Prorrogação de prazo",
  RENOVACAO: "Prorrogação de serviço contínuo com valor do novo período (art. 107)",
  VALOR: "Acréscimo de valor",
  PRAZO_VALOR: "Prazo e valor",
  SUPRESSAO: "Supressão de valor",
};

export const TIPOS_APOSTILAMENTO: Record<string, string> = {
  REAJUSTE: "Reajuste por índice",
  DOTACAO: "Alteração de dotação",
  OUTRO: "Outra anotação",
};

export const ehObra = (natureza: string) => !!NATUREZAS_CONTRATO[natureza]?.obra;
export const limiteAcrescimo = (natureza: string) => NATUREZAS_CONTRATO[natureza]?.limite ?? 25;

export const num = (v: string | number | null | undefined) => (v == null || v === "" ? 0 : Number(v));
export const numeroContrato = (c: { numero: number; ano: number }) => `${String(c.numero).padStart(3, "0")}/${c.ano}`;

/** Data (AAAA-MM-DD) como meio-dia local, para não mudar de dia com o fuso. */
export const dataLocal = (d: string) => new Date(`${d}T12:00:00`);

export type SituacaoContrato = "VIGENTE" | "VENCE_90" | "VENCE_60" | "VENCE_30" | "VENCIDO" | "ENCERRADO" | "RESCINDIDO";
export const SITUACAO_CONTRATO: Record<SituacaoContrato, { texto: string; tone: "ok" | "warn" | "bad" | "neutral" }> = {
  VIGENTE: { texto: "Vigente", tone: "ok" },
  VENCE_90: { texto: "Vence em até 90 dias", tone: "warn" },
  VENCE_60: { texto: "Vence em até 60 dias", tone: "warn" },
  VENCE_30: { texto: "Vence em até 30 dias", tone: "bad" },
  VENCIDO: { texto: "Vigência encerrada", tone: "neutral" },
  ENCERRADO: { texto: "Encerrado", tone: "neutral" },
  RESCINDIDO: { texto: "Rescindido", tone: "bad" },
};

type Valores = {
  valorGlobal: string | number;
  natureza: string;
  vigenciaFim: string;
  situacao: string;
};
type AditivoLike = { tipo: string; valor: string | number; novaVigenciaFim: string | null };
type ApostLike = { valor: string | number };
type NotaLike = { valor: string | number; situacao: string };

/** Notas que contam como executado: atestadas ou adiante (liquidação, pagas). Glosadas e não atestadas ficam de fora. */
export const NOTA_EXECUTADA = (situacao: string) => ["ATESTADA", "LIQUIDACAO", "PAGA"].includes(situacao);

export function resumoFinanceiro(c: Valores, aditivos: AditivoLike[], apost: ApostLike[], notas: NotaLike[], hoje = new Date()) {
  const global = num(c.valorGlobal);
  const reajustes = apost.reduce((s, a) => s + num(a.valor), 0);
  // a prorrogação de serviço contínuo (art. 107) soma o valor do novo período, mas não é acréscimo do art. 125
  const renovacoes = aditivos.filter((a) => a.tipo === "RENOVACAO").reduce((s, a) => s + num(a.valor), 0);
  const acrescimos = aditivos.filter((a) => a.tipo !== "RENOVACAO" && num(a.valor) > 0).reduce((s, a) => s + num(a.valor), 0);
  const supressoes = aditivos.filter((a) => num(a.valor) < 0).reduce((s, a) => s + num(a.valor), 0);
  const aditivosValor = renovacoes + acrescimos + supressoes;
  /** Valor inicial atualizado (art. 125): global + reajustes + períodos prorrogados. Base para o limite de acréscimo. */
  const baseLimite = global + reajustes + renovacoes;
  const valorAtual = global + reajustes + aditivosValor;
  const executado = notas.filter((n) => NOTA_EXECUTADA(n.situacao)).reduce((s, n) => s + num(n.valor), 0);
  const aAtestar = notas.filter((n) => n.situacao === "AGUARDANDO_ATESTO").reduce((s, n) => s + num(n.valor), 0);
  const saldo = valorAtual - executado;
  const pctExecutado = valorAtual > 0 ? (executado / valorAtual) * 100 : 0;
  const pctSaldo = valorAtual > 0 ? (saldo / valorAtual) * 100 : 0;
  const acrescimoPct = baseLimite > 0 ? (acrescimos / baseLimite) * 100 : 0;
  const limite = limiteAcrescimo(c.natureza);
  const fimDatas = [c.vigenciaFim, ...aditivos.map((a) => a.novaVigenciaFim).filter((x): x is string => !!x)].sort();
  const vigenciaFimAtual = fimDatas[fimDatas.length - 1];
  const dias = Math.ceil((dataLocal(vigenciaFimAtual).getTime() - hoje.getTime()) / 86400_000);
  let situacao: SituacaoContrato;
  if (c.situacao === "RESCINDIDO") situacao = "RESCINDIDO";
  else if (c.situacao === "ENCERRADO") situacao = "ENCERRADO";
  else if (dias < 0) situacao = "VENCIDO";
  else if (dias <= 30) situacao = "VENCE_30";
  else if (dias <= 60) situacao = "VENCE_60";
  else if (dias <= 90) situacao = "VENCE_90";
  else situacao = "VIGENTE";
  return {
    global,
    reajustes,
    renovacoes,
    baseLimite,
    acrescimos,
    supressoes,
    aditivosValor,
    valorAtual,
    executado,
    aAtestar,
    saldo,
    pctExecutado,
    pctSaldo,
    acrescimoPct,
    limite,
    acimaDoLimite: acrescimoPct > limite + 1e-9,
    vigenciaFimAtual,
    diasParaVencer: dias,
    situacao,
    ativo: situacao !== "ENCERRADO" && situacao !== "RESCINDIDO" && situacao !== "VENCIDO",
  };
}
export type ResumoFinanceiro = ReturnType<typeof resumoFinanceiro>;

/** Simulação do limite do art. 125 para um novo aditivo (usada no formulário, antes de registrar). */
export function simularAcrescimo(baseLimite: number, acrescimosAtuais: number, novo: number, natureza: string) {
  const total = acrescimosAtuais + Math.max(0, novo);
  const pct = baseLimite > 0 ? (total / baseLimite) * 100 : 0;
  const limite = limiteAcrescimo(natureza);
  return { pct, limite, acima: pct > limite + 1e-9 };
}

// ---------------------------------------------------------------------------
// Obras: cronograma físico-financeiro, medições e curva S
// ---------------------------------------------------------------------------
type EtapaLike = { id: string; nome: string; valor: string | number; previsto: number[] };
type MedicaoLike = { competencia: string; executado: Record<string, number> };

/** "2026-05" + k meses */
export function somaMes(comp: string, k: number) {
  const [a, m] = comp.split("-").map(Number);
  const t = a * 12 + (m - 1) + k;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}
export function difMeses(de: string, ate: string) {
  const [a1, m1] = de.split("-").map(Number);
  const [a2, m2] = ate.split("-").map(Number);
  return a2 * 12 + m2 - (a1 * 12 + m1);
}
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const rotuloMes = (comp: string) => {
  const [a, m] = comp.split("-").map(Number);
  return `${MESES[m - 1]}/${String(a).slice(2)}`;
};
export const competenciaDe = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

export type SituacaoObra = "NAO_INICIADA" | "EM_DIA" | "ATRASADA" | "PARALISADA" | "CONCLUIDA";
export const SITUACAO_OBRA: Record<SituacaoObra, { texto: string; tone: "ok" | "warn" | "bad" | "neutral" | "brand" }> = {
  NAO_INICIADA: { texto: "Não iniciada", tone: "neutral" },
  EM_DIA: { texto: "Em dia", tone: "ok" },
  ATRASADA: { texto: "Atrasada", tone: "bad" },
  PARALISADA: { texto: "Paralisada", tone: "bad" },
  CONCLUIDA: { texto: "Concluída", tone: "brand" },
};

/** Desvio (pontos percentuais) a partir do qual a obra é considerada atrasada. */
export const DESVIO_ATRASO = 10;

/**
 * Curva S e situação da obra. Percentuais físicos ponderados pelo valor de cada etapa.
 * A referência é o último mês completo (o anterior ao atual): compara previsto acumulado até ele com o medido até ele.
 */
export function analisarObra(
  obra: { obraInicio: string | null; obraSituacao: string | null },
  etapas: EtapaLike[],
  medicoes: MedicaoLike[],
  hoje = new Date(),
) {
  const total = etapas.reduce((s, e) => s + num(e.valor), 0);
  const nMeses = Math.max(0, ...etapas.map((e) => e.previsto.length));
  const inicio = obra.obraInicio ? obra.obraInicio.slice(0, 7) : null;
  const meses = inicio ? Array.from({ length: nMeses }, (_, i) => somaMes(inicio, i)) : [];
  const peso = (e: EtapaLike) => (total > 0 ? num(e.valor) / total : 0);
  const previstoMes = meses.map((_, i) => etapas.reduce((s, e) => s + (e.previsto[i] ?? 0) * peso(e), 0));
  const realizadoMes = meses.map((m) => {
    const med = medicoes.find((x) => x.competencia === m);
    if (!med) return 0;
    return etapas.reduce((s, e) => s + (med.executado[e.id] ?? 0) * peso(e), 0);
  });
  const acum = (arr: number[]) => arr.reduce<number[]>((out, v, i) => [...out, (out[i - 1] ?? 0) + v], []);
  const previstoAcum = acum(previstoMes).map((v) => Math.min(100, v));
  const realizadoAcumTodos = acum(realizadoMes).map((v) => Math.min(100, v));
  const ultimaMedida = medicoes.length ? [...medicoes].map((m) => m.competencia).sort().at(-1)! : null;
  const idxUltimaMedida = ultimaMedida && inicio ? difMeses(inicio, ultimaMedida) : -1;
  const ref = inicio ? Math.min(nMeses - 1, difMeses(inicio, competenciaDe(hoje)) - 1) : -1;
  const fisico = idxUltimaMedida >= 0 ? realizadoAcumTodos[Math.min(idxUltimaMedida, nMeses - 1)] ?? 0 : 0;
  const previstoRef = ref >= 0 ? previstoAcum[ref] : 0;
  const realizadoRef = ref >= 0 ? realizadoAcumTodos[ref] : 0;
  const desvio = previstoRef - realizadoRef;
  let situacao: SituacaoObra;
  if (obra.obraSituacao === "PARALISADA") situacao = "PARALISADA";
  else if (obra.obraSituacao === "CONCLUIDA" || fisico >= 99.95) situacao = "CONCLUIDA";
  else if (ref < 0 && fisico === 0) situacao = "NAO_INICIADA";
  else if (desvio > DESVIO_ATRASO) situacao = "ATRASADA";
  else situacao = "EM_DIA";
  /** Percentual executado de cada etapa até agora. */
  const porEtapa = etapas.map((e) => ({
    id: e.id,
    nome: e.nome,
    valor: num(e.valor),
    previstoAteRef: ref >= 0 ? Math.min(100, e.previsto.slice(0, ref + 1).reduce((s, v) => s + v, 0)) : 0,
    executado: Math.min(
      100,
      medicoes.reduce((s, m) => s + (m.executado[e.id] ?? 0), 0),
    ),
  }));
  return {
    total,
    meses,
    previstoAcum,
    /** Realizado acumulado só até o último mês medido (para não desenhar a linha no futuro). */
    realizadoAcum: idxUltimaMedida >= 0 ? realizadoAcumTodos.slice(0, Math.min(idxUltimaMedida, nMeses - 1) + 1) : [],
    fisico,
    previstoRef,
    realizadoRef,
    refMes: ref >= 0 ? meses[ref] : null,
    desvio,
    situacao,
    porEtapa,
  };
}
export type AnaliseObra = ReturnType<typeof analisarObra>;

/** Valor de uma medição: soma do % de cada etapa vezes o valor da etapa. */
export function valorMedicao(etapas: { id: string; valor: string | number }[], executado: Record<string, number>) {
  return etapas.reduce((s, e) => s + (num(e.valor) * (executado[e.id] ?? 0)) / 100, 0);
}

/** "20; 30; 30; 20" → [20,30,30,20] */
export function lerPrevisto(txt: string): number[] {
  return txt
    .split(/[;\s]+/)
    .map((x) => x.trim().replace(",", "."))
    .filter(Boolean)
    .map(Number);
}

// Regras puras do módulo de repasses e obrigações da área (sem banco, sem Next), testadas em regras.test.ts.
// - Alertas de prazo em DIAS CORRIDOS (30, 15, 5 dias e vencido): prazos de repasse e de obrigação são datas de calendário
//   fixadas pelo concedente ou pelo destinatário, não prazos processuais em dias úteis.
// - Execução do repasse: soma do que foi contratado, liquidado e pago nos processos vinculados (a fonte do valor é a mesma
//   da fila de pagamentos: metadados.contratacao.valor).
// - Quem edita: quem é da área da secretaria responsável ou do Gabinete. Ver segue `podeVerArea`. O papel ADMIN não dá edição.
import { AREAS, areaDoUsuario, ehArea, podeVerArea, type Area, type UsuarioComArea } from "../../lib/areas";

export const TIPOS_REPASSE: Record<string, { nome: string; descricao: string }> = {
  EMENDA_INDIVIDUAL: { nome: "Emenda individual", descricao: "Emenda parlamentar individual ao orçamento do Estado ou da União." },
  EMENDA_BANCADA: { nome: "Emenda de bancada", descricao: "Emenda apresentada pela bancada de parlamentares do estado." },
  TRANSFERENCIA_ESPECIAL: { nome: "Transferência especial", descricao: "Recurso de emenda repassado direto ao município, sem convênio." },
  CONVENIO: { nome: "Convênio", descricao: "Instrumento assinado com o concedente, com plano de trabalho e prestação de contas." },
  FUNDO_A_FUNDO: { nome: "Fundo a fundo", descricao: "Transferência de fundo nacional ou estadual para o fundo municipal." },
  PROGRAMA: { nome: "Programa", descricao: "Recurso de programa federal ou estadual com regras próprias." },
};

export const SITUACOES_REPASSE: Record<string, { nome: string; tone: "neutral" | "brand" | "ok" | "warn" | "bad" }> = {
  EM_CAPTACAO: { nome: "Em captação", tone: "neutral" },
  VIGENTE: { nome: "Vigente", tone: "brand" },
  EM_EXECUCAO: { nome: "Em execução", tone: "brand" },
  PRESTACAO_PENDENTE: { nome: "Prestação de contas pendente", tone: "warn" },
  PRESTADO: { nome: "Contas prestadas", tone: "ok" },
  COM_PENDENCIA: { nome: "Com pendência", tone: "bad" },
};

export const PERIODICIDADES: Record<string, { nome: string; meses: number }> = {
  MENSAL: { nome: "Mensal", meses: 1 },
  BIMESTRAL: { nome: "Bimestral", meses: 2 },
  TRIMESTRAL: { nome: "Trimestral", meses: 3 },
  QUADRIMESTRAL: { nome: "Quadrimestral", meses: 4 },
  SEMESTRAL: { nome: "Semestral", meses: 6 },
  ANUAL: { nome: "Anual", meses: 12 },
  UNICA: { nome: "Entrega única", meses: 0 },
};

export const SITUACOES_OBRIGACAO: Record<string, { nome: string; tone: "neutral" | "brand" | "ok" }> = {
  PENDENTE: { nome: "A fazer", tone: "neutral" },
  EM_PREPARACAO: { nome: "Em preparação", tone: "brand" },
  ENTREGUE: { nome: "Entregue", tone: "ok" },
};

export const nomeTipoRepasse = (t: string) => TIPOS_REPASSE[t]?.nome ?? "Outro";
export const nomeSituacaoRepasse = (s: string) => SITUACOES_REPASSE[s]?.nome ?? "Situação não informada";

// ---------------------------------------------------------------------------
// Datas (ISO aaaa-mm-dd, calendário)
// ---------------------------------------------------------------------------

const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const ehDataIso = (s: unknown): s is string => typeof s === "string" && ISO.test(s) && new Date(s + "T00:00:00Z").toISOString().slice(0, 10) === s;

/** Dias corridos de `de` até `ate` (datas ISO): positivo se `ate` é depois. */
export function diasCorridosEntre(de: string, ate: string): number {
  return Math.round((Date.parse(ate + "T00:00:00Z") - Date.parse(de + "T00:00:00Z")) / 86400_000);
}

/** Data ISO de hoje no calendário de Brasília (o município trabalha no horário local). */
export function hojeLocal(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Fortaleza", year: "numeric", month: "2-digit", day: "2-digit" }).format(agora);
}

/** dd/mm/aaaa de uma data ISO, sem passar por fuso (a data é de calendário). */
export function dataBr(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

/** Soma meses a uma data ISO, mantendo o dia (ou o último dia do mês, se ele não existir). */
export function somarMeses(iso: string, meses: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 + meses, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimo));
  return alvo.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Alertas de prazo: 30, 15, 5 dias e vencido (dias corridos)
// ---------------------------------------------------------------------------

export type NivelPrazo = "vencido" | "5" | "15" | "30" | "ok";
export type AlertaPrazo = { nivel: NivelPrazo; dias: number; texto: string; tone: "bad" | "warn" | "neutral" | "ok" };

/** Ordem de gravidade: menor é mais grave. */
export const GRAVIDADE_PRAZO: Record<NivelPrazo, number> = { vencido: 0, "5": 1, "15": 2, "30": 3, ok: 4 };

/**
 * Alerta de um prazo de calendário. Faltando até 5 dias (inclusive o dia do vencimento): "5"; até 15: "15"; até 30: "30";
 * passou: "vencido"; mais de 30: "ok".
 */
export function alertaDePrazo(prazo: string, hoje: string): AlertaPrazo {
  const dias = diasCorridosEntre(hoje, prazo);
  if (dias < 0) return { nivel: "vencido", dias, texto: dias === -1 ? "Venceu ontem" : `Vencido há ${-dias} dias`, tone: "bad" };
  const texto = dias === 0 ? "Vence hoje" : dias === 1 ? "Vence amanhã" : `Vence em ${dias} dias`;
  if (dias <= 5) return { nivel: "5", dias, texto, tone: "bad" };
  if (dias <= 15) return { nivel: "15", dias, texto, tone: "warn" };
  if (dias <= 30) return { nivel: "30", dias, texto, tone: "warn" };
  return { nivel: "ok", dias, texto: `Faltam ${dias} dias`, tone: "neutral" };
}

export type PrazoRepasse = { chave: "execucao" | "vigencia" | "prestacao"; rotulo: string; data: string; alerta: AlertaPrazo };

type DatasRepasse = { situacao: string; prazoExecucao: string | null; vigenciaFim: string | null; prazoPrestacaoContas: string | null };

/**
 * Prazos que valem para o repasse na situação atual, do mais grave ao menos grave.
 * Vigente ou em execução: execução, vigência e prestação de contas. Prestação pendente ou com pendência: prestação de contas.
 * Em captação e contas prestadas: nenhum prazo a vigiar.
 */
export function prazosDoRepasse(r: DatasRepasse, hoje: string): PrazoRepasse[] {
  const lista: Omit<PrazoRepasse, "alerta">[] = [];
  if (r.situacao === "VIGENTE" || r.situacao === "EM_EXECUCAO") {
    if (r.prazoExecucao) lista.push({ chave: "execucao", rotulo: "Prazo de execução", data: r.prazoExecucao });
    if (r.vigenciaFim) lista.push({ chave: "vigencia", rotulo: "Fim da vigência", data: r.vigenciaFim });
    if (r.prazoPrestacaoContas) lista.push({ chave: "prestacao", rotulo: "Prestação de contas", data: r.prazoPrestacaoContas });
  } else if (r.situacao === "PRESTACAO_PENDENTE" || r.situacao === "COM_PENDENCIA") {
    if (r.prazoPrestacaoContas) lista.push({ chave: "prestacao", rotulo: "Prestação de contas", data: r.prazoPrestacaoContas });
  }
  return lista
    .map((p) => ({ ...p, alerta: alertaDePrazo(p.data, hoje) }))
    .sort((a, b) => GRAVIDADE_PRAZO[a.alerta.nivel] - GRAVIDADE_PRAZO[b.alerta.nivel] || a.data.localeCompare(b.data));
}

/** O prazo mais crítico do repasse (ou null quando não há prazo a vigiar). */
export const prazoCritico = (r: DatasRepasse, hoje: string): PrazoRepasse | null => prazosDoRepasse(r, hoje)[0] ?? null;

// ---------------------------------------------------------------------------
// Execução pelos processos vinculados
// ---------------------------------------------------------------------------

/**
 * Um processo vinculado, já classificado. `valor` é metadados.contratacao.valor (null se a contratação ainda não foi registrada).
 * `liquidado`: está liquidado agora (na fila cronológica, enviado ao banco ou pago); uma liquidação devolvida não conta.
 * `pago`: chegou a PAGO (retorno do banco aceito). `cancelado`: encerrado sem pagamento (não conta como contratado).
 * `origemId`: num pagamento de contrato, o processo de compra de onde o contrato saiu (metadados.contrato.processoOrigemId).
 */
export type ProcessoExecucao = { id?: string; valor: number | null; liquidado: boolean; pago: boolean; cancelado: boolean; origemId?: string | null };
export type Execucao = { contratado: number; liquidado: number; pago: number };

/**
 * Soma da execução: contratado ⊇ liquidado ⊇ pago (um processo pago também conta como liquidado e contratado).
 * Compra e pagamentos do mesmo contrato no mesmo repasse contam uma vez só: o contratado vem da compra de origem; o
 * liquidado e o pago vêm dos pagamentos do contrato quando existirem, senão do fluxo da própria compra. Pagamento cuja
 * compra de origem não está no repasse conta sozinho (contratado = valor da nota).
 */
export function somarExecucao(processos: ProcessoExecucao[]): Execucao {
  const e: Execucao = { contratado: 0, liquidado: 0, pago: 0 };
  const conta = (p: ProcessoExecucao) => p.valor != null && Number.isFinite(p.valor) && !(p.cancelado && !p.pago);
  const ids = new Set(processos.map((p) => p.id).filter(Boolean));
  const pagamentosDe = new Map<string, ProcessoExecucao[]>();
  for (const p of processos)
    if (p.origemId && ids.has(p.origemId) && p.origemId !== p.id) pagamentosDe.set(p.origemId, [...(pagamentosDe.get(p.origemId) ?? []), p]);
  for (const p of processos) {
    if (p.origemId && ids.has(p.origemId) && p.origemId !== p.id) continue; // já entra pela compra de origem
    const pags = (p.id ? pagamentosDe.get(p.id) : undefined)?.filter(conta) ?? [];
    if (conta(p)) e.contratado += p.valor!;
    else if (pags.length) e.contratado += pags.reduce((s, x) => s + x.valor!, 0); // compra sem valor registrado: vale o que foi pago
    if (pags.length) {
      for (const x of pags) {
        if (x.liquidado || x.pago) e.liquidado += x.valor!;
        if (x.pago) e.pago += x.valor!;
      }
    } else if (conta(p)) {
      if (p.liquidado || p.pago) e.liquidado += p.valor!;
      if (p.pago) e.pago += p.valor!;
    }
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return { contratado: r2(e.contratado), liquidado: r2(e.liquidado), pago: r2(e.pago) };
}

/** Percentual executado do repasse: o que foi pago sobre o valor previsto (0 a 100+, uma casa). */
export function percentualExecutado(pago: number, previsto: number): number {
  if (!previsto || previsto <= 0) return 0;
  return Math.round((pago / previsto) * 1000) / 10;
}

// ---------------------------------------------------------------------------
// Risco (para a cabine da secretaria e a sala do prefeito)
// ---------------------------------------------------------------------------

export type Risco = { emRisco: boolean; motivo: string | null; valorEmRisco: number };

/**
 * Repasse em risco: prazo crítico em até 30 dias ou vencido, ou situação "com pendência".
 * Valor em risco: prazo de execução ou vigência → o que falta pagar do previsto; prestação de contas ou pendência → o valor recebido
 * (é o que o concedente pode pedir de volta).
 */
export function riscoDoRepasse(r: DatasRepasse & { valorPrevisto: number; valorRecebido: number }, pago: number, hoje: string): Risco {
  const p = prazoCritico(r, hoje);
  const naoExecutado = Math.max(0, r.valorPrevisto - pago);
  if (r.situacao === "COM_PENDENCIA") return { emRisco: true, motivo: "Repasse com pendência junto ao concedente", valorEmRisco: r.valorRecebido };
  if (!p || p.alerta.nivel === "ok") return { emRisco: false, motivo: null, valorEmRisco: 0 };
  const valor = p.chave === "prestacao" ? r.valorRecebido : naoExecutado;
  return { emRisco: true, motivo: `${p.rotulo}: ${p.alerta.texto.toLowerCase()}`, valorEmRisco: valor };
}

// ---------------------------------------------------------------------------
// Obrigações: próximo vencimento depois de uma entrega
// ---------------------------------------------------------------------------

/** Depois de entregar: a recorrente passa ao vencimento seguinte; a única fica entregue (null). */
export function vencimentoSeguinte(periodicidade: string, vencimento: string): string | null {
  const meses = PERIODICIDADES[periodicidade]?.meses ?? 0;
  return meses > 0 ? somarMeses(vencimento, meses) : null;
}

// ---------------------------------------------------------------------------
// Autorização (decidida no servidor; a tela só repete)
// ---------------------------------------------------------------------------

/**
 * Pode cadastrar e editar repasses e obrigações da área `area`? Só quem é da própria área ou do Gabinete.
 * Controle Interno e o papel ADMIN veem tudo, mas não editam (ver não é agir).
 */
export function podeEditarNaArea(u: UsuarioComArea, area: string | null | undefined): boolean {
  const minha = areaDoUsuario(u);
  if (!minha) return false;
  if (minha === "GABINETE") return true;
  if (!ehArea(area)) return false;
  return podeVerArea(u, area) && minha === area;
}

/** Pode ver repasses e obrigações da área `area`? (setor sem área: só quem vê tudo) */
export function podeVerNaArea(u: UsuarioComArea, area: string | null | undefined): boolean {
  if (ehArea(area)) return podeVerArea(u, area as Area);
  return podeVerArea(u, "GABINETE");
}

/** Só secretarias com pasta própria (Gabinete, Administração, Fazenda, Saúde, Educação, Assistência e Infraestrutura) respondem por repasse e obrigação. */
export function areaTemPasta(area: string | null | undefined): boolean {
  return AREAS.some((a) => a.chave === area && a.pasta);
}

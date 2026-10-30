// Finanças: orçamento (LOA), créditos adicionais, execução da despesa (reserva, empenho, liquidação, pagamento),
// receita prevista × arrecadada, contas bancárias por fonte e vínculo entre processos e empenhos.
// Valores em reais com 2 casas (numeric), lidos como number.
import { text, integer, timestamp, date, numeric, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { tramite, municipios, unidadesGestoras, usuarios, processos } from "./core";
import { empresas } from "./portal";

const id = () =>
  text("id")
    .primaryKey()
    .default(sql`gen_random_uuid()::text`);
const dinheiro = (nome: string) => numeric(nome, { precision: 16, scale: 2, mode: "number" });

/** Dotação da LOA: a menor unidade do orçamento, onde se reserva e se empenha. */
export const finDotacoes = tramite.table(
  "fin_dotacoes",
  {
    id: id(),
    municipioId: text("municipio_id")
      .notNull()
      .references(() => municipios.id),
    unidadeGestoraId: text("unidade_gestora_id")
      .notNull()
      .references(() => unidadesGestoras.id),
    ano: integer("ano").notNull(),
    /** órgão (ex.: "05") e unidade orçamentária (ex.: "05.01") */
    orgao: text("orgao").notNull(),
    orgaoNome: text("orgao_nome").notNull(),
    unidade: text("unidade").notNull(),
    unidadeNome: text("unidade_nome").notNull(),
    funcao: text("funcao").notNull(),
    subfuncao: text("subfuncao").notNull(),
    programa: text("programa").notNull(),
    programaNome: text("programa_nome").notNull(),
    acao: text("acao").notNull(),
    acaoNome: text("acao_nome").notNull(),
    /** natureza da despesa até o elemento (ex.: 3.3.90.30) */
    natureza: text("natureza").notNull(),
    /** fonte detalhada (ex.: 1500.1002) */
    fonte: text("fonte").notNull(),
    valorInicial: dinheiro("valor_inicial").notNull(),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("fin_dotacao_chave").on(t.municipioId, t.ano, t.unidade, t.funcao, t.subfuncao, t.programa, t.acao, t.natureza, t.fonte),
    index("fin_dotacao_municipio_ano").on(t.municipioId, t.ano),
  ],
);

/** Crédito adicional (positivo) ou anulação usada como fonte do crédito (negativo), sempre com decreto. */
export const finCreditos = tramite.table(
  "fin_creditos",
  {
    id: id(),
    dotacaoId: text("dotacao_id")
      .notNull()
      .references(() => finDotacoes.id),
    tipo: text("tipo").notNull(), // SUPLEMENTAR | ESPECIAL | EXTRAORDINARIO | REDUCAO
    decretoNumero: text("decreto_numero").notNull(),
    decretoData: date("decreto_data").notNull(),
    valor: dinheiro("valor").notNull(),
    justificativa: text("justificativa"),
    criadoPorId: text("criado_por_id").references(() => usuarios.id),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("fin_credito_dotacao").on(t.dotacaoId)],
);

/** Reserva (pré-empenho): separa saldo da dotação para um processo antes do empenho. */
export const finReservas = tramite.table(
  "fin_reservas",
  {
    id: id(),
    municipioId: text("municipio_id")
      .notNull()
      .references(() => municipios.id),
    ano: integer("ano").notNull(),
    numero: integer("numero").notNull(),
    dotacaoId: text("dotacao_id")
      .notNull()
      .references(() => finDotacoes.id),
    processoId: text("processo_id").references(() => processos.id, { onDelete: "set null" }),
    data: date("data").notNull(),
    valor: dinheiro("valor").notNull(),
    historico: text("historico").notNull(),
    situacao: text("situacao").notNull().default("ABERTA"), // ABERTA | ANULADA
    anuladaEm: timestamp("anulada_em", { withTimezone: true }),
    criadoPorId: text("criado_por_id").references(() => usuarios.id),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("fin_reserva_numero").on(t.municipioId, t.ano, t.numero), index("fin_reserva_dotacao").on(t.dotacaoId)],
);

/** Empenho (Lei 4.320, art. 58): compromisso com um credor, abatido da dotação. */
export const finEmpenhos = tramite.table(
  "fin_empenhos",
  {
    id: id(),
    municipioId: text("municipio_id")
      .notNull()
      .references(() => municipios.id),
    ano: integer("ano").notNull(),
    numero: integer("numero").notNull(),
    dotacaoId: text("dotacao_id")
      .notNull()
      .references(() => finDotacoes.id),
    reservaId: text("reserva_id").references(() => finReservas.id),
    tipo: text("tipo").notNull(), // ORDINARIO | ESTIMATIVO | GLOBAL
    empresaId: text("empresa_id").references(() => empresas.id),
    credorNome: text("credor_nome").notNull(),
    credorDocumento: text("credor_documento"),
    historico: text("historico").notNull(),
    data: date("data").notNull(),
    valor: dinheiro("valor").notNull(),
    valorAnulado: dinheiro("valor_anulado").notNull().default(0),
    /** anulações registradas: data, valor, motivo e autor (trilha preservada) */
    anulacoes: jsonb("anulacoes").$type<{ data: string; valor: number; motivo: string; autor: string }[]>(),
    criadoPorId: text("criado_por_id").references(() => usuarios.id),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("fin_empenho_numero").on(t.municipioId, t.ano, t.numero),
    index("fin_empenho_dotacao").on(t.dotacaoId),
    index("fin_empenho_empresa").on(t.empresaId),
  ],
);

/** Liquidação (art. 63): verificação do direito do credor, com documento fiscal e vencimento. */
export const finLiquidacoes = tramite.table(
  "fin_liquidacoes",
  {
    id: id(),
    empenhoId: text("empenho_id")
      .notNull()
      .references(() => finEmpenhos.id),
    data: date("data").notNull(),
    valor: dinheiro("valor").notNull(),
    documentoFiscal: text("documento_fiscal").notNull(),
    vencimento: date("vencimento").notNull(),
    criadoPorId: text("criado_por_id").references(() => usuarios.id),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("fin_liquidacao_empenho").on(t.empenhoId)],
);

/** Conta bancária vinculada a um grupo de fonte. Saldo do extrato é simulado na demonstração. */
export const finContas = tramite.table(
  "fin_contas",
  {
    id: id(),
    municipioId: text("municipio_id")
      .notNull()
      .references(() => municipios.id),
    banco: text("banco").notNull(),
    agencia: text("agencia").notNull(),
    numero: text("numero").notNull(),
    nome: text("nome").notNull(),
    grupoFonte: text("grupo_fonte").notNull(),
    saldoExtrato: dinheiro("saldo_extrato").notNull(),
    extratoEm: date("extrato_em").notNull(),
  },
  (t) => [uniqueIndex("fin_conta_numero").on(t.municipioId, t.banco, t.agencia, t.numero)],
);

/** Pagamento (art. 64): ordem bancária de uma liquidação, debitada de uma conta da mesma fonte. */
export const finPagamentos = tramite.table(
  "fin_pagamentos",
  {
    id: id(),
    liquidacaoId: text("liquidacao_id")
      .notNull()
      .references(() => finLiquidacoes.id),
    contaId: text("conta_id")
      .notNull()
      .references(() => finContas.id),
    data: date("data").notNull(),
    valor: dinheiro("valor").notNull(),
    /** justificativa pública quando o pagamento sai fora da ordem cronológica da fonte (Lei 14.133, art. 141) */
    justificativaOrdem: text("justificativa_ordem"),
    criadoPorId: text("criado_por_id").references(() => usuarios.id),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("fin_pagamento_liquidacao").on(t.liquidacaoId), index("fin_pagamento_conta").on(t.contaId)],
);

/** Vínculo entre um processo (ex.: COMPRA) e o empenho que o atende. */
export const finProcessoEmpenho = tramite.table(
  "fin_processo_empenho",
  {
    id: id(),
    processoId: text("processo_id")
      .notNull()
      .references(() => processos.id, { onDelete: "cascade" }),
    empenhoId: text("empenho_id")
      .notNull()
      .references(() => finEmpenhos.id, { onDelete: "cascade" }),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("fin_processo_empenho_par").on(t.processoId, t.empenhoId), index("fin_pe_empenho").on(t.empenhoId)],
);

/** Receita por mês e categoria: previsão (LOA, desdobrada em metas bimestrais) e arrecadação. */
export const finReceitas = tramite.table(
  "fin_receitas",
  {
    id: id(),
    municipioId: text("municipio_id")
      .notNull()
      .references(() => municipios.id),
    ano: integer("ano").notNull(),
    mes: integer("mes").notNull(),
    categoria: text("categoria").notNull(),
    previsto: dinheiro("previsto").notNull(),
    arrecadado: dinheiro("arrecadado"),
  },
  (t) => [uniqueIndex("fin_receita_chave").on(t.municipioId, t.ano, t.mes, t.categoria)],
);

// ---- relações ----
export const finDotacoesRelations = relations(finDotacoes, ({ one, many }) => ({
  unidadeGestora: one(unidadesGestoras, { fields: [finDotacoes.unidadeGestoraId], references: [unidadesGestoras.id] }),
  creditos: many(finCreditos),
  reservas: many(finReservas),
  empenhos: many(finEmpenhos),
}));
export const finCreditosRelations = relations(finCreditos, ({ one }) => ({
  dotacao: one(finDotacoes, { fields: [finCreditos.dotacaoId], references: [finDotacoes.id] }),
}));
export const finReservasRelations = relations(finReservas, ({ one, many }) => ({
  dotacao: one(finDotacoes, { fields: [finReservas.dotacaoId], references: [finDotacoes.id] }),
  processo: one(processos, { fields: [finReservas.processoId], references: [processos.id] }),
  empenhos: many(finEmpenhos),
}));
export const finEmpenhosRelations = relations(finEmpenhos, ({ one, many }) => ({
  dotacao: one(finDotacoes, { fields: [finEmpenhos.dotacaoId], references: [finDotacoes.id] }),
  reserva: one(finReservas, { fields: [finEmpenhos.reservaId], references: [finReservas.id] }),
  empresa: one(empresas, { fields: [finEmpenhos.empresaId], references: [empresas.id] }),
  liquidacoes: many(finLiquidacoes),
  processos: many(finProcessoEmpenho),
}));
export const finLiquidacoesRelations = relations(finLiquidacoes, ({ one, many }) => ({
  empenho: one(finEmpenhos, { fields: [finLiquidacoes.empenhoId], references: [finEmpenhos.id] }),
  pagamentos: many(finPagamentos),
}));
export const finPagamentosRelations = relations(finPagamentos, ({ one }) => ({
  liquidacao: one(finLiquidacoes, { fields: [finPagamentos.liquidacaoId], references: [finLiquidacoes.id] }),
  conta: one(finContas, { fields: [finPagamentos.contaId], references: [finContas.id] }),
}));
export const finProcessoEmpenhoRelations = relations(finProcessoEmpenho, ({ one }) => ({
  processo: one(processos, { fields: [finProcessoEmpenho.processoId], references: [processos.id] }),
  empenho: one(finEmpenhos, { fields: [finProcessoEmpenho.empenhoId], references: [finEmpenhos.id] }),
}));

export type FinDotacao = typeof finDotacoes.$inferSelect;
export type FinEmpenho = typeof finEmpenhos.$inferSelect;
export type FinConta = typeof finContas.$inferSelect;

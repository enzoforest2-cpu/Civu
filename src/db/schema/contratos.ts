// Contratos, aditivos, notas fiscais e execução de obras (cronograma, medições e diário).
// O contrato é um objeto próprio, ligado ao processo de origem (opcional) e à empresa contratada.
import { text, integer, boolean, timestamp, jsonb, date, numeric, uniqueIndex, index } from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { tramite, municipios, unidadesGestoras, processos, usuarios, setores } from "./core";
import { empresas, pessoas } from "./portal";

const id = () =>
  text("id")
    .primaryKey()
    .default(sql`gen_random_uuid()::text`);
const dinheiro = (nome: string) => numeric(nome, { precision: 14, scale: 2 });

/**
 * Contrato administrativo. `natureza` define o limite de acréscimo (art. 125 da Lei 14.133: 25% em geral, 50% para reforma)
 * e se o contrato tem cronograma de obra. `situacao` guarda só o que é ato (ativo, encerrado, rescindido);
 * "a vencer" é calculado pela vigência atual (com aditivos de prazo).
 */
export const contratos = tramite.table(
  "contratos",
  {
    id: id(),
    municipioId: text("municipio_id")
      .notNull()
      .references(() => municipios.id),
    unidadeGestoraId: text("unidade_gestora_id").references(() => unidadesGestoras.id),
    ano: integer("ano").notNull(),
    numero: integer("numero").notNull(),
    objeto: text("objeto").notNull(),
    natureza: text("natureza").notNull(), // COMPRA | SERVICO | SERVICO_CONTINUO | OBRA | REFORMA
    modalidade: text("modalidade").notNull(), // PREGAO | CONCORRENCIA | DISPENSA | INEXIGIBILIDADE | ADESAO_ATA | CHAMADA_PUBLICA
    empresaId: text("empresa_id")
      .notNull()
      .references(() => empresas.id),
    processoOrigemId: text("processo_origem_id").references(() => processos.id),
    setorId: text("setor_id").references(() => setores.id),
    valorGlobal: dinheiro("valor_global").notNull(),
    fonte: text("fonte").notNull(),
    assinadoEm: date("assinado_em").notNull(),
    vigenciaInicio: date("vigencia_inicio").notNull(),
    vigenciaFim: date("vigencia_fim").notNull(),
    fiscalId: text("fiscal_id").references(() => usuarios.id),
    gestorId: text("gestor_id").references(() => usuarios.id),
    situacao: text("situacao").notNull().default("ATIVO"), // ATIVO | ENCERRADO | RESCINDIDO
    encerradoEm: date("encerrado_em"),
    motivoEncerramento: text("motivo_encerramento"),
    // obra (natureza OBRA ou REFORMA)
    obraLocal: text("obra_local"),
    obraInicio: date("obra_inicio"),
    obraPrevisaoFim: date("obra_previsao_fim"),
    obraSituacao: text("obra_situacao"), // EM_EXECUCAO | PARALISADA | CONCLUIDA
    /** Motivo do atraso ou da paralisação, publicado na página de obras. */
    obraMotivo: text("obra_motivo"),
    criadoPorId: text("criado_por_id").references(() => usuarios.id),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("contrato_municipio_ano_numero").on(t.municipioId, t.ano, t.numero), index("contrato_empresa").on(t.empresaId)],
);

/** Termo aditivo: prazo, valor (acréscimo positivo, supressão negativa) ou ambos. */
export const contratoAditivos = tramite.table(
  "contrato_aditivos",
  {
    id: id(),
    contratoId: text("contrato_id")
      .notNull()
      .references(() => contratos.id, { onDelete: "cascade" }),
    numero: integer("numero").notNull(),
    tipo: text("tipo").notNull(), // PRAZO | VALOR | PRAZO_VALOR | SUPRESSAO
    valor: dinheiro("valor").notNull().default("0"),
    novaVigenciaFim: date("nova_vigencia_fim"),
    justificativa: text("justificativa").notNull(),
    assinadoEm: date("assinado_em").notNull(),
    /** Acréscimo acumulado sobre o valor inicial atualizado no momento do registro (percentual). */
    acrescimoAcumulado: numeric("acrescimo_acumulado", { precision: 7, scale: 2 }),
    acimaDoLimite: boolean("acima_do_limite").notNull().default(false),
    criadoPorId: text("criado_por_id").references(() => usuarios.id),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("aditivo_contrato_numero").on(t.contratoId, t.numero)],
);

/** Apostilamento (art. 136): reajuste por índice, mudança de dotação e outras anotações que não exigem aditivo. */
export const contratoApostilamentos = tramite.table(
  "contrato_apostilamentos",
  {
    id: id(),
    contratoId: text("contrato_id")
      .notNull()
      .references(() => contratos.id, { onDelete: "cascade" }),
    numero: integer("numero").notNull(),
    tipo: text("tipo").notNull(), // REAJUSTE | DOTACAO | OUTRO
    indice: text("indice"),
    percentual: numeric("percentual", { precision: 7, scale: 4 }),
    valor: dinheiro("valor").notNull().default("0"),
    descricao: text("descricao").notNull(),
    data: date("data").notNull(),
    criadoPorId: text("criado_por_id").references(() => usuarios.id),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("apostilamento_contrato_numero").on(t.contratoId, t.numero)],
);

/** Etapa do cronograma físico-financeiro de uma obra. `previsto[i]` = % da etapa prevista para o mês i a partir do início. */
export const contratoEtapas = tramite.table(
  "contrato_etapas",
  {
    id: id(),
    contratoId: text("contrato_id")
      .notNull()
      .references(() => contratos.id, { onDelete: "cascade" }),
    ordem: integer("ordem").notNull(),
    nome: text("nome").notNull(),
    valor: dinheiro("valor").notNull(),
    previsto: jsonb("previsto").$type<number[]>().notNull(),
  },
  (t) => [index("etapa_contrato").on(t.contratoId)],
);

/** Boletim de medição mensal: % executado de cada etapa no mês. O valor é calculado a partir do cronograma. */
export const contratoMedicoes = tramite.table(
  "contrato_medicoes",
  {
    id: id(),
    contratoId: text("contrato_id")
      .notNull()
      .references(() => contratos.id, { onDelete: "cascade" }),
    numero: integer("numero").notNull(),
    competencia: text("competencia").notNull(), // AAAA-MM
    executado: jsonb("executado").$type<Record<string, number>>().notNull(),
    valor: dinheiro("valor").notNull(),
    observacao: text("observacao"),
    registradaPorId: text("registrada_por_id").references(() => usuarios.id),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("medicao_contrato_competencia").on(t.contratoId, t.competencia)],
);

/** Diário de obra: registro curto do dia (clima, efetivo, o que foi feito, ocorrências). */
export const contratoDiario = tramite.table(
  "contrato_diario",
  {
    id: id(),
    contratoId: text("contrato_id")
      .notNull()
      .references(() => contratos.id, { onDelete: "cascade" }),
    data: date("data").notNull(),
    clima: text("clima"),
    efetivo: integer("efetivo"),
    texto: text("texto").notNull(),
    autorId: text("autor_id").references(() => usuarios.id),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("diario_contrato_data").on(t.contratoId, t.data)],
);

/**
 * Nota fiscal (ou fatura) ligada ao contrato. Ciclo: AGUARDANDO_ATESTO → ATESTADA → LIQUIDACAO (abre o processo de pagamento,
 * cujo andamento passa a valer: liquidação, fila cronológica, pago) ou GLOSADA. PAGA sem processo = pagamento anterior ao Civu.
 */
export const contratoNotas = tramite.table(
  "contrato_notas",
  {
    id: id(),
    contratoId: text("contrato_id")
      .notNull()
      .references(() => contratos.id, { onDelete: "cascade" }),
    numero: text("numero").notNull(),
    valor: dinheiro("valor").notNull(),
    competencia: text("competencia").notNull(), // AAAA-MM
    emitidaEm: date("emitida_em").notNull(),
    descricao: text("descricao"),
    medicaoId: text("medicao_id").references(() => contratoMedicoes.id),
    origem: text("origem").notNull().default("INTERNO"), // PORTAL | INTERNO
    enviadaPorPessoaId: text("enviada_por_pessoa_id").references(() => pessoas.id),
    registradaPorId: text("registrada_por_id").references(() => usuarios.id),
    situacao: text("situacao").notNull().default("AGUARDANDO_ATESTO"),
    atestadaEm: timestamp("atestada_em", { withTimezone: true }),
    atestadaPorId: text("atestada_por_id").references(() => usuarios.id),
    glosaMotivo: text("glosa_motivo"),
    processoId: text("processo_id").references(() => processos.id),
    enviadaLiquidacaoEm: timestamp("enviada_liquidacao_em", { withTimezone: true }),
    pagaEm: timestamp("paga_em", { withTimezone: true }),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("nota_contrato_numero").on(t.contratoId, t.numero), index("nota_situacao").on(t.situacao), index("nota_processo").on(t.processoId)],
);

export const contratosRelations = relations(contratos, ({ one, many }) => ({
  municipio: one(municipios, { fields: [contratos.municipioId], references: [municipios.id] }),
  unidadeGestora: one(unidadesGestoras, { fields: [contratos.unidadeGestoraId], references: [unidadesGestoras.id] }),
  empresa: one(empresas, { fields: [contratos.empresaId], references: [empresas.id] }),
  processoOrigem: one(processos, { fields: [contratos.processoOrigemId], references: [processos.id] }),
  setor: one(setores, { fields: [contratos.setorId], references: [setores.id] }),
  fiscal: one(usuarios, { fields: [contratos.fiscalId], references: [usuarios.id], relationName: "contratoFiscal" }),
  gestor: one(usuarios, { fields: [contratos.gestorId], references: [usuarios.id], relationName: "contratoGestor" }),
  aditivos: many(contratoAditivos),
  apostilamentos: many(contratoApostilamentos),
  notas: many(contratoNotas),
  etapas: many(contratoEtapas),
  medicoes: many(contratoMedicoes),
  diario: many(contratoDiario),
}));
export const contratoAditivosRelations = relations(contratoAditivos, ({ one }) => ({
  contrato: one(contratos, { fields: [contratoAditivos.contratoId], references: [contratos.id] }),
}));
export const contratoApostilamentosRelations = relations(contratoApostilamentos, ({ one }) => ({
  contrato: one(contratos, { fields: [contratoApostilamentos.contratoId], references: [contratos.id] }),
}));
export const contratoEtapasRelations = relations(contratoEtapas, ({ one }) => ({
  contrato: one(contratos, { fields: [contratoEtapas.contratoId], references: [contratos.id] }),
}));
export const contratoMedicoesRelations = relations(contratoMedicoes, ({ one }) => ({
  contrato: one(contratos, { fields: [contratoMedicoes.contratoId], references: [contratos.id] }),
  registradaPor: one(usuarios, { fields: [contratoMedicoes.registradaPorId], references: [usuarios.id] }),
}));
export const contratoDiarioRelations = relations(contratoDiario, ({ one }) => ({
  contrato: one(contratos, { fields: [contratoDiario.contratoId], references: [contratos.id] }),
  autor: one(usuarios, { fields: [contratoDiario.autorId], references: [usuarios.id] }),
}));
export const contratoNotasRelations = relations(contratoNotas, ({ one }) => ({
  contrato: one(contratos, { fields: [contratoNotas.contratoId], references: [contratos.id] }),
  medicao: one(contratoMedicoes, { fields: [contratoNotas.medicaoId], references: [contratoMedicoes.id] }),
  processo: one(processos, { fields: [contratoNotas.processoId], references: [processos.id] }),
  atestadaPor: one(usuarios, { fields: [contratoNotas.atestadaPorId], references: [usuarios.id] }),
  enviadaPor: one(pessoas, { fields: [contratoNotas.enviadaPorPessoaId], references: [pessoas.id] }),
}));

export type Contrato = typeof contratos.$inferSelect;
export type ContratoAditivo = typeof contratoAditivos.$inferSelect;
export type ContratoApostilamento = typeof contratoApostilamentos.$inferSelect;
export type ContratoNota = typeof contratoNotas.$inferSelect;
export type ContratoEtapa = typeof contratoEtapas.$inferSelect;
export type ContratoMedicao = typeof contratoMedicoes.$inferSelect;
export type ContratoDiario = typeof contratoDiario.$inferSelect;

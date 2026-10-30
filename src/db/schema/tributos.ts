// Tributos, cadastro imobiliário e observatório imobiliário.
// Cadastro de imóveis com planta genérica de valores, lançamentos (IPTU, ITBI, ISS, taxas), parcelas e guias,
// declarações de ITBI com avaliação fundamentada, inscrição municipal e alvarás, dívida ativa e certidões.
// Parâmetros (planta, alíquotas, previsão) são versionados por exercício e município, com fundamento.
import { text, integer, boolean, timestamp, jsonb, date, numeric, uniqueIndex, index } from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { tramite, municipios, usuarios, processos } from "./core";
import { pessoas, empresas, type Endereco } from "./portal";

const id = () =>
  text("id")
    .primaryKey()
    .default(sql`gen_random_uuid()::text`);
const dinheiro = (nome: string) => numeric(nome, { precision: 14, scale: 2, mode: "number" });
const area = (nome: string) => numeric(nome, { precision: 12, scale: 2, mode: "number" });
const municipioRef = () =>
  text("municipio_id")
    .notNull()
    .references(() => municipios.id);

/** Planta genérica de valores (simplificada): valor do m² de terreno e de construção por bairro, por exercício. */
export const tribPlanta = tramite.table(
  "trib_planta",
  {
    id: id(),
    municipioId: municipioRef(),
    exercicio: integer("exercicio").notNull(),
    bairro: text("bairro").notNull(),
    valorM2Terreno: dinheiro("valor_m2_terreno").notNull(),
    valorM2Construcao: dinheiro("valor_m2_construcao").notNull(),
    fundamento: text("fundamento").notNull(),
  },
  (t) => [uniqueIndex("trib_planta_exercicio_bairro").on(t.municipioId, t.exercicio, t.bairro)],
);

/** Alíquotas e condições de pagamento por tributo e uso, por exercício (motor de regra versionado por vigência). */
export const tribAliquotas = tramite.table(
  "trib_aliquotas",
  {
    id: id(),
    municipioId: municipioRef(),
    exercicio: integer("exercicio").notNull(),
    tributo: text("tributo").notNull(), // IPTU | ITBI | ISS | TLF
    uso: text("uso").notNull().default("TODOS"), // RESIDENCIAL | COMERCIAL | INDUSTRIAL | TERRENO | TODOS
    aliquota: numeric("aliquota", { precision: 8, scale: 5, mode: "number" }).notNull(), // fração: 0.006 = 0,6%
    descontoCotaUnica: numeric("desconto_cota_unica", { precision: 6, scale: 4, mode: "number" }).notNull().default(0),
    parcelas: integer("parcelas").notNull().default(1),
    fundamento: text("fundamento").notNull(),
  },
  (t) => [uniqueIndex("trib_aliquota_chave").on(t.municipioId, t.exercicio, t.tributo, t.uso)],
);

/** Receita prevista na LOA por tributo e exercício, para comparar com o arrecadado. */
export const tribPrevisoes = tramite.table(
  "trib_previsoes",
  {
    id: id(),
    municipioId: municipioRef(),
    exercicio: integer("exercicio").notNull(),
    tributo: text("tributo").notNull(),
    valorPrevisto: dinheiro("valor_previsto").notNull(),
  },
  (t) => [uniqueIndex("trib_previsao_chave").on(t.municipioId, t.exercicio, t.tributo)],
);

/** Imóvel do cadastro imobiliário. `valorVenal` é calculado pela planta do exercício e guardado com a memória. */
export const tribImoveis = tramite.table(
  "trib_imoveis",
  {
    id: id(),
    municipioId: municipioRef(),
    inscricao: text("inscricao").notNull(),
    logradouro: text("logradouro").notNull(),
    numero: text("numero").notNull(),
    complemento: text("complemento"),
    bairro: text("bairro").notNull(),
    cep: text("cep"),
    quadra: text("quadra"),
    lote: text("lote"),
    areaTerreno: area("area_terreno").notNull(),
    areaConstruida: area("area_construida").notNull().default(0),
    uso: text("uso").notNull(), // RESIDENCIAL | COMERCIAL | INDUSTRIAL | TERRENO
    padrao: text("padrao").notNull().default("MEDIO"), // BAIXO | MEDIO | ALTO
    anoConstrucao: integer("ano_construcao"),
    valorVenal: dinheiro("valor_venal").notNull(),
    memoriaValor: jsonb("memoria_valor"),
    ativo: boolean("ativo").notNull().default(true),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("trib_imovel_inscricao").on(t.municipioId, t.inscricao), index("trib_imovel_bairro").on(t.municipioId, t.bairro)],
);

/** Proprietários (pessoas ou empresas) de cada imóvel, com fração ideal. Transferência fecha o vínculo com `ate`. */
export const tribProprietarios = tramite.table(
  "trib_proprietarios",
  {
    id: id(),
    imovelId: text("imovel_id")
      .notNull()
      .references(() => tribImoveis.id, { onDelete: "cascade" }),
    pessoaId: text("pessoa_id").references(() => pessoas.id),
    empresaId: text("empresa_id").references(() => empresas.id),
    fracao: numeric("fracao", { precision: 5, scale: 2, mode: "number" }).notNull().default(100),
    principal: boolean("principal").notNull().default(true),
    desde: date("desde"),
    ate: date("ate"),
  },
  (t) => [index("trib_prop_imovel").on(t.imovelId), index("trib_prop_pessoa").on(t.pessoaId), index("trib_prop_empresa").on(t.empresaId)],
);

/** Inscrição municipal de empresa (cadastro mobiliário), ligada ao cadastro de empresas. */
export const tribInscricoes = tramite.table(
  "trib_inscricoes",
  {
    id: id(),
    municipioId: municipioRef(),
    empresaId: text("empresa_id")
      .notNull()
      .references(() => empresas.id),
    numero: text("numero").notNull(),
    cnaePrincipal: text("cnae_principal").notNull(),
    cnaeDescricao: text("cnae_descricao").notNull(),
    cnaesSecundarios: text("cnaes_secundarios")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    regime: text("regime").notNull(), // MEI | SIMPLES | NORMAL
    endereco: jsonb("endereco").$type<Endereco>(),
    imovelId: text("imovel_id").references(() => tribImoveis.id),
    areaUtilizada: area("area_utilizada"),
    situacao: text("situacao").notNull().default("ATIVA"), // ATIVA | SUSPENSA | BAIXADA
    abertaEm: date("aberta_em").notNull(),
  },
  (t) => [uniqueIndex("trib_inscricao_numero").on(t.municipioId, t.numero), uniqueIndex("trib_inscricao_empresa").on(t.municipioId, t.empresaId)],
);

/** Alvarás e licenças. O código de verificação permite conferir a autenticidade em /verificar/alvara/<codigo>. */
export const tribLicencas = tramite.table(
  "trib_licencas",
  {
    id: id(),
    municipioId: municipioRef(),
    inscricaoId: text("inscricao_id")
      .notNull()
      .references(() => tribInscricoes.id),
    tipo: text("tipo").notNull(), // LOCALIZACAO_FUNCIONAMENTO | SANITARIA | AMBIENTAL | PUBLICIDADE
    numero: text("numero").notNull(),
    codigoVerificacao: text("codigo_verificacao").notNull().unique(),
    atividades: text("atividades").notNull(),
    emitidaEm: timestamp("emitida_em", { withTimezone: true }).notNull().defaultNow(),
    validaAte: date("valida_ate").notNull(),
    situacao: text("situacao").notNull().default("VIGENTE"), // VIGENTE | CANCELADA (vencimento é calculado pela data)
    processoId: text("processo_id").references(() => processos.id),
    emitidaPorId: text("emitida_por_id").references(() => usuarios.id),
    observacoes: text("observacoes"),
  },
  (t) => [index("trib_licenca_inscricao").on(t.inscricaoId)],
);

/**
 * Lançamento tributário: IPTU, ITBI, ISS, TLF (taxa de licença) ou PARCELAMENTO (acordo de dívida ativa).
 * Guarda base, alíquota e memória de cálculo para que a origem de cada valor seja conhecida.
 */
export const tribLancamentos = tramite.table(
  "trib_lancamentos",
  {
    id: id(),
    municipioId: municipioRef(),
    tributo: text("tributo").notNull(),
    exercicio: integer("exercicio").notNull(),
    competencia: text("competencia"), // ISS: "2026-09"
    imovelId: text("imovel_id").references(() => tribImoveis.id),
    inscricaoId: text("inscricao_id").references(() => tribInscricoes.id),
    contribuintePessoaId: text("contribuinte_pessoa_id").references(() => pessoas.id),
    contribuinteEmpresaId: text("contribuinte_empresa_id").references(() => empresas.id),
    descricao: text("descricao").notNull(),
    baseCalculo: dinheiro("base_calculo").notNull(),
    aliquota: numeric("aliquota", { precision: 8, scale: 5, mode: "number" }),
    valor: dinheiro("valor").notNull(),
    memoria: jsonb("memoria"),
    situacao: text("situacao").notNull().default("ABERTO"), // ABERTO | PAGO | DIVIDA_ATIVA | CANCELADO
    lancadoEm: timestamp("lancado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("trib_lanc_tributo").on(t.municipioId, t.exercicio, t.tributo),
    index("trib_lanc_imovel").on(t.imovelId),
    index("trib_lanc_pessoa").on(t.contribuintePessoaId),
    index("trib_lanc_empresa").on(t.contribuinteEmpresaId),
  ],
);

/** Parcelas de um lançamento. Número 0 = cota única (com desconto); pagar uma opção cancela a outra. */
export const tribParcelas = tramite.table(
  "trib_parcelas",
  {
    id: id(),
    lancamentoId: text("lancamento_id")
      .notNull()
      .references(() => tribLancamentos.id, { onDelete: "cascade" }),
    numero: integer("numero").notNull(),
    vencimento: date("vencimento").notNull(),
    valor: dinheiro("valor").notNull(),
    desconto: dinheiro("desconto").notNull().default(0),
    situacao: text("situacao").notNull().default("ABERTA"), // ABERTA | PAGA | CANCELADA
    pagoEm: timestamp("pago_em", { withTimezone: true }),
    valorPago: dinheiro("valor_pago"),
  },
  (t) => [uniqueIndex("trib_parcela_numero").on(t.lancamentoId, t.numero), index("trib_parcela_venc").on(t.vencimento)],
);

/** Guia de recolhimento (boleto/PIX). Em demonstração, linha digitável e PIX são fictícios e marcados como tal. */
export const tribGuias = tramite.table(
  "trib_guias",
  {
    id: id(),
    municipioId: municipioRef(),
    numero: text("numero").notNull().unique(),
    parcelaIds: text("parcela_ids").array().notNull(),
    descricao: text("descricao").notNull(),
    valorPrincipal: dinheiro("valor_principal").notNull(),
    acrescimos: dinheiro("acrescimos").notNull().default(0),
    valorTotal: dinheiro("valor_total").notNull(),
    vencimento: date("vencimento").notNull(),
    linhaDigitavel: text("linha_digitavel").notNull(),
    pixCopiaCola: text("pix_copia_cola").notNull(),
    demonstracao: boolean("demonstracao").notNull().default(true),
    situacao: text("situacao").notNull().default("EMITIDA"), // EMITIDA | PAGA | CANCELADA
    pagaEm: timestamp("paga_em", { withTimezone: true }),
    emitidaPorPessoaId: text("emitida_por_pessoa_id").references(() => pessoas.id),
    emitidaPorUsuarioId: text("emitida_por_usuario_id").references(() => usuarios.id),
    contribuinteNome: text("contribuinte_nome").notNull(),
    contribuinteDocumento: text("contribuinte_documento").notNull(),
    emitidaEm: timestamp("emitida_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("trib_guia_municipio").on(t.municipioId, t.emitidaEm)],
);

/**
 * Declaração de ITBI (transmissão onerosa). A base de cálculo é o maior valor entre o declarado e a referência
 * fiscal (com memória e possibilidade de contestação). Transações quitadas alimentam o observatório imobiliário.
 */
export const tribItbi = tramite.table(
  "trib_itbi",
  {
    id: id(),
    municipioId: municipioRef(),
    numero: text("numero").notNull(),
    imovelId: text("imovel_id")
      .notNull()
      .references(() => tribImoveis.id),
    natureza: text("natureza").notNull().default("COMPRA_VENDA"), // COMPRA_VENDA | PERMUTA | DACAO | ARREMATACAO
    compradorPessoaId: text("comprador_pessoa_id").references(() => pessoas.id),
    compradorEmpresaId: text("comprador_empresa_id").references(() => empresas.id),
    compradorNome: text("comprador_nome").notNull(),
    compradorDocumento: text("comprador_documento").notNull(),
    vendedorNome: text("vendedor_nome").notNull(),
    vendedorDocumento: text("vendedor_documento").notNull(),
    valorDeclarado: dinheiro("valor_declarado").notNull(),
    financiado: boolean("financiado").notNull().default(false),
    valorFinanciado: dinheiro("valor_financiado"),
    valorReferencia: dinheiro("valor_referencia"),
    baseCalculo: dinheiro("base_calculo"),
    aliquota: numeric("aliquota", { precision: 8, scale: 5, mode: "number" }),
    valorImposto: dinheiro("valor_imposto"),
    memoria: jsonb("memoria"),
    situacao: text("situacao").notNull().default("EM_AVALIACAO"), // EM_AVALIACAO | AVALIADO | PAGO | CONTESTADO | CANCELADO
    justificativa: text("justificativa"),
    contestacao: text("contestacao"),
    avaliadoPorId: text("avaliado_por_id").references(() => usuarios.id),
    avaliadoEm: timestamp("avaliado_em", { withTimezone: true }),
    lancamentoId: text("lancamento_id").references(() => tribLancamentos.id),
    solicitadoPorPessoaId: text("solicitado_por_pessoa_id").references(() => pessoas.id),
    canal: text("canal").notNull().default("PORTAL"),
    declaradoEm: timestamp("declarado_em", { withTimezone: true }).notNull().defaultNow(),
    quitadoEm: timestamp("quitado_em", { withTimezone: true }),
  },
  (t) => [uniqueIndex("trib_itbi_numero").on(t.municipioId, t.numero), index("trib_itbi_situacao").on(t.municipioId, t.situacao), index("trib_itbi_imovel").on(t.imovelId)],
);

/** Inscrição em dívida ativa de um lançamento vencido e não pago. O valor atualizado é calculado na consulta. */
export const tribDividaAtiva = tramite.table(
  "trib_divida_ativa",
  {
    id: id(),
    municipioId: municipioRef(),
    numeroInscricao: text("numero_inscricao").notNull(),
    lancamentoId: text("lancamento_id")
      .notNull()
      .references(() => tribLancamentos.id),
    devedorPessoaId: text("devedor_pessoa_id").references(() => pessoas.id),
    devedorEmpresaId: text("devedor_empresa_id").references(() => empresas.id),
    valorOriginal: dinheiro("valor_original").notNull(),
    vencimentoOriginal: date("vencimento_original").notNull(),
    inscritaEm: date("inscrita_em").notNull(),
    situacao: text("situacao").notNull().default("ATIVA"), // ATIVA | PARCELADA | QUITADA | SUSPENSA | AJUIZADA
    parcelamentoId: text("parcelamento_id").references(() => tribLancamentos.id),
    fundamento: text("fundamento"),
  },
  (t) => [uniqueIndex("trib_da_numero").on(t.municipioId, t.numeroInscricao), index("trib_da_pessoa").on(t.devedorPessoaId), index("trib_da_empresa").on(t.devedorEmpresaId)],
);

/** Certidão de débitos (negativa, positiva ou positiva com efeitos de negativa), com código de verificação público. */
export const tribCertidoes = tramite.table("trib_certidoes", {
  id: id(),
  municipioId: municipioRef(),
  numero: text("numero").notNull(),
  codigoVerificacao: text("codigo_verificacao").notNull().unique(),
  tipo: text("tipo").notNull(), // NEGATIVA | POSITIVA | POSITIVA_EFEITO_NEGATIVA
  pessoaId: text("pessoa_id").references(() => pessoas.id),
  empresaId: text("empresa_id").references(() => empresas.id),
  nome: text("nome").notNull(),
  documento: text("documento").notNull(),
  finalidade: text("finalidade"),
  pendencias: jsonb("pendencias"),
  emitidaEm: timestamp("emitida_em", { withTimezone: true }).notNull().defaultNow(),
  validaAte: date("valida_ate").notNull(),
  solicitadaPorPessoaId: text("solicitada_por_pessoa_id").references(() => pessoas.id),
});

// ---- relações ----
export const tribImoveisRelations = relations(tribImoveis, ({ many }) => ({
  proprietarios: many(tribProprietarios),
  lancamentos: many(tribLancamentos),
  itbis: many(tribItbi),
}));
export const tribProprietariosRelations = relations(tribProprietarios, ({ one }) => ({
  imovel: one(tribImoveis, { fields: [tribProprietarios.imovelId], references: [tribImoveis.id] }),
  pessoa: one(pessoas, { fields: [tribProprietarios.pessoaId], references: [pessoas.id] }),
  empresa: one(empresas, { fields: [tribProprietarios.empresaId], references: [empresas.id] }),
}));
export const tribInscricoesRelations = relations(tribInscricoes, ({ one, many }) => ({
  empresa: one(empresas, { fields: [tribInscricoes.empresaId], references: [empresas.id] }),
  imovel: one(tribImoveis, { fields: [tribInscricoes.imovelId], references: [tribImoveis.id] }),
  licencas: many(tribLicencas),
  lancamentos: many(tribLancamentos),
}));
export const tribLicencasRelations = relations(tribLicencas, ({ one }) => ({
  inscricao: one(tribInscricoes, { fields: [tribLicencas.inscricaoId], references: [tribInscricoes.id] }),
  municipio: one(municipios, { fields: [tribLicencas.municipioId], references: [municipios.id] }),
  processo: one(processos, { fields: [tribLicencas.processoId], references: [processos.id] }),
  emitidaPor: one(usuarios, { fields: [tribLicencas.emitidaPorId], references: [usuarios.id] }),
}));
export const tribLancamentosRelations = relations(tribLancamentos, ({ one, many }) => ({
  imovel: one(tribImoveis, { fields: [tribLancamentos.imovelId], references: [tribImoveis.id] }),
  inscricao: one(tribInscricoes, { fields: [tribLancamentos.inscricaoId], references: [tribInscricoes.id] }),
  pessoa: one(pessoas, { fields: [tribLancamentos.contribuintePessoaId], references: [pessoas.id] }),
  empresa: one(empresas, { fields: [tribLancamentos.contribuinteEmpresaId], references: [empresas.id] }),
  parcelas: many(tribParcelas),
}));
export const tribParcelasRelations = relations(tribParcelas, ({ one }) => ({
  lancamento: one(tribLancamentos, { fields: [tribParcelas.lancamentoId], references: [tribLancamentos.id] }),
}));
export const tribItbiRelations = relations(tribItbi, ({ one }) => ({
  imovel: one(tribImoveis, { fields: [tribItbi.imovelId], references: [tribImoveis.id] }),
  lancamento: one(tribLancamentos, { fields: [tribItbi.lancamentoId], references: [tribLancamentos.id] }),
  avaliadoPor: one(usuarios, { fields: [tribItbi.avaliadoPorId], references: [usuarios.id] }),
  compradorPessoa: one(pessoas, { fields: [tribItbi.compradorPessoaId], references: [pessoas.id] }),
  compradorEmpresa: one(empresas, { fields: [tribItbi.compradorEmpresaId], references: [empresas.id] }),
}));
export const tribDividaAtivaRelations = relations(tribDividaAtiva, ({ one }) => ({
  lancamento: one(tribLancamentos, { fields: [tribDividaAtiva.lancamentoId], references: [tribLancamentos.id] }),
  pessoa: one(pessoas, { fields: [tribDividaAtiva.devedorPessoaId], references: [pessoas.id] }),
  empresa: one(empresas, { fields: [tribDividaAtiva.devedorEmpresaId], references: [empresas.id] }),
}));
export const tribCertidoesRelations = relations(tribCertidoes, ({ one }) => ({
  municipio: one(municipios, { fields: [tribCertidoes.municipioId], references: [municipios.id] }),
}));

export type TribImovel = typeof tribImoveis.$inferSelect;
export type TribLancamento = typeof tribLancamentos.$inferSelect;
export type TribParcela = typeof tribParcelas.$inferSelect;
export type TribItbi = typeof tribItbi.$inferSelect;
export type TribInscricao = typeof tribInscricoes.$inferSelect;
export type TribLicenca = typeof tribLicencas.$inferSelect;
export type TribGuia = typeof tribGuias.$inferSelect;
export type TribDividaAtiva = typeof tribDividaAtiva.$inferSelect;
export type TribCertidao = typeof tribCertidoes.$inferSelect;

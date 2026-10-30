// Identidade de quem é atendido: pessoas, empresas e a representação de uma pela outra.
// Pessoas e empresas não pertencem a um município: a mesma pessoa pode ser atendida por vários.
import { text, boolean, timestamp, jsonb, date, uniqueIndex, index } from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { tramite } from "./core";

const id = () =>
  text("id")
    .primaryKey()
    .default(sql`gen_random_uuid()::text`);

export type Endereco = { logradouro?: string; numero?: string; bairro?: string; cidade?: string; uf?: string; cep?: string; lat?: number; lng?: number };

/** Pessoa física. `nivelGovbr` registra o nível de confiabilidade da conta gov.br usada no último acesso. */
export const pessoas = tramite.table("pessoas", {
  id: id(),
  cpf: text("cpf").notNull().unique(),
  nome: text("nome").notNull(),
  email: text("email"),
  telefone: text("telefone"),
  nascimento: date("nascimento"),
  endereco: jsonb("endereco").$type<Endereco>(),
  nivelGovbr: text("nivel_govbr"),
  senhaHash: text("senha_hash"),
  telefoneConfirmado: boolean("telefone_confirmado").notNull().default(false),
  demonstracao: boolean("demonstracao").notNull().default(false),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});

/** Empresa, MEI ou entidade. */
export const empresas = tramite.table("empresas", {
  id: id(),
  cnpj: text("cnpj").notNull().unique(),
  razaoSocial: text("razao_social").notNull(),
  nomeFantasia: text("nome_fantasia"),
  porte: text("porte").notNull().default("DEMAIS"), // MEI | ME | EPP | DEMAIS
  atividades: text("atividades")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  endereco: jsonb("endereco").$type<Endereco>(),
  email: text("email"),
  telefone: text("telefone"),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Vínculo de representação: quem pode agir por uma empresa, com que papel, em quais assuntos e até quando.
 * Revogar não apaga: marca `revogadaEm` para preservar o histórico.
 */
export const representacoes = tramite.table(
  "representacoes",
  {
    id: id(),
    pessoaId: text("pessoa_id")
      .notNull()
      .references(() => pessoas.id),
    empresaId: text("empresa_id")
      .notNull()
      .references(() => empresas.id),
    papel: text("papel").notNull(), // RESPONSAVEL_LEGAL | SOCIO | PROCURADOR | CONTADOR
    escopos: text("escopos")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`), // PROCESSOS | TRIBUTOS | CONTRATOS | LICENCAS
    validaAte: date("valida_ate"),
    revogadaEm: timestamp("revogada_em", { withTimezone: true }),
    concedidaPorId: text("concedida_por_id").references(() => pessoas.id),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("representacao_pessoa").on(t.pessoaId), index("representacao_empresa").on(t.empresaId)],
);

export const sessoesPortal = tramite.table(
  "sessoes_portal",
  {
    id: id(),
    pessoaId: text("pessoa_id")
      .notNull()
      .references(() => pessoas.id, { onDelete: "cascade" }),
    /** Empresa em nome da qual a pessoa está agindo agora (null = em nome próprio). */
    empresaAtivaId: text("empresa_ativa_id").references(() => empresas.id),
    metodo: text("metodo").notNull(), // GOVBR_SIMULADO | SENHA
    expiraEm: timestamp("expira_em", { withTimezone: true }).notNull(),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("sessao_portal_id").on(t.id)],
);

export const pessoasRelations = relations(pessoas, ({ many }) => ({ representacoes: many(representacoes) }));
export const empresasRelations = relations(empresas, ({ many }) => ({ representantes: many(representacoes) }));
export const representacoesRelations = relations(representacoes, ({ one }) => ({
  pessoa: one(pessoas, { fields: [representacoes.pessoaId], references: [pessoas.id] }),
  empresa: one(empresas, { fields: [representacoes.empresaId], references: [empresas.id] }),
}));
export const sessoesPortalRelations = relations(sessoesPortal, ({ one }) => ({
  pessoa: one(pessoas, { fields: [sessoesPortal.pessoaId], references: [pessoas.id] }),
  empresaAtiva: one(empresas, { fields: [sessoesPortal.empresaAtivaId], references: [empresas.id] }),
}));

export type Pessoa = typeof pessoas.$inferSelect;
export type Empresa = typeof empresas.$inferSelect;
export type Representacao = typeof representacoes.$inferSelect;

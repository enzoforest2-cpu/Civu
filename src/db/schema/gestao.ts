// Módulo Gestão: automações (regras, execuções e alertas), central de integrações e auditoria administrativa.
// Os eventos de processos continuam no livro encadeado do núcleo (tabela eventos); aqui ficam os registros
// do que acontece fora dos processos: alteração de acessos, regras, integrações e decisões em lote.
import { boolean, index, integer, jsonb, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { municipios, processos, tramite, usuarios } from "./core";

const id = () =>
  text("id")
    .primaryKey()
    .default(sql`gen_random_uuid()::text`);

/**
 * Regra de automação "quando X então Y", por município.
 * gatilho: PROCESSO_PARADO | PALAVRA_CHAVE | EXIGENCIA_SEM_RESPOSTA
 * acao: ALERTA | ENCAMINHAR
 * nivel: INFORMAR (só alerta) | SUGERIR (registra sugestão para alguém aplicar) | EXECUTAR (aplica pelo motor)
 */
export const gestaoRegras = tramite.table(
  "gestao_regras",
  {
    id: id(),
    municipioId: text("municipio_id")
      .notNull()
      .references(() => municipios.id),
    nome: text("nome").notNull(),
    descricao: text("descricao"),
    gatilho: text("gatilho").notNull(),
    parametros: jsonb("parametros").notNull(),
    acao: text("acao").notNull(),
    acaoParametros: jsonb("acao_parametros").notNull(),
    nivel: text("nivel").notNull().default("INFORMAR"),
    ativa: boolean("ativa").notNull().default(true),
    versao: integer("versao").notNull().default(1),
    criadoPorId: text("criado_por_id").references(() => usuarios.id),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("gestao_regra_municipio").on(t.municipioId)],
);

/** Cada vez que uma regra é avaliada ("rodar agora"): quantos processos olhou, quantos disparos e o que fez. */
export const gestaoExecucoes = tramite.table(
  "gestao_execucoes",
  {
    id: id(),
    municipioId: text("municipio_id")
      .notNull()
      .references(() => municipios.id),
    regraId: text("regra_id")
      .notNull()
      .references(() => gestaoRegras.id, { onDelete: "cascade" }),
    regraVersao: integer("regra_versao").notNull(),
    usuarioId: text("usuario_id").references(() => usuarios.id),
    origem: text("origem").notNull().default("MANUAL"),
    avaliados: integer("avaliados").notNull().default(0),
    disparos: integer("disparos").notNull().default(0),
    /** [{ processoId, numero, motivo, resultado, detalhe }] */
    itens: jsonb("itens").notNull(),
    erro: text("erro"),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("gestao_execucao_regra").on(t.regraId, t.criadoEm), index("gestao_execucao_municipio").on(t.municipioId, t.criadoEm)],
);

/** Alerta gerado por automação (ou sugestão aguardando alguém aplicar). Não se apaga: resolve-se ou descarta-se. */
export const gestaoAlertas = tramite.table(
  "gestao_alertas",
  {
    id: id(),
    municipioId: text("municipio_id")
      .notNull()
      .references(() => municipios.id),
    regraId: text("regra_id").references(() => gestaoRegras.id, { onDelete: "set null" }),
    execucaoId: text("execucao_id").references(() => gestaoExecucoes.id, { onDelete: "set null" }),
    processoId: text("processo_id").references(() => processos.id, { onDelete: "cascade" }),
    /** ALTA | MEDIA | BAIXA */
    gravidade: text("gravidade").notNull(),
    /** ALERTA | SUGESTAO */
    tipo: text("tipo").notNull().default("ALERTA"),
    titulo: text("titulo").notNull(),
    detalhe: text("detalhe"),
    /** ABERTO | RESOLVIDO | DESCARTADO */
    situacao: text("situacao").notNull().default("ABERTO"),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    encerradoEm: timestamp("encerrado_em", { withTimezone: true }),
    encerradoPorId: text("encerrado_por_id").references(() => usuarios.id),
  },
  (t) => [index("gestao_alerta_municipio").on(t.municipioId, t.situacao), index("gestao_alerta_regra_processo").on(t.regraId, t.processoId)],
);

/** Situação de cada conector externo no município. O catálogo (nome, finalidade, condição) fica no código. */
export const gestaoIntegracoes = tramite.table(
  "gestao_integracoes",
  {
    id: id(),
    municipioId: text("municipio_id")
      .notNull()
      .references(() => municipios.id),
    chave: text("chave").notNull(),
    /** ATIVA | SIMULADA | NAO_CONFIGURADA */
    status: text("status").notNull().default("NAO_CONFIGURADA"),
    /** DEMONSTRACAO | HOMOLOGACAO | PRODUCAO */
    ambiente: text("ambiente").notNull().default("DEMONSTRACAO"),
    responsavelId: text("responsavel_id").references(() => usuarios.id),
    ultimoSincronismo: timestamp("ultimo_sincronismo", { withTimezone: true }),
    pendencias: text("pendencias"),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("gestao_integracao_municipio_chave").on(t.municipioId, t.chave)],
);

/** Chamada a um conector (envio ou consulta) com identificador único da operação, resultado e duração. */
export const gestaoChamadas = tramite.table(
  "gestao_chamadas",
  {
    id: id(),
    municipioId: text("municipio_id")
      .notNull()
      .references(() => municipios.id),
    integracaoId: text("integracao_id")
      .notNull()
      .references(() => gestaoIntegracoes.id, { onDelete: "cascade" }),
    operacao: text("operacao").notNull(),
    /** ENVIO | CONSULTA | RETORNO */
    direcao: text("direcao").notNull(),
    /** SUCESSO | FALHA | REJEITADA | PENDENTE */
    status: text("status").notNull(),
    idOperacao: text("id_operacao").notNull(),
    codigo: text("codigo"),
    duracaoMs: integer("duracao_ms"),
    resumo: text("resumo").notNull(),
    simulada: boolean("simulada").notNull().default(true),
    processoId: text("processo_id").references(() => processos.id, { onDelete: "set null" }),
    usuarioId: text("usuario_id").references(() => usuarios.id),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("gestao_chamada_integracao").on(t.integracaoId, t.criadoEm), uniqueIndex("gestao_chamada_operacao").on(t.municipioId, t.idOperacao)],
);

/**
 * Auditoria administrativa (append-only): alteração de acessos, regras, integrações, decisões em lote,
 * verificações de integridade. Correções acrescentam registros; nada é editado ou apagado.
 */
export const gestaoAuditoria = tramite.table(
  "gestao_auditoria",
  {
    id: id(),
    municipioId: text("municipio_id")
      .notNull()
      .references(() => municipios.id),
    autorId: text("autor_id").references(() => usuarios.id),
    acao: text("acao").notNull(),
    objetoTipo: text("objeto_tipo").notNull(),
    objetoId: text("objeto_id"),
    objetoRotulo: text("objeto_rotulo"),
    antes: jsonb("antes"),
    depois: jsonb("depois"),
    justificativa: text("justificativa"),
    /** TELA | AUTOMACAO | SISTEMA */
    origem: text("origem").notNull().default("TELA"),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("gestao_auditoria_municipio").on(t.municipioId, t.criadoEm)],
);

export const gestaoRegrasRelations = relations(gestaoRegras, ({ one, many }) => ({
  criadoPor: one(usuarios, { fields: [gestaoRegras.criadoPorId], references: [usuarios.id] }),
  execucoes: many(gestaoExecucoes),
}));

export const gestaoExecucoesRelations = relations(gestaoExecucoes, ({ one }) => ({
  regra: one(gestaoRegras, { fields: [gestaoExecucoes.regraId], references: [gestaoRegras.id] }),
  usuario: one(usuarios, { fields: [gestaoExecucoes.usuarioId], references: [usuarios.id] }),
}));

export const gestaoAlertasRelations = relations(gestaoAlertas, ({ one }) => ({
  regra: one(gestaoRegras, { fields: [gestaoAlertas.regraId], references: [gestaoRegras.id] }),
  processo: one(processos, { fields: [gestaoAlertas.processoId], references: [processos.id] }),
  encerradoPor: one(usuarios, { fields: [gestaoAlertas.encerradoPorId], references: [usuarios.id] }),
}));

export const gestaoIntegracoesRelations = relations(gestaoIntegracoes, ({ one, many }) => ({
  responsavel: one(usuarios, { fields: [gestaoIntegracoes.responsavelId], references: [usuarios.id] }),
  chamadas: many(gestaoChamadas),
}));

export const gestaoChamadasRelations = relations(gestaoChamadas, ({ one }) => ({
  integracao: one(gestaoIntegracoes, { fields: [gestaoChamadas.integracaoId], references: [gestaoIntegracoes.id] }),
  processo: one(processos, { fields: [gestaoChamadas.processoId], references: [processos.id] }),
  usuario: one(usuarios, { fields: [gestaoChamadas.usuarioId], references: [usuarios.id] }),
}));

export const gestaoAuditoriaRelations = relations(gestaoAuditoria, ({ one }) => ({
  autor: one(usuarios, { fields: [gestaoAuditoria.autorId], references: [usuarios.id] }),
}));

export type GestaoRegra = typeof gestaoRegras.$inferSelect;
export type GestaoExecucao = typeof gestaoExecucoes.$inferSelect;
export type GestaoAlerta = typeof gestaoAlertas.$inferSelect;
export type GestaoIntegracao = typeof gestaoIntegracoes.$inferSelect;
export type GestaoAuditoria = typeof gestaoAuditoria.$inferSelect;

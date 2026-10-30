// Civu — esquema do banco (Postgres, Drizzle ORM)
// Protocolo, tramitação, motor de workflow, documentos, assinaturas e trilha de auditoria.
import { pgSchema, text, integer, boolean, timestamp, jsonb, date, uniqueIndex, index } from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

/** Todas as tabelas ficam no schema Postgres "tramite" (nome técnico herdado do projeto que deu origem à Civu),
 *  isoladas de outros sistemas no mesmo banco. Renomear exige migração do banco de produção. */
export const tramite = pgSchema("tramite");

const id = () =>
  text("id")
    .primaryKey()
    .default(sql`gen_random_uuid()::text`);

/** Ente federativo (tenant). Um município = um tenant. */
export const municipios = tramite.table("municipios", {
  id: id(),
  slug: text("slug").notNull().unique(),
  nome: text("nome").notNull(),
  uf: text("uf").notNull(),
  populacao: integer("populacao"),
  tce: text("tce"),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});

/** Unidade gestora (prefeitura, fundo de saúde, câmara, RPPS). O SIAFIC exige segregação entre elas. */
export const unidadesGestoras = tramite.table(
  "unidades_gestoras",
  {
    id: id(),
    municipioId: text("municipio_id")
      .notNull()
      .references(() => municipios.id),
    codigo: text("codigo").notNull(),
    nome: text("nome").notNull(),
  },
  (t) => [uniqueIndex("ug_municipio_codigo").on(t.municipioId, t.codigo)],
);

/** Setor administrativo. Toda tramitação é entre setores. */
export const setores = tramite.table(
  "setores",
  {
    id: id(),
    municipioId: text("municipio_id")
      .notNull()
      .references(() => municipios.id),
    sigla: text("sigla").notNull(),
    nome: text("nome").notNull(),
    slaPadraoDias: integer("sla_padrao_dias").notNull().default(5),
  },
  (t) => [uniqueIndex("setor_municipio_sigla").on(t.municipioId, t.sigla)],
);

/** Usuário identificado por CPF (Decreto 10.540, art. 11). Papéis definem o que pode fazer em cada estado. */
export const usuarios = tramite.table(
  "usuarios",
  {
    id: id(),
    municipioId: text("municipio_id")
      .notNull()
      .references(() => municipios.id),
    cpf: text("cpf").notNull(),
    nome: text("nome").notNull(),
    email: text("email").notNull(),
    senhaHash: text("senha_hash").notNull(),
    cargo: text("cargo"),
    papeis: text("papeis")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    setorId: text("setor_id").references(() => setores.id),
    ativo: boolean("ativo").notNull().default(true),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("usuario_municipio_cpf").on(t.municipioId, t.cpf)],
);

export const sessoes = tramite.table("sessoes", {
  id: id(),
  usuarioId: text("usuario_id")
    .notNull()
    .references(() => usuarios.id, { onDelete: "cascade" }),
  expiraEm: timestamp("expira_em", { withTimezone: true }).notNull(),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});

/** Tipo de processo = definição de workflow (estados, gates, SLAs), versionada. Workflow é dado, não código. */
export const tiposProcesso = tramite.table(
  "tipos_processo",
  {
    id: id(),
    municipioId: text("municipio_id")
      .notNull()
      .references(() => municipios.id),
    chave: text("chave").notNull(),
    nome: text("nome").notNull(),
    descricao: text("descricao"),
    versao: integer("versao").notNull().default(1),
    ativo: boolean("ativo").notNull().default(true),
    definicao: jsonb("definicao").notNull(),
  },
  (t) => [uniqueIndex("tipo_municipio_chave_versao").on(t.municipioId, t.chave, t.versao)],
);

/** O processo administrativo: nasce no protocolo com número único e carrega a demanda por todos os setores. */
export const processos = tramite.table(
  "processos",
  {
    id: id(),
    municipioId: text("municipio_id")
      .notNull()
      .references(() => municipios.id),
    unidadeGestoraId: text("unidade_gestora_id")
      .notNull()
      .references(() => unidadesGestoras.id),
    tipoId: text("tipo_id")
      .notNull()
      .references(() => tiposProcesso.id),
    ano: integer("ano").notNull(),
    sequencial: integer("sequencial").notNull(),
    numero: text("numero").notNull(),
    assunto: text("assunto").notNull(),
    descricao: text("descricao"),
    urgencia: text("urgencia").notNull().default("NORMAL"),
    estadoAtual: text("estado_atual").notNull(),
    setorAtualId: text("setor_atual_id").references(() => setores.id),
    recebidoEm: timestamp("recebido_em", { withTimezone: true }),
    prazoEtapaEm: timestamp("prazo_etapa_em", { withTimezone: true }),
    abertoPorId: text("aberto_por_id")
      .notNull()
      .references(() => usuarios.id),
    abertoEm: timestamp("aberto_em", { withTimezone: true }).notNull().defaultNow(),
    encerradoEm: timestamp("encerrado_em", { withTimezone: true }),
    metadados: jsonb("metadados"),
    /** Interessado externo (pessoa ou empresa), quando o processo nasce no portal ou é aberto em nome de alguém. */
    interessadoPessoaId: text("interessado_pessoa_id"),
    interessadoEmpresaId: text("interessado_empresa_id"),
    /** Canal de entrada: INTERNO | PORTAL | WHATSAPP | PRESENCIAL */
    canal: text("canal").notNull().default("INTERNO"),
  },
  (t) => [
    index("processo_interessado_pessoa").on(t.interessadoPessoaId),
    index("processo_interessado_empresa").on(t.interessadoEmpresaId),
    uniqueIndex("processo_municipio_numero").on(t.municipioId, t.numero),
    index("processo_estado").on(t.municipioId, t.estadoAtual),
    index("processo_setor").on(t.setorAtualId),
  ],
);

/** Livro de eventos, append-only e encadeado por hash: trilha de auditoria e fonte dos indicadores. */
export const eventos = tramite.table(
  "eventos",
  {
    id: id(),
    processoId: text("processo_id")
      .notNull()
      .references(() => processos.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    tipo: text("tipo").notNull(),
    deEstado: text("de_estado"),
    paraEstado: text("para_estado"),
    deSetorId: text("de_setor_id").references(() => setores.id),
    paraSetorId: text("para_setor_id").references(() => setores.id),
    autorId: text("autor_id")
      .notNull()
      .references(() => usuarios.id),
    dados: jsonb("dados"),
    hashAnterior: text("hash_anterior"),
    hash: text("hash").notNull(),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("evento_processo_seq").on(t.processoId, t.seq), index("evento_criado").on(t.criadoEm)],
);

/** Documento juntado ao processo. Versão nova em vez de edição. */
export const documentos = tramite.table(
  "documentos",
  {
    id: id(),
    processoId: text("processo_id")
      .notNull()
      .references(() => processos.id, { onDelete: "cascade" }),
    tipo: text("tipo").notNull(),
    titulo: text("titulo").notNull(),
    conteudo: text("conteudo").notNull(),
    versao: integer("versao").notNull().default(1),
    hash: text("hash").notNull(),
    criadoPorId: text("criado_por_id")
      .notNull()
      .references(() => usuarios.id),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("documento_processo_tipo").on(t.processoId, t.tipo)],
);

/** Assinatura eletrônica (MVP: senha + carimbo de tempo + hash; produção: gov.br / ICP-Brasil). */
export const assinaturas = tramite.table(
  "assinaturas",
  {
    id: id(),
    documentoId: text("documento_id")
      .notNull()
      .references(() => documentos.id, { onDelete: "cascade" }),
    usuarioId: text("usuario_id")
      .notNull()
      .references(() => usuarios.id),
    papel: text("papel").notNull(),
    hashAssinado: text("hash_assinado").notNull(),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("assinatura_doc_usuario_papel").on(t.documentoId, t.usuarioId, t.papel)],
);

export const feriados = tramite.table(
  "feriados",
  {
    id: id(),
    municipioId: text("municipio_id")
      .notNull()
      .references(() => municipios.id),
    data: date("data").notNull(),
    nome: text("nome").notNull(),
  },
  (t) => [uniqueIndex("feriado_municipio_data").on(t.municipioId, t.data)],
);

// ---- relações (para consultas com `with`) ----
export const processosRelations = relations(processos, ({ one, many }) => ({
  municipio: one(municipios, { fields: [processos.municipioId], references: [municipios.id] }),
  unidadeGestora: one(unidadesGestoras, { fields: [processos.unidadeGestoraId], references: [unidadesGestoras.id] }),
  tipo: one(tiposProcesso, { fields: [processos.tipoId], references: [tiposProcesso.id] }),
  setorAtual: one(setores, { fields: [processos.setorAtualId], references: [setores.id] }),
  abertoPor: one(usuarios, { fields: [processos.abertoPorId], references: [usuarios.id] }),
  eventos: many(eventos),
  documentos: many(documentos),
}));

export const eventosRelations = relations(eventos, ({ one }) => ({
  processo: one(processos, { fields: [eventos.processoId], references: [processos.id] }),
  autor: one(usuarios, { fields: [eventos.autorId], references: [usuarios.id] }),
  deSetor: one(setores, { fields: [eventos.deSetorId], references: [setores.id], relationName: "deSetor" }),
  paraSetor: one(setores, { fields: [eventos.paraSetorId], references: [setores.id], relationName: "paraSetor" }),
}));

export const documentosRelations = relations(documentos, ({ one, many }) => ({
  processo: one(processos, { fields: [documentos.processoId], references: [processos.id] }),
  criadoPor: one(usuarios, { fields: [documentos.criadoPorId], references: [usuarios.id] }),
  assinaturas: many(assinaturas),
}));

export const assinaturasRelations = relations(assinaturas, ({ one }) => ({
  documento: one(documentos, { fields: [assinaturas.documentoId], references: [documentos.id] }),
  usuario: one(usuarios, { fields: [assinaturas.usuarioId], references: [usuarios.id] }),
}));

export const usuariosRelations = relations(usuarios, ({ one }) => ({
  setor: one(setores, { fields: [usuarios.setorId], references: [setores.id] }),
  municipio: one(municipios, { fields: [usuarios.municipioId], references: [municipios.id] }),
}));

export const setoresRelations = relations(setores, ({ many }) => ({
  usuarios: many(usuarios),
}));

export const sessoesRelations = relations(sessoes, ({ one }) => ({
  usuario: one(usuarios, { fields: [sessoes.usuarioId], references: [usuarios.id] }),
}));

export type Processo = typeof processos.$inferSelect;
export type Evento = typeof eventos.$inferSelect;
export type Documento = typeof documentos.$inferSelect;
export type Usuario = typeof usuarios.$inferSelect;
export type Setor = typeof setores.$inferSelect;
export type TipoProcesso = typeof tiposProcesso.$inferSelect;

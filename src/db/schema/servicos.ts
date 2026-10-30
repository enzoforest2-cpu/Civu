// Serviços urbanos: catálogo por município, ocorrências do cidadão, ordens de serviço, equipes e trilha de eventos.
// A ocorrência é leve: não usa o motor de processos; a linha do tempo vem de servicos_eventos.
import { text, integer, boolean, timestamp, jsonb, date, doublePrecision, uniqueIndex, index } from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { tramite, municipios, setores, usuarios } from "./core";
import { pessoas, empresas } from "./portal";

const id = () =>
  text("id")
    .primaryKey()
    .default(sql`gen_random_uuid()::text`);

/** Serviço urbano oferecido pelo município (tapa-buraco, lâmpada queimada, poda…), com secretaria responsável e prazo-alvo. */
export const servicosCatalogo = tramite.table(
  "servicos_catalogo",
  {
    id: id(),
    municipioId: text("municipio_id")
      .notNull()
      .references(() => municipios.id),
    chave: text("chave").notNull(),
    nome: text("nome").notNull(),
    /** Explicação curta para o cidadão: quando pedir e o que acontece. */
    descricao: text("descricao"),
    categoria: text("categoria").notNull(), // VIAS | ILUMINACAO | ARBORIZACAO | LIMPEZA | DRENAGEM | SINALIZACAO | ZOONOSES
    setorId: text("setor_id")
      .notNull()
      .references(() => setores.id),
    /** Prazo-alvo de atendimento em dias úteis, contado do registro. */
    slaDiasUteis: integer("sla_dias_uteis").notNull().default(10),
    exigeFoto: boolean("exige_foto").notNull().default(false),
    ativo: boolean("ativo").notNull().default(true),
    ordem: integer("ordem").notNull().default(50),
  },
  (t) => [uniqueIndex("servico_municipio_chave").on(t.municipioId, t.chave)],
);

/** Equipe de campo de uma secretaria. Membros ficam como texto livre nesta versão. */
export const servicosEquipes = tramite.table(
  "servicos_equipes",
  {
    id: id(),
    municipioId: text("municipio_id")
      .notNull()
      .references(() => municipios.id),
    setorId: text("setor_id")
      .notNull()
      .references(() => setores.id),
    nome: text("nome").notNull(),
    membros: text("membros"),
    /** Servidor que usa a tela de campo pela equipe (encarregado). */
    encarregadoId: text("encarregado_id").references(() => usuarios.id),
    ativa: boolean("ativa").notNull().default(true),
  },
  (t) => [index("equipe_setor").on(t.setorId)],
);

export type MaterialUsado = { item: string; quantidade: string };

/** Ordem de serviço: agrupa uma ou mais ocorrências para uma equipe numa data. */
export const servicosOrdens = tramite.table(
  "servicos_ordens",
  {
    id: id(),
    municipioId: text("municipio_id")
      .notNull()
      .references(() => municipios.id),
    setorId: text("setor_id")
      .notNull()
      .references(() => setores.id),
    ano: integer("ano").notNull(),
    sequencial: integer("sequencial").notNull(),
    numero: text("numero").notNull(),
    equipeId: text("equipe_id").references(() => servicosEquipes.id),
    /** PROGRAMADA | EM_EXECUCAO | CONCLUIDA | CANCELADA */
    status: text("status").notNull().default("PROGRAMADA"),
    programadaPara: date("programada_para"),
    instrucoes: text("instrucoes"),
    materiais: jsonb("materiais").$type<MaterialUsado[]>().notNull().default([]),
    observacao: text("observacao"),
    iniciadaEm: timestamp("iniciada_em", { withTimezone: true }),
    concluidaEm: timestamp("concluida_em", { withTimezone: true }),
    criadaPorId: text("criada_por_id")
      .notNull()
      .references(() => usuarios.id),
    criadaEm: timestamp("criada_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ordem_municipio_numero").on(t.municipioId, t.numero), index("ordem_equipe_data").on(t.equipeId, t.programadaPara)],
);

/** Pedido de serviço urbano feito pelo cidadão (portal) ou registrado pelo atendimento. */
export const servicosOcorrencias = tramite.table(
  "servicos_ocorrencias",
  {
    id: id(),
    municipioId: text("municipio_id")
      .notNull()
      .references(() => municipios.id),
    servicoId: text("servico_id")
      .notNull()
      .references(() => servicosCatalogo.id),
    /** Secretaria responsável (copiada do serviço no registro; pode ser redirecionada). */
    setorId: text("setor_id")
      .notNull()
      .references(() => setores.id),
    ano: integer("ano").notNull(),
    sequencial: integer("sequencial").notNull(),
    protocolo: text("protocolo").notNull(),
    /** ABERTA | ACEITA | PROGRAMADA | EM_EXECUCAO | CONCLUIDA | RECUSADA | DUPLICADA */
    status: text("status").notNull().default("ABERTA"),
    canal: text("canal").notNull().default("PORTAL"), // PORTAL | WHATSAPP | TELEFONE | PRESENCIAL
    solicitantePessoaId: text("solicitante_pessoa_id").references(() => pessoas.id),
    solicitanteEmpresaId: text("solicitante_empresa_id").references(() => empresas.id),
    solicitanteNome: text("solicitante_nome"),
    logradouro: text("logradouro").notNull(),
    numero: text("numero"),
    referencia: text("referencia"),
    bairro: text("bairro").notNull(),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    descricao: text("descricao").notNull(),
    abertaEm: timestamp("aberta_em", { withTimezone: true }).notNull().defaultNow(),
    /** Fim do prazo-alvo (SLA em dias úteis a partir do registro). */
    prazoEm: timestamp("prazo_em", { withTimezone: true }).notNull(),
    triadaEm: timestamp("triada_em", { withTimezone: true }),
    concluidaEm: timestamp("concluida_em", { withTimezone: true }),
    motivoRecusa: text("motivo_recusa"),
    duplicadaDeId: text("duplicada_de_id"),
    ordemId: text("ordem_id").references(() => servicosOrdens.id),
    avaliacaoNota: integer("avaliacao_nota"),
    avaliacaoComentario: text("avaliacao_comentario"),
    avaliadaEm: timestamp("avaliada_em", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("ocorrencia_municipio_protocolo").on(t.municipioId, t.protocolo),
    index("ocorrencia_setor_status").on(t.setorId, t.status),
    index("ocorrencia_pessoa").on(t.solicitantePessoaId),
    index("ocorrencia_empresa").on(t.solicitanteEmpresaId),
    index("ocorrencia_ordem").on(t.ordemId),
  ],
);

/** Linha do tempo da ocorrência: quem fez o quê e quando. `publico` = aparece para o cidadão. */
export const servicosEventos = tramite.table(
  "servicos_eventos",
  {
    id: id(),
    ocorrenciaId: text("ocorrencia_id")
      .notNull()
      .references(() => servicosOcorrencias.id, { onDelete: "cascade" }),
    tipo: text("tipo").notNull(), // REGISTRO | ACEITE | RECUSA | DUPLICIDADE | ORDEM | PROGRAMACAO | INICIO | CONCLUSAO | AVALIACAO | NOTA | PRAZO
    texto: text("texto").notNull(),
    publico: boolean("publico").notNull().default(true),
    autorUsuarioId: text("autor_usuario_id").references(() => usuarios.id),
    autorPessoaId: text("autor_pessoa_id").references(() => pessoas.id),
    autorNome: text("autor_nome").notNull(),
    dados: jsonb("dados"),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("servico_evento_ocorrencia").on(t.ocorrenciaId, t.criadoEm)],
);

export const servicosCatalogoRelations = relations(servicosCatalogo, ({ one, many }) => ({
  setor: one(setores, { fields: [servicosCatalogo.setorId], references: [setores.id] }),
  ocorrencias: many(servicosOcorrencias),
}));

export const servicosEquipesRelations = relations(servicosEquipes, ({ one, many }) => ({
  setor: one(setores, { fields: [servicosEquipes.setorId], references: [setores.id] }),
  encarregado: one(usuarios, { fields: [servicosEquipes.encarregadoId], references: [usuarios.id] }),
  ordens: many(servicosOrdens),
}));

export const servicosOrdensRelations = relations(servicosOrdens, ({ one, many }) => ({
  setor: one(setores, { fields: [servicosOrdens.setorId], references: [setores.id] }),
  equipe: one(servicosEquipes, { fields: [servicosOrdens.equipeId], references: [servicosEquipes.id] }),
  criadaPor: one(usuarios, { fields: [servicosOrdens.criadaPorId], references: [usuarios.id] }),
  ocorrencias: many(servicosOcorrencias),
}));

export const servicosOcorrenciasRelations = relations(servicosOcorrencias, ({ one, many }) => ({
  servico: one(servicosCatalogo, { fields: [servicosOcorrencias.servicoId], references: [servicosCatalogo.id] }),
  setor: one(setores, { fields: [servicosOcorrencias.setorId], references: [setores.id] }),
  ordem: one(servicosOrdens, { fields: [servicosOcorrencias.ordemId], references: [servicosOrdens.id] }),
  duplicadaDe: one(servicosOcorrencias, { fields: [servicosOcorrencias.duplicadaDeId], references: [servicosOcorrencias.id], relationName: "duplicidade" }),
  duplicadas: many(servicosOcorrencias, { relationName: "duplicidade" }),
  pessoa: one(pessoas, { fields: [servicosOcorrencias.solicitantePessoaId], references: [pessoas.id] }),
  empresa: one(empresas, { fields: [servicosOcorrencias.solicitanteEmpresaId], references: [empresas.id] }),
  eventos: many(servicosEventos),
}));

export const servicosEventosRelations = relations(servicosEventos, ({ one }) => ({
  ocorrencia: one(servicosOcorrencias, { fields: [servicosEventos.ocorrenciaId], references: [servicosOcorrencias.id] }),
}));

export type ServicoCatalogo = typeof servicosCatalogo.$inferSelect;
export type EquipeServico = typeof servicosEquipes.$inferSelect;
export type OrdemServico = typeof servicosOrdens.$inferSelect;
export type Ocorrencia = typeof servicosOcorrencias.$inferSelect;
export type EventoOcorrencia = typeof servicosEventos.$inferSelect;

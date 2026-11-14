// Repasses, emendas e convênios recebidos pelo município e obrigações de entrega de cada área (calendário).
// O vínculo processo↔repasse não fica aqui: é gravado pelo motor em `processos.metadados.repasseId`, com evento
// VINCULO_REPASSE no livro do processo (src/lib/engine.ts, `vincularRepasse`). A execução do repasse é calculada
// dos processos vinculados (src/modulos/repasses/dados.ts), nunca digitada.
import { text, boolean, timestamp, jsonb, date, numeric, index } from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { tramite, municipios, setores, usuarios } from "./core";

const id = () =>
  text("id")
    .primaryKey()
    .default(sql`gen_random_uuid()::text`);
const dinheiro = (nome: string) => numeric(nome, { precision: 14, scale: 2 });

/**
 * Repasse, emenda ou convênio. `tipo`: EMENDA_INDIVIDUAL | EMENDA_BANCADA | TRANSFERENCIA_ESPECIAL | CONVENIO | FUNDO_A_FUNDO | PROGRAMA.
 * `situacao`: EM_CAPTACAO | VIGENTE | EM_EXECUCAO | PRESTACAO_PENDENTE | PRESTADO | COM_PENDENCIA (src/modulos/repasses/regras.ts).
 * `setorId` é a secretaria responsável: a área dela decide quem vê e quem edita.
 */
export const repasses = tramite.table(
  "repasses",
  {
    id: id(),
    municipioId: text("municipio_id")
      .notNull()
      .references(() => municipios.id),
    setorId: text("setor_id")
      .notNull()
      .references(() => setores.id),
    tipo: text("tipo").notNull(),
    /** número do instrumento, da proposta ou da emenda, como o concedente identifica */
    identificacao: text("identificacao"),
    concedente: text("concedente").notNull(),
    objeto: text("objeto").notNull(),
    valorPrevisto: dinheiro("valor_previsto").notNull(),
    valorRecebido: dinheiro("valor_recebido").notNull().default("0"),
    assinadoEm: date("assinado_em"),
    vigenciaFim: date("vigencia_fim"),
    prazoExecucao: date("prazo_execucao"),
    prazoPrestacaoContas: date("prazo_prestacao_contas"),
    situacao: text("situacao").notNull(),
    observacao: text("observacao"),
    criadoPorId: text("criado_por_id").references(() => usuarios.id),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("repasse_municipio").on(t.municipioId), index("repasse_setor").on(t.setorId)],
);

/** Linha do tempo do repasse (só acréscimo): cadastro, alterações de dados e situação. Os vínculos com processos vêm do livro dos processos. */
export const repasseHistorico = tramite.table(
  "repasse_historico",
  {
    id: id(),
    repasseId: text("repasse_id")
      .notNull()
      .references(() => repasses.id, { onDelete: "cascade" }),
    tipo: text("tipo").notNull(), // CADASTRO | ALTERACAO
    descricao: text("descricao").notNull(),
    dados: jsonb("dados"),
    autorId: text("autor_id").references(() => usuarios.id),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("repasse_historico_repasse").on(t.repasseId)],
);

/**
 * Obrigação de entrega recorrente de uma área (relatório, prestação de contas, envio a sistema...). Cadastro livre do município.
 * `periodicidade`: MENSAL | BIMESTRAL | TRIMESTRAL | QUADRIMESTRAL | SEMESTRAL | ANUAL | UNICA.
 * `situacao` do ciclo atual: PENDENTE | EM_PREPARACAO | ENTREGUE (só a única fica entregue; a recorrente passa ao próximo vencimento).
 * `exemplo`: registro de demonstração, que não afirma prazo oficial.
 */
export const obrigacoesArea = tramite.table(
  "obrigacoes_area",
  {
    id: id(),
    municipioId: text("municipio_id")
      .notNull()
      .references(() => municipios.id),
    setorId: text("setor_id")
      .notNull()
      .references(() => setores.id),
    nome: text("nome").notNull(),
    destinatario: text("destinatario").notNull(),
    periodicidade: text("periodicidade").notNull(),
    proximoVencimento: date("proximo_vencimento").notNull(),
    responsavelId: text("responsavel_id").references(() => usuarios.id),
    situacao: text("situacao").notNull().default("PENDENTE"),
    observacao: text("observacao"),
    exemplo: boolean("exemplo").notNull().default(false),
    criadoPorId: text("criado_por_id").references(() => usuarios.id),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("obrigacao_area_municipio").on(t.municipioId), index("obrigacao_area_setor").on(t.setorId)],
);

/** Entrega registrada de uma obrigação: o vencimento a que se refere e o comprovante (recibo, protocolo, número do envio). */
export const obrigacaoEntregas = tramite.table(
  "obrigacao_entregas",
  {
    id: id(),
    obrigacaoId: text("obrigacao_id")
      .notNull()
      .references(() => obrigacoesArea.id, { onDelete: "cascade" }),
    vencimento: date("vencimento").notNull(),
    entregueEm: date("entregue_em").notNull(),
    comprovante: text("comprovante").notNull(),
    autorId: text("autor_id").references(() => usuarios.id),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("obrigacao_entrega_obrigacao").on(t.obrigacaoId)],
);

export const repassesRelations = relations(repasses, ({ one, many }) => ({
  setor: one(setores, { fields: [repasses.setorId], references: [setores.id] }),
  criadoPor: one(usuarios, { fields: [repasses.criadoPorId], references: [usuarios.id] }),
  historico: many(repasseHistorico),
}));

export const repasseHistoricoRelations = relations(repasseHistorico, ({ one }) => ({
  repasse: one(repasses, { fields: [repasseHistorico.repasseId], references: [repasses.id] }),
  autor: one(usuarios, { fields: [repasseHistorico.autorId], references: [usuarios.id] }),
}));

export const obrigacoesAreaRelations = relations(obrigacoesArea, ({ one, many }) => ({
  setor: one(setores, { fields: [obrigacoesArea.setorId], references: [setores.id] }),
  responsavel: one(usuarios, { fields: [obrigacoesArea.responsavelId], references: [usuarios.id] }),
  entregas: many(obrigacaoEntregas),
}));

export const obrigacaoEntregasRelations = relations(obrigacaoEntregas, ({ one }) => ({
  obrigacao: one(obrigacoesArea, { fields: [obrigacaoEntregas.obrigacaoId], references: [obrigacoesArea.id] }),
  autor: one(usuarios, { fields: [obrigacaoEntregas.autorId], references: [usuarios.id] }),
}));

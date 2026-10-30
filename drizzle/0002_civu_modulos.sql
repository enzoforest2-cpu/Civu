CREATE TABLE "tramite"."servicos_catalogo" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"municipio_id" text NOT NULL,
	"chave" text NOT NULL,
	"nome" text NOT NULL,
	"descricao" text,
	"categoria" text NOT NULL,
	"setor_id" text NOT NULL,
	"sla_dias_uteis" integer DEFAULT 10 NOT NULL,
	"exige_foto" boolean DEFAULT false NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"ordem" integer DEFAULT 50 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tramite"."servicos_equipes" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"municipio_id" text NOT NULL,
	"setor_id" text NOT NULL,
	"nome" text NOT NULL,
	"membros" text,
	"encarregado_id" text,
	"ativa" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tramite"."servicos_eventos" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"ocorrencia_id" text NOT NULL,
	"tipo" text NOT NULL,
	"texto" text NOT NULL,
	"publico" boolean DEFAULT true NOT NULL,
	"autor_usuario_id" text,
	"autor_pessoa_id" text,
	"autor_nome" text NOT NULL,
	"dados" jsonb,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tramite"."servicos_ocorrencias" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"municipio_id" text NOT NULL,
	"servico_id" text NOT NULL,
	"setor_id" text NOT NULL,
	"ano" integer NOT NULL,
	"sequencial" integer NOT NULL,
	"protocolo" text NOT NULL,
	"status" text DEFAULT 'ABERTA' NOT NULL,
	"canal" text DEFAULT 'PORTAL' NOT NULL,
	"solicitante_pessoa_id" text,
	"solicitante_empresa_id" text,
	"solicitante_nome" text,
	"logradouro" text NOT NULL,
	"numero" text,
	"referencia" text,
	"bairro" text NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"descricao" text NOT NULL,
	"aberta_em" timestamp with time zone DEFAULT now() NOT NULL,
	"prazo_em" timestamp with time zone NOT NULL,
	"triada_em" timestamp with time zone,
	"concluida_em" timestamp with time zone,
	"motivo_recusa" text,
	"duplicada_de_id" text,
	"ordem_id" text,
	"avaliacao_nota" integer,
	"avaliacao_comentario" text,
	"avaliada_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "tramite"."servicos_ordens" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"municipio_id" text NOT NULL,
	"setor_id" text NOT NULL,
	"ano" integer NOT NULL,
	"sequencial" integer NOT NULL,
	"numero" text NOT NULL,
	"equipe_id" text,
	"status" text DEFAULT 'PROGRAMADA' NOT NULL,
	"programada_para" date,
	"instrucoes" text,
	"materiais" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"observacao" text,
	"iniciada_em" timestamp with time zone,
	"concluida_em" timestamp with time zone,
	"criada_por_id" text NOT NULL,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tramite"."contrato_aditivos" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"contrato_id" text NOT NULL,
	"numero" integer NOT NULL,
	"tipo" text NOT NULL,
	"valor" numeric(14, 2) DEFAULT '0' NOT NULL,
	"nova_vigencia_fim" date,
	"justificativa" text NOT NULL,
	"assinado_em" date NOT NULL,
	"acrescimo_acumulado" numeric(7, 2),
	"acima_do_limite" boolean DEFAULT false NOT NULL,
	"criado_por_id" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tramite"."contrato_apostilamentos" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"contrato_id" text NOT NULL,
	"numero" integer NOT NULL,
	"tipo" text NOT NULL,
	"indice" text,
	"percentual" numeric(7, 4),
	"valor" numeric(14, 2) DEFAULT '0' NOT NULL,
	"descricao" text NOT NULL,
	"data" date NOT NULL,
	"criado_por_id" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tramite"."contrato_diario" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"contrato_id" text NOT NULL,
	"data" date NOT NULL,
	"clima" text,
	"efetivo" integer,
	"texto" text NOT NULL,
	"autor_id" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tramite"."contrato_etapas" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"contrato_id" text NOT NULL,
	"ordem" integer NOT NULL,
	"nome" text NOT NULL,
	"valor" numeric(14, 2) NOT NULL,
	"previsto" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tramite"."contrato_medicoes" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"contrato_id" text NOT NULL,
	"numero" integer NOT NULL,
	"competencia" text NOT NULL,
	"executado" jsonb NOT NULL,
	"valor" numeric(14, 2) NOT NULL,
	"observacao" text,
	"registrada_por_id" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tramite"."contrato_notas" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"contrato_id" text NOT NULL,
	"numero" text NOT NULL,
	"valor" numeric(14, 2) NOT NULL,
	"competencia" text NOT NULL,
	"emitida_em" date NOT NULL,
	"descricao" text,
	"medicao_id" text,
	"origem" text DEFAULT 'INTERNO' NOT NULL,
	"enviada_por_pessoa_id" text,
	"registrada_por_id" text,
	"situacao" text DEFAULT 'AGUARDANDO_ATESTO' NOT NULL,
	"atestada_em" timestamp with time zone,
	"atestada_por_id" text,
	"glosa_motivo" text,
	"processo_id" text,
	"enviada_liquidacao_em" timestamp with time zone,
	"paga_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tramite"."contratos" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"municipio_id" text NOT NULL,
	"unidade_gestora_id" text,
	"ano" integer NOT NULL,
	"numero" integer NOT NULL,
	"objeto" text NOT NULL,
	"natureza" text NOT NULL,
	"modalidade" text NOT NULL,
	"empresa_id" text NOT NULL,
	"processo_origem_id" text,
	"setor_id" text,
	"valor_global" numeric(14, 2) NOT NULL,
	"fonte" text NOT NULL,
	"assinado_em" date NOT NULL,
	"vigencia_inicio" date NOT NULL,
	"vigencia_fim" date NOT NULL,
	"fiscal_id" text,
	"gestor_id" text,
	"situacao" text DEFAULT 'ATIVO' NOT NULL,
	"encerrado_em" date,
	"motivo_encerramento" text,
	"obra_local" text,
	"obra_inicio" date,
	"obra_previsao_fim" date,
	"obra_situacao" text,
	"obra_motivo" text,
	"criado_por_id" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tramite"."fin_contas" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"municipio_id" text NOT NULL,
	"banco" text NOT NULL,
	"agencia" text NOT NULL,
	"numero" text NOT NULL,
	"nome" text NOT NULL,
	"grupo_fonte" text NOT NULL,
	"saldo_extrato" numeric(16, 2) NOT NULL,
	"extrato_em" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tramite"."fin_creditos" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"dotacao_id" text NOT NULL,
	"tipo" text NOT NULL,
	"decreto_numero" text NOT NULL,
	"decreto_data" date NOT NULL,
	"valor" numeric(16, 2) NOT NULL,
	"justificativa" text,
	"criado_por_id" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tramite"."fin_dotacoes" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"municipio_id" text NOT NULL,
	"unidade_gestora_id" text NOT NULL,
	"ano" integer NOT NULL,
	"orgao" text NOT NULL,
	"orgao_nome" text NOT NULL,
	"unidade" text NOT NULL,
	"unidade_nome" text NOT NULL,
	"funcao" text NOT NULL,
	"subfuncao" text NOT NULL,
	"programa" text NOT NULL,
	"programa_nome" text NOT NULL,
	"acao" text NOT NULL,
	"acao_nome" text NOT NULL,
	"natureza" text NOT NULL,
	"fonte" text NOT NULL,
	"valor_inicial" numeric(16, 2) NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tramite"."fin_empenhos" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"municipio_id" text NOT NULL,
	"ano" integer NOT NULL,
	"numero" integer NOT NULL,
	"dotacao_id" text NOT NULL,
	"reserva_id" text,
	"tipo" text NOT NULL,
	"empresa_id" text,
	"credor_nome" text NOT NULL,
	"credor_documento" text,
	"historico" text NOT NULL,
	"data" date NOT NULL,
	"valor" numeric(16, 2) NOT NULL,
	"valor_anulado" numeric(16, 2) DEFAULT 0 NOT NULL,
	"anulacoes" jsonb,
	"criado_por_id" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tramite"."fin_liquidacoes" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"empenho_id" text NOT NULL,
	"data" date NOT NULL,
	"valor" numeric(16, 2) NOT NULL,
	"documento_fiscal" text NOT NULL,
	"vencimento" date NOT NULL,
	"criado_por_id" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tramite"."fin_pagamentos" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"liquidacao_id" text NOT NULL,
	"conta_id" text NOT NULL,
	"data" date NOT NULL,
	"valor" numeric(16, 2) NOT NULL,
	"justificativa_ordem" text,
	"criado_por_id" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tramite"."fin_processo_empenho" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"processo_id" text NOT NULL,
	"empenho_id" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tramite"."fin_receitas" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"municipio_id" text NOT NULL,
	"ano" integer NOT NULL,
	"mes" integer NOT NULL,
	"categoria" text NOT NULL,
	"previsto" numeric(16, 2) NOT NULL,
	"arrecadado" numeric(16, 2)
);
--> statement-breakpoint
CREATE TABLE "tramite"."fin_reservas" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"municipio_id" text NOT NULL,
	"ano" integer NOT NULL,
	"numero" integer NOT NULL,
	"dotacao_id" text NOT NULL,
	"processo_id" text,
	"data" date NOT NULL,
	"valor" numeric(16, 2) NOT NULL,
	"historico" text NOT NULL,
	"situacao" text DEFAULT 'ABERTA' NOT NULL,
	"anulada_em" timestamp with time zone,
	"criado_por_id" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tramite"."trib_aliquotas" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"municipio_id" text NOT NULL,
	"exercicio" integer NOT NULL,
	"tributo" text NOT NULL,
	"uso" text DEFAULT 'TODOS' NOT NULL,
	"aliquota" numeric(8, 5) NOT NULL,
	"desconto_cota_unica" numeric(6, 4) DEFAULT 0 NOT NULL,
	"parcelas" integer DEFAULT 1 NOT NULL,
	"fundamento" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tramite"."trib_certidoes" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"municipio_id" text NOT NULL,
	"numero" text NOT NULL,
	"codigo_verificacao" text NOT NULL,
	"tipo" text NOT NULL,
	"pessoa_id" text,
	"empresa_id" text,
	"nome" text NOT NULL,
	"documento" text NOT NULL,
	"finalidade" text,
	"pendencias" jsonb,
	"emitida_em" timestamp with time zone DEFAULT now() NOT NULL,
	"valida_ate" date NOT NULL,
	"solicitada_por_pessoa_id" text,
	CONSTRAINT "trib_certidoes_codigo_verificacao_unique" UNIQUE("codigo_verificacao")
);
--> statement-breakpoint
CREATE TABLE "tramite"."trib_divida_ativa" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"municipio_id" text NOT NULL,
	"numero_inscricao" text NOT NULL,
	"lancamento_id" text NOT NULL,
	"devedor_pessoa_id" text,
	"devedor_empresa_id" text,
	"valor_original" numeric(14, 2) NOT NULL,
	"vencimento_original" date NOT NULL,
	"inscrita_em" date NOT NULL,
	"situacao" text DEFAULT 'ATIVA' NOT NULL,
	"parcelamento_id" text,
	"fundamento" text
);
--> statement-breakpoint
CREATE TABLE "tramite"."trib_guias" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"municipio_id" text NOT NULL,
	"numero" text NOT NULL,
	"parcela_ids" text[] NOT NULL,
	"descricao" text NOT NULL,
	"valor_principal" numeric(14, 2) NOT NULL,
	"acrescimos" numeric(14, 2) DEFAULT 0 NOT NULL,
	"valor_total" numeric(14, 2) NOT NULL,
	"vencimento" date NOT NULL,
	"linha_digitavel" text NOT NULL,
	"pix_copia_cola" text NOT NULL,
	"demonstracao" boolean DEFAULT true NOT NULL,
	"situacao" text DEFAULT 'EMITIDA' NOT NULL,
	"paga_em" timestamp with time zone,
	"emitida_por_pessoa_id" text,
	"emitida_por_usuario_id" text,
	"contribuinte_nome" text NOT NULL,
	"contribuinte_documento" text NOT NULL,
	"emitida_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trib_guias_numero_unique" UNIQUE("numero")
);
--> statement-breakpoint
CREATE TABLE "tramite"."trib_imoveis" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"municipio_id" text NOT NULL,
	"inscricao" text NOT NULL,
	"logradouro" text NOT NULL,
	"numero" text NOT NULL,
	"complemento" text,
	"bairro" text NOT NULL,
	"cep" text,
	"quadra" text,
	"lote" text,
	"area_terreno" numeric(12, 2) NOT NULL,
	"area_construida" numeric(12, 2) DEFAULT 0 NOT NULL,
	"uso" text NOT NULL,
	"padrao" text DEFAULT 'MEDIO' NOT NULL,
	"ano_construcao" integer,
	"valor_venal" numeric(14, 2) NOT NULL,
	"memoria_valor" jsonb,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tramite"."trib_inscricoes" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"municipio_id" text NOT NULL,
	"empresa_id" text NOT NULL,
	"numero" text NOT NULL,
	"cnae_principal" text NOT NULL,
	"cnae_descricao" text NOT NULL,
	"cnaes_secundarios" text[] DEFAULT '{}'::text[] NOT NULL,
	"regime" text NOT NULL,
	"endereco" jsonb,
	"imovel_id" text,
	"area_utilizada" numeric(12, 2),
	"situacao" text DEFAULT 'ATIVA' NOT NULL,
	"aberta_em" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tramite"."trib_itbi" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"municipio_id" text NOT NULL,
	"numero" text NOT NULL,
	"imovel_id" text NOT NULL,
	"natureza" text DEFAULT 'COMPRA_VENDA' NOT NULL,
	"comprador_pessoa_id" text,
	"comprador_empresa_id" text,
	"comprador_nome" text NOT NULL,
	"comprador_documento" text NOT NULL,
	"vendedor_nome" text NOT NULL,
	"vendedor_documento" text NOT NULL,
	"valor_declarado" numeric(14, 2) NOT NULL,
	"financiado" boolean DEFAULT false NOT NULL,
	"valor_financiado" numeric(14, 2),
	"valor_referencia" numeric(14, 2),
	"base_calculo" numeric(14, 2),
	"aliquota" numeric(8, 5),
	"valor_imposto" numeric(14, 2),
	"memoria" jsonb,
	"situacao" text DEFAULT 'EM_AVALIACAO' NOT NULL,
	"justificativa" text,
	"contestacao" text,
	"avaliado_por_id" text,
	"avaliado_em" timestamp with time zone,
	"lancamento_id" text,
	"solicitado_por_pessoa_id" text,
	"canal" text DEFAULT 'PORTAL' NOT NULL,
	"declarado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"quitado_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "tramite"."trib_lancamentos" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"municipio_id" text NOT NULL,
	"tributo" text NOT NULL,
	"exercicio" integer NOT NULL,
	"competencia" text,
	"imovel_id" text,
	"inscricao_id" text,
	"contribuinte_pessoa_id" text,
	"contribuinte_empresa_id" text,
	"descricao" text NOT NULL,
	"base_calculo" numeric(14, 2) NOT NULL,
	"aliquota" numeric(8, 5),
	"valor" numeric(14, 2) NOT NULL,
	"memoria" jsonb,
	"situacao" text DEFAULT 'ABERTO' NOT NULL,
	"lancado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tramite"."trib_licencas" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"municipio_id" text NOT NULL,
	"inscricao_id" text NOT NULL,
	"tipo" text NOT NULL,
	"numero" text NOT NULL,
	"codigo_verificacao" text NOT NULL,
	"atividades" text NOT NULL,
	"emitida_em" timestamp with time zone DEFAULT now() NOT NULL,
	"valida_ate" date NOT NULL,
	"situacao" text DEFAULT 'VIGENTE' NOT NULL,
	"processo_id" text,
	"emitida_por_id" text,
	"observacoes" text,
	CONSTRAINT "trib_licencas_codigo_verificacao_unique" UNIQUE("codigo_verificacao")
);
--> statement-breakpoint
CREATE TABLE "tramite"."trib_parcelas" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"lancamento_id" text NOT NULL,
	"numero" integer NOT NULL,
	"vencimento" date NOT NULL,
	"valor" numeric(14, 2) NOT NULL,
	"desconto" numeric(14, 2) DEFAULT 0 NOT NULL,
	"situacao" text DEFAULT 'ABERTA' NOT NULL,
	"pago_em" timestamp with time zone,
	"valor_pago" numeric(14, 2)
);
--> statement-breakpoint
CREATE TABLE "tramite"."trib_planta" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"municipio_id" text NOT NULL,
	"exercicio" integer NOT NULL,
	"bairro" text NOT NULL,
	"valor_m2_terreno" numeric(14, 2) NOT NULL,
	"valor_m2_construcao" numeric(14, 2) NOT NULL,
	"fundamento" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tramite"."trib_previsoes" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"municipio_id" text NOT NULL,
	"exercicio" integer NOT NULL,
	"tributo" text NOT NULL,
	"valor_previsto" numeric(14, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tramite"."trib_proprietarios" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"imovel_id" text NOT NULL,
	"pessoa_id" text,
	"empresa_id" text,
	"fracao" numeric(5, 2) DEFAULT 100 NOT NULL,
	"principal" boolean DEFAULT true NOT NULL,
	"desde" date,
	"ate" date
);
--> statement-breakpoint
CREATE TABLE "tramite"."gestao_alertas" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"municipio_id" text NOT NULL,
	"regra_id" text,
	"execucao_id" text,
	"processo_id" text,
	"gravidade" text NOT NULL,
	"tipo" text DEFAULT 'ALERTA' NOT NULL,
	"titulo" text NOT NULL,
	"detalhe" text,
	"situacao" text DEFAULT 'ABERTO' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"encerrado_em" timestamp with time zone,
	"encerrado_por_id" text
);
--> statement-breakpoint
CREATE TABLE "tramite"."gestao_auditoria" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"municipio_id" text NOT NULL,
	"autor_id" text,
	"acao" text NOT NULL,
	"objeto_tipo" text NOT NULL,
	"objeto_id" text,
	"objeto_rotulo" text,
	"antes" jsonb,
	"depois" jsonb,
	"justificativa" text,
	"origem" text DEFAULT 'TELA' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tramite"."gestao_chamadas" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"municipio_id" text NOT NULL,
	"integracao_id" text NOT NULL,
	"operacao" text NOT NULL,
	"direcao" text NOT NULL,
	"status" text NOT NULL,
	"id_operacao" text NOT NULL,
	"codigo" text,
	"duracao_ms" integer,
	"resumo" text NOT NULL,
	"simulada" boolean DEFAULT true NOT NULL,
	"processo_id" text,
	"usuario_id" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tramite"."gestao_execucoes" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"municipio_id" text NOT NULL,
	"regra_id" text NOT NULL,
	"regra_versao" integer NOT NULL,
	"usuario_id" text,
	"origem" text DEFAULT 'MANUAL' NOT NULL,
	"avaliados" integer DEFAULT 0 NOT NULL,
	"disparos" integer DEFAULT 0 NOT NULL,
	"itens" jsonb NOT NULL,
	"erro" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tramite"."gestao_integracoes" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"municipio_id" text NOT NULL,
	"chave" text NOT NULL,
	"status" text DEFAULT 'NAO_CONFIGURADA' NOT NULL,
	"ambiente" text DEFAULT 'DEMONSTRACAO' NOT NULL,
	"responsavel_id" text,
	"ultimo_sincronismo" timestamp with time zone,
	"pendencias" text,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tramite"."gestao_regras" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"municipio_id" text NOT NULL,
	"nome" text NOT NULL,
	"descricao" text,
	"gatilho" text NOT NULL,
	"parametros" jsonb NOT NULL,
	"acao" text NOT NULL,
	"acao_parametros" jsonb NOT NULL,
	"nivel" text DEFAULT 'INFORMAR' NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"versao" integer DEFAULT 1 NOT NULL,
	"criado_por_id" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tramite"."servicos_catalogo" ADD CONSTRAINT "servicos_catalogo_municipio_id_municipios_id_fk" FOREIGN KEY ("municipio_id") REFERENCES "tramite"."municipios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."servicos_catalogo" ADD CONSTRAINT "servicos_catalogo_setor_id_setores_id_fk" FOREIGN KEY ("setor_id") REFERENCES "tramite"."setores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."servicos_equipes" ADD CONSTRAINT "servicos_equipes_municipio_id_municipios_id_fk" FOREIGN KEY ("municipio_id") REFERENCES "tramite"."municipios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."servicos_equipes" ADD CONSTRAINT "servicos_equipes_setor_id_setores_id_fk" FOREIGN KEY ("setor_id") REFERENCES "tramite"."setores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."servicos_equipes" ADD CONSTRAINT "servicos_equipes_encarregado_id_usuarios_id_fk" FOREIGN KEY ("encarregado_id") REFERENCES "tramite"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."servicos_eventos" ADD CONSTRAINT "servicos_eventos_ocorrencia_id_servicos_ocorrencias_id_fk" FOREIGN KEY ("ocorrencia_id") REFERENCES "tramite"."servicos_ocorrencias"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."servicos_eventos" ADD CONSTRAINT "servicos_eventos_autor_usuario_id_usuarios_id_fk" FOREIGN KEY ("autor_usuario_id") REFERENCES "tramite"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."servicos_eventos" ADD CONSTRAINT "servicos_eventos_autor_pessoa_id_pessoas_id_fk" FOREIGN KEY ("autor_pessoa_id") REFERENCES "tramite"."pessoas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."servicos_ocorrencias" ADD CONSTRAINT "servicos_ocorrencias_municipio_id_municipios_id_fk" FOREIGN KEY ("municipio_id") REFERENCES "tramite"."municipios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."servicos_ocorrencias" ADD CONSTRAINT "servicos_ocorrencias_servico_id_servicos_catalogo_id_fk" FOREIGN KEY ("servico_id") REFERENCES "tramite"."servicos_catalogo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."servicos_ocorrencias" ADD CONSTRAINT "servicos_ocorrencias_setor_id_setores_id_fk" FOREIGN KEY ("setor_id") REFERENCES "tramite"."setores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."servicos_ocorrencias" ADD CONSTRAINT "servicos_ocorrencias_solicitante_pessoa_id_pessoas_id_fk" FOREIGN KEY ("solicitante_pessoa_id") REFERENCES "tramite"."pessoas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."servicos_ocorrencias" ADD CONSTRAINT "servicos_ocorrencias_solicitante_empresa_id_empresas_id_fk" FOREIGN KEY ("solicitante_empresa_id") REFERENCES "tramite"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."servicos_ocorrencias" ADD CONSTRAINT "servicos_ocorrencias_ordem_id_servicos_ordens_id_fk" FOREIGN KEY ("ordem_id") REFERENCES "tramite"."servicos_ordens"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."servicos_ordens" ADD CONSTRAINT "servicos_ordens_municipio_id_municipios_id_fk" FOREIGN KEY ("municipio_id") REFERENCES "tramite"."municipios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."servicos_ordens" ADD CONSTRAINT "servicos_ordens_setor_id_setores_id_fk" FOREIGN KEY ("setor_id") REFERENCES "tramite"."setores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."servicos_ordens" ADD CONSTRAINT "servicos_ordens_equipe_id_servicos_equipes_id_fk" FOREIGN KEY ("equipe_id") REFERENCES "tramite"."servicos_equipes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."servicos_ordens" ADD CONSTRAINT "servicos_ordens_criada_por_id_usuarios_id_fk" FOREIGN KEY ("criada_por_id") REFERENCES "tramite"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."contrato_aditivos" ADD CONSTRAINT "contrato_aditivos_contrato_id_contratos_id_fk" FOREIGN KEY ("contrato_id") REFERENCES "tramite"."contratos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."contrato_aditivos" ADD CONSTRAINT "contrato_aditivos_criado_por_id_usuarios_id_fk" FOREIGN KEY ("criado_por_id") REFERENCES "tramite"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."contrato_apostilamentos" ADD CONSTRAINT "contrato_apostilamentos_contrato_id_contratos_id_fk" FOREIGN KEY ("contrato_id") REFERENCES "tramite"."contratos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."contrato_apostilamentos" ADD CONSTRAINT "contrato_apostilamentos_criado_por_id_usuarios_id_fk" FOREIGN KEY ("criado_por_id") REFERENCES "tramite"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."contrato_diario" ADD CONSTRAINT "contrato_diario_contrato_id_contratos_id_fk" FOREIGN KEY ("contrato_id") REFERENCES "tramite"."contratos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."contrato_diario" ADD CONSTRAINT "contrato_diario_autor_id_usuarios_id_fk" FOREIGN KEY ("autor_id") REFERENCES "tramite"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."contrato_etapas" ADD CONSTRAINT "contrato_etapas_contrato_id_contratos_id_fk" FOREIGN KEY ("contrato_id") REFERENCES "tramite"."contratos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."contrato_medicoes" ADD CONSTRAINT "contrato_medicoes_contrato_id_contratos_id_fk" FOREIGN KEY ("contrato_id") REFERENCES "tramite"."contratos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."contrato_medicoes" ADD CONSTRAINT "contrato_medicoes_registrada_por_id_usuarios_id_fk" FOREIGN KEY ("registrada_por_id") REFERENCES "tramite"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."contrato_notas" ADD CONSTRAINT "contrato_notas_contrato_id_contratos_id_fk" FOREIGN KEY ("contrato_id") REFERENCES "tramite"."contratos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."contrato_notas" ADD CONSTRAINT "contrato_notas_medicao_id_contrato_medicoes_id_fk" FOREIGN KEY ("medicao_id") REFERENCES "tramite"."contrato_medicoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."contrato_notas" ADD CONSTRAINT "contrato_notas_enviada_por_pessoa_id_pessoas_id_fk" FOREIGN KEY ("enviada_por_pessoa_id") REFERENCES "tramite"."pessoas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."contrato_notas" ADD CONSTRAINT "contrato_notas_registrada_por_id_usuarios_id_fk" FOREIGN KEY ("registrada_por_id") REFERENCES "tramite"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."contrato_notas" ADD CONSTRAINT "contrato_notas_atestada_por_id_usuarios_id_fk" FOREIGN KEY ("atestada_por_id") REFERENCES "tramite"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."contrato_notas" ADD CONSTRAINT "contrato_notas_processo_id_processos_id_fk" FOREIGN KEY ("processo_id") REFERENCES "tramite"."processos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."contratos" ADD CONSTRAINT "contratos_municipio_id_municipios_id_fk" FOREIGN KEY ("municipio_id") REFERENCES "tramite"."municipios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."contratos" ADD CONSTRAINT "contratos_unidade_gestora_id_unidades_gestoras_id_fk" FOREIGN KEY ("unidade_gestora_id") REFERENCES "tramite"."unidades_gestoras"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."contratos" ADD CONSTRAINT "contratos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "tramite"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."contratos" ADD CONSTRAINT "contratos_processo_origem_id_processos_id_fk" FOREIGN KEY ("processo_origem_id") REFERENCES "tramite"."processos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."contratos" ADD CONSTRAINT "contratos_setor_id_setores_id_fk" FOREIGN KEY ("setor_id") REFERENCES "tramite"."setores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."contratos" ADD CONSTRAINT "contratos_fiscal_id_usuarios_id_fk" FOREIGN KEY ("fiscal_id") REFERENCES "tramite"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."contratos" ADD CONSTRAINT "contratos_gestor_id_usuarios_id_fk" FOREIGN KEY ("gestor_id") REFERENCES "tramite"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."contratos" ADD CONSTRAINT "contratos_criado_por_id_usuarios_id_fk" FOREIGN KEY ("criado_por_id") REFERENCES "tramite"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."fin_contas" ADD CONSTRAINT "fin_contas_municipio_id_municipios_id_fk" FOREIGN KEY ("municipio_id") REFERENCES "tramite"."municipios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."fin_creditos" ADD CONSTRAINT "fin_creditos_dotacao_id_fin_dotacoes_id_fk" FOREIGN KEY ("dotacao_id") REFERENCES "tramite"."fin_dotacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."fin_creditos" ADD CONSTRAINT "fin_creditos_criado_por_id_usuarios_id_fk" FOREIGN KEY ("criado_por_id") REFERENCES "tramite"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."fin_dotacoes" ADD CONSTRAINT "fin_dotacoes_municipio_id_municipios_id_fk" FOREIGN KEY ("municipio_id") REFERENCES "tramite"."municipios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."fin_dotacoes" ADD CONSTRAINT "fin_dotacoes_unidade_gestora_id_unidades_gestoras_id_fk" FOREIGN KEY ("unidade_gestora_id") REFERENCES "tramite"."unidades_gestoras"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."fin_empenhos" ADD CONSTRAINT "fin_empenhos_municipio_id_municipios_id_fk" FOREIGN KEY ("municipio_id") REFERENCES "tramite"."municipios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."fin_empenhos" ADD CONSTRAINT "fin_empenhos_dotacao_id_fin_dotacoes_id_fk" FOREIGN KEY ("dotacao_id") REFERENCES "tramite"."fin_dotacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."fin_empenhos" ADD CONSTRAINT "fin_empenhos_reserva_id_fin_reservas_id_fk" FOREIGN KEY ("reserva_id") REFERENCES "tramite"."fin_reservas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."fin_empenhos" ADD CONSTRAINT "fin_empenhos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "tramite"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."fin_empenhos" ADD CONSTRAINT "fin_empenhos_criado_por_id_usuarios_id_fk" FOREIGN KEY ("criado_por_id") REFERENCES "tramite"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."fin_liquidacoes" ADD CONSTRAINT "fin_liquidacoes_empenho_id_fin_empenhos_id_fk" FOREIGN KEY ("empenho_id") REFERENCES "tramite"."fin_empenhos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."fin_liquidacoes" ADD CONSTRAINT "fin_liquidacoes_criado_por_id_usuarios_id_fk" FOREIGN KEY ("criado_por_id") REFERENCES "tramite"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."fin_pagamentos" ADD CONSTRAINT "fin_pagamentos_liquidacao_id_fin_liquidacoes_id_fk" FOREIGN KEY ("liquidacao_id") REFERENCES "tramite"."fin_liquidacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."fin_pagamentos" ADD CONSTRAINT "fin_pagamentos_conta_id_fin_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "tramite"."fin_contas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."fin_pagamentos" ADD CONSTRAINT "fin_pagamentos_criado_por_id_usuarios_id_fk" FOREIGN KEY ("criado_por_id") REFERENCES "tramite"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."fin_processo_empenho" ADD CONSTRAINT "fin_processo_empenho_processo_id_processos_id_fk" FOREIGN KEY ("processo_id") REFERENCES "tramite"."processos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."fin_processo_empenho" ADD CONSTRAINT "fin_processo_empenho_empenho_id_fin_empenhos_id_fk" FOREIGN KEY ("empenho_id") REFERENCES "tramite"."fin_empenhos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."fin_receitas" ADD CONSTRAINT "fin_receitas_municipio_id_municipios_id_fk" FOREIGN KEY ("municipio_id") REFERENCES "tramite"."municipios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."fin_reservas" ADD CONSTRAINT "fin_reservas_municipio_id_municipios_id_fk" FOREIGN KEY ("municipio_id") REFERENCES "tramite"."municipios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."fin_reservas" ADD CONSTRAINT "fin_reservas_dotacao_id_fin_dotacoes_id_fk" FOREIGN KEY ("dotacao_id") REFERENCES "tramite"."fin_dotacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."fin_reservas" ADD CONSTRAINT "fin_reservas_processo_id_processos_id_fk" FOREIGN KEY ("processo_id") REFERENCES "tramite"."processos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."fin_reservas" ADD CONSTRAINT "fin_reservas_criado_por_id_usuarios_id_fk" FOREIGN KEY ("criado_por_id") REFERENCES "tramite"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."trib_aliquotas" ADD CONSTRAINT "trib_aliquotas_municipio_id_municipios_id_fk" FOREIGN KEY ("municipio_id") REFERENCES "tramite"."municipios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."trib_certidoes" ADD CONSTRAINT "trib_certidoes_municipio_id_municipios_id_fk" FOREIGN KEY ("municipio_id") REFERENCES "tramite"."municipios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."trib_certidoes" ADD CONSTRAINT "trib_certidoes_pessoa_id_pessoas_id_fk" FOREIGN KEY ("pessoa_id") REFERENCES "tramite"."pessoas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."trib_certidoes" ADD CONSTRAINT "trib_certidoes_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "tramite"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."trib_certidoes" ADD CONSTRAINT "trib_certidoes_solicitada_por_pessoa_id_pessoas_id_fk" FOREIGN KEY ("solicitada_por_pessoa_id") REFERENCES "tramite"."pessoas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."trib_divida_ativa" ADD CONSTRAINT "trib_divida_ativa_municipio_id_municipios_id_fk" FOREIGN KEY ("municipio_id") REFERENCES "tramite"."municipios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."trib_divida_ativa" ADD CONSTRAINT "trib_divida_ativa_lancamento_id_trib_lancamentos_id_fk" FOREIGN KEY ("lancamento_id") REFERENCES "tramite"."trib_lancamentos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."trib_divida_ativa" ADD CONSTRAINT "trib_divida_ativa_devedor_pessoa_id_pessoas_id_fk" FOREIGN KEY ("devedor_pessoa_id") REFERENCES "tramite"."pessoas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."trib_divida_ativa" ADD CONSTRAINT "trib_divida_ativa_devedor_empresa_id_empresas_id_fk" FOREIGN KEY ("devedor_empresa_id") REFERENCES "tramite"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."trib_divida_ativa" ADD CONSTRAINT "trib_divida_ativa_parcelamento_id_trib_lancamentos_id_fk" FOREIGN KEY ("parcelamento_id") REFERENCES "tramite"."trib_lancamentos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."trib_guias" ADD CONSTRAINT "trib_guias_municipio_id_municipios_id_fk" FOREIGN KEY ("municipio_id") REFERENCES "tramite"."municipios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."trib_guias" ADD CONSTRAINT "trib_guias_emitida_por_pessoa_id_pessoas_id_fk" FOREIGN KEY ("emitida_por_pessoa_id") REFERENCES "tramite"."pessoas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."trib_guias" ADD CONSTRAINT "trib_guias_emitida_por_usuario_id_usuarios_id_fk" FOREIGN KEY ("emitida_por_usuario_id") REFERENCES "tramite"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."trib_imoveis" ADD CONSTRAINT "trib_imoveis_municipio_id_municipios_id_fk" FOREIGN KEY ("municipio_id") REFERENCES "tramite"."municipios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."trib_inscricoes" ADD CONSTRAINT "trib_inscricoes_municipio_id_municipios_id_fk" FOREIGN KEY ("municipio_id") REFERENCES "tramite"."municipios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."trib_inscricoes" ADD CONSTRAINT "trib_inscricoes_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "tramite"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."trib_inscricoes" ADD CONSTRAINT "trib_inscricoes_imovel_id_trib_imoveis_id_fk" FOREIGN KEY ("imovel_id") REFERENCES "tramite"."trib_imoveis"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."trib_itbi" ADD CONSTRAINT "trib_itbi_municipio_id_municipios_id_fk" FOREIGN KEY ("municipio_id") REFERENCES "tramite"."municipios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."trib_itbi" ADD CONSTRAINT "trib_itbi_imovel_id_trib_imoveis_id_fk" FOREIGN KEY ("imovel_id") REFERENCES "tramite"."trib_imoveis"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."trib_itbi" ADD CONSTRAINT "trib_itbi_comprador_pessoa_id_pessoas_id_fk" FOREIGN KEY ("comprador_pessoa_id") REFERENCES "tramite"."pessoas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."trib_itbi" ADD CONSTRAINT "trib_itbi_comprador_empresa_id_empresas_id_fk" FOREIGN KEY ("comprador_empresa_id") REFERENCES "tramite"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."trib_itbi" ADD CONSTRAINT "trib_itbi_avaliado_por_id_usuarios_id_fk" FOREIGN KEY ("avaliado_por_id") REFERENCES "tramite"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."trib_itbi" ADD CONSTRAINT "trib_itbi_lancamento_id_trib_lancamentos_id_fk" FOREIGN KEY ("lancamento_id") REFERENCES "tramite"."trib_lancamentos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."trib_itbi" ADD CONSTRAINT "trib_itbi_solicitado_por_pessoa_id_pessoas_id_fk" FOREIGN KEY ("solicitado_por_pessoa_id") REFERENCES "tramite"."pessoas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."trib_lancamentos" ADD CONSTRAINT "trib_lancamentos_municipio_id_municipios_id_fk" FOREIGN KEY ("municipio_id") REFERENCES "tramite"."municipios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."trib_lancamentos" ADD CONSTRAINT "trib_lancamentos_imovel_id_trib_imoveis_id_fk" FOREIGN KEY ("imovel_id") REFERENCES "tramite"."trib_imoveis"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."trib_lancamentos" ADD CONSTRAINT "trib_lancamentos_inscricao_id_trib_inscricoes_id_fk" FOREIGN KEY ("inscricao_id") REFERENCES "tramite"."trib_inscricoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."trib_lancamentos" ADD CONSTRAINT "trib_lancamentos_contribuinte_pessoa_id_pessoas_id_fk" FOREIGN KEY ("contribuinte_pessoa_id") REFERENCES "tramite"."pessoas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."trib_lancamentos" ADD CONSTRAINT "trib_lancamentos_contribuinte_empresa_id_empresas_id_fk" FOREIGN KEY ("contribuinte_empresa_id") REFERENCES "tramite"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."trib_licencas" ADD CONSTRAINT "trib_licencas_municipio_id_municipios_id_fk" FOREIGN KEY ("municipio_id") REFERENCES "tramite"."municipios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."trib_licencas" ADD CONSTRAINT "trib_licencas_inscricao_id_trib_inscricoes_id_fk" FOREIGN KEY ("inscricao_id") REFERENCES "tramite"."trib_inscricoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."trib_licencas" ADD CONSTRAINT "trib_licencas_processo_id_processos_id_fk" FOREIGN KEY ("processo_id") REFERENCES "tramite"."processos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."trib_licencas" ADD CONSTRAINT "trib_licencas_emitida_por_id_usuarios_id_fk" FOREIGN KEY ("emitida_por_id") REFERENCES "tramite"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."trib_parcelas" ADD CONSTRAINT "trib_parcelas_lancamento_id_trib_lancamentos_id_fk" FOREIGN KEY ("lancamento_id") REFERENCES "tramite"."trib_lancamentos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."trib_planta" ADD CONSTRAINT "trib_planta_municipio_id_municipios_id_fk" FOREIGN KEY ("municipio_id") REFERENCES "tramite"."municipios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."trib_previsoes" ADD CONSTRAINT "trib_previsoes_municipio_id_municipios_id_fk" FOREIGN KEY ("municipio_id") REFERENCES "tramite"."municipios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."trib_proprietarios" ADD CONSTRAINT "trib_proprietarios_imovel_id_trib_imoveis_id_fk" FOREIGN KEY ("imovel_id") REFERENCES "tramite"."trib_imoveis"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."trib_proprietarios" ADD CONSTRAINT "trib_proprietarios_pessoa_id_pessoas_id_fk" FOREIGN KEY ("pessoa_id") REFERENCES "tramite"."pessoas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."trib_proprietarios" ADD CONSTRAINT "trib_proprietarios_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "tramite"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."gestao_alertas" ADD CONSTRAINT "gestao_alertas_municipio_id_municipios_id_fk" FOREIGN KEY ("municipio_id") REFERENCES "tramite"."municipios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."gestao_alertas" ADD CONSTRAINT "gestao_alertas_regra_id_gestao_regras_id_fk" FOREIGN KEY ("regra_id") REFERENCES "tramite"."gestao_regras"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."gestao_alertas" ADD CONSTRAINT "gestao_alertas_execucao_id_gestao_execucoes_id_fk" FOREIGN KEY ("execucao_id") REFERENCES "tramite"."gestao_execucoes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."gestao_alertas" ADD CONSTRAINT "gestao_alertas_processo_id_processos_id_fk" FOREIGN KEY ("processo_id") REFERENCES "tramite"."processos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."gestao_alertas" ADD CONSTRAINT "gestao_alertas_encerrado_por_id_usuarios_id_fk" FOREIGN KEY ("encerrado_por_id") REFERENCES "tramite"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."gestao_auditoria" ADD CONSTRAINT "gestao_auditoria_municipio_id_municipios_id_fk" FOREIGN KEY ("municipio_id") REFERENCES "tramite"."municipios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."gestao_auditoria" ADD CONSTRAINT "gestao_auditoria_autor_id_usuarios_id_fk" FOREIGN KEY ("autor_id") REFERENCES "tramite"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."gestao_chamadas" ADD CONSTRAINT "gestao_chamadas_municipio_id_municipios_id_fk" FOREIGN KEY ("municipio_id") REFERENCES "tramite"."municipios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."gestao_chamadas" ADD CONSTRAINT "gestao_chamadas_integracao_id_gestao_integracoes_id_fk" FOREIGN KEY ("integracao_id") REFERENCES "tramite"."gestao_integracoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."gestao_chamadas" ADD CONSTRAINT "gestao_chamadas_processo_id_processos_id_fk" FOREIGN KEY ("processo_id") REFERENCES "tramite"."processos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."gestao_chamadas" ADD CONSTRAINT "gestao_chamadas_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "tramite"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."gestao_execucoes" ADD CONSTRAINT "gestao_execucoes_municipio_id_municipios_id_fk" FOREIGN KEY ("municipio_id") REFERENCES "tramite"."municipios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."gestao_execucoes" ADD CONSTRAINT "gestao_execucoes_regra_id_gestao_regras_id_fk" FOREIGN KEY ("regra_id") REFERENCES "tramite"."gestao_regras"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."gestao_execucoes" ADD CONSTRAINT "gestao_execucoes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "tramite"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."gestao_integracoes" ADD CONSTRAINT "gestao_integracoes_municipio_id_municipios_id_fk" FOREIGN KEY ("municipio_id") REFERENCES "tramite"."municipios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."gestao_integracoes" ADD CONSTRAINT "gestao_integracoes_responsavel_id_usuarios_id_fk" FOREIGN KEY ("responsavel_id") REFERENCES "tramite"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."gestao_regras" ADD CONSTRAINT "gestao_regras_municipio_id_municipios_id_fk" FOREIGN KEY ("municipio_id") REFERENCES "tramite"."municipios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."gestao_regras" ADD CONSTRAINT "gestao_regras_criado_por_id_usuarios_id_fk" FOREIGN KEY ("criado_por_id") REFERENCES "tramite"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "servico_municipio_chave" ON "tramite"."servicos_catalogo" USING btree ("municipio_id","chave");--> statement-breakpoint
CREATE INDEX "equipe_setor" ON "tramite"."servicos_equipes" USING btree ("setor_id");--> statement-breakpoint
CREATE INDEX "servico_evento_ocorrencia" ON "tramite"."servicos_eventos" USING btree ("ocorrencia_id","criado_em");--> statement-breakpoint
CREATE UNIQUE INDEX "ocorrencia_municipio_protocolo" ON "tramite"."servicos_ocorrencias" USING btree ("municipio_id","protocolo");--> statement-breakpoint
CREATE INDEX "ocorrencia_setor_status" ON "tramite"."servicos_ocorrencias" USING btree ("setor_id","status");--> statement-breakpoint
CREATE INDEX "ocorrencia_pessoa" ON "tramite"."servicos_ocorrencias" USING btree ("solicitante_pessoa_id");--> statement-breakpoint
CREATE INDEX "ocorrencia_empresa" ON "tramite"."servicos_ocorrencias" USING btree ("solicitante_empresa_id");--> statement-breakpoint
CREATE INDEX "ocorrencia_ordem" ON "tramite"."servicos_ocorrencias" USING btree ("ordem_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ordem_municipio_numero" ON "tramite"."servicos_ordens" USING btree ("municipio_id","numero");--> statement-breakpoint
CREATE INDEX "ordem_equipe_data" ON "tramite"."servicos_ordens" USING btree ("equipe_id","programada_para");--> statement-breakpoint
CREATE UNIQUE INDEX "aditivo_contrato_numero" ON "tramite"."contrato_aditivos" USING btree ("contrato_id","numero");--> statement-breakpoint
CREATE UNIQUE INDEX "apostilamento_contrato_numero" ON "tramite"."contrato_apostilamentos" USING btree ("contrato_id","numero");--> statement-breakpoint
CREATE INDEX "diario_contrato_data" ON "tramite"."contrato_diario" USING btree ("contrato_id","data");--> statement-breakpoint
CREATE INDEX "etapa_contrato" ON "tramite"."contrato_etapas" USING btree ("contrato_id");--> statement-breakpoint
CREATE UNIQUE INDEX "medicao_contrato_competencia" ON "tramite"."contrato_medicoes" USING btree ("contrato_id","competencia");--> statement-breakpoint
CREATE UNIQUE INDEX "nota_contrato_numero" ON "tramite"."contrato_notas" USING btree ("contrato_id","numero");--> statement-breakpoint
CREATE INDEX "nota_situacao" ON "tramite"."contrato_notas" USING btree ("situacao");--> statement-breakpoint
CREATE INDEX "nota_processo" ON "tramite"."contrato_notas" USING btree ("processo_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contrato_municipio_ano_numero" ON "tramite"."contratos" USING btree ("municipio_id","ano","numero");--> statement-breakpoint
CREATE INDEX "contrato_empresa" ON "tramite"."contratos" USING btree ("empresa_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fin_conta_numero" ON "tramite"."fin_contas" USING btree ("municipio_id","banco","agencia","numero");--> statement-breakpoint
CREATE INDEX "fin_credito_dotacao" ON "tramite"."fin_creditos" USING btree ("dotacao_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fin_dotacao_chave" ON "tramite"."fin_dotacoes" USING btree ("municipio_id","ano","unidade","funcao","subfuncao","programa","acao","natureza","fonte");--> statement-breakpoint
CREATE INDEX "fin_dotacao_municipio_ano" ON "tramite"."fin_dotacoes" USING btree ("municipio_id","ano");--> statement-breakpoint
CREATE UNIQUE INDEX "fin_empenho_numero" ON "tramite"."fin_empenhos" USING btree ("municipio_id","ano","numero");--> statement-breakpoint
CREATE INDEX "fin_empenho_dotacao" ON "tramite"."fin_empenhos" USING btree ("dotacao_id");--> statement-breakpoint
CREATE INDEX "fin_empenho_empresa" ON "tramite"."fin_empenhos" USING btree ("empresa_id");--> statement-breakpoint
CREATE INDEX "fin_liquidacao_empenho" ON "tramite"."fin_liquidacoes" USING btree ("empenho_id");--> statement-breakpoint
CREATE INDEX "fin_pagamento_liquidacao" ON "tramite"."fin_pagamentos" USING btree ("liquidacao_id");--> statement-breakpoint
CREATE INDEX "fin_pagamento_conta" ON "tramite"."fin_pagamentos" USING btree ("conta_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fin_processo_empenho_par" ON "tramite"."fin_processo_empenho" USING btree ("processo_id","empenho_id");--> statement-breakpoint
CREATE INDEX "fin_pe_empenho" ON "tramite"."fin_processo_empenho" USING btree ("empenho_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fin_receita_chave" ON "tramite"."fin_receitas" USING btree ("municipio_id","ano","mes","categoria");--> statement-breakpoint
CREATE UNIQUE INDEX "fin_reserva_numero" ON "tramite"."fin_reservas" USING btree ("municipio_id","ano","numero");--> statement-breakpoint
CREATE INDEX "fin_reserva_dotacao" ON "tramite"."fin_reservas" USING btree ("dotacao_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trib_aliquota_chave" ON "tramite"."trib_aliquotas" USING btree ("municipio_id","exercicio","tributo","uso");--> statement-breakpoint
CREATE UNIQUE INDEX "trib_da_numero" ON "tramite"."trib_divida_ativa" USING btree ("municipio_id","numero_inscricao");--> statement-breakpoint
CREATE INDEX "trib_da_pessoa" ON "tramite"."trib_divida_ativa" USING btree ("devedor_pessoa_id");--> statement-breakpoint
CREATE INDEX "trib_da_empresa" ON "tramite"."trib_divida_ativa" USING btree ("devedor_empresa_id");--> statement-breakpoint
CREATE INDEX "trib_guia_municipio" ON "tramite"."trib_guias" USING btree ("municipio_id","emitida_em");--> statement-breakpoint
CREATE UNIQUE INDEX "trib_imovel_inscricao" ON "tramite"."trib_imoveis" USING btree ("municipio_id","inscricao");--> statement-breakpoint
CREATE INDEX "trib_imovel_bairro" ON "tramite"."trib_imoveis" USING btree ("municipio_id","bairro");--> statement-breakpoint
CREATE UNIQUE INDEX "trib_inscricao_numero" ON "tramite"."trib_inscricoes" USING btree ("municipio_id","numero");--> statement-breakpoint
CREATE UNIQUE INDEX "trib_inscricao_empresa" ON "tramite"."trib_inscricoes" USING btree ("municipio_id","empresa_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trib_itbi_numero" ON "tramite"."trib_itbi" USING btree ("municipio_id","numero");--> statement-breakpoint
CREATE INDEX "trib_itbi_situacao" ON "tramite"."trib_itbi" USING btree ("municipio_id","situacao");--> statement-breakpoint
CREATE INDEX "trib_itbi_imovel" ON "tramite"."trib_itbi" USING btree ("imovel_id");--> statement-breakpoint
CREATE INDEX "trib_lanc_tributo" ON "tramite"."trib_lancamentos" USING btree ("municipio_id","exercicio","tributo");--> statement-breakpoint
CREATE INDEX "trib_lanc_imovel" ON "tramite"."trib_lancamentos" USING btree ("imovel_id");--> statement-breakpoint
CREATE INDEX "trib_lanc_pessoa" ON "tramite"."trib_lancamentos" USING btree ("contribuinte_pessoa_id");--> statement-breakpoint
CREATE INDEX "trib_lanc_empresa" ON "tramite"."trib_lancamentos" USING btree ("contribuinte_empresa_id");--> statement-breakpoint
CREATE INDEX "trib_licenca_inscricao" ON "tramite"."trib_licencas" USING btree ("inscricao_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trib_parcela_numero" ON "tramite"."trib_parcelas" USING btree ("lancamento_id","numero");--> statement-breakpoint
CREATE INDEX "trib_parcela_venc" ON "tramite"."trib_parcelas" USING btree ("vencimento");--> statement-breakpoint
CREATE UNIQUE INDEX "trib_planta_exercicio_bairro" ON "tramite"."trib_planta" USING btree ("municipio_id","exercicio","bairro");--> statement-breakpoint
CREATE UNIQUE INDEX "trib_previsao_chave" ON "tramite"."trib_previsoes" USING btree ("municipio_id","exercicio","tributo");--> statement-breakpoint
CREATE INDEX "trib_prop_imovel" ON "tramite"."trib_proprietarios" USING btree ("imovel_id");--> statement-breakpoint
CREATE INDEX "trib_prop_pessoa" ON "tramite"."trib_proprietarios" USING btree ("pessoa_id");--> statement-breakpoint
CREATE INDEX "trib_prop_empresa" ON "tramite"."trib_proprietarios" USING btree ("empresa_id");--> statement-breakpoint
CREATE INDEX "gestao_alerta_municipio" ON "tramite"."gestao_alertas" USING btree ("municipio_id","situacao");--> statement-breakpoint
CREATE INDEX "gestao_alerta_regra_processo" ON "tramite"."gestao_alertas" USING btree ("regra_id","processo_id");--> statement-breakpoint
CREATE INDEX "gestao_auditoria_municipio" ON "tramite"."gestao_auditoria" USING btree ("municipio_id","criado_em");--> statement-breakpoint
CREATE INDEX "gestao_chamada_integracao" ON "tramite"."gestao_chamadas" USING btree ("integracao_id","criado_em");--> statement-breakpoint
CREATE UNIQUE INDEX "gestao_chamada_operacao" ON "tramite"."gestao_chamadas" USING btree ("municipio_id","id_operacao");--> statement-breakpoint
CREATE INDEX "gestao_execucao_regra" ON "tramite"."gestao_execucoes" USING btree ("regra_id","criado_em");--> statement-breakpoint
CREATE INDEX "gestao_execucao_municipio" ON "tramite"."gestao_execucoes" USING btree ("municipio_id","criado_em");--> statement-breakpoint
CREATE UNIQUE INDEX "gestao_integracao_municipio_chave" ON "tramite"."gestao_integracoes" USING btree ("municipio_id","chave");--> statement-breakpoint
CREATE INDEX "gestao_regra_municipio" ON "tramite"."gestao_regras" USING btree ("municipio_id");
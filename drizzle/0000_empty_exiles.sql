CREATE SCHEMA "tramite";
--> statement-breakpoint
CREATE TABLE "tramite"."assinaturas" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"documento_id" text NOT NULL,
	"usuario_id" text NOT NULL,
	"papel" text NOT NULL,
	"hash_assinado" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tramite"."documentos" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"processo_id" text NOT NULL,
	"tipo" text NOT NULL,
	"titulo" text NOT NULL,
	"conteudo" text NOT NULL,
	"versao" integer DEFAULT 1 NOT NULL,
	"hash" text NOT NULL,
	"criado_por_id" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tramite"."eventos" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"processo_id" text NOT NULL,
	"seq" integer NOT NULL,
	"tipo" text NOT NULL,
	"de_estado" text,
	"para_estado" text,
	"de_setor_id" text,
	"para_setor_id" text,
	"autor_id" text NOT NULL,
	"dados" jsonb,
	"hash_anterior" text,
	"hash" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tramite"."feriados" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"municipio_id" text NOT NULL,
	"data" date NOT NULL,
	"nome" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tramite"."municipios" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"slug" text NOT NULL,
	"nome" text NOT NULL,
	"uf" text NOT NULL,
	"populacao" integer,
	"tce" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "municipios_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "tramite"."processos" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"municipio_id" text NOT NULL,
	"unidade_gestora_id" text NOT NULL,
	"tipo_id" text NOT NULL,
	"ano" integer NOT NULL,
	"sequencial" integer NOT NULL,
	"numero" text NOT NULL,
	"assunto" text NOT NULL,
	"descricao" text,
	"urgencia" text DEFAULT 'NORMAL' NOT NULL,
	"estado_atual" text NOT NULL,
	"setor_atual_id" text,
	"recebido_em" timestamp with time zone,
	"prazo_etapa_em" timestamp with time zone,
	"aberto_por_id" text NOT NULL,
	"aberto_em" timestamp with time zone DEFAULT now() NOT NULL,
	"encerrado_em" timestamp with time zone,
	"metadados" jsonb
);
--> statement-breakpoint
CREATE TABLE "tramite"."sessoes" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"usuario_id" text NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tramite"."setores" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"municipio_id" text NOT NULL,
	"sigla" text NOT NULL,
	"nome" text NOT NULL,
	"sla_padrao_dias" integer DEFAULT 5 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tramite"."tipos_processo" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"municipio_id" text NOT NULL,
	"chave" text NOT NULL,
	"nome" text NOT NULL,
	"descricao" text,
	"versao" integer DEFAULT 1 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"definicao" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tramite"."unidades_gestoras" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"municipio_id" text NOT NULL,
	"codigo" text NOT NULL,
	"nome" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tramite"."usuarios" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"municipio_id" text NOT NULL,
	"cpf" text NOT NULL,
	"nome" text NOT NULL,
	"email" text NOT NULL,
	"senha_hash" text NOT NULL,
	"cargo" text,
	"papeis" text[] DEFAULT '{}'::text[] NOT NULL,
	"setor_id" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tramite"."assinaturas" ADD CONSTRAINT "assinaturas_documento_id_documentos_id_fk" FOREIGN KEY ("documento_id") REFERENCES "tramite"."documentos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."assinaturas" ADD CONSTRAINT "assinaturas_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "tramite"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."documentos" ADD CONSTRAINT "documentos_processo_id_processos_id_fk" FOREIGN KEY ("processo_id") REFERENCES "tramite"."processos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."documentos" ADD CONSTRAINT "documentos_criado_por_id_usuarios_id_fk" FOREIGN KEY ("criado_por_id") REFERENCES "tramite"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."eventos" ADD CONSTRAINT "eventos_processo_id_processos_id_fk" FOREIGN KEY ("processo_id") REFERENCES "tramite"."processos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."eventos" ADD CONSTRAINT "eventos_de_setor_id_setores_id_fk" FOREIGN KEY ("de_setor_id") REFERENCES "tramite"."setores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."eventos" ADD CONSTRAINT "eventos_para_setor_id_setores_id_fk" FOREIGN KEY ("para_setor_id") REFERENCES "tramite"."setores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."eventos" ADD CONSTRAINT "eventos_autor_id_usuarios_id_fk" FOREIGN KEY ("autor_id") REFERENCES "tramite"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."feriados" ADD CONSTRAINT "feriados_municipio_id_municipios_id_fk" FOREIGN KEY ("municipio_id") REFERENCES "tramite"."municipios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."processos" ADD CONSTRAINT "processos_municipio_id_municipios_id_fk" FOREIGN KEY ("municipio_id") REFERENCES "tramite"."municipios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."processos" ADD CONSTRAINT "processos_unidade_gestora_id_unidades_gestoras_id_fk" FOREIGN KEY ("unidade_gestora_id") REFERENCES "tramite"."unidades_gestoras"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."processos" ADD CONSTRAINT "processos_tipo_id_tipos_processo_id_fk" FOREIGN KEY ("tipo_id") REFERENCES "tramite"."tipos_processo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."processos" ADD CONSTRAINT "processos_setor_atual_id_setores_id_fk" FOREIGN KEY ("setor_atual_id") REFERENCES "tramite"."setores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."processos" ADD CONSTRAINT "processos_aberto_por_id_usuarios_id_fk" FOREIGN KEY ("aberto_por_id") REFERENCES "tramite"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."sessoes" ADD CONSTRAINT "sessoes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "tramite"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."setores" ADD CONSTRAINT "setores_municipio_id_municipios_id_fk" FOREIGN KEY ("municipio_id") REFERENCES "tramite"."municipios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."tipos_processo" ADD CONSTRAINT "tipos_processo_municipio_id_municipios_id_fk" FOREIGN KEY ("municipio_id") REFERENCES "tramite"."municipios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."unidades_gestoras" ADD CONSTRAINT "unidades_gestoras_municipio_id_municipios_id_fk" FOREIGN KEY ("municipio_id") REFERENCES "tramite"."municipios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."usuarios" ADD CONSTRAINT "usuarios_municipio_id_municipios_id_fk" FOREIGN KEY ("municipio_id") REFERENCES "tramite"."municipios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."usuarios" ADD CONSTRAINT "usuarios_setor_id_setores_id_fk" FOREIGN KEY ("setor_id") REFERENCES "tramite"."setores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "assinatura_doc_usuario_papel" ON "tramite"."assinaturas" USING btree ("documento_id","usuario_id","papel");--> statement-breakpoint
CREATE INDEX "documento_processo_tipo" ON "tramite"."documentos" USING btree ("processo_id","tipo");--> statement-breakpoint
CREATE UNIQUE INDEX "evento_processo_seq" ON "tramite"."eventos" USING btree ("processo_id","seq");--> statement-breakpoint
CREATE INDEX "evento_criado" ON "tramite"."eventos" USING btree ("criado_em");--> statement-breakpoint
CREATE UNIQUE INDEX "feriado_municipio_data" ON "tramite"."feriados" USING btree ("municipio_id","data");--> statement-breakpoint
CREATE UNIQUE INDEX "processo_municipio_numero" ON "tramite"."processos" USING btree ("municipio_id","numero");--> statement-breakpoint
CREATE INDEX "processo_estado" ON "tramite"."processos" USING btree ("municipio_id","estado_atual");--> statement-breakpoint
CREATE INDEX "processo_setor" ON "tramite"."processos" USING btree ("setor_atual_id");--> statement-breakpoint
CREATE UNIQUE INDEX "setor_municipio_sigla" ON "tramite"."setores" USING btree ("municipio_id","sigla");--> statement-breakpoint
CREATE UNIQUE INDEX "tipo_municipio_chave_versao" ON "tramite"."tipos_processo" USING btree ("municipio_id","chave","versao");--> statement-breakpoint
CREATE UNIQUE INDEX "ug_municipio_codigo" ON "tramite"."unidades_gestoras" USING btree ("municipio_id","codigo");--> statement-breakpoint
CREATE UNIQUE INDEX "usuario_municipio_cpf" ON "tramite"."usuarios" USING btree ("municipio_id","cpf");
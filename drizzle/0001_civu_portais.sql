CREATE TABLE "tramite"."empresas" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"cnpj" text NOT NULL,
	"razao_social" text NOT NULL,
	"nome_fantasia" text,
	"porte" text DEFAULT 'DEMAIS' NOT NULL,
	"atividades" text[] DEFAULT '{}'::text[] NOT NULL,
	"endereco" jsonb,
	"email" text,
	"telefone" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "empresas_cnpj_unique" UNIQUE("cnpj")
);
--> statement-breakpoint
CREATE TABLE "tramite"."pessoas" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"cpf" text NOT NULL,
	"nome" text NOT NULL,
	"email" text,
	"telefone" text,
	"nascimento" date,
	"endereco" jsonb,
	"nivel_govbr" text,
	"senha_hash" text,
	"telefone_confirmado" boolean DEFAULT false NOT NULL,
	"demonstracao" boolean DEFAULT false NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pessoas_cpf_unique" UNIQUE("cpf")
);
--> statement-breakpoint
CREATE TABLE "tramite"."representacoes" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"pessoa_id" text NOT NULL,
	"empresa_id" text NOT NULL,
	"papel" text NOT NULL,
	"escopos" text[] DEFAULT '{}'::text[] NOT NULL,
	"valida_ate" date,
	"revogada_em" timestamp with time zone,
	"concedida_por_id" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tramite"."sessoes_portal" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"pessoa_id" text NOT NULL,
	"empresa_ativa_id" text,
	"metodo" text NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tramite"."processos" ADD COLUMN "interessado_pessoa_id" text;--> statement-breakpoint
ALTER TABLE "tramite"."processos" ADD COLUMN "interessado_empresa_id" text;--> statement-breakpoint
ALTER TABLE "tramite"."processos" ADD COLUMN "canal" text DEFAULT 'INTERNO' NOT NULL;--> statement-breakpoint
ALTER TABLE "tramite"."representacoes" ADD CONSTRAINT "representacoes_pessoa_id_pessoas_id_fk" FOREIGN KEY ("pessoa_id") REFERENCES "tramite"."pessoas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."representacoes" ADD CONSTRAINT "representacoes_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "tramite"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."representacoes" ADD CONSTRAINT "representacoes_concedida_por_id_pessoas_id_fk" FOREIGN KEY ("concedida_por_id") REFERENCES "tramite"."pessoas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."sessoes_portal" ADD CONSTRAINT "sessoes_portal_pessoa_id_pessoas_id_fk" FOREIGN KEY ("pessoa_id") REFERENCES "tramite"."pessoas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."sessoes_portal" ADD CONSTRAINT "sessoes_portal_empresa_ativa_id_empresas_id_fk" FOREIGN KEY ("empresa_ativa_id") REFERENCES "tramite"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "representacao_pessoa" ON "tramite"."representacoes" USING btree ("pessoa_id");--> statement-breakpoint
CREATE INDEX "representacao_empresa" ON "tramite"."representacoes" USING btree ("empresa_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sessao_portal_id" ON "tramite"."sessoes_portal" USING btree ("id");--> statement-breakpoint
CREATE INDEX "processo_interessado_pessoa" ON "tramite"."processos" USING btree ("interessado_pessoa_id");--> statement-breakpoint
CREATE INDEX "processo_interessado_empresa" ON "tramite"."processos" USING btree ("interessado_empresa_id");
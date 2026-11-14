CREATE TABLE "tramite"."obrigacao_entregas" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"obrigacao_id" text NOT NULL,
	"vencimento" date NOT NULL,
	"entregue_em" date NOT NULL,
	"comprovante" text NOT NULL,
	"autor_id" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tramite"."obrigacoes_area" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"municipio_id" text NOT NULL,
	"setor_id" text NOT NULL,
	"nome" text NOT NULL,
	"destinatario" text NOT NULL,
	"periodicidade" text NOT NULL,
	"proximo_vencimento" date NOT NULL,
	"responsavel_id" text,
	"situacao" text DEFAULT 'PENDENTE' NOT NULL,
	"observacao" text,
	"exemplo" boolean DEFAULT false NOT NULL,
	"criado_por_id" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tramite"."repasse_historico" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"repasse_id" text NOT NULL,
	"tipo" text NOT NULL,
	"descricao" text NOT NULL,
	"dados" jsonb,
	"autor_id" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tramite"."repasses" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"municipio_id" text NOT NULL,
	"setor_id" text NOT NULL,
	"tipo" text NOT NULL,
	"identificacao" text,
	"concedente" text NOT NULL,
	"objeto" text NOT NULL,
	"valor_previsto" numeric(14, 2) NOT NULL,
	"valor_recebido" numeric(14, 2) DEFAULT '0' NOT NULL,
	"assinado_em" date,
	"vigencia_fim" date,
	"prazo_execucao" date,
	"prazo_prestacao_contas" date,
	"situacao" text NOT NULL,
	"observacao" text,
	"criado_por_id" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tramite"."obrigacao_entregas" ADD CONSTRAINT "obrigacao_entregas_obrigacao_id_obrigacoes_area_id_fk" FOREIGN KEY ("obrigacao_id") REFERENCES "tramite"."obrigacoes_area"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."obrigacao_entregas" ADD CONSTRAINT "obrigacao_entregas_autor_id_usuarios_id_fk" FOREIGN KEY ("autor_id") REFERENCES "tramite"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."obrigacoes_area" ADD CONSTRAINT "obrigacoes_area_municipio_id_municipios_id_fk" FOREIGN KEY ("municipio_id") REFERENCES "tramite"."municipios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."obrigacoes_area" ADD CONSTRAINT "obrigacoes_area_setor_id_setores_id_fk" FOREIGN KEY ("setor_id") REFERENCES "tramite"."setores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."obrigacoes_area" ADD CONSTRAINT "obrigacoes_area_responsavel_id_usuarios_id_fk" FOREIGN KEY ("responsavel_id") REFERENCES "tramite"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."obrigacoes_area" ADD CONSTRAINT "obrigacoes_area_criado_por_id_usuarios_id_fk" FOREIGN KEY ("criado_por_id") REFERENCES "tramite"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."repasse_historico" ADD CONSTRAINT "repasse_historico_repasse_id_repasses_id_fk" FOREIGN KEY ("repasse_id") REFERENCES "tramite"."repasses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."repasse_historico" ADD CONSTRAINT "repasse_historico_autor_id_usuarios_id_fk" FOREIGN KEY ("autor_id") REFERENCES "tramite"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."repasses" ADD CONSTRAINT "repasses_municipio_id_municipios_id_fk" FOREIGN KEY ("municipio_id") REFERENCES "tramite"."municipios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."repasses" ADD CONSTRAINT "repasses_setor_id_setores_id_fk" FOREIGN KEY ("setor_id") REFERENCES "tramite"."setores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite"."repasses" ADD CONSTRAINT "repasses_criado_por_id_usuarios_id_fk" FOREIGN KEY ("criado_por_id") REFERENCES "tramite"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "obrigacao_entrega_obrigacao" ON "tramite"."obrigacao_entregas" USING btree ("obrigacao_id");--> statement-breakpoint
CREATE INDEX "obrigacao_area_municipio" ON "tramite"."obrigacoes_area" USING btree ("municipio_id");--> statement-breakpoint
CREATE INDEX "obrigacao_area_setor" ON "tramite"."obrigacoes_area" USING btree ("setor_id");--> statement-breakpoint
CREATE INDEX "repasse_historico_repasse" ON "tramite"."repasse_historico" USING btree ("repasse_id");--> statement-breakpoint
CREATE INDEX "repasse_municipio" ON "tramite"."repasses" USING btree ("municipio_id");--> statement-breakpoint
CREATE INDEX "repasse_setor" ON "tramite"."repasses" USING btree ("setor_id");
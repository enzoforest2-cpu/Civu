import Link from "next/link";
import { and, desc, eq, isNull } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db";
import { processos } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { fmtData } from "@/lib/dates";
import { Cabecalho, Panel } from "@/components/ui";
import { Assistente } from "@/modulos/gestao/componentes/assistente";

export const metadata = { title: "Assistente de redação · Civu" };

export default async function RedacaoPage({ searchParams }: { searchParams: Promise<{ processo?: string }> }) {
  const u = await requireUser();
  const { processo } = await searchParams;
  const lista = await db.query.processos.findMany({
    where: and(eq(processos.municipioId, u.municipioId), isNull(processos.encerradoEm)),
    with: { setorAtual: true },
    orderBy: desc(processos.abertoEm),
    limit: 200,
  });
  const procs = lista.map((p) => ({
    id: p.id,
    numero: p.numero,
    assunto: p.assunto,
    interessado: String((p.metadados as Record<string, unknown> | null)?.interessado ?? ""),
    setor: p.setorAtual?.nome ?? "",
  }));
  return (
    <>
      <Link href="/automacoes" className="mb-4 inline-flex items-center gap-1.5 text-[14px] text-ink-2 hover:text-ink">
        <ArrowLeft size={15} /> Automações
      </Link>
      <Cabecalho
        titulo="Assistente de redação"
        sub="Despachos, ofícios e respostas ao cidadão a partir de modelos aprovados, preenchidos com os dados do processo. Revise sempre antes de usar."
      />
      <div className="mb-6 rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-[13.5px] text-ink">
        <span className="font-semibold">Versão por modelos.</span> O texto sai de modelos com variáveis, sem inteligência artificial. A versão com IA, que propõe o rascunho a partir do
        histórico do processo e mostra as fontes usadas, virá depois e continuará exigindo revisão de quem assina.
      </div>
      <Panel>
        <Assistente
          processos={procs}
          processoInicial={procs.some((p) => p.id === processo) ? processo : undefined}
          fixos={{ municipio: u.municipio.nome, data: fmtData(new Date()), autor: u.nome, cargo: u.cargo ?? "" }}
        />
      </Panel>
    </>
  );
}

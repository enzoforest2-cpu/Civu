import { and, asc, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/db";
import { processos } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { Card, PageHeader, Empty } from "@/components/ui";
import { TabelaProcessos } from "@/components/tabela-processos";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { receberAction } from "@/app/actions";
import { NumeroProcesso, UrgenciaBadge } from "@/components/ui";
import { fmtDataHora } from "@/lib/dates";

export default async function CaixaPage() {
  const u = await requireUser();
  if (!u.setorId) {
    return (
      <>
        <PageHeader title="Minha caixa" />
        <Empty>Você não está lotado em nenhum setor. Peça ao administrador para ajustar seu cadastro.</Empty>
      </>
    );
  }
  const base = and(eq(processos.municipioId, u.municipioId), eq(processos.setorAtualId, u.setorId), isNull(processos.encerradoEm));
  const [aReceber, emAndamento] = await Promise.all([
    db.query.processos.findMany({
      where: and(base, isNull(processos.recebidoEm)),
      with: { setorAtual: true, tipo: true, abertoPor: true, eventos: { orderBy: (e, { desc }) => [desc(e.seq)], limit: 1, with: { deSetor: true } } },
      orderBy: [asc(processos.abertoEm)],
    }),
    db.query.processos.findMany({
      where: and(base, isNotNull(processos.recebidoEm)),
      with: { setorAtual: true, tipo: true, abertoPor: true },
      orderBy: [asc(processos.prazoEtapaEm), desc(processos.abertoEm)],
    }),
  ]);
  const recebidos = emAndamento;

  return (
    <>
      <PageHeader
        title="Minha caixa"
        subtitle={`Processos no setor ${u.setor?.nome}. Confirme o recebimento de cada processo que chegar; o prazo da etapa já está correndo.`}
      />
      <Card title={`A receber (${aReceber.length})`} className="mb-6">
        {aReceber.length === 0 ? (
          <Empty>Nada aguardando recebimento.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {aReceber.map((p) => {
              const ult = p.eventos[0];
              return (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <NumeroProcesso id={p.id} numero={p.numero} />
                      <UrgenciaBadge u={p.urgencia} />
                    </div>
                    <div className="truncate text-sm">{p.assunto}</div>
                    <div className="text-xs text-ink-3">
                      Enviado por {ult?.deSetor?.nome ?? "—"} em {fmtDataHora(ult?.criadoEm)}
                    </div>
                  </div>
                  <ActionForm action={receberAction}>
                    <input type="hidden" name="processoId" value={p.id} />
                    <SubmitButton className="btn btn-ghost" pendingText="Confirmando…">
                      Confirmar recebimento
                    </SubmitButton>
                  </ActionForm>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <Card title={`Em andamento no setor (${recebidos.length})`}>
        <TabelaProcessos linhas={recebidos} vazio="Nenhum processo em andamento no seu setor." />
      </Card>
    </>
  );
}

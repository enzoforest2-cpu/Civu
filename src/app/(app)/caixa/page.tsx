import { and, asc, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { ArrowDownToLine } from "lucide-react";
import { db } from "@/db";
import { processos } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { Cabecalho, Panel, Vazio, NumeroProcesso, UrgenciaChip, Prazo } from "@/components/ui";
import { TabelaProcessos, valorDoProcesso } from "@/components/tabela-processos";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { receberAction } from "@/app/actions";
import { fmtDataHora, fmtMoeda } from "@/lib/dates";
import { nomeDaEtapa, type WorkflowDef } from "@/lib/workflow";

export default async function CaixaPage() {
  const u = await requireUser();
  if (!u.setorId) {
    return (
      <>
        <Cabecalho titulo="Minha caixa" />
        <Vazio>Você ainda não está ligado a um setor. Peça ao administrador para ajustar seu cadastro.</Vazio>
      </>
    );
  }
  const base = and(eq(processos.municipioId, u.municipioId), eq(processos.setorAtualId, u.setorId), isNull(processos.encerradoEm));
  const [aReceber, recebidos] = await Promise.all([
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

  return (
    <>
      <Cabecalho
        titulo="Minha caixa"
        sub={
          <>
            Processos que estão com <strong className="font-semibold text-ink">{u.setor?.nome}</strong>. Quando um processo chegar, confirme o recebimento — o prazo da etapa já está correndo.
          </>
        }
      />

      <section className="mb-8">
        <h2 className="mb-3 text-[15px] font-semibold text-ink">
          Chegaram para o seu setor <span className="tnum text-ink-3">{aReceber.length}</span>
        </h2>
        {aReceber.length === 0 ? (
          <Vazio>Nada esperando recebimento.</Vazio>
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {aReceber.map((p) => {
              const ult = p.eventos[0];
              return (
                <li key={p.id} className="panel flex flex-col gap-4 border-l-4 !border-l-warn p-5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <NumeroProcesso id={p.id} numero={p.numero} />
                      <UrgenciaChip u={p.urgencia} />
                    </div>
                    <div className="mt-1 text-[15.5px] font-medium text-ink">{p.assunto}</div>
                    <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2">
                      <div>
                        <dt className="text-[12px] text-ink-3">Etapa</dt>
                        <dd className="text-[14px] font-medium text-ink">{nomeDaEtapa(p.tipo.definicao as WorkflowDef, p.estadoAtual)}</dd>
                      </div>
                      <div>
                        <dt className="text-[12px] text-ink-3">Valor</dt>
                        <dd className="tnum text-[14px] text-ink">{fmtMoeda(valorDoProcesso(p.metadados))}</dd>
                      </div>
                      <div className="col-span-2">
                        <dt className="text-[12px] text-ink-3">Prazo da etapa</dt>
                        <dd className="mt-0.5">
                          <Prazo prazo={p.prazoEtapaEm} encerrado={p.encerradoEm} />
                        </dd>
                      </div>
                    </dl>
                    <div className="mt-2 text-[13px] text-ink-3">
                      Enviado por {ult?.deSetor?.nome ?? "—"} em {fmtDataHora(ult?.criadoEm)}
                    </div>
                  </div>
                  <ActionForm action={receberAction}>
                    <input type="hidden" name="processoId" value={p.id} />
                    <SubmitButton className="btn btn-primary" pendingText="Confirmando…">
                      <ArrowDownToLine size={16} /> Confirmar recebimento
                    </SubmitButton>
                  </ActionForm>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Panel title={`Em andamento no seu setor · ${recebidos.length}`} pad={false}>
        <div className="px-6 pt-2 pb-2">
          <TabelaProcessos linhas={recebidos} vazio="Nenhum processo em andamento no seu setor." />
        </div>
      </Panel>
    </>
  );
}

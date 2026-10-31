import { Chip, Panel, Vazio } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { hojeIso } from "@/lib/engine";
import type { Recurso } from "@/lib/regras-fluxo";
import { decidirRecursoAction, registrarRecursoAction } from "./acoes";
import { SoConsulta, dataBr, listaDe, metaDe, type PropsEtapa } from "./util";

/** Recursos (art. 165): intenção na sessão, razões em 3 dias úteis, contrarrazões em mais 3, decisão. */
export function PainelRecursos({ p, pode }: PropsEtapa) {
  const lista = listaDe<Recurso>(metaDe(p).recursos);
  const hoje = hojeIso();
  // Destino do link "Ver recursos" (página do processo): o primeiro recurso que já pode ser decidido; senão o registro de intenção; senão o painel
  const aDecidir = pode ? lista.findIndex((r) => !r.decididoEm && hoje > r.contrarrazoesAte) : -1;
  const alvo = "etapa-recursos";
  return (
    <Panel id={pode ? undefined : alvo} title="Recursos">
      <p className="text-[14px] text-ink-2">Razões em 3 dias úteis após a intenção e contrarrazões em mais 3 (art. 165). Recurso provido devolve o processo à sessão para refazer o julgamento.</p>
      <div className="mt-4">
        {lista.length === 0 ? (
          <Vazio>Nenhuma intenção de recurso registrada na sessão.</Vazio>
        ) : (
          <ul className="space-y-3">
            {lista.map((r, n) => (
              <li key={`${r.id}-${n}`} className="rounded-xl border border-line px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[14.5px] font-medium text-ink">{r.recorrente}</div>
                    <div className="text-[12.5px] text-ink-3">Intenção em {dataBr(r.intencaoEm)}</div>
                  </div>
                  {r.decididoEm ? <Chip tone={r.provido ? "warn" : "ok"}>{r.provido ? "Provido" : "Não provido"}</Chip> : <Chip>Aguardando decisão</Chip>}
                </div>
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[14px] text-ink-2">
                  <span>
                    Razões até <strong className="tnum font-semibold text-ink">{dataBr(r.razoesAte)}</strong>
                  </span>
                  <span>
                    Contrarrazões até <strong className="tnum font-semibold text-ink">{dataBr(r.contrarrazoesAte)}</strong>
                  </span>
                </div>
                {r.decididoEm ? (
                  <div className="mt-2 rounded-lg bg-sunken px-3 py-2 text-[14px] text-ink">
                    <strong className="font-semibold">Decidido em {dataBr(r.decididoEm)}:</strong> {r.decisao}
                  </div>
                ) : pode && hoje <= r.contrarrazoesAte ? (
                  <p className="mt-2 text-[14px] text-ink-3">A decisão fica disponível a partir do dia seguinte ao fim das contrarrazões ({dataBr(r.contrarrazoesAte)}).</p>
                ) : (
                  pode && (
                    <details id={n === aDecidir ? alvo : undefined} className="mt-3 rounded-xl border border-line open:bg-sunken/50">
                      <summary className="flex min-h-[44px] items-center px-4 py-2.5 text-[14px] font-semibold text-brand-2">Decidir</summary>
                      <ActionForm action={decidirRecursoAction} className="space-y-3 px-4 pb-4">
                        <input type="hidden" name="processoId" value={p.id} />
                        <input type="hidden" name="recursoId" value={r.id} />
                        <div>
                          <label className="label" htmlFor={`dec-${r.id}`}>
                            Decisão
                          </label>
                          <textarea id={`dec-${r.id}`} name="decisao" className="input" rows={3} required />
                        </div>
                        <label className="flex min-h-[44px] items-center gap-2 text-[14px] text-ink">
                          <input type="checkbox" name="provido" className="h-4 w-4" /> Recurso provido (volta à sessão para refazer o julgamento)
                        </label>
                        <SubmitButton pendingText="Salvando…">Registrar decisão</SubmitButton>
                      </ActionForm>
                    </details>
                  )
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {pode ? (
        <details id={aDecidir < 0 ? alvo : undefined} className="mt-4 rounded-xl border border-line open:bg-sunken/50">
          <summary className="px-4 py-3 text-[14px] font-semibold text-brand-2">Registrar intenção de recurso</summary>
          <ActionForm action={registrarRecursoAction} className="space-y-3 px-4 pb-4">
            <input type="hidden" name="processoId" value={p.id} />
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_170px]">
              <div>
                <label className="label" htmlFor="rec-recorrente">
                  Licitante que recorre
                </label>
                <input id="rec-recorrente" name="recorrente" className="input" required />
              </div>
              <div>
                <label className="label" htmlFor="rec-data">
                  Intenção em
                </label>
                <input id="rec-data" name="intencaoEm" type="date" className="input" required defaultValue={hojeIso()} />
              </div>
            </div>
            <SubmitButton pendingText="Registrando…">Registrar intenção</SubmitButton>
          </ActionForm>
        </details>
      ) : (
        <SoConsulta />
      )}
    </Panel>
  );
}

import { Chip, Panel, Vazio } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { hojeIso } from "@/lib/engine";
import type { Edital, Impugnacao } from "@/lib/regras-fluxo";
import { registrarImpugnacaoAction, responderImpugnacaoAction } from "./acoes";
import { SoConsulta, dataBr, listaDe, metaDe, type PropsEtapa } from "./util";

/** Impugnações ao edital (art. 164): tempestividade calculada pelo motor, resposta com efeito sobre o edital. */
export function PainelImpugnacoes({ p, pode }: PropsEtapa) {
  const meta = metaDe(p);
  const edital = meta.edital as Edital | undefined;
  const lista = listaDe<Impugnacao>(meta.impugnacoes);
  // Destino do link "Ver impugnações" (página do processo): a primeira que precisa de resposta; senão o registro de uma nova; senão o painel
  const aResponder = pode ? lista.findIndex((i) => i.tempestiva && !i.resposta) : -1;
  const alvo = "etapa-impugnacoes";
  return (
    <Panel id={pode ? undefined : alvo} title="Impugnações ao edital">
      {edital && (
        <p className="text-[14.5px] font-semibold text-ink">
          Sessão marcada para {dataBr(edital.aberturaEm)}
          <span className="font-normal text-ink-2"> · edital {edital.numero}</span>
        </p>
      )}
      <p className="mt-1 text-[14px] text-ink-2">
        Vale a impugnação recebida até 3 dias úteis antes da abertura (art. 164). As que chegaram no prazo precisam de resposta antes da sessão.
      </p>

      <div className="mt-4">
        {lista.length === 0 ? (
          <Vazio>Nenhuma impugnação registrada. Se chegar alguma, registre abaixo com a data de recebimento.</Vazio>
        ) : (
          <ul className="space-y-3">
            {lista.map((i, n) => (
              <li key={`${i.id}-${n}`} className="rounded-xl border border-line px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[14.5px] font-medium text-ink">{i.autor}</div>
                    <div className="text-[12.5px] text-ink-3">Recebida em {dataBr(i.recebidaEm)}</div>
                  </div>
                  <Chip tone={i.tempestiva ? "ok" : "neutral"}>{i.tempestiva ? "No prazo" : "Fora do prazo"}</Chip>
                </div>
                <p className="mt-2 text-[14px] break-words text-ink-2">{i.texto}</p>
                {i.resposta ? (
                  <div className="mt-2 rounded-lg bg-sunken px-3 py-2 text-[14px] text-ink">
                    <strong className="font-semibold">{i.acolhida ? (i.alteraPropostas ? "Acolhida, altera as propostas" : "Acolhida") : "Não acolhida"}</strong>
                    {i.respondidaEm ? ` em ${dataBr(i.respondidaEm)}` : ""}: {i.resposta}
                  </div>
                ) : (
                  pode && (
                    <details id={n === aResponder ? alvo : undefined} className="mt-3 rounded-xl border border-line open:bg-sunken/50">
                      <summary className="flex min-h-[44px] items-center px-4 py-2.5 text-[14px] font-semibold text-brand-2">Responder</summary>
                      <ActionForm action={responderImpugnacaoAction} className="space-y-3 px-4 pb-4">
                        <input type="hidden" name="processoId" value={p.id} />
                        <input type="hidden" name="impugnacaoId" value={i.id} />
                        <div>
                          <label className="label" htmlFor={`resp-${i.id}`}>
                            Resposta
                          </label>
                          <textarea id={`resp-${i.id}`} name="resposta" className="input" rows={3} required />
                        </div>
                        <label className="flex min-h-[44px] items-center gap-2 text-[14px] text-ink">
                          <input type="checkbox" name="acolhida" className="h-4 w-4" /> Impugnação acolhida
                        </label>
                        <label className="flex min-h-[44px] items-center gap-2 text-[14px] text-ink">
                          <input type="checkbox" name="alteraPropostas" className="h-4 w-4" /> Altera as propostas (o edital volta a ser publicado com prazo novo)
                        </label>
                        <SubmitButton pendingText="Salvando…">Registrar resposta</SubmitButton>
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
        <details id={aResponder < 0 ? alvo : undefined} className="mt-4 rounded-xl border border-line open:bg-sunken/50">
          <summary className="px-4 py-3 text-[14px] font-semibold text-brand-2">Registrar impugnação</summary>
          <ActionForm action={registrarImpugnacaoAction} className="space-y-3 px-4 pb-4">
            <input type="hidden" name="processoId" value={p.id} />
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_170px]">
              <div>
                <label className="label" htmlFor="imp-autor">
                  Quem impugnou
                </label>
                <input id="imp-autor" name="autor" className="input" required placeholder="Ex.: Mendes Materiais Ltda." />
              </div>
              <div>
                <label className="label" htmlFor="imp-data">
                  Recebida em
                </label>
                <input id="imp-data" name="recebidaEm" type="date" className="input" required defaultValue={hojeIso()} />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="imp-texto">
                O que pede
              </label>
              <textarea id="imp-texto" name="texto" className="input" rows={3} required />
            </div>
            <SubmitButton pendingText="Registrando…">Registrar impugnação</SubmitButton>
          </ActionForm>
        </details>
      ) : (
        <SoConsulta />
      )}
    </Panel>
  );
}

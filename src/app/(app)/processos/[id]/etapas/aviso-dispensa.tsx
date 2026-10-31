import { Chip, Panel } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { hojeIso } from "@/lib/engine";
import { MIN_JUSTIFICATIVA, fimAvisoDispensa, type AvisoDispensa } from "@/lib/regras-fluxo";
import { avisoDispensaAction } from "./acoes";
import { SoConsulta, dataBr, metaDe, type PropsEtapa } from "./util";

/** Aviso de contratação direta por dispensa de valor, ou justificativa de por que não houve aviso. */
export function PainelAvisoDispensa({ p, pode, feriados }: PropsEtapa) {
  const aviso = metaDe(p).avisoDispensa as AvisoDispensa | undefined;
  return (
    <Panel id="etapa-aviso" title="Aviso de dispensa" action={aviso ? <Chip tone="ok">Registrado</Chip> : <Chip tone="warn">A publicar</Chip>}>
      <p className="text-[14px] text-ink-2">
        Na dispensa por valor, o aviso fica aberto por 3 dias úteis para receber propostas de outros interessados (art. 75, §3º). Sem aviso, registre a justificativa.
      </p>
      {aviso?.publicadoEm && (
        <p className="mt-3 text-[14.5px] text-ink">
          Aviso publicado em {dataBr(aviso.publicadoEm)}. <strong className="font-semibold">Propostas até {dataBr(fimAvisoDispensa(aviso.publicadoEm, feriados))}</strong>
        </p>
      )}
      {aviso?.justificativaSemAviso && (
        <p className="mt-3 rounded-lg bg-sunken px-3 py-2 text-[14px] text-ink">
          <strong className="font-semibold">Sem aviso:</strong> {aviso.justificativaSemAviso}
        </p>
      )}
      {pode ? (
        <ActionForm action={avisoDispensaAction} className="mt-4 space-y-3">
          <input type="hidden" name="processoId" value={p.id} />
          <div>
            <label className="label" htmlFor="av-data">
              Data de publicação do aviso
            </label>
            <input id="av-data" name="publicadoEm" type="date" className="input sm:!w-56" defaultValue={aviso ? "" : hojeIso()} />
          </div>
          <div>
            <label className="label" htmlFor="av-just">
              Ou justificativa sem aviso
            </label>
            <textarea id="av-just" name="justificativaSemAviso" className="input" rows={2} placeholder="Deixe em branco se o aviso foi publicado." />
            <p className="hint">Pelo menos {MIN_JUSTIFICATIVA} caracteres. Preencha a data ou a justificativa.</p>
          </div>
          <SubmitButton pendingText="Registrando…">Registrar aviso</SubmitButton>
        </ActionForm>
      ) : (
        !aviso && <SoConsulta>Compras ainda não registrou o aviso.</SoConsulta>
      )}
    </Panel>
  );
}

import { Chip, Panel } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { fmtData, fmtDataHora } from "@/lib/dates";
import type { RetornoBancario } from "@/lib/regras-fluxo";
import { retornoBancarioAction } from "./acoes";
import { SoConsulta, listaDe, metaDe, type PropsEtapa } from "./util";

/** Retorno do banco sobre o pagamento enviado: só o aceite leva a "pago"; a recusa devolve à fila sem perder a posição. */
export function PainelRetornoBancario({ p, pode }: PropsEtapa) {
  const meta = metaDe(p);
  const envio = [...p.eventos].reverse().find((e) => e.paraEstado === "PAGAMENTO_ENVIADO");
  const recusas = listaDe<RetornoBancario>(meta.historicoRetornos).filter((r) => r && !r.aceito);
  return (
    <Panel id="etapa-retorno" title="Retorno do banco" action={<Chip tone="warn">{envio ? `Enviado em ${fmtData(envio.criadoEm)}, aguardando o banco` : "Aguardando o banco"}</Chip>}>
      <p className="text-[14px] text-ink-2">Enviado ao banco ainda não é pago. Registre aqui o que o banco respondeu (integração bancária simulada).</p>
      {recusas.length > 0 && (
        <details className="mt-3 rounded-xl border border-line open:bg-sunken/50">
          <summary className="px-4 py-3 text-[14px] font-semibold text-ink-2">Recusas anteriores ({recusas.length})</summary>
          <ul className="space-y-1.5 px-4 pb-4 text-[14px] text-ink-2">
            {recusas.map((r, i) => (
              <li key={i}>
                {fmtDataHora(r.em)}: {r.motivo ?? "sem motivo informado"}
              </li>
            ))}
          </ul>
        </details>
      )}
      {pode ? (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <ActionForm action={retornoBancarioAction} className="rounded-xl border border-ok/25 bg-ok-soft/40 p-4">
            <input type="hidden" name="processoId" value={p.id} />
            <input type="hidden" name="resultado" value="ACEITO" />
            <label className="label" htmlFor="rb-aut">
              Autenticação bancária
            </label>
            <input id="rb-aut" name="autenticacao" className="input tnum" placeholder="Ex.: código do comprovante" />
            <div className="mt-3">
              <SubmitButton pendingText="Registrando…">Banco confirmou</SubmitButton>
            </div>
          </ActionForm>
          <ActionForm action={retornoBancarioAction} className="rounded-xl border border-bad/20 bg-bad-soft/40 p-4">
            <input type="hidden" name="processoId" value={p.id} />
            <input type="hidden" name="resultado" value="RECUSADO" />
            <label className="label" htmlFor="rb-motivo">
              Motivo da recusa
            </label>
            <input id="rb-motivo" name="motivo" className="input" required placeholder="Ex.: conta do favorecido encerrada" />
            <div className="mt-3">
              <SubmitButton className="btn btn-danger" pendingText="Registrando…">
                Banco recusou
              </SubmitButton>
            </div>
          </ActionForm>
        </div>
      ) : (
        <SoConsulta>A tesouraria registra o retorno do banco.</SoConsulta>
      )}
    </Panel>
  );
}

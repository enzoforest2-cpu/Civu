import { Panel } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { MODALIDADES } from "@/lib/workflow";
import { MIN_JUSTIFICATIVA } from "@/lib/regras-fluxo";
import { definirModalidadeAction } from "./acoes";
import { SoConsulta, type PropsEtapa } from "./util";

/** Compras define se a contratação segue por licitação ou contratação direta. */
export function PainelModalidade({ p, pode }: PropsEtapa) {
  return (
    <Panel title="Modalidade da contratação">
      <p className="text-[14px] text-ink-2">A secretaria deixou a modalidade para compras definir. Ela decide o caminho do processo depois do parecer jurídico.</p>
      {pode ? (
        <ActionForm action={definirModalidadeAction} className="mt-4 space-y-3">
          <input type="hidden" name="processoId" value={p.id} />
          <div>
            <label className="label" htmlFor="modalidade">
              Modalidade
            </label>
            <select id="modalidade" name="modalidade" className="input" defaultValue="" required>
              <option value="" disabled>
                Escolha
              </option>
              {Object.entries(MODALIDADES)
                .filter(([k]) => k !== "A_DEFINIR")
                .map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="modalidade-just">
              Justificativa
            </label>
            <textarea id="modalidade-just" name="justificativa" className="input" rows={2} required placeholder="Ex.: Valor estimado acima do limite de dispensa; segue por pregão eletrônico." />
            <p className="hint">Pelo menos {MIN_JUSTIFICATIVA} caracteres.</p>
          </div>
          <SubmitButton pendingText="Salvando…">Definir modalidade</SubmitButton>
        </ActionForm>
      ) : (
        <SoConsulta />
      )}
    </Panel>
  );
}

import { Panel } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { MODALIDADES } from "@/lib/workflow";
import { MIN_JUSTIFICATIVA } from "@/lib/regras-fluxo";
import { definirModalidadeAction } from "./acoes";
import { SoConsulta, metaDe, type PropsEtapa } from "./util";

/** Compras define (ou altera, enquanto o processo está na instrução) se a contratação segue por licitação ou contratação direta. */
export function PainelModalidade({ p, pode }: PropsEtapa) {
  const atual = metaDe(p).modalidade;
  const definida = typeof atual === "string" && atual !== "A_DEFINIR" && !!MODALIDADES[atual];
  return (
    <Panel id="etapa-modalidade" title={definida ? "Alterar modalidade" : "Modalidade da contratação"}>
      {definida ? (
        <p className="text-[14px] text-ink-2">
          Modalidade atual: <strong className="font-semibold text-ink">{MODALIDADES[atual]}</strong>. Ao trocar entre licitação e contratação direta, o que foi registrado no caminho anterior (aviso de dispensa, edital, sessão) vai para o histórico e precisa ser feito de novo.
        </p>
      ) : (
        <p className="text-[14px] text-ink-2">A secretaria deixou a modalidade para compras definir. Ela decide o caminho do processo depois do parecer jurídico.</p>
      )}
      {pode ? (
        <ActionForm action={definirModalidadeAction} className="mt-4 space-y-3">
          <input type="hidden" name="processoId" value={p.id} />
          <div>
            <label className="label" htmlFor="modalidade">
              Modalidade
            </label>
            <select id="modalidade" name="modalidade" className="input" defaultValue={definida ? atual : ""} required>
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
          <SubmitButton pendingText="Salvando…">{definida ? "Alterar modalidade" : "Definir modalidade"}</SubmitButton>
        </ActionForm>
      ) : (
        <SoConsulta />
      )}
    </Panel>
  );
}

"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/action-form";
import { corrigirFonteValorAction, type FormState } from "./acoes";

/**
 * Correção de fonte de recurso e valor depois do contrato (até a fila de pagamento), com motivo.
 * Fornecedor e CNPJ não mudam aqui. Com erro, volta com o que foi digitado.
 */
export function CorrecaoContratacao({
  processoId,
  fonte,
  valor,
  fontes,
  minMotivo,
}: {
  processoId: string;
  fonte: string;
  valor: string;
  fontes: Record<string, string>;
  minMotivo: number;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(corrigirFonteValorAction, null);
  const v: Record<string, string | undefined> = state?.valores ?? {};
  return (
    <details className="mt-4 rounded-xl border border-line open:bg-sunken/50" open={!!state}>
      <summary className="px-4 py-3 text-[14px] font-semibold text-brand">Corrigir fonte ou valor</summary>
      <form key={JSON.stringify(state ?? {})} action={formAction} className="space-y-3 px-4 pb-4">
        <input type="hidden" name="processoId" value={processoId} />
        <p className="hint">Fornecedor e CNPJ não mudam. Na fila de pagamento, a posição continua pela data da liquidação; com outra fonte, o pagamento passa à fila dela.</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="corr-valor">
              Valor (R$)
            </label>
            <input id="corr-valor" name="valor" className="input tnum" inputMode="decimal" defaultValue={v.valor ?? valor} placeholder="0,00" />
          </div>
          <div>
            <label className="label" htmlFor="corr-fonte">
              Fonte
            </label>
            <select id="corr-fonte" name="fonte" className="input" defaultValue={v.fonte ?? fonte}>
              {Object.entries(fontes).map(([k, nome]) => (
                <option key={k} value={k}>
                  {nome}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="label" htmlFor="corr-motivo">
            Motivo da correção
          </label>
          <textarea id="corr-motivo" name="motivo" className="input" rows={2} required minLength={minMotivo} defaultValue={v.motivo ?? ""} placeholder={`Pelo menos ${minMotivo} caracteres. Fica registrado no histórico do processo.`} />
        </div>
        <SubmitButton pendingText="Salvando…">Salvar correção</SubmitButton>
        {state?.erro && (
          <div role="alert" className="mt-3 rounded-lg border border-red-200 bg-bad-soft px-3 py-2 text-sm text-bad">
            {state.erro}
          </div>
        )}
        {state?.ok && <div className="mt-3 rounded-lg border border-green-200 bg-ok-soft px-3 py-2 text-sm text-ok">{state.ok}</div>}
      </form>
    </details>
  );
}

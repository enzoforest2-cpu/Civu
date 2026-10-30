"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/action-form";
import { resultadoSessaoAction, type FormState } from "./acoes";

/** Formulário do resultado da sessão. Com erro (ex.: CNPJ inválido), volta com o que foi digitado. */
export function SessaoForm({ processoId, hoje }: { processoId: string; hoje: string }) {
  const [state, formAction] = useActionState<FormState, FormData>(resultadoSessaoAction, null);
  const v: Record<string, string | undefined> = state?.valores ?? {};
  return (
    <form key={JSON.stringify(state ?? {})} action={formAction} className="mt-4 space-y-3">
      <input type="hidden" name="processoId" value={processoId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="ses-situacao">
            Situação
          </label>
          <select id="ses-situacao" name="situacao" className="input" defaultValue={v.situacao ?? "VENCEDOR"}>
            <option value="VENCEDOR">Vencedor definido</option>
            <option value="DESERTA">Deserta (nenhum interessado)</option>
            <option value="FRACASSADA">Fracassada (nenhuma proposta válida)</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="ses-ata">
            Data da ata
          </label>
          <input id="ses-ata" name="ataEm" type="date" className="input" required defaultValue={v.ataEm ?? hoje} />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="ses-fornecedor">
          Fornecedor vencedor
        </label>
        <input id="ses-fornecedor" name="fornecedor" className="input" defaultValue={v.fornecedor ?? ""} placeholder="Razão social" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="ses-cnpj">
            CNPJ
          </label>
          <input id="ses-cnpj" name="cnpj" className="input tnum" defaultValue={v.cnpj ?? ""} inputMode="numeric" placeholder="00.000.000/0000-00" />
        </div>
        <div>
          <label className="label" htmlFor="ses-valor">
            Valor (R$)
          </label>
          <input id="ses-valor" name="valor" className="input tnum" defaultValue={v.valor ?? ""} inputMode="decimal" placeholder="0,00" />
        </div>
      </div>
      <p className="hint">Fornecedor, CNPJ e valor só são pedidos quando há vencedor.</p>
      <SubmitButton pendingText="Registrando…">Registrar resultado</SubmitButton>
      {state?.erro && (
        <div role="alert" className="mt-3 rounded-lg border border-red-200 bg-bad-soft px-3 py-2 text-sm text-bad">
          {state.erro}
        </div>
      )}
      {state?.ok && <div className="mt-3 rounded-lg border border-green-200 bg-ok-soft px-3 py-2 text-sm text-ok">{state.ok}</div>}
    </form>
  );
}

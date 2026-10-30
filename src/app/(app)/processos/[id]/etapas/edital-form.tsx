"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/action-form";
import { publicarEditalAction, type EditalState } from "./acoes";

type Edital = { numero: string; tipoObjeto: string; publicadoEm: string; aberturaEm: string; plataforma: string };

/** Formulário do edital. A frase da abertura mínima vem do servidor (feriados do município) a cada envio. */
export function EditalForm({ processoId, tipos, atual, aberturaInicial }: { processoId: string; tipos: { chave: string; rotulo: string }[]; atual?: Edital; aberturaInicial?: string }) {
  const [state, formAction] = useActionState<EditalState, FormData>(publicarEditalAction, null);
  const abertura = state?.abertura ?? aberturaInicial;
  // O React limpa o formulário depois do envio; remontar com o que foi enviado preserva os campos quando há erro
  const v = { ...atual, ...state?.valores };
  return (
    <form key={JSON.stringify(state ?? {})} action={formAction} className="mt-4 space-y-3">
      <input type="hidden" name="processoId" value={processoId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="ed-numero">
            Número do edital
          </label>
          <input id="ed-numero" name="numero" className="input" required defaultValue={v.numero ?? ""} placeholder="Ex.: Pregão eletrônico 12/2026" />
        </div>
        <div>
          <label className="label" htmlFor="ed-plataforma">
            Plataforma
          </label>
          <input id="ed-plataforma" name="plataforma" className="input" required defaultValue={v.plataforma ?? ""} placeholder="Ex.: Portal de Compras Públicas" />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="ed-tipo">
          Tipo de objeto
        </label>
        <select id="ed-tipo" name="tipoObjeto" className="input" required defaultValue={v.tipoObjeto ?? ""}>
          <option value="" disabled>
            Escolha
          </option>
          {tipos.map((t) => (
            <option key={t.chave} value={t.chave}>
              {t.rotulo}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="ed-publicado">
            Publicado em
          </label>
          <input id="ed-publicado" name="publicadoEm" type="date" className="input" required defaultValue={v.publicadoEm ?? ""} />
        </div>
        <div>
          <label className="label" htmlFor="ed-abertura">
            Abertura em
          </label>
          <input id="ed-abertura" name="aberturaEm" type="date" className="input" required defaultValue={v.aberturaEm ?? ""} />
          <p className="hint" aria-live="polite">
            {abertura ?? "O prazo mínimo (art. 55) é calculado ao enviar, com os feriados do município."}
          </p>
        </div>
      </div>
      <SubmitButton pendingText="Publicando…">Publicar edital</SubmitButton>
      {state?.erro && (
        <div role="alert" className="mt-3 rounded-lg border border-red-200 bg-bad-soft px-3 py-2 text-sm text-bad">
          {state.erro}
        </div>
      )}
      {state?.ok && <div className="mt-3 rounded-lg border border-green-200 bg-ok-soft px-3 py-2 text-sm text-ok">{state.ok}</div>}
    </form>
  );
}

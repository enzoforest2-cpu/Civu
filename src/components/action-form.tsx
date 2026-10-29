"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/app/actions";

/** Formulário ligado a uma server action que devolve { erro } ou { ok }. Limpa os campos após sucesso. */
export function ActionForm({
  action,
  children,
  className = "",
  resetOnOk = true,
}: {
  action: (state: ActionState, fd: FormData) => Promise<ActionState>;
  children: ReactNode;
  className?: string;
  resetOnOk?: boolean;
}) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && resetOnOk) ref.current?.reset();
  }, [state, resetOnOk]);
  return (
    <form ref={ref} action={formAction} className={className}>
      {children}
      {state?.erro && (
        <div role="alert" className="mt-3 rounded-lg border border-red-200 bg-bad-soft px-3 py-2 text-sm text-bad">
          {state.erro}
        </div>
      )}
      {state?.ok && <div className="mt-3 rounded-lg border border-green-200 bg-ok-soft px-3 py-2 text-sm text-ok">{state.ok}</div>}
    </form>
  );
}

/** Botão de envio que se desabilita enquanto a action roda. Aceita name/value para formulários com várias ações. */
export function SubmitButton({
  children,
  className = "btn btn-primary",
  pendingText = "Processando…",
  name,
  value,
}: {
  children: ReactNode;
  className?: string;
  pendingText?: string;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} name={name} value={value}>
      {pending ? pendingText : children}
    </button>
  );
}

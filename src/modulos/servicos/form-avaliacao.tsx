"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { avaliarAction } from "./acoes";

const ROTULO = ["", "Muito ruim", "Ruim", "Regular", "Bom", "Muito bom"];

export function FormAvaliacao({ ocorrenciaId }: { ocorrenciaId: string }) {
  const [nota, setNota] = useState(0);
  const [sobre, setSobre] = useState(0);
  const ativa = sobre || nota;
  return (
    <ActionForm action={avaliarAction} resetOnOk={false}>
      <input type="hidden" name="ocorrenciaId" value={ocorrenciaId} />
      <fieldset>
        <legend className="label">Como foi o atendimento?</legend>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1" onMouseLeave={() => setSobre(0)}>
            {[1, 2, 3, 4, 5].map((n) => (
              <label key={n} className="cursor-pointer rounded-lg p-1 focus-within:outline-2 focus-within:outline-brand" onMouseEnter={() => setSobre(n)}>
                <input type="radio" name="nota" value={n} className="sr-only" checked={nota === n} onChange={() => setNota(n)} required />
                <Star size={32} strokeWidth={1.8} className={n <= ativa ? "fill-warn text-warn" : "text-line-2"} aria-hidden />
                <span className="sr-only">
                  {n} de 5 — {ROTULO[n]}
                </span>
              </label>
            ))}
          </div>
          <span className="text-[14px] font-medium text-ink-2">{ativa ? ROTULO[ativa] : "Toque numa estrela"}</span>
        </div>
      </fieldset>
      <label className="label mt-4" htmlFor="comentario">
        Quer comentar? <span className="font-normal text-ink-3">(opcional)</span>
      </label>
      <textarea id="comentario" name="comentario" className="input" rows={2} maxLength={500} placeholder="O que ficou bom e o que pode melhorar" />
      <SubmitButton className="btn btn-primary mt-3" pendingText="Enviando…" disabled={!nota}>
        Enviar avaliação
      </SubmitButton>
    </ActionForm>
  );
}

"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { aditivoAction } from "./acoes";
import { TIPOS_ADITIVO, simularAcrescimo } from "./regras";

const lerValor = (s: string) => {
  const t = s.trim();
  if (!t) return 0;
  return Number((t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t).replace(/[^\d.-]/g, "")) || 0;
};

/** Registro de termo aditivo com aviso imediato do limite do art. 125 (25% em geral, 50% em reforma). */
export function FormAditivo({
  contratoId,
  natureza,
  baseLimite,
  acrescimos,
  continuo,
}: {
  contratoId: string;
  natureza: string;
  baseLimite: number;
  acrescimos: number;
  continuo: boolean;
}) {
  const [tipo, setTipo] = useState("PRAZO");
  const [valor, setValor] = useState("");
  const comValor = tipo !== "PRAZO";
  const comPrazo = tipo === "PRAZO" || tipo === "PRAZO_VALOR" || tipo === "RENOVACAO";
  const novo = tipo === "VALOR" || tipo === "PRAZO_VALOR" ? lerValor(valor) : 0;
  const sim = simularAcrescimo(baseLimite + (tipo === "RENOVACAO" ? lerValor(valor) : 0), acrescimos, novo, natureza);
  const tipos = Object.entries(TIPOS_ADITIVO).filter(([k]) => continuo || k !== "RENOVACAO");
  return (
    <ActionForm action={aditivoAction} className="space-y-3">
      <input type="hidden" name="contratoId" value={contratoId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="ad-tipo">
            Tipo
          </label>
          <select id="ad-tipo" name="tipo" className="input" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {tipos.map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="ad-data">
            Assinado em
          </label>
          <input id="ad-data" name="assinadoEm" type="date" className="input" required />
        </div>
        {comValor && (
          <div>
            <label className="label" htmlFor="ad-valor">
              {tipo === "SUPRESSAO" ? "Valor suprimido (R$)" : tipo === "RENOVACAO" ? "Valor do novo período (R$)" : "Valor acrescido (R$)"}
            </label>
            <input id="ad-valor" name="valor" className="input tnum" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} required />
          </div>
        )}
        {comPrazo && (
          <div>
            <label className="label" htmlFor="ad-vig">
              Nova data de fim da vigência
            </label>
            <input id="ad-vig" name="novaVigenciaFim" type="date" className="input" required />
          </div>
        )}
      </div>
      <div>
        <label className="label" htmlFor="ad-just">
          Justificativa
        </label>
        <textarea id="ad-just" name="justificativa" rows={3} className="input" required minLength={15} />
      </div>
      {(tipo === "VALOR" || tipo === "PRAZO_VALOR") && novo > 0 && (
        <div
          role="status"
          className={`flex items-start gap-2 rounded-lg px-3 py-2 text-[14px] ${sim.acima ? "border border-bad/30 bg-bad-soft text-bad" : "bg-sunken text-ink-2"}`}
        >
          {sim.acima && <AlertTriangle size={16} className="mt-0.5 shrink-0" />}
          <span>
            Com este aditivo, os acréscimos somam <strong className="tnum">{sim.pct.toFixed(1).replace(".", ",")}%</strong> do valor inicial atualizado. Limite do art. 125 da Lei
            14.133 para este contrato: {sim.limite}%.
            {sim.acima && " O registro fica marcado como acima do limite e aparece nos alertas."}
          </span>
        </div>
      )}
      <SubmitButton pendingText="Registrando…">Registrar aditivo</SubmitButton>
    </ActionForm>
  );
}

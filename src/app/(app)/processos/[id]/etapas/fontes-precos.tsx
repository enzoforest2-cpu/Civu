"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { fmtMoeda } from "@/lib/dates";
import { numeroBr as numero } from "@/lib/numeros";
import { mediana } from "@/lib/regras-fluxo";

type Linha = { k: number; fonte: string; data: string; valor: string };

/** Tabela editável de fontes da pesquisa de preços, com contador e mediana ao vivo. O servidor recalcula ao salvar. */
export function FontesPrecos({ inicial, justificativaInicial }: { inicial: { fonte: string; data: string; valor: number }[]; justificativaInicial: string }) {
  // Campos controlados: o React limpa o formulário depois da action, mas o que está no estado continua (inclusive quando há erro)
  const [justificativa, setJustificativa] = useState(justificativaInicial);
  const [linhas, setLinhas] = useState<Linha[]>(() =>
    inicial.length ? inicial.map((f, i) => ({ k: i, fonte: f.fonte, data: f.data, valor: String(f.valor).replace(".", ",") })) : [{ k: 0, fonte: "", data: "", valor: "" }],
  );
  const validas = linhas.filter((l) => l.fonte.trim() && numero(l.valor) > 0);
  const med = mediana(validas.map((l) => numero(l.valor)));
  const muda = (k: number, campo: "fonte" | "data" | "valor", v: string) => setLinhas((ls) => ls.map((l) => (l.k === k ? { ...l, [campo]: v } : l)));

  return (
    <div>
      <div className="hidden gap-2 px-1 pb-1 text-[12.5px] font-semibold text-ink-3 sm:grid sm:grid-cols-[minmax(0,1fr)_150px_130px_36px]">
        <span>Fonte</span>
        <span>Data</span>
        <span>Valor (R$)</span>
        <span />
      </div>
      <ul className="space-y-3 sm:space-y-2">
        {linhas.map((l, i) => (
          <li key={l.k} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_36px] gap-2 rounded-xl border border-line p-3 sm:grid-cols-[minmax(0,1fr)_150px_130px_36px] sm:rounded-none sm:border-0 sm:p-0">
            <input
              name="fonte"
              className="input col-span-3 sm:col-span-1"
              aria-label={`Fonte ${i + 1}`}
              placeholder="Ex.: Painel de Preços, cotação de fornecedor"
              value={l.fonte}
              onChange={(e) => muda(l.k, "fonte", e.target.value)}
            />
            <input name="data" type="date" className="input min-w-0" aria-label={`Data da fonte ${i + 1}`} value={l.data} onChange={(e) => muda(l.k, "data", e.target.value)} />
            <input
              name="valor"
              className="input tnum min-w-0"
              inputMode="decimal"
              aria-label={`Valor da fonte ${i + 1}`}
              placeholder="0,00"
              value={l.valor}
              onChange={(e) => muda(l.k, "valor", e.target.value)}
            />
            <button
              type="button"
              className="btn btn-quiet !px-0"
              aria-label={`Remover fonte ${i + 1}`}
              title="Remover fonte"
              onClick={() => setLinhas((ls) => (ls.length > 1 ? ls.filter((x) => x.k !== l.k) : [{ k: l.k + 1, fonte: "", data: "", valor: "" }]))}
            >
              <X size={15} />
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <button type="button" className="btn btn-quiet !px-3 !py-1.5 text-[13px]" onClick={() => setLinhas((ls) => [...ls, { k: Math.max(0, ...ls.map((x) => x.k)) + 1, fonte: "", data: "", valor: "" }])}>
          <Plus size={14} /> Adicionar fonte
        </button>
        <div className="flex flex-wrap items-center gap-3 text-[13.5px]">
          <span className={validas.length >= 3 ? "font-semibold text-ok" : "font-semibold text-warn"}>{validas.length} de 3 fontes</span>
          <span className="text-ink-2">
            Mediana: <strong className="tnum font-semibold text-ink">{med === null ? "—" : fmtMoeda(med)}</strong>
          </span>
        </div>
      </div>
      <div className="mt-4">
        <label className="label" htmlFor="pesquisa-just">
          Justificativa (se houver menos de 3 fontes)
        </label>
        <textarea
          id="pesquisa-just"
          name="justificativa"
          className="input"
          rows={2}
          value={justificativa}
          onChange={(e) => setJustificativa(e.target.value)}
          placeholder="Ex.: Só dois fornecedores atendem a região; o terceiro consultado não respondeu."
        />
      </div>
    </div>
  );
}

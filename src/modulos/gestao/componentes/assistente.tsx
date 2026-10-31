"use client";

import { useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { juntarRedacaoAction } from "../acoes";
import { MODELOS, VARIAVEIS, preencher, variaveisDo } from "../modelos";

export type ProcessoRedacao = { id: string; numero: string; assunto: string; interessado: string; setor: string };

/** Assistente de redação por modelos: escolhe o modelo e o processo, completa os campos e revisa antes de usar. */
export function Assistente({ processos, fixos, processoInicial }: { processos: ProcessoRedacao[]; fixos: Record<string, string>; processoInicial?: string }) {
  const [modelo, setModelo] = useState(MODELOS[0].chave);
  const [processoId, setProcessoId] = useState(processoInicial ?? "");
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [texto, setTexto] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  const m = MODELOS.find((x) => x.chave === modelo)!;
  const p = processos.find((x) => x.id === processoId);
  const usadas = variaveisDo(m.corpo);
  const livres = usadas.filter((k) => !VARIAVEIS.find((v) => v.chave === k)?.doProcesso || (!p && ["numero", "assunto", "interessado", "setor"].includes(k)));
  const valores = useMemo(
    () => ({ ...fixos, ...(p ? { numero: p.numero, assunto: p.assunto, interessado: p.interessado, setor: p.setor } : {}), ...campos }),
    [fixos, p, campos],
  );
  const gerado = preencher(m.corpo, valores);
  const final = texto ?? gerado.texto;

  function mudar(fn: () => void) {
    fn();
    setTexto(null);
    setCopiado(false);
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(final);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <div className="space-y-4">
        <div>
          <label className="label" htmlFor="a-modelo">
            Modelo
          </label>
          <select id="a-modelo" className="input" value={modelo} onChange={(e) => mudar(() => setModelo(e.target.value))}>
            {MODELOS.map((x) => (
              <option key={x.chave} value={x.chave}>
                {x.titulo} ({x.finalidade})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="a-proc">
            Processo
          </label>
          <select id="a-proc" className="input" value={processoId} onChange={(e) => mudar(() => setProcessoId(e.target.value))}>
            <option value="">Sem processo (preencher à mão)</option>
            {processos.map((x) => (
              <option key={x.id} value={x.id}>
                {x.numero} — {x.assunto}
              </option>
            ))}
          </select>
          <p className="hint">Número, assunto, interessado, setor, data e quem assina vêm do sistema.</p>
        </div>
        {livres.map((k) => {
          const v = VARIAVEIS.find((x) => x.chave === k);
          return (
            <div key={k}>
              <label className="label" htmlFor={`a-${k}`}>
                {v?.rotulo ?? k}
              </label>
              <input
                id={`a-${k}`}
                className="input"
                value={campos[k] ?? ""}
                placeholder={v ? `Ex.: ${v.exemplo}` : ""}
                onChange={(e) => {
                  const val = e.target.value;
                  mudar(() => setCampos((c) => ({ ...c, [k]: val })));
                }}
              />
            </div>
          );
        })}
      </div>

      <div>
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
          <label className="label !mb-0" htmlFor="a-texto">
            Texto para revisar
          </label>
          {gerado.faltando.length > 0 && texto == null && (
            <span className="text-[12.5px] text-warn">
              {gerado.faltando.length === 1 ? "1 campo a preencher" : `${gerado.faltando.length} campos a preencher`}
            </span>
          )}
        </div>
        <textarea id="a-texto" className="input min-h-[320px] font-mono !text-[14px] leading-relaxed" value={final} onChange={(e) => setTexto(e.target.value)} />
        <p className="hint">Você pode ajustar o texto livremente. Ele só é usado depois que você copiar ou juntar ao processo.</p>
        <div className="mt-3 flex flex-wrap items-start gap-2">
          <button type="button" className="btn btn-quiet" onClick={copiar}>
            {copiado ? <Check size={16} /> : <Copy size={16} />} {copiado ? "Copiado" : "Copiar texto"}
          </button>
          {p && (
            <ActionForm action={juntarRedacaoAction} resetOnOk={false}>
              <input type="hidden" name="processoId" value={p.id} />
              <input type="hidden" name="modelo" value={m.chave} />
              <input type="hidden" name="texto" value={final} />
              <SubmitButton pendingText="Juntando…">Juntar ao processo {p.numero}</SubmitButton>
            </ActionForm>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { criarRegraAction } from "../acoes";

/** Formulário de nova regra "quando X então Y"; os campos mudam conforme o gatilho e a ação. */
export function NovaRegra({ setores }: { setores: { sigla: string; nome: string }[] }) {
  const [gatilho, setGatilho] = useState("PROCESSO_PARADO");
  const [acao, setAcao] = useState("ALERTA");
  return (
    <ActionForm action={criarRegraAction} className="space-y-4">
      <div>
        <label className="label" htmlFor="r-nome">
          Nome da regra
        </label>
        <input id="r-nome" name="nome" className="input" placeholder="Ex.: Parado na Procuradoria há 7 dias" required />
      </div>

      <fieldset className="rounded-xl border border-line p-4">
        <legend className="px-1 text-[13px] font-semibold text-ink">Quando</legend>
        <select name="gatilho" className="input" value={gatilho} onChange={(e) => setGatilho(e.target.value)} aria-label="Gatilho">
          <option value="PROCESSO_PARADO">Processo ficar parado no setor</option>
          <option value="PALAVRA_CHAVE">Requerimento mencionar palavra-chave</option>
          <option value="EXIGENCIA_SEM_RESPOSTA">Exigência ficar sem resposta</option>
        </select>
        {gatilho === "PROCESSO_PARADO" && (
          <div className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-[120px_minmax(0,1fr)]">
            <div>
              <label className="label" htmlFor="r-dias">
                Dias sem movimentar
              </label>
              <input id="r-dias" name="dias" type="number" min={1} max={365} defaultValue={7} className="input tnum" />
            </div>
            <div>
              <label className="label" htmlFor="r-setor">
                Em qual setor
              </label>
              <select id="r-setor" name="setorSigla" className="input" defaultValue="">
                <option value="">Qualquer setor</option>
                {setores.map((s) => (
                  <option key={s.sigla} value={s.sigla}>
                    {s.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
        {gatilho === "PALAVRA_CHAVE" && (
          <div className="mt-3 space-y-2">
            <label className="label" htmlFor="r-palavras">
              Palavras-chave (separadas por vírgula)
            </label>
            <input id="r-palavras" name="palavras" className="input" placeholder="buraco, asfalto, pavimentação" />
            <label className="inline-flex items-center gap-2 text-[13.5px] text-ink-2">
              <input type="checkbox" name="somenteNovos" defaultChecked className="h-4 w-4 accent-[var(--color-brand)]" /> Só requerimentos ainda no protocolo
            </label>
          </div>
        )}
        {gatilho === "EXIGENCIA_SEM_RESPOSTA" && (
          <div className="mt-3">
            <label className="label" htmlFor="r-tol">
              Tolerância depois do prazo (dias)
            </label>
            <input id="r-tol" name="diasTolerancia" type="number" min={0} max={60} defaultValue={0} className="input tnum sm:max-w-[140px]" />
          </div>
        )}
      </fieldset>

      <fieldset className="rounded-xl border border-line p-4">
        <legend className="px-1 text-[13px] font-semibold text-ink">Então</legend>
        <select name="acao" className="input" value={acao} onChange={(e) => setAcao(e.target.value)} aria-label="Ação">
          <option value="ALERTA">Gerar alerta</option>
          <option value="ENCAMINHAR">Encaminhar a um setor</option>
        </select>
        {acao === "ALERTA" ? (
          <div className="mt-3">
            <label className="label" htmlFor="r-grav">
              Gravidade
            </label>
            <select id="r-grav" name="gravidade" className="input" defaultValue="MEDIA">
              <option value="ALTA">Alta</option>
              <option value="MEDIA">Média</option>
              <option value="BAIXA">Baixa</option>
            </select>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="r-dest">
                  Setor de destino
                </label>
                <select id="r-dest" name="destino" className="input" required>
                  {setores.map((s) => (
                    <option key={s.sigla} value={s.sigla}>
                      {s.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="r-nivel">
                  Nível
                </label>
                <select id="r-nivel" name="nivel" className="input" defaultValue="SUGERIR">
                  <option value="SUGERIR">Sugerir (alguém aplica)</option>
                  <option value="EXECUTAR">Executar pelo fluxo</option>
                </select>
              </div>
            </div>
            <div>
              <label className="label" htmlFor="r-desp">
                Texto do despacho (opcional)
              </label>
              <input id="r-desp" name="despacho" className="input" placeholder="Ex.: À SEINFRA para vistoria." />
            </div>
          </div>
        )}
      </fieldset>
      <SubmitButton>Criar regra</SubmitButton>
    </ActionForm>
  );
}

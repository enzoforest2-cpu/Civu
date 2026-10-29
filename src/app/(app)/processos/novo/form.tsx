"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { abrirProcessoAction } from "@/app/actions";
import type { WorkflowDef } from "@/lib/workflow";

type Tipo = { id: string; chave: string; nome: string; descricao: string | null; campos: NonNullable<WorkflowDef["camposAbertura"]>; primeiroEstado?: string };

const ROTULO_OPCAO: Record<string, string> = { BAIXA: "Baixa", MEDIA: "Média", ALTA: "Alta", SIM: "Sim", NAO: "Não", NAO_SEI: "Não sei" };

export function NovoProcessoForm({ tipos, ugs, setor }: { tipos: Tipo[]; ugs: { id: string; nome: string }[]; setor: string }) {
  const [tipoId, setTipoId] = useState(tipos[0]?.id ?? "");
  const tipo = tipos.find((t) => t.id === tipoId);
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <ActionForm action={abrirProcessoAction} className="card p-6" resetOnOk={false}>
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="label">Tipo de processo</label>
              <select name="tipoId" className="input" value={tipoId} onChange={(e) => setTipoId(e.target.value)}>
                {tipos.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome}
                  </option>
                ))}
              </select>
              {tipo?.descricao && <p className="mt-1 text-xs text-ink-3">{tipo.descricao}</p>}
            </div>
            <div>
              <label className="label">Unidade gestora</label>
              <select name="unidadeGestoraId" className="input" defaultValue={ugs[0]?.id}>
                {ugs.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Assunto</label>
            <input name="assunto" className="input" required maxLength={160} placeholder="Ex.: Aquisição de medicamentos básicos para as UBS" />
          </div>
          <div>
            <label className="label">Descrição (opcional)</label>
            <textarea name="descricao" className="input" rows={3} />
          </div>
          <div>
            <label className="label">Urgência</label>
            <select name="urgencia" className="input" defaultValue="NORMAL">
              <option value="NORMAL">Normal</option>
              <option value="PRIORITARIO">Prioritário</option>
              <option value="URGENTE">Urgente (exige justificativa do secretário)</option>
            </select>
          </div>

          {tipo && tipo.campos.length > 0 && (
            <fieldset className="rounded-lg border border-line p-4">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-ink-3">
                Dados da {tipo.chave === "COMPRA" ? "demanda (DFD)" : "abertura"}
              </legend>
              <div className="grid gap-4 md:grid-cols-2">
                {tipo.campos.map((c) => (
                  <div key={c.chave} className={c.tipo === "longo" ? "md:col-span-2" : ""}>
                    <label className="label">
                      {c.rotulo}
                      {c.obrigatorio && <span className="text-bad"> *</span>}
                    </label>
                    {c.tipo === "longo" ? (
                      <textarea name={`meta.${c.chave}`} className="input" rows={3} required={c.obrigatorio} />
                    ) : c.tipo === "opcao" ? (
                      <select name={`meta.${c.chave}`} className="input" required={c.obrigatorio} defaultValue="">
                        <option value="" disabled>
                          Selecione
                        </option>
                        {c.opcoes?.map((o) => (
                          <option key={o} value={o}>
                            {ROTULO_OPCAO[o] ?? o}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        name={`meta.${c.chave}`}
                        className="input"
                        type={c.tipo === "numero" ? "number" : c.tipo === "data" ? "date" : "text"}
                        step={c.tipo === "numero" ? "0.01" : undefined}
                        required={c.obrigatorio}
                      />
                    )}
                  </div>
                ))}
              </div>
            </fieldset>
          )}

          <div className="flex items-center justify-between">
            <p className="text-xs text-ink-3">Setor de origem: {setor}. O número é gerado no protocolo ao salvar.</p>
            <SubmitButton pendingText="Protocolando…">Protocolar</SubmitButton>
          </div>
        </div>
      </ActionForm>
      <aside className="space-y-4">
        <div className="card p-5 text-sm">
          <div className="font-semibold">O que acontece depois</div>
          <ol className="mt-2 list-decimal space-y-1 pl-4 text-ink-2">
            <li>O protocolo gera o número (ano/sequencial) e a capa.</li>
            <li>
              O processo fica na etapa <strong>{tipo?.primeiroEstado ?? "inicial"}</strong>, no seu setor.
            </li>
            <li>Junte o documento exigido (no fluxo de compra, o DFD) e assine.</li>
            <li>Avance para a próxima etapa; o setor de destino confirma o recebimento.</li>
          </ol>
        </div>
        {tipo?.chave === "COMPRA" && (
          <div className="card p-5 text-sm text-ink-2">
            <div className="font-semibold text-ink">Dica</div>
            <p className="mt-1">
              Demandas fora do Plano de Contratações Anual exigem justificativa aprovada pela autoridade (Lei 14.133, art. 12). Marque &ldquo;Não&rdquo; se não
              souber e o setor de compras verifica.
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}

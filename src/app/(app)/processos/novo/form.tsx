"use client";

import { useState } from "react";
import { FileStack, ShoppingCart } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { abrirProcessoAction } from "@/app/actions";
import type { WorkflowDef } from "@/lib/workflow";

type Tipo = { id: string; chave: string; nome: string; descricao: string | null; campos: NonNullable<WorkflowDef["camposAbertura"]>; primeiroEstado?: string };

const ROTULO_OPCAO: Record<string, string> = { BAIXA: "Baixa", MEDIA: "Média", ALTA: "Alta", SIM: "Sim", NAO: "Não", NAO_SEI: "Não sei" };

export function NovoProcessoForm({ tipos, ugs, setor }: { tipos: Tipo[]; ugs: { id: string; nome: string }[]; setor: string }) {
  const [tipoId, setTipoId] = useState(tipos[0]?.id ?? "");
  const tipo = tipos.find((t) => t.id === tipoId);
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
      <ActionForm action={abrirProcessoAction} resetOnOk={false}>
        <input type="hidden" name="tipoId" value={tipoId} />
        <div className="space-y-6">
          <Secao numero={1} titulo="Que tipo de processo é?">
            <div className="grid gap-3 sm:grid-cols-2">
              {tipos.map((t) => {
                const ativo = t.id === tipoId;
                const Icon = t.chave === "COMPRA" ? ShoppingCart : FileStack;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTipoId(t.id)}
                    aria-pressed={ativo}
                    className={`flex items-start gap-3 rounded-xl border-2 p-4 text-left transition-colors ${ativo ? "border-brand bg-brand-soft/60" : "border-line bg-white hover:border-line-2"}`}
                  >
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${ativo ? "bg-brand text-white" : "bg-sunken text-ink-2"}`}>
                      <Icon size={19} />
                    </span>
                    <span>
                      <span className="block text-[15px] font-semibold text-ink">{t.nome}</span>
                      {t.descricao && <span className="mt-0.5 block text-[13px] leading-snug text-ink-2">{t.descricao}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </Secao>

          <Secao numero={2} titulo="Sobre o pedido">
            <div className="space-y-4">
              <div>
                <label className="label" htmlFor="assunto">
                  Assunto
                </label>
                <input id="assunto" name="assunto" className="input" required maxLength={160} placeholder="Ex.: Aquisição de medicamentos básicos para as UBS" />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="label" htmlFor="ug">
                    Órgão
                  </label>
                  <select id="ug" name="unidadeGestoraId" className="input" defaultValue={ugs[0]?.id}>
                    {ugs.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.nome}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="urgencia">
                    Urgência
                  </label>
                  <select id="urgencia" name="urgencia" className="input" defaultValue="NORMAL">
                    <option value="NORMAL">Normal</option>
                    <option value="PRIORITARIO">Prioritário</option>
                    <option value="URGENTE">Urgente</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="label" htmlFor="descricao">
                  Descrição <span className="font-normal text-ink-3">(opcional)</span>
                </label>
                <textarea id="descricao" name="descricao" className="input" rows={3} />
              </div>
            </div>
          </Secao>

          {tipo && tipo.campos.length > 0 && (
            <Secao numero={3} titulo={tipo.chave === "COMPRA" ? "Formalização da demanda" : "Dados da abertura"} sub={tipo.chave === "COMPRA" ? "Estas informações formam o DFD exigido pela Lei 14.133." : undefined}>
              <div className="grid gap-4 md:grid-cols-2">
                {tipo.campos.map((c) => (
                  <div key={c.chave} className={c.tipo === "longo" || c.tipo === "texto" ? "md:col-span-2" : ""}>
                    <label className="label" htmlFor={`m-${c.chave}`}>
                      {c.rotulo}
                    </label>
                    {c.tipo === "longo" ? (
                      <textarea id={`m-${c.chave}`} name={`meta.${c.chave}`} className="input" rows={3} required={c.obrigatorio} />
                    ) : c.tipo === "opcao" ? (
                      <select id={`m-${c.chave}`} name={`meta.${c.chave}`} className="input" required={c.obrigatorio} defaultValue="">
                        <option value="" disabled>
                          Escolha
                        </option>
                        {c.opcoes?.map((o) => (
                          <option key={o} value={o}>
                            {ROTULO_OPCAO[o] ?? o}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        id={`m-${c.chave}`}
                        name={`meta.${c.chave}`}
                        className="input"
                        type={c.tipo === "numero" ? "number" : c.tipo === "data" ? "date" : "text"}
                        step={c.tipo === "numero" ? "0.01" : undefined}
                        required={c.obrigatorio}
                      />
                    )}
                    {c.chave === "noPCA" && <p className="hint">Se não souber, escolha “Não sei” — o setor de compras confere.</p>}
                  </div>
                ))}
              </div>
            </Secao>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[13.5px] text-ink-3">O processo sai do seu setor ({setor}) com número próprio.</p>
            <SubmitButton className="btn btn-primary btn-lg" pendingText="Protocolando…">
              Protocolar processo
            </SubmitButton>
          </div>
        </div>
      </ActionForm>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="rounded-2xl bg-sunken p-5 text-[14px] text-ink-2">
          <div className="text-[15px] font-semibold text-ink">Depois de protocolar</div>
          <ol className="mt-3 space-y-3">
            <li>O sistema gera o número do processo.</li>
            <li>
              O processo começa em <strong className="font-semibold text-ink">{tipo?.primeiroEstado?.replace(/^\d+[a-z]?\.\s*/i, "") ?? "na primeira etapa"}</strong>.
            </li>
            <li>{tipo?.chave === "COMPRA" ? "Junte o DFD e assine para enviar à autorização." : "O protocolo distribui ao setor responsável."}</li>
            <li>Cada setor confirma quando recebe — e todo mundo acompanha onde está.</li>
          </ol>
        </div>
      </aside>
    </div>
  );
}

function Secao({ numero, titulo, sub, children }: { numero: number; titulo: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="panel p-6">
      <div className="mb-4 flex items-start gap-3">
        <span className="display tnum flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-[14px] font-semibold text-white">{numero}</span>
        <div>
          <h2 className="text-[17px] font-semibold text-ink">{titulo}</h2>
          {sub && <p className="text-[13.5px] text-ink-2">{sub}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

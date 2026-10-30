"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { criarContratoAction } from "./acoes";
import { MODALIDADES_CONTRATO, NATUREZAS_CONTRATO, ehObra, lerPrevisto } from "./regras";

type Opcao = { id: string; rotulo: string; detalhe?: string };

const lerValor = (s: string) => {
  const t = s.trim();
  if (!t) return 0;
  return Number((t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t).replace(/[^\d.-]/g, "")) || 0;
};
const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function FormContrato({
  empresas,
  usuarios,
  setores,
  ugs,
  processos,
  fontes,
}: {
  empresas: Opcao[];
  usuarios: Opcao[];
  setores: Opcao[];
  ugs: Opcao[];
  processos: Opcao[];
  fontes: Record<string, string>;
}) {
  const [natureza, setNatureza] = useState("COMPRA");
  const [valor, setValor] = useState("");
  const [etapas, setEtapas] = useState([
    { nome: "", valor: "", previsto: "" },
    { nome: "", valor: "", previsto: "" },
    { nome: "", valor: "", previsto: "" },
  ]);
  const obra = ehObra(natureza);
  const somaEtapas = etapas.reduce((s, e) => s + lerValor(e.valor), 0);
  const global = lerValor(valor);
  const muda = (i: number, k: "nome" | "valor" | "previsto", v: string) => setEtapas((arr) => arr.map((e, j) => (j === i ? { ...e, [k]: v } : e)));

  return (
    <ActionForm action={criarContratoAction} className="space-y-6" resetOnOk={false}>
      <section className="panel space-y-4 p-6">
        <h2 className="text-[15px] font-semibold text-ink">Contrato</h2>
        <div className="grid gap-4 sm:grid-cols-[1fr_1fr_2fr]">
          <div>
            <label className="label" htmlFor="numero">
              Número
            </label>
            <input id="numero" name="numero" type="number" min={1} className="input tnum" placeholder="automático" />
          </div>
          <div>
            <label className="label" htmlFor="ano">
              Ano
            </label>
            <input id="ano" name="ano" type="number" className="input tnum" defaultValue={new Date().getFullYear()} />
          </div>
          <div>
            <label className="label" htmlFor="natureza">
              Natureza
            </label>
            <select id="natureza" name="natureza" className="input" value={natureza} onChange={(e) => setNatureza(e.target.value)}>
              {Object.entries(NATUREZAS_CONTRATO).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.nome}
                </option>
              ))}
            </select>
            <p className="hint">Limite de acréscimo (art. 125): {NATUREZAS_CONTRATO[natureza].limite}%.</p>
          </div>
        </div>
        <div>
          <label className="label" htmlFor="objeto">
            Objeto
          </label>
          <textarea id="objeto" name="objeto" rows={2} className="input" required minLength={10} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="empresaId">
              Empresa contratada
            </label>
            <select id="empresaId" name="empresaId" className="input" required defaultValue="">
              <option value="" disabled>
                Escolha
              </option>
              {empresas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.rotulo} {e.detalhe ? `(${e.detalhe})` : ""}
                </option>
              ))}
            </select>
            <p className="hint">Empresas do cadastro único. Empresa nova entra pelo cadastro de empresas.</p>
          </div>
          <div>
            <label className="label" htmlFor="modalidade">
              Modalidade
            </label>
            <select id="modalidade" name="modalidade" className="input">
              {Object.entries(MODALIDADES_CONTRATO).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="processoOrigemId">
              Processo de origem (opcional)
            </label>
            <select id="processoOrigemId" name="processoOrigemId" className="input" defaultValue="">
              <option value="">Não vincular</option>
              {processos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.rotulo} — {p.detalhe}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="setorId">
              Secretaria
            </label>
            <select id="setorId" name="setorId" className="input" defaultValue="">
              <option value="">—</option>
              {setores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.rotulo}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="panel space-y-4 p-6">
        <h2 className="text-[15px] font-semibold text-ink">Valor, vigência e responsáveis</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="valorGlobal">
              Valor global (R$)
            </label>
            <input id="valorGlobal" name="valorGlobal" className="input tnum" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} required />
          </div>
          <div>
            <label className="label" htmlFor="fonte">
              Fonte de recurso
            </label>
            <select id="fonte" name="fonte" className="input" required defaultValue="">
              <option value="" disabled>
                Escolha
              </option>
              {Object.entries(fontes).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="unidadeGestoraId">
              Unidade gestora
            </label>
            <select id="unidadeGestoraId" name="unidadeGestoraId" className="input">
              {ugs.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.rotulo}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="assinadoEm">
              Assinado em
            </label>
            <input id="assinadoEm" name="assinadoEm" type="date" className="input" required />
          </div>
          <div>
            <label className="label" htmlFor="vigenciaInicio">
              Início da vigência
            </label>
            <input id="vigenciaInicio" name="vigenciaInicio" type="date" className="input" required />
          </div>
          <div>
            <label className="label" htmlFor="vigenciaFim">
              Fim da vigência
            </label>
            <input id="vigenciaFim" name="vigenciaFim" type="date" className="input" required />
          </div>
          <div>
            <label className="label" htmlFor="fiscalId">
              Fiscal
            </label>
            <select id="fiscalId" name="fiscalId" className="input" required defaultValue="">
              <option value="" disabled>
                Escolha
              </option>
              {usuarios.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.rotulo}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="gestorId">
              Gestor
            </label>
            <select id="gestorId" name="gestorId" className="input" required defaultValue="">
              <option value="" disabled>
                Escolha
              </option>
              {usuarios.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.rotulo}
                </option>
              ))}
            </select>
            <p className="hint">Fiscal e gestor precisam ser pessoas diferentes.</p>
          </div>
        </div>
      </section>

      {obra && (
        <section className="panel space-y-4 p-6">
          <div>
            <h2 className="text-[15px] font-semibold text-ink">Obra: local e cronograma físico-financeiro</h2>
            <p className="mt-1 text-[13.5px] text-ink-2">
              Para cada etapa, informe o valor e o percentual previsto em cada mês a partir do início, separados por ponto e vírgula. Ex.: <span className="tnum">20; 30; 30; 20</span>{" "}
              (quatro meses, somando 100).
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-3">
              <label className="label" htmlFor="obraLocal">
                Local da obra
              </label>
              <input id="obraLocal" name="obraLocal" className="input" required />
            </div>
            <div>
              <label className="label" htmlFor="obraInicio">
                Início (ordem de serviço)
              </label>
              <input id="obraInicio" name="obraInicio" type="date" className="input" required />
            </div>
            <div>
              <label className="label" htmlFor="obraPrevisaoFim">
                Previsão de término
              </label>
              <input id="obraPrevisaoFim" name="obraPrevisaoFim" type="date" className="input" />
            </div>
          </div>
          <div className="space-y-3">
            {etapas.map((e, i) => {
              const prev = lerPrevisto(e.previsto);
              const soma = prev.reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0);
              return (
                <div key={i} className="grid items-start gap-2 rounded-xl bg-sunken/60 p-3 sm:grid-cols-[2fr_1fr_2fr_auto]">
                  <input name={`etapa.${i}.nome`} className="input" placeholder={`Etapa ${i + 1}`} value={e.nome} onChange={(x) => muda(i, "nome", x.target.value)} aria-label={`Nome da etapa ${i + 1}`} />
                  <input name={`etapa.${i}.valor`} className="input tnum" inputMode="decimal" placeholder="Valor" value={e.valor} onChange={(x) => muda(i, "valor", x.target.value)} aria-label={`Valor da etapa ${i + 1}`} />
                  <div>
                    <input
                      name={`etapa.${i}.previsto`}
                      className="input tnum"
                      placeholder="% por mês: 20; 30; 30; 20"
                      value={e.previsto}
                      onChange={(x) => muda(i, "previsto", x.target.value)}
                      aria-label={`Previsto por mês da etapa ${i + 1}`}
                    />
                    {e.previsto && <p className={`hint ${Math.abs(soma - 100) > 0.05 ? "!text-bad" : ""}`}>{`${prev.length} meses, soma ${soma.toLocaleString("pt-BR")}%`}</p>}
                  </div>
                  <button type="button" className="btn btn-quiet !px-3" onClick={() => setEtapas((arr) => arr.filter((_, j) => j !== i))} aria-label={`Remover etapa ${i + 1}`} disabled={etapas.length === 1}>
                    <Trash2 size={15} />
                  </button>
                </div>
              );
            })}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button type="button" className="btn btn-quiet" onClick={() => setEtapas((a) => [...a, { nome: "", valor: "", previsto: "" }])} disabled={etapas.length >= 12}>
                <Plus size={15} /> Etapa
              </button>
              <span className={`tnum text-[13.5px] ${global && Math.abs(somaEtapas - global) > 0.05 ? "font-semibold text-bad" : "text-ink-2"}`}>
                Etapas somam {moeda(somaEtapas)} {global ? `de ${moeda(global)}` : ""}
              </span>
            </div>
          </div>
        </section>
      )}

      <SubmitButton className="btn btn-primary btn-lg" pendingText="Registrando…">
        Registrar contrato
      </SubmitButton>
    </ActionForm>
  );
}

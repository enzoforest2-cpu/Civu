"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { CheckCircle2, Flame, Lock, X, XCircle } from "lucide-react";
import { decidirLoteAction } from "../acoes";
import type { ResultadoLote } from "../gabinete";

export type ItemLote = {
  id: string;
  numero: string;
  assunto: string;
  urgencia: string;
  etapa: string;
  tipoNome: string;
  prazoTexto: string;
  prazoTom: "ok" | "warn" | "bad" | "neutral";
  interessado: string | null;
  valorTexto: string | null;
  acaoRotulo: string | null;
  gera: string[];
  bloqueio: string | null;
  recebido: boolean;
};

const TOM = { ok: "bg-ok-soft text-ok", warn: "bg-warn-soft text-warn", bad: "bg-bad-soft text-bad", neutral: "bg-sunken text-ink-2" };

/** Lista do gabinete com seleção e decisão em lote (autorizar pelo fluxo ou só despachar), com confirmação por senha. */
export function DecisaoLote({ itens, podeDecidir }: { itens: ItemLote[]; podeDecidir: boolean }) {
  const [sel, setSel] = useState<string[]>([]);
  const [modo, setModo] = useState<"AVANCAR" | "DESPACHAR" | null>(null);
  const [texto, setTexto] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoLote | null>(null);
  const [pendente, iniciar] = useTransition();

  const selecionados = useMemo(() => itens.filter((i) => sel.includes(i.id)), [itens, sel]);
  const aptos = selecionados.filter((i) => i.acaoRotulo);
  const alternar = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const todos = sel.length === itens.length && itens.length > 0;

  function abrir(m: "AVANCAR" | "DESPACHAR") {
    setModo(m);
    setErro(null);
    setResultado(null);
    setSenha("");
  }

  function confirmar() {
    if (!modo) return;
    setErro(null);
    iniciar(async () => {
      const ids = modo === "AVANCAR" ? aptos.map((i) => i.id) : selecionados.map((i) => i.id);
      const r = await decidirLoteAction({ ids, modo, texto, senha });
      if (r.erro) setErro(r.erro);
      else {
        setResultado(r.resultados ?? []);
        setModo(null);
        setSel([]);
        setTexto("");
        setSenha("");
      }
    });
  }

  return (
    <div>
      {podeDecidir && itens.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-sunken px-3 py-2.5">
          <label className="mr-auto inline-flex cursor-pointer items-center gap-2 text-[14px] text-ink-2">
            <input type="checkbox" className="h-4 w-4 accent-[var(--color-brand)]" checked={todos} onChange={() => setSel(todos ? [] : itens.map((i) => i.id))} />
            {sel.length ? `${sel.length} ${sel.length === 1 ? "selecionado" : "selecionados"}` : "Selecionar todos"}
          </label>
          <button type="button" className="btn btn-primary !py-2" disabled={aptos.length === 0} onClick={() => abrir("AVANCAR")}>
            Autorizar {aptos.length > 0 && `(${aptos.length})`}
          </button>
          <button type="button" className="btn btn-quiet !py-2" disabled={sel.length === 0} onClick={() => abrir("DESPACHAR")}>
            Só despachar
          </button>
        </div>
      )}

      {resultado && (
        <div className="mb-4 rounded-xl border border-line bg-white p-4" role="status">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[14.5px] font-semibold text-ink">Resultado da decisão</h3>
            <button type="button" className="rounded-lg p-1 text-ink-3 hover:bg-sunken" onClick={() => setResultado(null)} aria-label="Fechar resultado">
              <X size={16} />
            </button>
          </div>
          <ul className="space-y-1.5">
            {resultado.map((r) => (
              <li key={r.processoId} className="flex items-start gap-2 text-[13.5px]">
                {r.ok ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-ok" /> : <XCircle size={16} className="mt-0.5 shrink-0 text-bad" />}
                <span>
                  <Link href={`/processos/${r.processoId}`} className="tnum font-semibold text-brand hover:underline">
                    {r.numero}
                  </Link>{" "}
                  <span className={r.ok ? "text-ink-2" : "text-bad"}>{r.mensagem}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[12.5px] text-ink-3">Cada passo foi registrado na trilha do processo; o lote ficou na auditoria administrativa.</p>
        </div>
      )}

      {itens.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line-2 px-6 py-10 text-center text-sm text-ink-3">
          Nenhum processo parado no gabinete. Quando um processo chegar para autorização ou despacho, ele aparece aqui.
        </div>
      )}
      <ul className="divide-y divide-line">
        {itens.map((i) => (
          <li key={i.id} className="flex items-start gap-3 py-3.5">
            {podeDecidir && (
              <input
                type="checkbox"
                className="mt-1.5 h-4 w-4 shrink-0 accent-[var(--color-brand)]"
                checked={sel.includes(i.id)}
                onChange={() => alternar(i.id)}
                aria-label={`Selecionar ${i.numero}`}
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/processos/${i.id}`} className="tnum font-semibold text-brand hover:underline">
                  {i.numero}
                </Link>
                {i.urgencia === "URGENTE" && (
                  <span className="chip bg-bad-soft text-bad">
                    <Flame size={12} strokeWidth={2.5} /> Urgente
                  </span>
                )}
                {i.urgencia === "PRIORITARIO" && <span className="chip bg-warn-soft text-warn">Prioritário</span>}
                <span className={`chip ${TOM[i.prazoTom]}`}>{i.prazoTexto}</span>
                {!i.recebido && <span className="chip bg-sunken text-ink-2">Não recebido</span>}
              </div>
              <div className="mt-0.5 text-[14.5px] text-ink">{i.assunto}</div>
              <div className="text-[13px] text-ink-3">
                {i.tipoNome} · {i.etapa}
                {i.interessado && <> · {i.interessado}</>}
                {i.valorTexto && <> · estimado em {i.valorTexto}</>}
              </div>
              <div className="mt-1 text-[12.5px]">
                {i.acaoRotulo ? (
                  <span className="text-ok">
                    Pronto para: {i.acaoRotulo.toLowerCase()}
                    {i.gera.length > 0 && <span className="text-ink-3"> · gera e assina: {i.gera.join(", ")}</span>}
                  </span>
                ) : (
                  <span className="text-warn">{i.bloqueio}</span>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>

      {modo && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="titulo-lote">
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl sm:p-6">
            <div className="mb-3 flex items-start justify-between gap-3">
              <h2 id="titulo-lote" className="display text-[20px] font-semibold text-ink">
                {modo === "AVANCAR" ? `Autorizar ${aptos.length === 1 ? "1 processo" : `${aptos.length} processos`}` : `Despachar ${selecionados.length === 1 ? "1 processo" : `${selecionados.length} processos`}`}
              </h2>
              <button type="button" className="rounded-lg p-1 text-ink-3 hover:bg-sunken" onClick={() => setModo(null)} aria-label="Cancelar">
                <X size={18} />
              </button>
            </div>
            <ul className="mb-4 max-h-40 space-y-1 overflow-y-auto rounded-lg bg-sunken p-3 text-[13px]">
              {(modo === "AVANCAR" ? aptos : selecionados).map((i) => (
                <li key={i.id}>
                  <span className="tnum font-semibold text-ink">{i.numero}</span> <span className="text-ink-2">{i.assunto}</span>
                  {modo === "AVANCAR" && <span className="text-ink-3"> → {i.acaoRotulo}</span>}
                </li>
              ))}
            </ul>
            {modo === "AVANCAR" && selecionados.length > aptos.length && (
              <p className="mb-3 text-[13px] text-warn">
                {selecionados.length - aptos.length} selecionado(s) com pendência ficarão de fora. Use &quot;Só despachar&quot; para registrar uma orientação neles.
              </p>
            )}
            <label className="label" htmlFor="lote-texto">
              {modo === "AVANCAR" ? "Despacho (opcional, entra no documento e na trilha)" : "Despacho"}
            </label>
            <textarea
              id="lote-texto"
              className="input min-h-[96px]"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder={modo === "AVANCAR" ? "Ex.: Autorizo, observado o limite da dotação." : "Ex.: À Secretaria de Administração para manifestação em 5 dias úteis."}
            />
            <label className="label mt-3" htmlFor="lote-senha">
              Confirme com sua senha
            </label>
            <div className="relative">
              <Lock size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
              <input id="lote-senha" type="password" className="input !pl-9" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="current-password" />
            </div>
            <p className="hint">
              {modo === "AVANCAR"
                ? "Os documentos exigidos pela etapa serão juntados e assinados em seu nome como ordenador(a), e cada processo avançará pelo fluxo."
                : "O despacho será registrado em cada processo, sem mudar a etapa."}
            </p>
            {erro && (
              <div role="alert" className="mt-3 rounded-lg border border-red-200 bg-bad-soft px-3 py-2 text-sm text-bad">
                {erro}
              </div>
            )}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" className="btn btn-quiet" onClick={() => setModo(null)}>
                Cancelar
              </button>
              <button type="button" className="btn btn-primary" disabled={pendente || !senha || (modo === "DESPACHAR" && texto.trim().length < 5)} onClick={confirmar}>
                {pendente ? "Registrando…" : modo === "AVANCAR" ? "Confirmar autorização" : "Confirmar despacho"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

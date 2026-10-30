/* eslint-disable react-hooks/purity -- prazos dependem da hora atual; renderizado no servidor a cada requisição */
import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Clock, Star } from "lucide-react";
import { Chip } from "@/components/ui";
import { fmtData, fmtDataHora, relativo } from "@/lib/dates";
import { EM_ABERTO, STATUS_CIDADAO, STATUS_GESTAO, STATUS_ORDEM, type StatusOcorrencia, type StatusOrdem } from "./constantes";

export function StatusChip({ status, publico = false }: { status: string; publico?: boolean }) {
  const m = (publico ? STATUS_CIDADAO : STATUS_GESTAO)[status as StatusOcorrencia];
  return <Chip tone={m?.tone ?? "neutral"}>{m?.rotulo ?? status}</Chip>;
}

export function StatusOrdemChip({ status }: { status: string }) {
  const m = STATUS_ORDEM[status as StatusOrdem];
  return <Chip tone={m?.tone ?? "neutral"}>{m?.rotulo ?? status}</Chip>;
}

/** Situação do prazo-alvo (SLA) de uma ocorrência. */
export function SlaChip({ o }: { o: { status: string; prazoEm: Date; concluidaEm: Date | null } }) {
  if (o.status === "CONCLUIDA" && o.concluidaEm) {
    const ok = o.concluidaEm <= o.prazoEm;
    return (
      <Chip tone={ok ? "ok" : "warn"}>
        <CheckCircle2 size={12} strokeWidth={2.5} />
        {ok ? "Dentro do prazo" : "Concluída com atraso"}
      </Chip>
    );
  }
  if (!EM_ABERTO.includes(o.status as StatusOcorrencia)) return null;
  const ms = o.prazoEm.getTime() - Date.now();
  if (ms < 0)
    return (
      <Chip tone="bad">
        <AlertTriangle size={12} strokeWidth={2.5} />
        Atrasada {relativo(o.prazoEm)}
      </Chip>
    );
  if (ms < 2 * 86400_000)
    return (
      <Chip tone="warn">
        <Clock size={12} strokeWidth={2.5} />
        Vence {relativo(o.prazoEm)}
      </Chip>
    );
  return (
    <Chip tone="neutral">
      <Clock size={12} strokeWidth={2.5} />
      Prazo {fmtData(o.prazoEm)}
    </Chip>
  );
}

type Ev = { id: string; tipo: string; texto: string; publico: boolean; autorNome: string; dados: unknown; criadoEm: Date };

const MARCA: Record<string, string> = {
  REGISTRO: "bg-ink-3",
  ACEITE: "bg-brand",
  PROGRAMACAO: "bg-brand",
  ORDEM: "bg-brand",
  INICIO: "bg-warn",
  CONCLUSAO: "bg-ok",
  AVALIACAO: "bg-ok",
  RECUSA: "bg-bad",
  DUPLICIDADE: "bg-ink-3",
  ENCAMINHAMENTO: "bg-ink-3",
  NOTA: "bg-line-2",
};

/**
 * Linha do tempo da ocorrência. Na gestão mostra quem fez cada passo e marca o que é interno;
 * no portal mostra a secretaria (não o nome do servidor) e só os eventos públicos.
 */
export function LinhaDoTempo({ eventos, modo }: { eventos: Ev[]; modo: "gestao" | "cidadao" }) {
  const lista = [...eventos].reverse();
  return (
    <ol className="relative space-y-5 before:absolute before:top-2 before:bottom-2 before:left-[5px] before:w-px before:bg-line">
      {lista.map((e) => {
        const setor = (e.dados as { setor?: string } | null)?.setor;
        const quem =
          modo === "gestao"
            ? `${e.autorNome}${setor ? ` · ${setor}` : ""}`
            : e.tipo === "REGISTRO" || e.tipo === "AVALIACAO"
              ? e.autorNome
              : (setor ?? "Prefeitura");
        return (
          <li key={e.id} className="relative pl-6">
            <span aria-hidden className={`absolute top-[7px] left-0 h-[11px] w-[11px] rounded-full ring-4 ring-white ${MARCA[e.tipo] ?? "bg-ink-3"}`} />
            <div className="flex flex-wrap items-center gap-x-2 text-[12.5px] text-ink-3">
              <span className="tnum">{fmtDataHora(e.criadoEm)}</span>
              <span aria-hidden>·</span>
              <span>{quem}</span>
              {modo === "gestao" && !e.publico && <Chip>Interno</Chip>}
            </div>
            <p className="mt-0.5 text-[14.5px] leading-snug text-ink">{e.texto}</p>
          </li>
        );
      })}
    </ol>
  );
}

export function Estrelas({ nota, tamanho = 15 }: { nota: number; tamanho?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`Nota ${nota.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} de 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={tamanho} strokeWidth={2} className={n <= Math.round(nota) ? "fill-warn text-warn" : "text-line-2"} aria-hidden />
      ))}
    </span>
  );
}

/** Barra horizontal simples para tabelas de indicadores. */
export function Barra({ valor, max, tone = "brand", rotulo }: { valor: number; max: number; tone?: "brand" | "bad" | "ok" | "warn"; rotulo?: ReactNode }) {
  const pct = max > 0 ? Math.max(2, Math.round((valor / max) * 100)) : 0;
  const cor = { brand: "bg-brand", bad: "bg-bad", ok: "bg-ok", warn: "bg-warn" }[tone];
  return (
    <div className="flex items-center gap-2">
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-sunken">
        <div className={`h-full rounded-full ${cor}`} style={{ width: `${valor > 0 ? pct : 0}%` }} />
      </div>
      {rotulo !== undefined && <span className="tnum w-12 shrink-0 text-right text-[13px] text-ink-2">{rotulo}</span>}
    </div>
  );
}

export function Aba({ href, ativa, rotulo, n, tone }: { href: string; ativa: boolean; rotulo: string; n?: number; tone?: "bad" }) {
  return (
    <Link
      href={href}
      aria-current={ativa ? "page" : undefined}
      className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13.5px] font-medium transition-colors ${
        ativa ? "border-ink bg-ink text-white" : "border-line bg-white text-ink-2 hover:border-line-2 hover:text-ink"
      }`}
    >
      {rotulo}
      {n !== undefined && (
        <span className={`tnum rounded-full px-1.5 text-[12px] ${ativa ? "bg-white/20" : tone === "bad" && n > 0 ? "bg-bad-soft text-bad" : "bg-sunken"}`}>
          {n}
        </span>
      )}
    </Link>
  );
}

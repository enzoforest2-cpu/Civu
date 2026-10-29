/* eslint-disable react-hooks/purity -- prazos dependem da hora atual; renderizado no servidor a cada requisição */
import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Clock, Flame, Inbox } from "lucide-react";
import { fmtData, relativo } from "@/lib/dates";

export function Panel({
  children,
  className = "",
  title,
  action,
  pad = true,
}: {
  children: ReactNode;
  className?: string;
  title?: ReactNode;
  action?: ReactNode;
  pad?: boolean;
}) {
  return (
    <section className={`panel ${className}`}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 px-6 pt-5 pb-1">
          <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
          {action}
        </header>
      )}
      <div className={pad ? "px-6 pt-3 pb-6" : ""}>{children}</div>
    </section>
  );
}

const TONES = {
  neutral: "bg-sunken text-ink-2",
  brand: "bg-brand-soft text-brand-ink",
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
} as const;
export type Tone = keyof typeof TONES;

export function Chip({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  return <span className={`chip ${TONES[tone]}`}>{children}</span>;
}

export function UrgenciaChip({ u }: { u: string }) {
  if (u === "URGENTE")
    return (
      <Chip tone="bad">
        <Flame size={12} strokeWidth={2.5} /> Urgente
      </Chip>
    );
  if (u === "PRIORITARIO") return <Chip tone="warn">Prioritário</Chip>;
  return null;
}

/** Situação do prazo da etapa, em linguagem simples. */
export function situacaoPrazo(prazo: Date | null, encerrado?: Date | null): { tone: Tone; texto: string } {
  if (encerrado) return { tone: "ok", texto: "Concluído" };
  if (!prazo) return { tone: "neutral", texto: "Sem prazo" };
  const ms = prazo.getTime() - Date.now();
  if (ms < 0) return { tone: "bad", texto: `Atrasado ${relativo(prazo).replace("há ", "há ")}` };
  if (ms < 2 * 86400_000) return { tone: "warn", texto: `Vence ${relativo(prazo)}` };
  return { tone: "ok", texto: `Prazo ${fmtData(prazo)}` };
}

export function Prazo({ prazo, encerrado }: { prazo: Date | null; encerrado?: Date | null }) {
  const s = situacaoPrazo(prazo, encerrado);
  const Icon = s.tone === "bad" ? AlertTriangle : s.tone === "ok" && encerrado ? CheckCircle2 : Clock;
  return (
    <Chip tone={s.tone}>
      <Icon size={12} strokeWidth={2.5} />
      {s.texto}
    </Chip>
  );
}

export function Vazio({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line-2 px-6 py-10 text-center text-sm text-ink-3">
      {icon ?? <Inbox size={22} className="text-ink-3" />}
      <div>{children}</div>
    </div>
  );
}

export function Cabecalho({ titulo, sub, acao }: { titulo: string; sub?: ReactNode; acao?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-3xl">
        <h1 className="display text-[28px] leading-[1.1] font-semibold text-ink sm:text-[34px]">{titulo}</h1>
        {sub && <p className="mt-2 text-[15px] text-ink-2">{sub}</p>}
      </div>
      {acao}
    </div>
  );
}

export function NumeroProcesso({ id, numero, className = "" }: { id: string; numero: string; className?: string }) {
  return (
    <Link href={`/processos/${id}`} className={`tnum font-semibold text-brand hover:text-brand-2 hover:underline ${className}`}>
      {numero}
    </Link>
  );
}

/** Iniciais para o avatar de pessoa. */
export function Avatar({ nome, size = 32 }: { nome: string; size?: number }) {
  const ini = nome
    .replace(/^(Dr|Dra)\.?\s+/i, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-brand-soft font-semibold text-brand-ink"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      aria-hidden
    >
      {ini}
    </span>
  );
}

/* eslint-disable react-hooks/purity -- prazos dependem da hora atual; renderizado no servidor a cada requisição */
import Link from "next/link";
import type { ReactNode } from "react";
import { fmtData, relativo } from "@/lib/dates";

export function Card({ children, className = "", title, action }: { children: ReactNode; className?: string; title?: ReactNode; action?: ReactNode }) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          {action}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint, tone = "neutral" }: { label: string; value: ReactNode; hint?: string; tone?: "neutral" | "bad" | "warn" | "ok" }) {
  const color = tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : tone === "ok" ? "text-ok" : "text-ink";
  return (
    <div className="card px-5 py-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-ink-3">{label}</div>
      <div className={`mt-1 text-3xl font-semibold tabular-nums ${color}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-ink-2">{hint}</div>}
    </div>
  );
}

const TONES: Record<string, string> = {
  neutral: "bg-slate-100 text-slate-700",
  brand: "bg-brand-soft text-brand-ink",
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  info: "bg-info-soft text-info",
};
export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: keyof typeof TONES }) {
  return <span className={`badge ${TONES[tone]}`}>{children}</span>;
}

export function UrgenciaBadge({ u }: { u: string }) {
  if (u === "URGENTE") return <Badge tone="bad">Urgente</Badge>;
  if (u === "PRIORITARIO") return <Badge tone="warn">Prioritário</Badge>;
  return null;
}

export function Prazo({ prazo, encerrado }: { prazo: Date | null; encerrado?: Date | null }) {
  if (encerrado) return <Badge tone="ok">Encerrado</Badge>;
  if (!prazo) return <span className="text-ink-3">—</span>;
  const atrasado = prazo.getTime() < Date.now();
  const dias = Math.ceil((prazo.getTime() - Date.now()) / 86400_000);
  if (atrasado) return <Badge tone="bad">Atrasado {relativo(prazo)}</Badge>;
  if (dias <= 1) return <Badge tone="warn">Vence {relativo(prazo)}</Badge>;
  return (
    <span className="text-ink-2">
      {fmtData(prazo)} <span className="text-ink-3">({relativo(prazo)})</span>
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-line-2 px-4 py-8 text-center text-sm text-ink-3">{children}</div>;
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-2">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function NumeroProcesso({ id, numero }: { id: string; numero: string }) {
  return (
    <Link href={`/processos/${id}`} className="font-mono text-[13px] font-semibold text-brand hover:underline">
      {numero}
    </Link>
  );
}

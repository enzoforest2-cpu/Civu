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
        <header className="flex min-h-[52px] items-center justify-between gap-3 px-5 pt-4 pb-1">
          <h2 className="titulo-secao text-ink">{title}</h2>
          {action && <div className="shrink-0 text-[13.5px]">{action}</div>}
        </header>
      )}
      <div className={pad ? "px-5 pt-2 pb-5" : ""}>{children}</div>
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

/** Estado vazio: mantém o lugar do bloco e diz em uma frase o que acontece ou o que fazer. */
export function Vazio({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-dashed border-line-2 px-4 py-3.5 text-[14px] text-ink-2">
      <span className="shrink-0 text-ink-3">{icon ?? <Inbox size={17} />}</span>
      <div>{children}</div>
    </div>
  );
}

/**
 * Título da tela: um substantivo (h1 de 24-26px), uma linha cinza com o achado ou o escopo,
 * e à direita só ações reais. `volta` mostra o caminho de onde a tela vem.
 */
export function Cabecalho({ titulo, sub, acao, volta }: { titulo: ReactNode; sub?: ReactNode; acao?: ReactNode; volta?: { href: string; rotulo: string } }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0 max-w-3xl">
        {volta && (
          <Link href={volta.href} className="mb-2 inline-block text-[13.5px] text-ink-3 hover:text-ink">
            {volta.rotulo}
          </Link>
        )}
        <h1 className="titulo-pagina text-ink">{titulo}</h1>
        {sub && <p className="mt-1.5 text-[15px] leading-relaxed text-ink-2">{sub}</p>}
      </div>
      {acao && <div className="flex shrink-0 flex-wrap items-center gap-2">{acao}</div>}
    </div>
  );
}

/** Números de cabeçalho num só container dividido por fios. O primeiro pode liderar (`lider`). */
export function Quadro({ itens, lider = false }: { itens: { rotulo: ReactNode; valor: ReactNode; nota?: ReactNode; tom?: "bad" | "ok" | "warn" }[]; lider?: boolean }) {
  return (
    <div className="quadro" style={{ gridTemplateColumns: `repeat(${itens.length}, minmax(0, 1fr))` }}>
      {itens.map((i, n) => (
        <div key={n}>
          <div className="quadro-rotulo">{i.rotulo}</div>
          <div
            className={`quadro-valor ${i.tom === "bad" ? "text-bad" : i.tom === "warn" ? "text-warn" : "text-ink"}`}
            style={lider && n === 0 ? { fontSize: "1.95rem", fontWeight: 600 } : undefined}
          >
            {i.valor}
          </div>
          {i.nota && <div className="quadro-nota">{i.nota}</div>}
        </div>
      ))}
    </div>
  );
}

export function NumeroProcesso({ id, numero, className = "" }: { id: string; numero: string; className?: string }) {
  return (
    <Link href={`/processos/${id}`} className={`tnum font-medium text-brand-ink hover:text-brand hover:underline ${className}`}>
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

import type { ReactNode } from "react";
import type { ProcessoCompleto } from "@/lib/engine";

/** Props comuns dos painéis das etapas. */
/** `abrir`: id do <details> que a página pediu aberto (?abrir=), para as pendências funcionarem sem JavaScript. */
export type PropsEtapa = { p: ProcessoCompleto; pode: boolean; feriados: Set<string>; abrir?: string };

/** AAAA-MM-DD para dd/mm/aaaa sem passar por fuso. Aceita também data-hora ISO. */
export function dataBr(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return d && m && a ? `${d}/${m}/${a}` : iso;
}

export function metaDe(p: ProcessoCompleto): Record<string, unknown> {
  return (p.metadados ?? {}) as Record<string, unknown>;
}

/** Lista do metadado como array, tolerando ausência ou formato inesperado. */
export function listaDe<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

/** Aviso para quem só consulta a etapa. */
export function SoConsulta({ children }: { children?: ReactNode }) {
  return <p className="mt-3 text-[14px] text-ink-3">{children ?? "Só quem conduz esta etapa registra estes dados. Você pode consultar."}</p>;
}

/** Linha de dado: rótulo pequeno e valor. */
export function Dado({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[12.5px] text-ink-3">{rotulo}</dt>
      <dd className="text-[14.5px] text-ink">{children}</dd>
    </div>
  );
}

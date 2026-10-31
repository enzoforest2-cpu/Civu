"use client";

import type { MouseEvent, ReactNode } from "react";

const CAMPO = "input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled])";

/**
 * Leva ao formulário que resolve uma pendência: abre o <details> (o próprio alvo e os que o contêm),
 * rola até ele e põe o foco no primeiro campo. Sem JavaScript, o `href` faz o mesmo papel pela âncora.
 * `valores` pré-preenche selects pelo nome (ex.: tipo de documento a juntar, papel da assinatura).
 */
export function IrPara({
  alvo,
  href,
  foco,
  valores,
  className,
  children,
}: {
  alvo: string;
  href?: string;
  foco?: string;
  valores?: Record<string, string>;
  className?: string;
  children: ReactNode;
}) {
  function ir(e: MouseEvent<HTMLAnchorElement>) {
    const el = document.getElementById(alvo);
    if (!el) return; // deixa a âncora agir
    e.preventDefault();
    for (let d: HTMLElement | null = el; d; d = d.parentElement) if (d instanceof HTMLDetailsElement) d.open = true;
    for (const [nome, v] of Object.entries(valores ?? {})) {
      const s = el.querySelector<HTMLSelectElement>(`select[name="${nome}"]`);
      if (s && [...s.options].some((o) => o.value === v)) {
        s.value = v;
        s.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
    const campo = (foco && el.querySelector<HTMLElement>(foco)) || el.querySelector<HTMLElement>(CAMPO);
    const destino = campo ?? el.querySelector<HTMLElement>("summary") ?? el;
    if (destino === el && !el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
    el.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    destino.focus({ preventScroll: true });
    history.replaceState(null, "", `#${alvo}`);
  }
  return (
    <a href={href ?? `#${alvo}`} onClick={ir} className={className}>
      {children}
    </a>
  );
}

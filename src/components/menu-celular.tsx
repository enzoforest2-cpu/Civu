"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { Menu, X } from "lucide-react";
import type { GrupoNav } from "@/components/navegacao";

const ID = "menu-celular";

function ativo(path: string, href: string) {
  if (href === "/processos") return path === "/processos" || /^\/processos\/(?!novo)/.test(path);
  return path === href || path.startsWith(href + "/");
}

/**
 * Botão que abre o menu da gestão no celular. Usa `popovertarget` (HTML): abre e fecha mesmo sem JavaScript,
 * e o navegador informa aos leitores de tela se o menu está aberto.
 */
export function BotaoMenuCelular() {
  return (
    <button
      type="button"
      popoverTarget={ID}
      aria-controls={ID}
      aria-haspopup="dialog"
      className="flex h-[44px] items-center gap-2 rounded-lg px-3 text-[15px] font-semibold text-ink hover:bg-sunken"
    >
      <Menu size={20} aria-hidden /> Menu
    </button>
  );
}

/**
 * Gaveta do menu da gestão no celular: um `popover` declarativo, fora da barra que some no computador.
 * Sem JavaScript: abre pelo botão, fecha pelo X, pelo Esc ou tocando fora, e os links navegam.
 * Com JavaScript: o foco fica preso na gaveta e volta ao botão ao fechar; a gaveta fecha ao navegar e ao passar
 * para a largura do menu lateral (1024 px), para que nada fique aberto e invisível. O fundo não rola com a gaveta
 * aberta (regra em globals.css, também sem JavaScript).
 */
export function GavetaMenuCelular({ grupos, topo, rodape }: { grupos: GrupoNav[]; topo?: ReactNode; rodape?: ReactNode }) {
  const path = usePathname();
  const ref = useRef<HTMLDivElement>(null);
  const aberta = () => !!ref.current?.matches(":popover-open");
  const fechar = () => {
    if (aberta()) ref.current?.hidePopover();
  };

  // Fecha quando a página muda (clique num item)
  useEffect(() => {
    if (ref.current?.matches(":popover-open")) ref.current.hidePopover();
  }, [path]);

  // Fecha ao girar a tela ou alargar a janela até o menu lateral aparecer
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const ver = () => {
      if (mq.matches && ref.current?.matches(":popover-open")) ref.current.hidePopover();
    };
    mq.addEventListener("change", ver);
    return () => mq.removeEventListener("change", ver);
  }, []);

  const focaveis = () => [...(ref.current?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])") ?? [])];

  return (
    <div
      id={ID}
      ref={ref}
      popover="auto"
      role="dialog"
      aria-label="Menu da gestão"
      onToggle={(e) => {
        const novo = (e.nativeEvent as ToggleEvent).newState;
        if (novo === "open") {
          // primeiro item do menu (o link da página atual, se houver)
          const atual = ref.current?.querySelector<HTMLElement>('nav a[aria-current="page"]');
          (atual ?? focaveis()[0])?.focus();
        } else if (ref.current?.contains(document.activeElement) || document.activeElement === document.body) {
          document.querySelector<HTMLElement>(`[popovertarget="${ID}"]`)?.focus();
        }
      }}
      onKeyDown={(e) => {
        // Foco preso: Tab e Shift+Tab giram dentro da gaveta
        if (e.key !== "Tab") return;
        const lista = focaveis();
        const primeiro = lista[0];
        const ultimo = lista[lista.length - 1];
        if (e.shiftKey && document.activeElement === primeiro) {
          e.preventDefault();
          ultimo?.focus();
        } else if (!e.shiftKey && document.activeElement === ultimo) {
          e.preventDefault();
          primeiro?.focus();
        }
      }}
      className="fixed inset-y-0 right-auto left-0 m-0 h-dvh max-h-none w-[min(320px,88vw)] max-w-none overflow-hidden border-0 bg-surface p-0 text-ink shadow-xl backdrop:bg-ink/40 lg:hidden"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2">
          {topo}
          <button
            type="button"
            popoverTarget={ID}
            popoverTargetAction="hide"
            className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-lg text-ink-2 hover:bg-sunken hover:text-ink"
            aria-label="Fechar menu"
          >
            <X size={20} aria-hidden />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto overscroll-contain px-3 py-3" aria-label="Itens do menu">
          {grupos.map((g) => (
            <div key={g.chave} className="mb-3">
              <div className="px-3 pt-1 pb-1 text-[13px] font-semibold text-ink-2">{g.rotulo}</div>
              <ul>
                {g.itens.map((i) => {
                  const a = ativo(path, i.href) && !grupos.some((x) => x.itens.some((o) => o.href.startsWith(i.href + "/") && ativo(path, o.href)));
                  return (
                    <li key={i.href}>
                      <Link
                        href={i.href}
                        onClick={fechar}
                        aria-current={a ? "page" : undefined}
                        className={`flex min-h-[44px] items-center gap-3 rounded-lg px-3 py-2 text-[15px] ${
                          a ? "bg-brand-soft font-semibold text-brand-ink [&_svg]:text-brand-2" : "text-ink-2 hover:bg-sunken hover:text-ink [&_svg]:text-ink-3"
                        }`}
                      >
                        {i.icone}
                        {i.rotulo}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        {rodape && <div className="border-t border-line p-4">{rodape}</div>}
      </div>
    </div>
  );
}

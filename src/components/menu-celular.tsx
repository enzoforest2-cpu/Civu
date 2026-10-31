"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Menu, X } from "lucide-react";
import type { GrupoNav } from "@/components/navegacao";

function ativo(path: string, href: string) {
  if (href === "/processos") return path === "/processos" || /^\/processos\/(?!novo)/.test(path);
  return path === href || path.startsWith(href + "/");
}

/**
 * Menu da gestão no celular: botão que abre uma gaveta com todos os itens.
 * Usa <dialog> modal: o resto da página fica inerte (foco preso na gaveta) e Esc fecha.
 */
export function MenuCelular({ grupos, topo, rodape }: { grupos: GrupoNav[]; topo?: ReactNode; rodape?: ReactNode }) {
  const path = usePathname();
  const ref = useRef<HTMLDialogElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const [aberto, setAberto] = useState(false);

  // Fecha a gaveta quando a página muda (clique num item)
  useEffect(() => {
    const d = ref.current;
    if (d?.open) d.close();
  }, [path]);

  function abrir() {
    ref.current?.showModal();
    setAberto(true);
  }
  function fechar() {
    ref.current?.close();
  }

  return (
    <>
      <button
        ref={botao}
        type="button"
        onClick={abrir}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        aria-controls="menu-celular"
        className="flex h-[44px] items-center gap-2 rounded-lg px-3 text-[15px] font-semibold text-ink hover:bg-sunken"
      >
        <Menu size={20} aria-hidden /> Menu
      </button>
      <dialog
        id="menu-celular"
        ref={ref}
        aria-label="Menu da gestão"
        onClose={() => {
          setAberto(false);
          botao.current?.focus();
        }}
        onKeyDown={(e) => {
          // O <dialog> modal deixa o Tab escapar para a barra do navegador; aqui o foco gira dentro da gaveta
          if (e.key !== "Tab" || !ref.current) return;
          const focaveis = [...ref.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")];
          const primeiro = focaveis[0];
          const ultimo = focaveis[focaveis.length - 1];
          if (e.shiftKey && document.activeElement === primeiro) {
            e.preventDefault();
            ultimo?.focus();
          } else if (!e.shiftKey && document.activeElement === ultimo) {
            e.preventDefault();
            primeiro?.focus();
          }
        }}
        onClick={(e) => {
          // clique no fundo escurecido (fora da gaveta) fecha
          if (e.target === ref.current) fechar();
        }}
        className="menu-gaveta m-0 h-dvh max-h-none w-[min(320px,88vw)] max-w-none bg-surface p-0 text-ink shadow-xl backdrop:bg-ink/40"
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2">
            {topo}
            <button type="button" onClick={fechar} className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-lg text-ink-2 hover:bg-sunken hover:text-ink" aria-label="Fechar menu">
              <X size={20} aria-hidden />
            </button>
          </div>
          <nav className="flex-1 overflow-y-auto px-3 py-3" aria-label="Itens do menu">
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
      </dialog>
    </>
  );
}

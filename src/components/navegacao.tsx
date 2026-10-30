"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ChevronRight, Menu, X } from "lucide-react";

export type GrupoNav = { chave: string; rotulo: string; itens: { href: string; rotulo: string; icone: ReactNode }[] };

function ativo(path: string, href: string) {
  if (href === "/processos") return path === "/processos" || /^\/processos\/(?!novo)/.test(path);
  return path === href || path.startsWith(href + "/");
}

/** Um item mais específico (ex.: /financas/caixa) vence o item-pai (/financas). */
function itemAtivo(path: string, href: string, grupos: GrupoNav[]) {
  return ativo(path, href) && !grupos.some((x) => x.itens.some((o) => o.href.startsWith(href + "/") && ativo(path, o.href)));
}

function Grupos({ grupos, aoNavegar }: { grupos: GrupoNav[]; aoNavegar?: () => void }) {
  const path = usePathname();
  return (
    <>
      {grupos.map((g, n) => {
        const contem = g.itens.some((i) => ativo(path, i.href));
        // o primeiro grupo e o que contém a página atual ficam abertos; os outros recolhidos
        return (
          <details key={g.chave} open={contem || n === 0} className="group mt-4 first:mt-0">
            <summary className="flex cursor-pointer list-none items-center justify-between rounded-md px-2.5 py-1 text-[12.5px] text-ink-3 hover:text-ink [&::-webkit-details-marker]:hidden">
              {g.rotulo}
              <ChevronRight size={13} className="transition-transform group-open:rotate-90" aria-hidden />
            </summary>
            <div className="mt-1 grid gap-0.5">
              {g.itens.map((i) => {
                const a = itemAtivo(path, i.href, grupos);
                return (
                  <Link
                    key={i.href}
                    href={i.href}
                    onClick={aoNavegar}
                    aria-current={a ? "page" : undefined}
                    className={`flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[14px] transition-colors ${
                      a ? "bg-active font-medium text-ink [&_svg]:text-ink" : "text-ink-2 hover:bg-sunken hover:text-ink [&_svg]:text-ink-3"
                    }`}
                  >
                    {i.icone}
                    <span className="truncate">{i.rotulo}</span>
                  </Link>
                );
              })}
            </div>
          </details>
        );
      })}
    </>
  );
}

/** Menu lateral da gestão: grupos com rótulo em caixa normal, item atual numa pílula cinza. */
export function Navegacao({ grupos }: { grupos: GrupoNav[] }) {
  return (
    <nav className="flex-1 overflow-y-auto px-3 pt-1 pb-4" aria-label="Menu da gestão">
      <Grupos grupos={grupos} />
    </nav>
  );
}

/** No celular, o menu vira uma folha de tela cheia aberta pelo botão da barra superior. */
export function MenuMovel({ grupos, topo, rodape }: { grupos: GrupoNav[]; topo: ReactNode; rodape: ReactNode }) {
  const [aberto, setAberto] = useState(false);
  const path = usePathname();
  useEffect(() => setAberto(false), [path]);
  useEffect(() => {
    document.body.style.overflow = aberto ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [aberto]);
  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="inline-flex size-10 items-center justify-center rounded-md text-ink hover:bg-active"
        aria-label="Abrir menu"
        aria-expanded={aberto}
      >
        <Menu size={20} />
      </button>
      {aberto && (
        <div className="fixed inset-0 z-50 flex flex-col bg-bg" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4">
            {topo}
            <button type="button" onClick={() => setAberto(false)} className="inline-flex size-10 items-center justify-center rounded-md hover:bg-active" aria-label="Fechar menu">
              <X size={20} />
            </button>
          </div>
          <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Menu da gestão">
            <Grupos grupos={grupos} aoNavegar={() => setAberto(false)} />
          </nav>
          <div className="border-t border-line p-3">{rodape}</div>
        </div>
      )}
    </>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

export type GrupoNav = { chave: string; rotulo: string; itens: { href: string; rotulo: string; icone: ReactNode }[] };

function ativo(path: string, href: string) {
  if (href === "/processos") return path === "/processos" || /^\/processos\/(?!novo)/.test(path);
  return path === href || path.startsWith(href + "/");
}

/** Menu lateral agrupado: grupos recolhidos por padrão, aberto o que contém a página atual. */
export function Navegacao({ grupos }: { grupos: GrupoNav[] }) {
  const path = usePathname();
  return (
    <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4" aria-label="Menu da gestão">
      {grupos.map((g) => {
        const contem = g.itens.some((i) => ativo(path, i.href));
        return (
          <details key={g.chave} open={contem || g.chave === "visao" || g.chave === "atendimento"} className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg px-3 py-2 text-[12px] font-semibold tracking-wide text-ink-3 uppercase hover:text-ink-2 [&::-webkit-details-marker]:hidden">
              {g.rotulo}
              <ChevronRight size={14} className="transition-transform group-open:rotate-90" />
            </summary>
            <div className="space-y-0.5 pb-2">
              {g.itens.map((i) => {
                const a = ativo(path, i.href);
                return (
                  <Link
                    key={i.href}
                    href={i.href}
                    aria-current={a ? "page" : undefined}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-[14.5px] transition-colors ${
                      a ? "bg-brand-soft font-semibold text-brand-ink [&_svg]:text-brand" : "text-ink-2 hover:bg-sunken hover:text-ink [&_svg]:text-ink-3"
                    }`}
                  >
                    {i.icone}
                    {i.rotulo}
                  </Link>
                );
              })}
            </div>
          </details>
        );
      })}
    </nav>
  );
}

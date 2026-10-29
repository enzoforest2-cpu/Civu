"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Globe, Inbox, LayoutGrid, Settings2, FolderOpen, ShieldCheck, ListOrdered } from "lucide-react";

const ICONES = { painel: LayoutGrid, caixa: Inbox, processos: FolderOpen, fluxos: BookOpen, config: Settings2, publico: Globe, obrigacoes: ShieldCheck, fila: ListOrdered };

export function NavLink({ href, children, icone }: { href: string; children: React.ReactNode; icone: keyof typeof ICONES }) {
  const path = usePathname();
  const ativo = href === "/processos" ? path === "/processos" || /^\/processos\/(?!novo)/.test(path) : path === href || path.startsWith(href + "/");
  const Icon = ICONES[icone];
  return (
    <Link
      href={href}
      aria-current={ativo ? "page" : undefined}
      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-[14.5px] transition-colors ${
        ativo ? "bg-brand-soft font-semibold text-brand-ink" : "text-ink-2 hover:bg-sunken hover:text-ink"
      }`}
    >
      <Icon size={18} strokeWidth={ativo ? 2.4 : 2} className={ativo ? "text-brand" : "text-ink-3"} />
      {children}
    </Link>
  );
}

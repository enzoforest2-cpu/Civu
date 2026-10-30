"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleHelp } from "lucide-react";

/** Link de ajuda do topo: abre o artigo da página atual (ou a busca, se não houver artigo específico). */
export function LinkAjuda() {
  const path = usePathname();
  return (
    <Link
      href={`/ajuda?pagina=${encodeURIComponent(path)}`}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-[14px] font-medium text-ink-2 hover:bg-sunken hover:text-ink"
      title="Ajuda sobre esta página"
    >
      <CircleHelp size={17} />
      <span className="hidden sm:inline">Ajuda</span>
    </Link>
  );
}

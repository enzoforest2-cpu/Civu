"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const path = usePathname();
  const ativo = href === "/processos" ? path === "/processos" || /^\/processos\/(?!novo)/.test(path) : path === href || path.startsWith(href + "/");
  return (
    <Link
      href={href}
      className={`block rounded-md px-3 py-2 text-sm transition-colors ${ativo ? "bg-white/10 font-semibold text-white" : "text-side-ink hover:bg-white/5 hover:text-white"}`}
    >
      {children}
    </Link>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { logoutAction } from "@/app/actions";
import { PAPEL_NOME } from "@/lib/workflow";
import { NavLink } from "@/components/nav-link";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const u = await getSessionUser();
  if (!u) redirect("/login");
  const nav = [
    { href: "/painel", label: "Painel" },
    { href: "/caixa", label: "Minha caixa" },
    { href: "/processos", label: "Processos" },
    { href: "/processos/novo", label: "Abrir processo" },
    { href: "/fluxos", label: "Fluxos" },
    { href: "/configuracoes", label: "Configurações" },
  ];
  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col bg-side text-side-ink">
        <div className="px-5 py-5">
          <Link href="/painel" className="text-base font-semibold tracking-tight text-white">
            Trâmite
          </Link>
          <div className="mt-1 truncate text-xs text-side-ink/70">
            {u.municipio.nome} · {u.municipio.uf}
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 px-3">
          {nav.map((n) => (
            <NavLink key={n.href} href={n.href}>
              {n.label}
            </NavLink>
          ))}
          <div className="mt-4 border-t border-white/10 pt-4">
            <NavLink href="/consulta">Consulta pública</NavLink>
          </div>
        </nav>
        <div className="border-t border-white/10 px-5 py-4 text-xs">
          <div className="truncate font-medium text-white">{u.nome}</div>
          <div className="truncate text-side-ink/70">{u.cargo ?? u.papeis.map((p) => PAPEL_NOME[p]).join(", ")}</div>
          <div className="truncate text-side-ink/70">{u.setor?.nome ?? "Sem setor"}</div>
          <form action={logoutAction} className="mt-3">
            <button className="text-side-ink/80 hover:text-white">Sair</button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-8 py-7">{children}</main>
    </div>
  );
}

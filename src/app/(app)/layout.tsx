import Link from "next/link";
import { redirect } from "next/navigation";
import { LogOut, Search } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { logoutAction } from "@/app/actions";
import { NavLink } from "@/components/nav-link";
import { Avatar } from "@/components/ui";
import { Marca } from "@/components/marca";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const u = await getSessionUser();
  if (!u) redirect("/login");
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-r border-line bg-surface lg:flex">
        <div className="px-5 pt-6 pb-5">
          <Link href="/painel" className="flex items-center gap-2.5">
            <Marca />
            <span className="display text-[20px] font-semibold text-ink">Trâmite</span>
          </Link>
          <div className="mt-3 rounded-lg bg-sunken px-3 py-2 text-[13px] leading-tight text-ink-2">
            <div className="font-semibold text-ink">{u.municipio.nome}</div>
            <div className="text-ink-3">Prefeitura · {u.municipio.uf}</div>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 px-3">
          <NavLink href="/painel" icone="painel">Painel</NavLink>
          <NavLink href="/caixa" icone="caixa">Minha caixa</NavLink>
          <NavLink href="/processos" icone="processos">Processos</NavLink>
          <NavLink href="/fluxos" icone="fluxos">Fluxos</NavLink>
          <NavLink href="/configuracoes" icone="config">Cadastros</NavLink>
          <div className="my-3 border-t border-line" />
          <NavLink href="/consulta" icone="publico">Consulta pública</NavLink>
        </nav>
        <div className="border-t border-line p-4">
          <div className="flex items-center gap-3">
            <Avatar nome={u.nome} size={36} />
            <div className="min-w-0 flex-1 text-[13px] leading-tight">
              <div className="truncate font-semibold text-ink">{u.nome}</div>
              <div className="truncate text-ink-3">{u.cargo ?? u.setor?.nome}</div>
            </div>
            <form action={logoutAction}>
              <button className="rounded-lg p-2 text-ink-3 hover:bg-sunken hover:text-ink" title="Sair" aria-label="Sair">
                <LogOut size={17} />
              </button>
            </form>
          </div>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <nav className="flex items-center gap-1 overflow-x-auto border-b border-line bg-surface px-4 py-2 lg:hidden" aria-label="Menu">
          <Link href="/painel" className="mr-2 shrink-0">
            <Marca size={26} />
          </Link>
          {[
            ["/painel", "Painel"],
            ["/caixa", "Minha caixa"],
            ["/processos", "Processos"],
            ["/fluxos", "Fluxos"],
            ["/configuracoes", "Cadastros"],
          ].map(([h, r]) => (
            <Link key={h} href={h} className="shrink-0 rounded-lg px-3 py-1.5 text-[14px] font-medium text-ink-2 hover:bg-sunken">
              {r}
            </Link>
          ))}
        </nav>
        <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-line bg-bg/85 px-4 py-3 backdrop-blur sm:px-10">
          <form action="/processos" className="relative w-full max-w-md">
            <Search size={17} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-3" />
            <input name="q" className="input !rounded-full !bg-white !py-2.5 !pl-10" placeholder="Buscar processo por número ou assunto" />
            <input type="hidden" name="situacao" value="todos" />
          </form>
          <Link href="/processos/novo" className="btn btn-primary !rounded-full">
            Abrir processo
          </Link>
        </header>
        <main className="mx-auto max-w-[1280px] px-4 py-7 sm:px-10 sm:py-9">{children}</main>
      </div>
    </div>
  );
}

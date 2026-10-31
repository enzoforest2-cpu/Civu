import Link from "next/link";
import { redirect } from "next/navigation";
import { LogOut, Search } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { logoutAction } from "@/app/actions";
import { Navegacao, type GrupoNav } from "@/components/navegacao";
import { BotaoMenuCelular, GavetaMenuCelular } from "@/components/menu-celular";
import { GRUPOS, ITENS_GESTAO } from "@/lib/modulos";
import { Avatar } from "@/components/ui";
import { Marca, MarcaCompleta } from "@/components/marca";
import { LinkAjuda } from "@/modulos/gestao/componentes/link-ajuda";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const u = await getSessionUser();
  if (!u) redirect("/login");
  const grupos: GrupoNav[] = GRUPOS.map((g) => ({
    chave: g.chave,
    rotulo: g.rotulo,
    itens: ITENS_GESTAO.filter((i) => i.grupo === g.chave && (!i.papeis || u.papeis.includes("ADMIN") || i.papeis.some((p) => u.papeis.includes(p)))).map((i) => ({
      href: i.href,
      rotulo: i.rotulo,
      icone: <i.icone size={18} strokeWidth={2} />,
    })),
  })).filter((g) => g.itens.length > 0);
  return (
    <div className="flex min-h-screen">
      <a href="#conteudo" className="pular-conteudo">
        Pular para o conteúdo
      </a>
      <aside aria-label="Menu lateral" className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-r border-line bg-surface lg:flex">
        <div className="px-5 pt-6 pb-5">
          <Link href="/painel" className="flex min-h-[44px] items-center gap-2.5">
            <MarcaCompleta />
          </Link>
          <div className="mt-3 rounded-lg bg-sunken px-3 py-2 text-[13px] leading-tight text-ink-2">
            <div className="font-semibold text-ink">{u.municipio.nome}</div>
            <div className="text-ink-3">Prefeitura · {u.municipio.uf}</div>
          </div>
        </div>
        <Navegacao grupos={grupos} />
        <div className="border-t border-line p-4">
          <div className="flex items-center gap-3">
            <Avatar nome={u.nome} size={36} />
            <div className="min-w-0 flex-1 text-[13px] leading-tight">
              <div className="truncate font-semibold text-ink">{u.nome}</div>
              <div className="truncate text-ink-3">{u.cargo ?? u.setor?.nome}</div>
            </div>
            <form action={logoutAction}>
              <button className="flex h-[44px] w-[44px] items-center justify-center rounded-lg text-ink-3 hover:bg-sunken hover:text-ink" title="Sair" aria-label="Sair">
                <LogOut size={17} />
              </button>
            </form>
          </div>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <nav aria-label="Menu do celular" className="flex items-center justify-between gap-2 border-b border-line bg-surface px-4 py-1 lg:hidden">
          <Link href="/painel" className="flex h-[44px] min-w-[44px] items-center gap-2.5" aria-label={`Civu, ${u.municipio.nome}: ir para o painel`}>
            <Marca size={26} />
            <span className="text-[13px] leading-tight text-ink-2">{u.municipio.nome}</span>
          </Link>
          <BotaoMenuCelular />
        </nav>
        {/* a gaveta fica fora da barra do celular (que some no computador): ver GavetaMenuCelular */}
        <GavetaMenuCelular
          grupos={grupos}
          topo={<span className="min-w-0 truncate text-[14px] font-semibold text-ink">{u.nome}</span>}
          rodape={
            <form action={logoutAction}>
              <button className="btn btn-quiet min-h-[44px] w-full">
                <LogOut size={17} aria-hidden /> Sair
              </button>
            </form>
          }
        />
        <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-line bg-bg/85 px-4 py-3 backdrop-blur sm:px-10">
          <form action="/processos" className="relative w-full max-w-md">
            <Search size={17} aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-3" />
            <input name="q" className="input !rounded-full !bg-white !py-2.5 !pl-10" placeholder="Buscar processo por número ou assunto" aria-label="Buscar processo por número ou assunto" />
            <input type="hidden" name="situacao" value="todos" />
          </form>
          <div className="flex shrink-0 items-center gap-1">
            <LinkAjuda />
            <Link href="/processos/novo" className="btn btn-primary !rounded-full">
              Abrir processo
            </Link>
          </div>
        </header>
        <main id="conteudo" tabIndex={-1} className="mx-auto max-w-[1280px] px-4 py-7 sm:px-10 sm:py-9">
          {children}
        </main>
      </div>
    </div>
  );
}

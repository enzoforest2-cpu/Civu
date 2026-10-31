import Link from "next/link";
import { LogOut } from "lucide-react";
import { requirePortal } from "@/lib/portal";
import { agirComoAction, sairPortalAction } from "./actions";
import { MarcaCompleta } from "@/components/marca";
import { Avatar } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const s = await requirePortal();
  const app = s.empresaAtiva ? "Civu Empresas" : "Civu Cidadão";
  return (
    <div className="min-h-screen bg-bg">
      <a href="#conteudo" className="pular-conteudo">
        Pular para o conteúdo
      </a>
      <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href="/portal" className="flex items-center gap-3">
            <MarcaCompleta altura={24} />
            <span className="border-l border-line pl-3 text-[14px] font-semibold text-ink-2">{app}</span>
          </Link>
          <div className="flex items-center gap-2">
            {s.representacoes.length > 0 && (
              <form action={agirComoAction} className="flex items-center gap-2">
                <label htmlFor="empresaId" className="hidden text-[13px] text-ink-3 sm:block">
                  Agindo como
                </label>
                <select id="empresaId" name="empresaId" defaultValue={s.empresaAtiva?.id ?? ""} className="input min-h-[44px] !w-auto !py-1.5 text-[14px]">
                  <option value="">{s.pessoa.nome} (você)</option>
                  {s.representacoes.map((r) => (
                    <option key={r.id} value={r.empresaId}>
                      {r.empresa.nomeFantasia ?? r.empresa.razaoSocial}
                    </option>
                  ))}
                </select>
                <button className="btn btn-quiet min-h-[44px] !px-3 !py-1.5 text-[13px]">Trocar</button>
              </form>
            )}
            <form action={sairPortalAction}>
              <button className="flex h-[44px] w-[44px] items-center justify-center rounded-lg text-ink-3 hover:bg-sunken hover:text-ink" title="Sair" aria-label="Sair">
                <LogOut size={17} />
              </button>
            </form>
          </div>
        </div>
        {s.empresaAtiva && (
          <div className="bg-brand-2 text-white">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-2 px-4 py-1.5 text-[13px] sm:px-6">
              <Avatar nome={s.pessoa.nome} size={20} />
              <span>
                {s.pessoa.nome} agindo em nome de <strong className="font-semibold">{s.empresaAtiva.razaoSocial}</strong>
              </span>
            </div>
          </div>
        )}
      </header>
      <main id="conteudo" tabIndex={-1} className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}

import Link from "next/link";
import { MarcaCompleta } from "@/components/marca";

/** Cabeçalho das páginas públicas de obras (mesmo padrão da fila de pagamentos). */
export function CabecalhoPublico({ slug }: { slug?: string }) {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <MarcaCompleta altura={26} />
          <div className="border-l border-line pl-2.5 leading-tight">
            <div className="text-[12.5px] text-ink-3">Transparência</div>
          </div>
        </div>
        <nav className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[14px] font-semibold">
          <Link href={`/fila-de-pagamentos${slug ? `?m=${slug}` : ""}`} className="alvo-toque text-ink-2 hover:text-ink">
            Fila de pagamentos
          </Link>
          <Link href={`/consulta${slug ? `?m=${slug}` : ""}`} className="alvo-toque text-ink-2 hover:text-ink">
            Consultar processo
          </Link>
          <Link href="/login" className="alvo-toque text-brand-2 hover:underline">
            Sou servidor
          </Link>
        </nav>
      </div>
    </header>
  );
}

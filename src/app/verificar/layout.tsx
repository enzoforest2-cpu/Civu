import Link from "next/link";
import { MarcaCompleta } from "@/components/marca";

export const dynamic = "force-dynamic";

export default function VerificarLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-bg">
      <header className="border-b border-line bg-surface print:hidden">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Link href="/verificar" className="flex items-center gap-2.5">
            <MarcaCompleta altura={26} />
            <span className="border-l border-line pl-2.5 text-[12.5px] leading-tight text-ink-3">Verificação de documentos</span>
          </Link>
          <Link href="/consulta" className="text-[14px] font-semibold text-brand-2 hover:underline">
            Consulta de processos
          </Link>
        </div>
      </header>
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">{children}</div>
    </main>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { Search } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { Cabecalho, Panel, Vazio } from "@/components/ui";
import { ARTIGOS, artigoDaPagina, buscarArtigos } from "@/modulos/gestao/ajuda";

export const metadata = { title: "Ajuda · Civu" };

export default async function AjudaPage({ searchParams }: { searchParams: Promise<{ q?: string; pagina?: string }> }) {
  await requireUser();
  const { q, pagina } = await searchParams;
  if (pagina && !q) {
    const a = artigoDaPagina(pagina);
    if (a) redirect(`/ajuda/${a.slug}`);
  }
  const lista = q ? buscarArtigos(q) : ARTIGOS;
  const modulos = [...new Set(lista.map((a) => a.modulo))];

  return (
    <>
      <Cabecalho titulo="Central de ajuda" sub="Artigos curtos sobre cada parte da Civu. Em qualquer página, use o botão Ajuda no topo para abrir o artigo daquela página." />
      {pagina && !q && <p className="mb-4 text-[14px] text-ink-2">Ainda não há artigo específico para esta página. Veja os artigos abaixo ou pesquise.</p>}
      <form action="/ajuda" className="relative mb-8 max-w-xl">
        <Search size={17} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-3" />
        <input name="q" defaultValue={q ?? ""} className="input !rounded-full !py-2.5 !pl-10" placeholder="Pesquisar: prazo, assinatura, regra, PNCP…" aria-label="Pesquisar na ajuda" />
      </form>
      {lista.length === 0 ? (
        <Vazio>
          Nenhum artigo encontrado para &quot;{q}&quot;.{" "}
          <Link href="/ajuda" className="font-semibold text-brand-2 hover:underline">
            Ver todos
          </Link>
        </Vazio>
      ) : (
        <div className="space-y-8">
          {modulos.map((m) => (
            <section key={m}>
              <h2 className="mb-3 text-[12.5px] font-semibold tracking-wide text-ink-3 uppercase">{m}</h2>
              <div className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2 xl:grid-cols-3">
                {lista
                  .filter((a) => a.modulo === m)
                  .map((a) => (
                    <Link key={a.slug} href={`/ajuda/${a.slug}`} className="group">
                      <Panel className="h-full transition-colors group-hover:border-brand/40">
                        <div className="text-[15.5px] font-semibold text-ink group-hover:text-brand-2">{a.titulo}</div>
                        <p className="mt-1 text-[13.5px] leading-snug text-ink-2">{a.resumo}</p>
                      </Panel>
                    </Link>
                  ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

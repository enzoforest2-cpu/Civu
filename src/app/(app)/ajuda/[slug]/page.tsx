import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { Panel } from "@/components/ui";
import { ARTIGOS } from "@/modulos/gestao/ajuda";
import { ITENS_GESTAO } from "@/lib/modulos";

export default async function ArtigoPage({ params }: { params: Promise<{ slug: string }> }) {
  await requireUser();
  const { slug } = await params;
  const a = ARTIGOS.find((x) => x.slug === slug);
  if (!a) notFound();
  const relacionados = ARTIGOS.filter((x) => x.modulo === a.modulo && x.slug !== a.slug);
  return (
    <div className="max-w-3xl">
      <Link href="/ajuda" className="mb-4 inline-flex items-center gap-1.5 text-[14px] text-ink-2 hover:text-ink">
        <ArrowLeft size={15} /> Central de ajuda
      </Link>
      <div className="mb-1 text-[12.5px] font-semibold tracking-wide text-ink-3 uppercase">{a.modulo}</div>
      <h1 className="display text-[28px] leading-[1.15] font-semibold text-ink sm:text-[32px]">{a.titulo}</h1>
      <p className="mt-2 text-[15.5px] text-ink-2">{a.resumo}</p>
      <div className="mt-8 space-y-7">
        {a.secoes.map((s) => (
          <section key={s.titulo}>
            <h2 className="text-[17px] font-semibold text-ink">{s.titulo}</h2>
            <div className="mt-2 space-y-2.5 text-[15px] leading-relaxed text-ink-2">
              {s.texto.map((t, i) => (
                <p key={i}>{t}</p>
              ))}
            </div>
          </section>
        ))}
      </div>
      <div className="mt-8 flex flex-wrap gap-2">
        {a.rotas.map((r) => (
          <Link key={r} href={r} className="btn btn-quiet">
            Abrir {ITENS_GESTAO.find((i) => i.href === r)?.rotulo ?? a.titulo} <ArrowRight size={15} />
          </Link>
        ))}
      </div>
      {relacionados.length > 0 && (
        <Panel title="Veja também" className="mt-10">
          <ul className="space-y-2">
            {relacionados.map((x) => (
              <li key={x.slug}>
                <Link href={`/ajuda/${x.slug}`} className="font-semibold text-brand-2 hover:underline">
                  {x.titulo}
                </Link>
                <span className="text-[13.5px] text-ink-3"> — {x.resumo}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

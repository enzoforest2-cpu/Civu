import Link from "next/link";
import { db } from "@/db";
import { municipios } from "@/db/schema";
import { MarcaCompleta } from "@/components/marca";
import { anoCorrente, execucao, fmtIso, hojeIso, porFuncao, receita } from "@/modulos/financas/dados";
import { fmtCompacto } from "@/modulos/financas/classificacao";

export const dynamic = "force-dynamic";

export const metadata = { title: "Orçamento aberto" };

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

/** Página pública: quanto a prefeitura pode gastar, quanto já comprometeu e quanto pagou, por área. */
export default async function OrcamentoAbertoPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const sp = await searchParams;
  const lista = await db.query.municipios.findMany({ orderBy: municipios.nome });
  const mun = lista.find((x) => x.slug === sp.m) ?? lista[0];
  const ano = anoCorrente();
  const [ex, funcoes, rec] = mun ? await Promise.all([execucao(mun.id, ano), porFuncao(mun.id, ano), receita(mun.id, ano)]) : [null, [], null];
  const t = ex?.totais;
  const maxF = Math.max(1, ...funcoes.map((f) => f.atualizado));

  return (
    <main className="min-h-screen bg-bg">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <MarcaCompleta altura={26} />
            <div className="border-l border-line pl-2.5 leading-tight">
              <div className="text-[12.5px] text-ink-3">Transparência</div>
            </div>
          </div>
          <nav className="flex items-center gap-4 text-[14px] font-semibold">
            <Link href={`/fila-de-pagamentos${mun ? `?m=${mun.slug}` : ""}`} className="hidden text-ink-2 hover:text-ink sm:inline">
              Fila de pagamentos
            </Link>
            <Link href="/login" className="text-brand hover:underline">
              Sou servidor
            </Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <h1 className="display text-[30px] leading-[1.1] font-semibold text-ink sm:text-[38px]">
          Orçamento {mun ? `de ${mun.nome}` : ""} em {ano}
        </h1>

        {lista.length > 1 && (
          <form method="get" className="mt-4 flex flex-wrap items-center gap-2">
            <label htmlFor="m" className="text-[14px] text-ink-2">
              Município
            </label>
            <select id="m" name="m" className="input !w-auto" defaultValue={mun?.slug}>
              {lista.map((x) => (
                <option key={x.id} value={x.slug}>
                  {x.nome} – {x.uf}
                </option>
              ))}
            </select>
            <button className="btn btn-quiet">Ver</button>
          </form>
        )}

        {!t || ex!.dotacoes.length === 0 ? (
          <p className="panel mt-8 p-6 text-ink-2">O orçamento deste ano ainda não foi publicado aqui.</p>
        ) : (
          <>
            <p className="mt-3 max-w-3xl text-[16px] leading-relaxed text-ink-2">
              Neste ano, a prefeitura está autorizada a gastar até <strong className="text-ink">{fmtCompacto(t.atualizado)}</strong>. Até {fmtIso(hojeIso())}, já
              assumiu compromissos de <strong className="text-ink">{fmtCompacto(t.empenhado)}</strong> ({pct(t.empenhado, t.atualizado)}%) e pagou{" "}
              <strong className="text-ink">{fmtCompacto(t.pago)}</strong> ({pct(t.pago, t.atualizado)}%).
              {rec && rec.totais.previstoAte > 0 && (
                <>
                  {" "}
                  Entraram {fmtCompacto(rec.totais.arrecadado)} em impostos e repasses, {pct(rec.totais.arrecadado, rec.totais.previstoAte)}% do que se esperava até
                  agora.
                </>
              )}
            </p>

            <dl className="mt-8 grid gap-3 sm:grid-cols-3">
              {(
                [
                  ["Orçado", t.atualizado, "O valor máximo que pode ser gasto, aprovado pela Câmara na lei do orçamento e ajustado por decretos."],
                  ["Comprometido", t.empenhado, "Despesas já contratadas e reservadas para um fornecedor ou para a folha (empenho)."],
                  ["Pago", t.pago, "Dinheiro que já saiu da conta da prefeitura depois da entrega do serviço ou produto."],
                ] as const
              ).map(([r, v, txt]) => (
                <div key={r} className="panel p-5">
                  <dt className="text-[13px] font-semibold text-ink-3">{r}</dt>
                  <dd className="display tnum mt-1 text-[26px] font-semibold text-ink">{fmtCompacto(v)}</dd>
                  <p className="mt-1 text-[13.5px] leading-snug text-ink-2">{txt}</p>
                </div>
              ))}
            </dl>

            <section className="panel mt-8 p-5 sm:p-6">
              <h2 className="text-[18px] font-semibold text-ink">Em que área o dinheiro está sendo usado</h2>
              <p className="mt-1 text-[14px] text-ink-2">Barra cheia: o orçado da área. Parte escura: o que já foi pago. Parte clara: o que está comprometido.</p>
              <ul className="mt-6 space-y-5">
                {funcoes.map((f) => (
                  <li key={f.funcao}>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                      <span className="text-[15px] font-semibold text-ink">{f.simples}</span>
                      <span className="tnum text-[14px] text-ink-2">
                        pagou {fmtCompacto(f.pago)} de {fmtCompacto(f.atualizado)} <span className="text-ink-3">({pct(f.pago, f.atualizado)}%)</span>
                      </span>
                    </div>
                    <div className="mt-1.5" style={{ width: `${Math.max(14, (f.atualizado / maxF) * 100)}%` }}>
                      <div className="relative h-3 overflow-hidden rounded-full bg-sunken" role="img" aria-label={`${f.simples}: pago ${pct(f.pago, f.atualizado)}% do orçado`}>
                        <div className="absolute inset-y-0 left-0 bg-brand/30" style={{ width: `${pct(f.empenhado, f.atualizado)}%` }} />
                        <div className="absolute inset-y-0 left-0 bg-brand" style={{ width: `${pct(f.pago, f.atualizado)}%` }} />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section className="panel mt-8 p-5 sm:p-6">
              <h2 className="text-[18px] font-semibold text-ink">De cada R$ 100 pagos até agora</h2>
              <ul className="mt-4 grid gap-x-8 gap-y-2 sm:grid-cols-2">
                {[...funcoes]
                  .sort((a, b) => b.pago - a.pago)
                  .map((f) => (
                    <li key={f.funcao} className="flex items-baseline justify-between gap-3 border-b border-line py-2 text-[14.5px]">
                      <span className="text-ink">{f.simples}</span>
                      <span className="tnum font-semibold text-ink">
                        {(f.pago / t.pago) * 100 < 0.5 ? "menos de R$ 1" : `R$ ${((f.pago / t.pago) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`}
                      </span>
                    </li>
                  ))}
              </ul>
            </section>

            <section className="mt-8 rounded-2xl bg-sunken p-5 text-[14px] leading-relaxed text-ink-2 sm:p-6">
              <h2 className="text-[16px] font-semibold text-ink">Como ler estes números</h2>
              <p className="mt-2">
                Toda despesa pública passa por etapas: primeiro o dinheiro é <strong>reservado</strong> no orçamento, depois <strong>empenhado</strong> (a prefeitura se
                compromete com um fornecedor), <strong>liquidado</strong> (o serviço ou produto foi entregue e conferido) e, por fim, <strong>pago</strong>. Por isso o
                comprometido é sempre maior que o pago.
              </p>
              <p className="mt-2">
                Os pagamentos a fornecedores seguem uma fila por ordem de entrega, que você pode acompanhar na{" "}
                <Link href={`/fila-de-pagamentos${mun ? `?m=${mun.slug}` : ""}`} className="font-semibold text-brand hover:underline">
                  fila de pagamentos
                </Link>
                .
              </p>
              <p className="mt-2 text-[13px] text-ink-3">Dados de demonstração. Valores oficiais são publicados no Portal da Transparência e nos relatórios fiscais (RREO e RGF).</p>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

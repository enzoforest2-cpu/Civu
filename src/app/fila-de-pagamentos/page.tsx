/* eslint-disable react-hooks/purity -- dias na fila dependem da hora atual; renderizado a cada requisição */
import Link from "next/link";
import { ListOrdered, Search } from "lucide-react";
import { db } from "@/db";
import { municipios } from "@/db/schema";
import { filaDePagamentos, historicoDePagamentos, enviadosAoBanco, fmtCnpj } from "@/lib/pagamentos";
import { fmtData, fmtMoeda } from "@/lib/dates";
import { Marca, MarcaCompleta } from "@/components/marca";

export const dynamic = "force-dynamic";

/** Fila pública de pagamentos em ordem cronológica, por fonte de recurso (Lei 14.133, art. 141). */
export default async function FilaPage({ searchParams }: { searchParams: Promise<{ m?: string; cnpj?: string }> }) {
  const sp = await searchParams;
  const lista = await db.query.municipios.findMany({ orderBy: municipios.nome });
  const mun = lista.find((x) => x.slug === sp.m) ?? lista[0];
  const cnpj = (sp.cnpj ?? "").replace(/\D/g, "");
  const [filas, hist, enviados] = mun
    ? await Promise.all([filaDePagamentos(mun.id), historicoDePagamentos(mun.id, 180), enviadosAoBanco(mun.id)])
    : [[], { pagos: [], mediaDias: null, quebras: [] }, []];
  const totalItens = filas.reduce((s, f) => s + f.fila.length, 0);
  const totalValor = filas.reduce((s, f) => s + f.total, 0);
  const meus = cnpj
    ? filas.flatMap((f) =>
        f.fila
          .filter((x) => x.cnpj === cnpj)
          .map((x) => ({ ...x, aFrente: f.fila.filter((y) => y.posicao < x.posicao), filaTotal: f.fila.length })),
      )
    : [];
  const hoje = Date.now();

  return (
    <main className="min-h-screen bg-bg">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <MarcaCompleta altura={26} />
            <div className="leading-tight border-l border-line pl-2.5">
              <div className="text-[12.5px] text-ink-3">Transparência</div>
            </div>
          </div>
          <nav className="flex items-center gap-4 text-[14px] font-semibold">
            <Link href={`/consulta${mun ? `?m=${mun.slug}` : ""}`} className="text-ink-2 hover:text-ink">
              Consultar processo
            </Link>
            <Link href="/login" className="text-brand hover:underline">
              Sou servidor
            </Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <h1 className="display text-[32px] leading-[1.1] font-semibold text-ink sm:text-[38px]">Fila de pagamentos{mun ? ` de ${mun.nome}` : ""}</h1>
        <p className="mt-2 max-w-3xl text-[15px] text-ink-2">
          A prefeitura paga cada fonte de recurso na ordem em que as despesas foram liquidadas (Lei 14.133, art. 141). Qualquer pagamento fora dessa ordem
          aparece aqui com a justificativa.
        </p>

        <form className="panel mt-7 flex flex-wrap items-end gap-3 p-5" method="get">
          <div className="min-w-[200px] flex-1">
            <label className="label" htmlFor="m">
              Município
            </label>
            <select id="m" name="m" className="input" defaultValue={mun?.slug}>
              {lista.map((x) => (
                <option key={x.id} value={x.slug}>
                  {x.nome} – {x.uf}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[200px] flex-1">
            <label className="label" htmlFor="cnpj">
              Sou fornecedor: meu CNPJ
            </label>
            <input id="cnpj" name="cnpj" className="input tnum" inputMode="numeric" placeholder="00.000.000/0000-00" defaultValue={sp.cnpj ?? ""} />
          </div>
          <button className="btn btn-primary btn-lg">
            <Search size={17} /> Ver posição
          </button>
        </form>

        {cnpj && (
          <section className="mt-6" aria-live="polite">
            {meus.length === 0 ? (
              <div className="rounded-xl bg-sunken px-5 py-4 text-[14.5px] text-ink-2">
                Nenhum pagamento do CNPJ <strong className="tnum text-ink">{fmtCnpj(cnpj)}</strong> na fila agora. Se a nota fiscal já foi entregue, ela pode
                estar em atesto ou liquidação.
              </div>
            ) : (
              <div className="space-y-3">
                {meus.map((x) => (
                  <div key={x.processoId} className="rounded-2xl border-2 border-brand bg-brand-soft/50 px-5 py-4">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="display tnum text-[30px] leading-none font-semibold text-brand">{x.posicao}º</span>
                      <span className="text-[15px] text-ink">
                        de {x.filaTotal} na fila de <strong className="font-semibold">{x.fonteNome}</strong>
                      </span>
                    </div>
                    <p className="mt-2 text-[14.5px] text-ink-2">
                      Processo <span className="tnum font-semibold text-ink">{x.numero}</span> · {fmtMoeda(x.valor)} · liquidado em {fmtData(x.liquidadoEm)}.{" "}
                      {x.aFrente.length === 0
                        ? "É o próximo pagamento desta fonte."
                        : `${x.aFrente.length === 1 ? "1 pagamento" : `${x.aFrente.length} pagamentos`} à frente, somando ${fmtMoeda(x.aFrente.reduce((s, y) => s + (y.valor ?? 0), 0))}.`}
                      {hist.mediaDias != null && ` Nos últimos 6 meses, a prefeitura levou em média ${hist.mediaDias} dias entre a liquidação e o pagamento.`}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <Numero valor={String(totalItens)} rotulo={totalItens === 1 ? "pagamento aguardando" : "pagamentos aguardando"} />
          <Numero valor={fmtMoeda(totalValor)} rotulo="na fila, somando todas as fontes" />
          <Numero valor={hist.mediaDias == null ? "—" : `${hist.mediaDias} dias`} rotulo="em média da liquidação ao pagamento (últimos 6 meses)" />
        </div>

        {filas.length === 0 ? (
          <div className="mt-8 rounded-xl border border-dashed border-line-2 px-6 py-10 text-center text-[14.5px] text-ink-3">
            Nenhum pagamento aguardando na fila agora.
          </div>
        ) : (
          filas.map((f) => (
            <section key={f.fonte} className="panel mt-8 overflow-hidden">
              <header className="flex flex-wrap items-center justify-between gap-2 px-6 pt-5 pb-3">
                <h2 className="flex items-center gap-2 text-[17px] font-semibold text-ink">
                  <ListOrdered size={18} className="text-brand" /> {f.fonteNome}
                </h2>
                <span className="tnum text-[13.5px] text-ink-2">
                  {f.fila.length} {f.fila.length === 1 ? "pagamento" : "pagamentos"} · {fmtMoeda(f.total)}
                </span>
              </header>
              <div className="overflow-x-auto">
                <table className="lista">
                  <thead>
                    <tr>
                      <th className="w-16">Ordem</th>
                      <th>Fornecedor</th>
                      <th>Processo</th>
                      <th className="text-right">Valor</th>
                      <th>Liquidado em</th>
                      <th className="text-right">Dias na fila</th>
                    </tr>
                  </thead>
                  <tbody>
                    {f.fila.map((x) => (
                      <tr key={x.processoId} className={cnpj && x.cnpj === cnpj ? "bg-brand-soft/60" : undefined}>
                        <td className="display tnum text-[18px] font-semibold text-ink">{x.posicao}º</td>
                        <td className="min-w-[200px]">
                          <div className="font-medium text-ink">{x.fornecedor ?? "Não informado"}</div>
                          <div className="tnum text-[12.5px] text-ink-3">{x.cnpj ? fmtCnpj(x.cnpj) : ""}</div>
                        </td>
                        <td className="min-w-[180px]">
                          <span className="tnum font-semibold text-ink">{x.numero}</span>
                          <div className="text-[12.5px] text-ink-3">{x.assunto}</div>
                        </td>
                        <td className="tnum text-right whitespace-nowrap">{fmtMoeda(x.valor)}</td>
                        <td className="tnum whitespace-nowrap">{fmtData(x.liquidadoEm)}</td>
                        <td className="tnum text-right">{Math.max(0, Math.round((hoje - x.liquidadoEm.getTime()) / 86400_000))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))
        )}

        <section className="panel mt-8 p-6">
          <h2 className="text-[17px] font-semibold text-ink">Pagamentos fora da ordem</h2>
          <p className="mt-1 text-[14px] text-ink-2">Últimos 6 meses. A lei admite alterar a ordem só com justificativa publicada (art. 141, §1º).</p>
          {hist.quebras.length === 0 ? (
            <p className="mt-4 rounded-xl bg-ok-soft/60 px-4 py-3 text-[14.5px] text-ok">Nenhum pagamento fora da ordem no período.</p>
          ) : (
            <ul className="mt-4 divide-y divide-line">
              {hist.quebras.map((q) => (
                <li key={q.processoId} className="py-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="text-[14.5px] text-ink">
                      <span className="tnum font-semibold">{q.numero}</span> · {q.fornecedor ?? "Fornecedor não informado"} · {q.fonteNome}
                    </div>
                    <span className="tnum text-[13px] text-ink-3">pago em {fmtData(q.pagoEm)}</span>
                  </div>
                  <p className="mt-1.5 text-[14px] text-ink-2">
                    <strong className="font-semibold text-ink">Justificativa:</strong> {q.quebra?.justificativa}
                  </p>
                  <p className="mt-1 text-[12.5px] text-ink-3">Passou à frente de: {q.quebra?.aFrente.join(", ")}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel mt-8 p-6">
          <h2 className="text-[17px] font-semibold text-ink">Enviados ao banco, aguardando confirmação</h2>
          {enviados.length === 0 ? (
            <p className="mt-3 rounded-xl bg-sunken px-4 py-3 text-[14.5px] text-ink-2">
              Nenhum pagamento enviado ao banco agora. Quando a prefeitura envia uma ordem de pagamento, ela aparece aqui até o banco confirmar; só depois disso o
              pagamento é considerado pago.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {enviados.map((x) => (
                <li key={x.processoId} className="flex flex-wrap items-baseline justify-between gap-2 py-3 text-[14px]">
                  <span className="text-ink">
                    <span className="tnum font-semibold">{x.numero}</span> · {x.fornecedor ?? "Fornecedor não informado"}
                  </span>
                  <span className="tnum text-ink-3">
                    {fmtMoeda(x.valor)} · enviado em {fmtData(x.enviadoEm)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {hist.pagos.length > 0 && (
          <section className="panel mt-8 p-6">
            <h2 className="text-[17px] font-semibold text-ink">Pagos recentemente</h2>
            <ul className="mt-3 divide-y divide-line">
              {hist.pagos.slice(0, 10).map((x) => (
                <li key={x.processoId} className="flex flex-wrap items-baseline justify-between gap-2 py-3 text-[14px]">
                  <span className="text-ink">
                    <span className="tnum font-semibold">{x.numero}</span> · {x.fornecedor ?? x.assunto}
                  </span>
                  <span className="tnum text-ink-3">
                    pago em {fmtData(x.pagoEm)} · {x.diasNaFila} dias na fila
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}

function Numero({ valor, rotulo }: { valor: string; rotulo: string }) {
  return (
    <div className="panel px-5 py-4">
      <div className="display tnum text-[26px] font-semibold text-ink">{valor}</div>
      <div className="text-[13.5px] text-ink-2">{rotulo}</div>
    </div>
  );
}

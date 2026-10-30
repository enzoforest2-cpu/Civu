import Link from "next/link";
import { ArrowRight, MapPin } from "lucide-react";
import { db } from "@/db";
import { municipios } from "@/db/schema";
import { fmtData, fmtMoeda } from "@/lib/dates";
import { obrasPublicas } from "@/modulos/contratos/dados";
import { dataLocal } from "@/modulos/contratos/regras";
import { BarraPct, ChipObra, pct } from "@/modulos/contratos/componentes";
import { CabecalhoPublico } from "./cabecalho";

export const dynamic = "force-dynamic";

/** Obras públicas: o que está sendo construído, por quem, quanto custa, quanto já foi feito e quando termina. */
export default async function ObrasPublicasPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const sp = await searchParams;
  const lista = await db.query.municipios.findMany({ orderBy: municipios.nome });
  const mun = lista.find((x) => x.slug === sp.m) ?? lista[0];
  const obras = mun ? await obrasPublicas(mun.id) : [];
  const investimento = obras.reduce((s, o) => s + o.fin.valorAtual, 0);
  const atrasadas = obras.filter((o) => o.obra!.situacao === "ATRASADA" || o.obra!.situacao === "PARALISADA").length;

  return (
    <main className="min-h-screen bg-bg">
      <CabecalhoPublico slug={mun?.slug} />
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <h1 className="display text-[32px] leading-[1.1] font-semibold text-ink sm:text-[38px]">Obras públicas{mun ? ` de ${mun.nome}` : ""}</h1>
        <p className="mt-2 max-w-3xl text-[15px] text-ink-2">
          Cada obra mostra a empresa contratada, o valor, quanto já foi executado segundo as medições da fiscalização e o prazo atualizado. Quando há atraso, o motivo
          aparece aqui.
        </p>
        {lista.length > 1 && (
          <form className="mt-6 flex flex-wrap items-end gap-3" method="get">
            <div className="min-w-[220px]">
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
            <button className="btn btn-quiet">Ver</button>
          </form>
        )}

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <Resumo valor={String(obras.length)} rotulo={obras.length === 1 ? "obra em andamento ou concluída" : "obras em andamento ou concluídas"} />
          <Resumo valor={fmtMoeda(investimento)} rotulo="de investimento contratado" />
          <Resumo valor={String(atrasadas)} rotulo={atrasadas === 1 ? "obra atrasada ou paralisada" : "obras atrasadas ou paralisadas"} />
        </div>

        {obras.length === 0 ? (
          <div className="mt-8 rounded-xl border border-dashed border-line-2 px-6 py-10 text-center text-[14.5px] text-ink-3">Nenhuma obra publicada ainda.</div>
        ) : (
          <ul className="mt-8 space-y-4">
            {obras.map((c) => {
              const o = c.obra!;
              return (
                <li key={c.id}>
                  <Link href={`/obras/${c.id}`} className="panel group block p-5 transition-colors hover:border-brand sm:p-6">
                    <div className="flex flex-wrap items-center gap-2">
                      <ChipObra s={o.situacao} />
                      <span className="flex items-center gap-1 text-[13px] text-ink-3">
                        <MapPin size={13} /> {c.obraLocal}
                      </span>
                    </div>
                    <h2 className="mt-2 text-[18px] leading-snug font-semibold text-ink group-hover:text-brand">{c.objeto}</h2>
                    <div className="mt-4 grid gap-4 text-[13.5px] sm:grid-cols-[1.4fr_1fr_1fr_1fr]">
                      <div>
                        <div className="flex items-baseline justify-between">
                          <span className="text-ink-3">Executado</span>
                          <span className="display tnum text-[18px] font-semibold text-ink">{pct(o.fisico, 0)}</span>
                        </div>
                        <div className="mt-1.5">
                          <BarraPct valor={o.fisico} previsto={o.previstoRef} tone={o.situacao === "ATRASADA" || o.situacao === "PARALISADA" ? "bad" : "brand"} />
                        </div>
                        <div className="tnum mt-1 text-[12.5px] text-ink-3">previsto até agora: {pct(o.previstoRef, 0)}</div>
                      </div>
                      <div>
                        <div className="text-ink-3">Valor</div>
                        <div className="tnum font-semibold text-ink">{fmtMoeda(c.fin.valorAtual)}</div>
                      </div>
                      <div>
                        <div className="text-ink-3">Empresa</div>
                        <div className="font-medium text-ink">{c.empresa.nomeFantasia ?? c.empresa.razaoSocial}</div>
                      </div>
                      <div>
                        <div className="text-ink-3">Término previsto</div>
                        <div className="tnum font-medium text-ink">{fmtData(c.obraPrevisaoFim ? dataLocal(c.obraPrevisaoFim) : null)}</div>
                      </div>
                    </div>
                    {c.obraMotivo && (o.situacao === "ATRASADA" || o.situacao === "PARALISADA") && (
                      <p className="mt-4 rounded-lg bg-warn-soft px-3 py-2 text-[13.5px] text-ink">
                        <strong className="font-semibold">Por que atrasou:</strong> {c.obraMotivo}
                      </p>
                    )}
                    <span className="mt-4 inline-flex items-center gap-1 text-[13.5px] font-semibold text-brand">
                      Ver cronograma e medições <ArrowRight size={14} />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-8 max-w-3xl text-[13px] text-ink-3">
          Percentual executado = soma das medições conferidas pelo fiscal, ponderada pelo valor de cada etapa do cronograma. Dados de demonstração: valores e
          percentuais não representam obras reais.
        </p>
      </div>
    </main>
  );
}

function Resumo({ valor, rotulo }: { valor: string; rotulo: string }) {
  return (
    <div className="panel px-5 py-4">
      <div className="display tnum text-[24px] font-semibold text-ink">{valor}</div>
      <div className="text-[13.5px] text-ink-2">{rotulo}</div>
    </div>
  );
}

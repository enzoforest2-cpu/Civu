import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin } from "lucide-react";
import { db } from "@/db";
import { fmtData, fmtMoeda } from "@/lib/dates";
import { fmtCnpj } from "@/lib/pagamentos";
import { obrasPublicas } from "@/modulos/contratos/dados";
import { dataLocal, rotuloMes } from "@/modulos/contratos/regras";
import { BarraPct, ChipObra, CurvaS, pct } from "@/modulos/contratos/componentes";
import { CabecalhoPublico } from "../cabecalho";

export const dynamic = "force-dynamic";

export default async function ObraPublicaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const base = await db.query.contratos.findFirst({ where: (c, { eq }) => eq(c.id, id), with: { municipio: true } });
  if (!base) notFound();
  const c = (await obrasPublicas(base.municipioId)).find((x) => x.id === id);
  if (!c) notFound();
  const o = c.obra!;
  const medido = c.medicoes.reduce((s, m) => s + Number(m.valor), 0);
  const dl = (d: string | null) => fmtData(d ? dataLocal(d) : null);

  return (
    <main className="min-h-screen bg-bg">
      <CabecalhoPublico slug={base.municipio.slug} />
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <Link href={`/obras?m=${base.municipio.slug}`} className="mb-4 inline-flex items-center gap-1.5 text-[13.5px] font-medium text-ink-2 hover:text-ink">
          <ArrowLeft size={15} /> Obras de {base.municipio.nome}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <ChipObra s={o.situacao} />
          <span className="flex items-center gap-1 text-[13.5px] text-ink-2">
            <MapPin size={14} /> {c.obraLocal}
          </span>
        </div>
        <h1 className="display mt-2 text-[28px] leading-[1.15] font-semibold text-ink sm:text-[34px]">{c.objeto}</h1>

        {c.obraMotivo && (o.situacao === "ATRASADA" || o.situacao === "PARALISADA") && (
          <div className="mt-5 rounded-xl border border-warn/30 bg-warn-soft px-5 py-4 text-[14.5px] text-ink">
            <strong className="font-semibold">{o.situacao === "PARALISADA" ? "Por que a obra está parada" : "Por que a obra está atrasada"}:</strong> {c.obraMotivo}
          </div>
        )}

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Bloco rotulo="Executado" valor={pct(o.fisico, 0)} />
          <Bloco rotulo={`Previsto até ${o.refMes ? rotuloMes(o.refMes) : "agora"}`} valor={pct(o.previstoRef, 0)} />
          <Bloco rotulo="Valor contratado" valor={fmtMoeda(c.fin.valorAtual)} />
          <Bloco rotulo="Já medido" valor={fmtMoeda(medido)} />
        </div>

        <section className="panel mt-6 p-6">
          <h2 className="mb-3 text-[16px] font-semibold text-ink">Previsto × realizado</h2>
          <CurvaS obra={o} />
        </section>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <section className="panel p-6">
            <h2 className="mb-3 text-[16px] font-semibold text-ink">Etapas</h2>
            <ul className="space-y-4">
              {o.porEtapa.map((e) => (
                <li key={e.id}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2 text-[14px]">
                    <span className="font-medium text-ink">{e.nome}</span>
                    <span className="tnum text-ink-2">
                      {pct(e.executado, 0)} de 100% · previsto {pct(e.previstoAteRef, 0)}
                    </span>
                  </div>
                  <div className="mt-1.5">
                    <BarraPct valor={e.executado} previsto={e.previstoAteRef} tone={e.previstoAteRef - e.executado > 10 ? "bad" : "brand"} />
                  </div>
                </li>
              ))}
            </ul>
          </section>
          <section className="panel p-6">
            <h2 className="mb-3 text-[16px] font-semibold text-ink">Contrato</h2>
            <dl className="space-y-3 text-[14px]">
              <div>
                <dt className="text-[12.5px] text-ink-3">Empresa</dt>
                <dd className="font-medium text-ink">{c.empresa.razaoSocial}</dd>
                <dd className="tnum text-[13px] text-ink-2">CNPJ {fmtCnpj(c.empresa.cnpj)}</dd>
              </div>
              <div>
                <dt className="text-[12.5px] text-ink-3">Contrato</dt>
                <dd className="tnum text-ink">{c.rotulo}</dd>
              </div>
              <div>
                <dt className="text-[12.5px] text-ink-3">Início</dt>
                <dd className="tnum text-ink">{dl(c.obraInicio)}</dd>
              </div>
              <div>
                <dt className="text-[12.5px] text-ink-3">Término previsto</dt>
                <dd className="tnum text-ink">{dl(c.obraPrevisaoFim)}</dd>
              </div>
              <div>
                <dt className="text-[12.5px] text-ink-3">Medições</dt>
                <dd className="text-ink">
                  {c.medicoes.length} {c.medicoes.length === 1 ? "medição" : "medições"}
                  {c.medicoes.length > 0 && `, a última em ${rotuloMes(c.medicoes[c.medicoes.length - 1].competencia)}`}
                </dd>
              </div>
            </dl>
          </section>
        </div>
        <p className="mt-8 max-w-3xl text-[13px] text-ink-3">
          Dados de demonstração: valores e percentuais não representam obras reais. Fotos e localização no mapa entram com o aplicativo de fiscalização em campo.
        </p>
      </div>
    </main>
  );
}

function Bloco({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="panel px-4 py-3.5">
      <div className="text-[12.5px] text-ink-3">{rotulo}</div>
      <div className="display tnum mt-0.5 text-[20px] font-semibold text-ink">{valor}</div>
    </div>
  );
}

/* eslint-disable react-hooks/purity -- painel depende do dia; renderizado a cada requisição */
import Link from "next/link";
import { and, count, eq, inArray } from "drizzle-orm";
import { ArrowUpRight } from "lucide-react";
import { db } from "@/db";
import { tribItbi } from "@/db/schema";
import { arrecadacao, inadimplencia, listarDividaAtiva, listarInscricoes, maioresDevedores, requireTributos, situacaoLicenca } from "@/modulos/tributos/dados";
import { Numero, Progresso, moedaCurta } from "@/modulos/tributos/componentes";
import { TRIBUTO_NOME, mascararDocumento } from "@/modulos/tributos/regras";
import { fmtMoeda } from "@/lib/dates";
import { Chip, Panel } from "@/components/ui";

const pct = (x: number) => `${(x * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

export default async function TributosPainel() {
  const u = await requireTributos();
  const ano = new Date().getFullYear();
  const [arr, inad, devedores, da, [{ fila }], inscricoes] = await Promise.all([
    arrecadacao(u.municipioId, ano),
    inadimplencia(u.municipioId, ano),
    maioresDevedores(u.municipioId, 10),
    listarDividaAtiva(u.municipioId, {}),
    db
      .select({ fila: count() })
      .from(tribItbi)
      .where(and(eq(tribItbi.municipioId, u.municipioId), inArray(tribItbi.situacao, ["EM_AVALIACAO", "CONTESTADO"]))),
    listarInscricoes(u.municipioId),
  ]);
  const previsto = arr.reduce((a, x) => a + x.previsto, 0);
  const arrecadado = arr.reduce((a, x) => a + x.arrecadado, 0);
  const inicio = new Date(ano, 0, 1).getTime();
  const decorrido = (Date.now() - inicio) / (new Date(ano + 1, 0, 1).getTime() - inicio);
  const iptu = inad.find((x) => x.tributo === "IPTU");
  const totInad = inad.reduce((a, x) => ({ vencido: a.vencido + x.vencido, aberto: a.aberto + x.aberto }), { vencido: 0, aberto: 0 });
  const estoque = da.filter((d) => d.situacao === "ATIVA" || d.situacao === "AJUIZADA");
  const estoqueValor = estoque.reduce((a, d) => a + d.atual.total, 0);
  const alvaras = inscricoes.map((i) => i.licencas.find((l) => l.tipo === "LOCALIZACAO_FUNCIONAMENTO")).map((l) => (l ? situacaoLicenca(l.validaAte, l.situacao) : null));
  const vencidos = alvaras.filter((s) => !s || s.dias < 0).length;
  const vencendo = alvaras.filter((s) => s && s.dias >= 0 && s.dias <= 30).length;

  return (
    <>
      <section className="mb-9">
        <p className="text-[15px] text-ink-2">Tributos · exercício {ano}</p>
        <h1 className="display mt-1 max-w-4xl text-[30px] leading-[1.1] font-semibold text-ink sm:text-[38px]">
          {moedaCurta(arrecadado)} arrecadados, {pct(previsto ? arrecadado / previsto : 0)} do previsto para o ano
          <span className="text-ink-3"> — com {pct(decorrido)} do ano decorrido.</span>
        </h1>
      </section>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Numero
          rotulo="Inadimplência do IPTU"
          valor={iptu ? pct(iptu.taxa) : "—"}
          tone={iptu && iptu.taxa > 0.1 ? "bad" : iptu && iptu.taxa > 0.05 ? "warn" : undefined}
          sub={iptu ? `${fmtMoeda(iptu.aberto)} vencidos e não pagos em ${iptu.contribuintes} lançamentos` : undefined}
        />
        <Numero rotulo="Dívida ativa (atualizada)" valor={moedaCurta(estoqueValor)} sub={`${estoque.length} inscrições em aberto ou em cobrança judicial`} />
        <Numero rotulo="ITBI esperando avaliação" valor={fila} tone={fila > 5 ? "warn" : undefined} sub={<Link href="/tributos/itbi" className="font-semibold text-brand-2 hover:underline">Abrir a fila</Link>} />
        <Numero rotulo="Alvarás" valor={`${vencidos} vencidos`} tone={vencidos ? "bad" : undefined} sub={`${vencendo} vencem nos próximos 30 dias · ${inscricoes.length} inscrições`} />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <Panel title="Arrecadado × previsto na LOA" action={<span className="text-[12.5px] text-ink-3">Recebido no ano, por tributo</span>}>
          <ul className="space-y-5">
            {arr.map((x) => {
              const p = x.previsto ? x.arrecadado / x.previsto : 0;
              const atrasado = p < decorrido - 0.1;
              return (
                <li key={x.tributo}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-[14px]">
                    <span className="font-semibold text-ink">{TRIBUTO_NOME[x.tributo === "PARCELAMENTO" ? "DIVIDA_ATIVA" : x.tributo]}</span>
                    <span className="tnum text-ink-2">
                      <span className="font-semibold text-ink">{fmtMoeda(x.arrecadado)}</span> de {fmtMoeda(x.previsto)}
                      <span className={`ml-2 font-semibold ${atrasado ? "text-warn" : "text-ok"}`}>{pct(p)}</span>
                    </span>
                  </div>
                  <div className="relative mt-1.5">
                    <Progresso valor={x.arrecadado} total={x.previsto} tone={atrasado ? "warn" : "brand"} />
                    <div className="absolute -top-1 h-[18px] w-0.5 rounded bg-ink/50" style={{ left: `${Math.min(100, decorrido * 100)}%` }} title="Proporção do ano decorrida" />
                  </div>
                  {x.lancado > 0 && x.tributo !== "PARCELAMENTO" && (
                    <div className="mt-1 text-[12px] text-ink-3">
                      Lançado no exercício: {fmtMoeda(x.lancado)}
                      {x.tributo === "ISS" && " · só regime normal; MEI e Simples recolhem no DAS"}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="mt-5 border-t border-line pt-3 text-[12.5px] leading-snug text-ink-3">
            O traço vertical marca a parte do ano já decorrida. A comparação é com a previsão da LOA; previsão não é receita realizada e a sazonalidade (cota única em março, ITBI irregular) pesa no ritmo.
          </p>
        </Panel>

        <div className="space-y-6">
          <Panel title="Inadimplência do exercício">
            <ul className="divide-y divide-line">
              {inad
                .filter((x) => x.vencido > 0)
                .map((x) => (
                  <li key={x.tributo} className="py-3">
                    <div className="flex items-baseline justify-between gap-3 text-[14px]">
                      <span className="font-medium text-ink">{TRIBUTO_NOME[x.tributo] ?? x.tributo}</span>
                      <span className={`tnum font-semibold ${x.taxa > 0.1 ? "text-bad" : x.taxa > 0.05 ? "text-warn" : "text-ink"}`}>{pct(x.taxa)}</span>
                    </div>
                    <div className="tnum text-[12.5px] text-ink-3">
                      {fmtMoeda(x.aberto)} não pagos de {fmtMoeda(x.vencido)} vencidos
                    </div>
                  </li>
                ))}
              <li className="flex items-baseline justify-between gap-3 py-3 text-[14px] font-semibold">
                <span>Total</span>
                <span className="tnum">{pct(totInad.vencido ? totInad.aberto / totInad.vencido : 0)}</span>
              </li>
            </ul>
            <p className="mt-1 text-[12.5px] text-ink-3">Parte do valor com vencimento já passado que ainda não foi paga. A cota única vencida não entra: o débito segue pelas parcelas.</p>
          </Panel>
        </div>
      </div>

      <Panel
        title="Maiores devedores"
        className="mt-6"
        action={
          <Link href="/tributos/divida-ativa" className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand-2 hover:underline">
            Dívida ativa <ArrowUpRight size={14} />
          </Link>
        }
        pad={false}
      >
        <div className="overflow-x-auto px-2 pb-3">
          <table className="lista min-w-[640px]">
            <thead>
              <tr>
                <th>#</th>
                <th>Contribuinte</th>
                <th>CPF/CNPJ</th>
                <th className="text-right">Dívida ativa</th>
                <th className="text-right">Vencido no exercício</th>
                <th className="text-right">Total atualizado</th>
              </tr>
            </thead>
            <tbody>
              {devedores.map((d, i) => (
                <tr key={d.documento}>
                  <td className="tnum text-ink-3">{i + 1}</td>
                  <td>
                    <span className="font-medium text-ink">{d.nome}</span> {d.tipo === "EMPRESA" && <Chip>Empresa</Chip>}
                  </td>
                  <td className="tnum text-ink-2">{mascararDocumento(d.documento)}</td>
                  <td className="tnum text-right">{d.divida ? fmtMoeda(d.divida) : "—"}</td>
                  <td className="tnum text-right">{d.vencido ? fmtMoeda(d.vencido) : "—"}</td>
                  <td className="tnum text-right font-semibold">{fmtMoeda(d.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-4 pt-2 text-[12.5px] text-ink-3">CPF e CNPJ mascarados nesta visão. Valores com correção, multa e juros de demonstração calculados até hoje.</p>
        </div>
      </Panel>
    </>
  );
}

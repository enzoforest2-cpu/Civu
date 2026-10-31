import { requireUser } from "@/lib/auth";
import { fmtMoeda } from "@/lib/dates";
import { Cabecalho, Chip, Panel } from "@/components/ui";
import { anoCorrente, indices } from "@/modulos/financas/dados";
import { AbasFinancas, ReguaIndice, SemAcesso, podeVerFinancas } from "@/modulos/financas/ui";
import { MESES_LONGOS, fmtPct } from "@/modulos/financas/classificacao";

export const dynamic = "force-dynamic";

export default async function IndicesPage() {
  const u = await requireUser();
  if (!podeVerFinancas(u)) return <SemAcesso />;
  const ano = anoCorrente();
  const idx = await indices(u.municipioId, ano);
  const mes = MESES_LONGOS[idx.meses - 1];

  return (
    <>
      <Cabecalho
        titulo="Índices legais"
        sub={`Mínimos constitucionais de saúde e educação, FUNDEB e limite de despesa com pessoal: o realizado de janeiro a ${mes} e a projeção para 31/12.`}
      />
      <AbasFinancas atual="/financas/indices" />

      <div className="grid gap-6 lg:grid-cols-2">
        {idx.lista.map((i) => {
          const max = i.maximo != null;
          const escala = max ? 60 : i.chave === "fundeb70" ? 100 : Math.max(40, Math.ceil(((i.projetado ?? 0) + 8) / 5) * 5);
          const marcas = max
            ? [
                { v: i.alerta!, rotulo: "alerta", cor: "var(--color-warn)" },
                { v: i.prudencial!, rotulo: "prud.", cor: "#e2551b" },
                { v: i.maximo!, rotulo: "limite", cor: "var(--color-bad)" },
              ]
            : [{ v: i.minimo!, rotulo: "mínimo", cor: "var(--color-bad)" }];
          return (
            <Panel key={i.chave} className={i.situacao === "risco" ? "border-red-200" : ""}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-[16px] font-semibold text-ink">{i.titulo}</h2>
                  <div className="text-[13px] text-ink-3">{max ? `Limite ${fmtPct(i.maximo, 0)} da RCL` : `Mínimo ${fmtPct(i.minimo, 0)}`}</div>
                </div>
                <Chip tone={i.situacao === "ok" ? "ok" : i.situacao === "risco" ? "bad" : "warn"}>
                  {i.situacao === "ok" ? "Dentro da regra" : i.situacao === "risco" ? "Risco" : "Atenção"}
                </Chip>
              </div>
              <div className="mt-4 flex flex-wrap gap-x-8 gap-y-2">
                <div>
                  <div className="text-[12.5px] text-ink-3">Realizado até {mes}</div>
                  <div className="display tnum text-[30px] leading-tight font-semibold text-ink">{fmtPct(i.realizado)}</div>
                </div>
                <div>
                  <div className="text-[12.5px] text-ink-3">Projeção para 31/12</div>
                  <div className={`display tnum text-[30px] leading-tight font-semibold ${i.situacao === "risco" ? "text-bad" : "text-ink-2"}`}>{fmtPct(i.projetado)}</div>
                </div>
              </div>
              <ReguaIndice realizado={i.realizado} projetado={i.projetado} marcas={marcas} escalaMax={escala} escalaMin={max ? 40 : 0} tipo={max ? "maximo" : "minimo"} />
              {max && (
                <div className="-mt-3 mb-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-3">
                  <span>escala de 40% a 60%</span>
                  <span>alerta {fmtPct(i.alerta)}</span>
                  <span>prudencial {fmtPct(i.prudencial)}</span>
                  <span>limite {fmtPct(i.maximo, 0)}</span>
                </div>
              )}
              <p className="text-[14px] text-ink">{i.mensagem}</p>
              <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-sunken p-3 text-[13px]">
                <div>
                  <dt className="text-ink-3">Aplicado até agora</dt>
                  <dd className="tnum font-semibold">{fmtMoeda(i.numerador)}</dd>
                </div>
                <div>
                  <dt className="text-ink-3">Base até agora</dt>
                  <dd className="tnum font-semibold">{fmtMoeda(i.denominador)}</dd>
                </div>
                <div>
                  <dt className="text-ink-3">Aplicado projetado</dt>
                  <dd className="tnum">{fmtMoeda(i.numeradorProj)}</dd>
                </div>
                <div>
                  <dt className="text-ink-3">Base projetada</dt>
                  <dd className="tnum">{fmtMoeda(i.denominadorProj)}</dd>
                </div>
              </dl>
              <details className="mt-3 text-[13px] text-ink-2">
                <summary className="font-semibold text-brand-2">Como é calculado</summary>
                <p className="mt-2">{i.base}</p>
                <p className="mt-1">
                  <strong className="text-ink">Projeção (estimativa):</strong> {i.comoProjetado}
                </p>
              </details>
            </Panel>
          );
        })}
      </div>
      <p className="mt-6 max-w-3xl text-[14px] text-ink-3">
        Acompanhamento gerencial com base na despesa liquidada. Os demonstrativos oficiais (RREO, RGF, SIOPS e SIOPE) são gerados pelo sistema contábil e seguem as
        regras do Manual de Demonstrativos Fiscais da STN, inclusive restos a pagar e os últimos 12 meses no caso da despesa com pessoal.
      </p>
    </>
  );
}

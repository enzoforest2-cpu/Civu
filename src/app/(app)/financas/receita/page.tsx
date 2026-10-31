import { requireUser } from "@/lib/auth";
import { fmtMoeda } from "@/lib/dates";
import { Cabecalho, Chip, Panel } from "@/components/ui";
import { anoCorrente, fmtIso, receita } from "@/modulos/financas/dados";
import { AbasFinancas, GraficoMensal, Kpi, SemAcesso, podeVerFinancas } from "@/modulos/financas/ui";
import { MESES, MESES_LONGOS, fmtCompacto, fmtPct } from "@/modulos/financas/classificacao";

export const dynamic = "force-dynamic";

export default async function ReceitaPage({ searchParams }: { searchParams: Promise<{ cat?: string }> }) {
  const u = await requireUser();
  if (!podeVerFinancas(u)) return <SemAcesso />;
  const sp = await searchParams;
  const ano = anoCorrente();
  const rec = await receita(u.municipioId, ano);
  const t = rec.totais;
  const mes = MESES_LONGOS[rec.mesesDecorridos - 1] ?? "";
  const cat = rec.categorias.find((c) => c.categoria === sp.cat);
  const serie = cat ? cat.meses : rec.porMes;
  const grupos = [
    { titulo: "Receitas próprias", itens: rec.categorias.filter((c) => c.origem === "Própria") },
    { titulo: "Transferências", itens: rec.categorias.filter((c) => c.origem === "Transferência") },
  ];
  const tom = (d: number | null) => (d == null ? "neutral" : d < 0.9 ? "bad" : d < 0.97 ? "warn" : "ok");

  return (
    <>
      <Cabecalho titulo="Receita" sub={`Previsão da LOA, desdobrada mês a mês, comparada com o que foi arrecadado até ${fmtIso(rec.hoje)}.`} />
      <AbasFinancas atual="/financas/receita" />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi rotulo={`Previsto no ano`} valor={fmtCompacto(t.previstoAno)} sub="receita bruta da LOA" />
        <Kpi
          rotulo={`Arrecadado até ${mes}`}
          valor={fmtCompacto(t.arrecadado)}
          sub={`${fmtPct((t.arrecadado / t.previstoAte) * 100, 1)} de ${fmtCompacto(t.previstoAte)} previstos`}
          tom={t.arrecadado < t.previstoAte * 0.97 ? "warn" : undefined}
        />
        <Kpi rotulo="Receita corrente líquida" valor={fmtCompacto(t.rcl)} sub={`até ${mes} · base do limite de pessoal`} />
        <Kpi rotulo="Impostos e transferências" valor={fmtCompacto(t.impostos)} sub={`até ${mes} · base de saúde e educação`} />
      </div>

      <Panel
        title={cat ? `${cat.nome}: previsto × arrecadado por mês` : "Previsto × arrecadado por mês (todas as receitas)"}
        className="mb-6"
        action={
          <div className="flex items-center gap-3 text-[12.5px] text-ink-3">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-line-2" /> Previsto
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-brand" /> Arrecadado
            </span>
            <span className="hidden items-center gap-1.5 sm:inline-flex">
              <span className="h-2.5 w-2.5 rounded-sm bg-warn" /> Abaixo de 90%
            </span>
          </div>
        }
      >
        <GraficoMensal dados={serie} />
        <form method="get" className="mt-3 flex flex-wrap items-center gap-2">
          <label htmlFor="cat" className="text-[13px] text-ink-2">
            Ver uma receita:
          </label>
          <select id="cat" name="cat" defaultValue={sp.cat ?? ""} className="input !w-auto !py-1.5">
            <option value="">Todas</option>
            {rec.categorias.map((c) => (
              <option key={c.categoria} value={c.categoria}>
                {c.nome}
              </option>
            ))}
          </select>
          <button className="btn btn-quiet !py-1.5">Mostrar</button>
        </form>
      </Panel>

      <div className="space-y-6">
        {grupos.map((g) => (
          <Panel key={g.titulo} title={g.titulo} pad={false}>
            <div className="overflow-x-auto">
              <table className="lista">
                <thead>
                  <tr>
                    <th>Receita</th>
                    <th className="text-right">Previsto no ano</th>
                    <th className="text-right">Previsto até {MESES[rec.mesesDecorridos - 1]}</th>
                    <th className="text-right">Arrecadado</th>
                    <th className="text-right">Desempenho</th>
                    <th className="text-right">Falta no ano</th>
                  </tr>
                </thead>
                <tbody>
                  {g.itens.map((c) => (
                    <tr key={c.categoria} className="linha">
                      <td className="min-w-[220px]">
                        <a href={`?cat=${c.categoria}`} className="font-medium text-ink hover:text-brand-2 hover:underline">
                          {c.nome}
                        </a>
                        <div className="text-[12.5px] text-ink-3">
                          {c.simples}
                          {c.deducaoFundeb && " · 20% retidos para o FUNDEB"}
                        </div>
                      </td>
                      <td className="tnum text-right whitespace-nowrap">{fmtMoeda(c.previstoAno)}</td>
                      <td className="tnum text-right whitespace-nowrap">{fmtMoeda(c.previstoAte)}</td>
                      <td className="tnum text-right font-semibold whitespace-nowrap">{fmtMoeda(c.arrecadado)}</td>
                      <td className="text-right">
                        <Chip tone={tom(c.desempenho)}>{c.desempenho == null ? "—" : fmtPct(c.desempenho * 100, 0)}</Chip>
                      </td>
                      <td className="tnum text-right whitespace-nowrap text-ink-2">{fmtMoeda(Math.max(0, c.previstoAno - c.arrecadado))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        ))}
      </div>

      <Panel title="Da receita bruta à receita corrente líquida" className="mt-6">
        <dl className="max-w-xl space-y-2 text-[14px]">
          <div className="flex justify-between gap-4">
            <dt className="text-ink-2">Receita arrecadada até {mes}</dt>
            <dd className="tnum font-semibold">{fmtMoeda(t.arrecadado)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-ink-2">(−) Receitas de capital (convênios para obras e equipamentos)</dt>
            <dd className="tnum">{fmtMoeda(rec.categorias.filter((c) => !c.corrente).reduce((s, c) => s + c.arrecadado, 0))}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-ink-2">(−) Dedução para formação do FUNDEB (20% de FPM, ICMS, IPVA e ITR)</dt>
            <dd className="tnum">{fmtMoeda(t.deducaoFundeb)}</dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-line pt-2">
            <dt className="font-semibold text-ink">Receita corrente líquida (simplificada)</dt>
            <dd className="tnum font-semibold">{fmtMoeda(t.rcl)}</dd>
          </div>
        </dl>
        <p className="mt-3 text-[13px] text-ink-3">
          Cálculo simplificado para acompanhamento. A RCL oficial (LRF, art. 2º) considera os últimos 12 meses e outras deduções, e é publicada no RREO pelo sistema
          contábil.
        </p>
      </Panel>
      <p className="mt-4 max-w-3xl text-[13px] text-ink-3">
        Demonstração: a arrecadação é simulada. Em produção, os valores chegam diariamente do sistema de tributos e dos extratos das transferências (Tesouro Nacional e
        Estado).
      </p>
    </>
  );
}

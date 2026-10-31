import Link from "next/link";
import { observatorio, requireTributos } from "@/modulos/tributos/dados";
import { Titulo } from "@/modulos/tributos/componentes";
import { fmtData, fmtMoeda } from "@/lib/dates";
import { Chip, Panel, type Tone } from "@/components/ui";

const COR_TRANSACAO = "#168779";
const COR_PLANTA = "#c7882f";
const CONF: Record<string, { rotulo: string; tone: Tone }> = {
  ADEQUADA: { rotulo: "Adequada", tone: "ok" },
  MODERADA: { rotulo: "Moderada", tone: "brand" },
  BAIXA: { rotulo: "Baixa", tone: "warn" },
  SEM_DADOS: { rotulo: "Sem dados", tone: "neutral" },
};
const reais = (v: number | null) => (v === null ? "—" : `R$\u00a0${Math.round(v).toLocaleString("pt-BR")}`);

export default async function Observatorio({ searchParams }: { searchParams: Promise<{ uso?: string }> }) {
  const u = await requireTributos();
  const sp = await searchParams;
  const uso = sp.uso === "COMERCIAL" ? "COMERCIAL" : "RESIDENCIAL";
  const { linhas, evolucao, total } = await observatorio(u.municipioId, uso);
  const comDados = linhas.filter((l) => l.n > 0);
  const max = Math.max(1, ...comDados.map((l) => Math.max(l.medianaM2 ?? 0, l.medianaPgvM2 ?? 0, l.faixa?.max ?? 0)));
  const geralRazao = comDados.length ? comDados.reduce((a, l) => a + (l.razao ?? 0) * l.n, 0) / comDados.reduce((a, l) => a + l.n, 0) : null;

  // gráfico de barras horizontais: duas barras por bairro
  const W = 720,
    rotuloW = 150,
    barH = 12,
    gap = 2,
    linhaH = 44,
    topo = 8;
  const H = topo + comDados.length * linhaH + 24;
  const x = (v: number) => rotuloW + (v / max) * (W - rotuloW - 70);
  const passo = max > 8000 ? 2000 : 1000;
  const ticks = Array.from({ length: Math.floor(max / passo) + 1 }, (_, i) => i * passo);

  // evolução trimestral
  const EW = 960,
    EH = 220,
    pad = 36;
  const emax = Math.max(1, ...evolucao.map((e) => e.mediana));
  const emin = Math.min(...evolucao.map((e) => e.mediana), emax) * 0.85;
  const ex = (i: number) => pad + (i * (EW - pad * 2)) / Math.max(1, evolucao.length - 1);
  const ey = (v: number) => EH - 28 - ((v - emin) / (emax - emin || 1)) * (EH - 50);

  return (
    <>
      <Titulo
        titulo="Observatório imobiliário"
        sub="Preço de transação (ITBI quitado nos últimos 24 meses) comparado ao valor da planta genérica, por bairro. Serve para planejar a revisão da planta e orientar a avaliação do ITBI — não fixa preço."
        acao={
          <nav className="flex gap-2" aria-label="Uso">
            {["RESIDENCIAL", "COMERCIAL"].map((k) => (
              <Link key={k} href={`?uso=${k}`} className={`rounded-full border px-4 py-1.5 text-[13.5px] font-semibold ${uso === k ? "border-brand-2 bg-brand-2 text-white" : "border-line-2 bg-surface text-ink-2 hover:bg-sunken"}`}>
                {k === "RESIDENCIAL" ? "Residencial" : "Comercial"}
              </Link>
            ))}
          </nav>
        }
      />

      <section className="mb-6 grid gap-4 md:grid-cols-[1.2fr_1fr]">
        <div className="panel p-6">
          <div className="text-[13px] font-medium text-ink-3">Defasagem da planta</div>
          <p className="display mt-1 text-[24px] leading-tight font-semibold text-ink">
            {geralRazao ? (
              <>
                Na média ponderada, a planta vale <span className="text-warn">{Math.round(geralRazao * 100)}%</span> do preço de transação por m².
              </>
            ) : (
              "Sem transações suficientes para comparar."
            )}
          </p>
          <p className="mt-2 text-[13.5px] text-ink-2">
            {total} transações quitadas · {comDados.length} de {linhas.length} bairros com dados. Bairros com menos de 5 transações não sustentam conclusão.
          </p>
        </div>
        <div className="panel p-6 text-[13px] leading-snug text-ink-2">
          <div className="mb-2 font-semibold text-ink">Quatro informações que não se misturam</div>
          <ul className="space-y-1">
            <li>
              <strong className="font-semibold text-ink">Preço anunciado</strong>: oferta do vendedor; não entra aqui.
            </li>
            <li>
              <strong className="font-semibold text-ink">Preço de transação</strong>: base do ITBI quitado (esta página).
            </li>
            <li>
              <strong className="font-semibold text-ink">Avaliação individual</strong>: estimativa técnica com responsável.
            </li>
            <li>
              <strong className="font-semibold text-ink">Valor tributário</strong>: valor venal pela planta vigente.
            </li>
          </ul>
        </div>
      </section>

      <Panel
        title="R$ por m² construído: transação × planta"
        className="mb-6"
        action={
          <div className="flex flex-wrap gap-4 text-[12.5px] text-ink-2">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: COR_TRANSACAO }} /> Mediana de transação
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: COR_PLANTA }} /> Planta genérica (valor venal ÷ área)
            </span>
          </div>
        }
      >
        {comDados.length === 0 ? (
          <p className="text-[14px] text-ink-3">Nenhuma transação quitada deste uso nos últimos 24 meses.</p>
        ) : (
          <div className="overflow-x-auto">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[560px]" role="img" aria-label="Mediana do m² de transação e m² da planta por bairro">
              {ticks.map((t) => (
                <g key={t}>
                  <line x1={x(t)} x2={x(t)} y1={topo} y2={H - 22} stroke="var(--color-line)" />
                  <text x={x(t)} y={H - 6} textAnchor="middle" fontSize="11" fill="var(--color-ink-3)">
                    {t === 0 ? "0" : `${(t / 1000).toLocaleString("pt-BR")} mil`}
                  </text>
                </g>
              ))}
              {comDados.map((l, i) => {
                const y = topo + i * linhaH + 6;
                const baixa = l.n < 5;
                return (
                  <g key={l.bairro}>
                    <title>{`${l.bairro}: transação ${reais(l.medianaM2)}/m² (${l.n} negócios, de ${reais(l.faixa?.min ?? null)} a ${reais(l.faixa?.max ?? null)}); planta ${reais(l.medianaPgvM2)}/m²`}</title>
                    <rect x={0} y={y - 6} width={W} height={linhaH - 2} fill="transparent" />
                    <text x={rotuloW - 10} y={y + barH} textAnchor="end" fontSize="12.5" fill="var(--color-ink)" fontWeight={600}>
                      {l.bairro}
                    </text>
                    <text x={rotuloW - 10} y={y + barH + 14} textAnchor="end" fontSize="11" fill={baixa ? "var(--color-warn)" : "var(--color-ink-3)"}>
                      {l.n} {l.n === 1 ? "negócio" : "negócios"}
                      {baixa ? " · amostra baixa" : ""}
                    </text>
                    {l.faixa && <line x1={x(l.faixa.min)} x2={x(l.faixa.max)} y1={y + barH / 2} y2={y + barH / 2} stroke={COR_TRANSACAO} strokeOpacity={0.35} strokeWidth={2} />}
                    <rect x={rotuloW} y={y} width={Math.max(2, x(l.medianaM2 ?? 0) - rotuloW)} height={barH} rx={4} fill={COR_TRANSACAO} opacity={baixa ? 0.55 : 1} />
                    <text x={x(l.faixa?.max ?? l.medianaM2 ?? 0) + 6} y={y + barH - 2} fontSize="11.5" fill="var(--color-ink)" className="tnum">
                      {reais(l.medianaM2)}
                    </text>
                    <rect x={rotuloW} y={y + barH + gap} width={Math.max(2, x(l.medianaPgvM2 ?? 0) - rotuloW)} height={barH} rx={4} fill={COR_PLANTA} />
                    <text x={x(l.medianaPgvM2 ?? 0) + 6} y={y + barH * 2 + gap - 2} fontSize="11.5" fill="var(--color-ink-2)">
                      {reais(l.medianaPgvM2)}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        )}
        <p className="mt-2 text-[12.5px] text-ink-3">A linha fina mostra a faixa entre o menor e o maior m² negociado. Barras claras: menos de 5 negócios, sem confiança para conclusão.</p>
      </Panel>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
        <Panel title="Tabela por bairro" pad={false}>
          <div className="overflow-x-auto px-2 pb-3">
            <table className="lista min-w-[640px]">
              <thead>
                <tr>
                  <th>Bairro</th>
                  <th className="text-right">Negócios</th>
                  <th className="text-right">Transação m²</th>
                  <th className="text-right">Planta m²</th>
                  <th className="text-right">Planta / mercado</th>
                  <th className="text-right">Declarado abaixo</th>
                  <th>Confiança</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.bairro}>
                    <td>
                      <div className="font-medium">{l.bairro}</div>
                      {l.ultima && <div className="text-[12px] text-ink-3">último em {fmtData(l.ultima)}</div>}
                    </td>
                    <td className="tnum text-right">{l.n}</td>
                    <td className="tnum text-right">{reais(l.medianaM2)}</td>
                    <td className="tnum text-right">{reais(l.medianaPgvM2)}</td>
                    <td className="tnum text-right font-semibold">{l.razao ? `${Math.round(l.razao * 100)}%` : "—"}</td>
                    <td className="tnum text-right">{l.n ? `${l.subdeclaracao} de ${l.n}` : "—"}</td>
                    <td>
                      <Chip tone={CONF[l.confianca].tone}>{CONF[l.confianca].rotulo}</Chip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-4 pt-2 text-[12.5px] text-ink-3">
              “Declarado abaixo”: negócios em que o valor declarado ficou mais de 5% abaixo da base de cálculo final — divergência que merece análise, não prova de fraude. Volume total negociado:{" "}
              {fmtMoeda(linhas.reduce((a, l) => a + l.volume, 0))}.
            </p>
          </div>
        </Panel>

        <Panel title="Evolução da mediana (todos os bairros)">
          {evolucao.length < 2 ? (
            <p className="text-[14px] text-ink-3">Poucos períodos com dados.</p>
          ) : (
            <svg viewBox={`0 0 ${EW} ${EH}`} className="w-full" role="img" aria-label="Mediana trimestral do m² de transação">
              <line x1={pad} x2={EW - pad} y1={EH - 28} y2={EH - 28} stroke="var(--color-line)" />
              <polyline points={evolucao.map((e, i) => `${ex(i)},${ey(e.mediana)}`).join(" ")} fill="none" stroke={COR_TRANSACAO} strokeWidth={2} strokeLinejoin="round" />
              {evolucao.map((e, i) => (
                <g key={e.periodo}>
                  <title>{`${e.periodo.replace("-", " ")}: ${reais(e.mediana)}/m² em ${e.n} negócios`}</title>
                  <circle cx={ex(i)} cy={ey(e.mediana)} r={9} fill="transparent" />
                  <circle cx={ex(i)} cy={ey(e.mediana)} r={4} fill={COR_TRANSACAO} stroke="var(--color-surface)" strokeWidth={2} />
                  <text x={ex(i)} y={EH - 10} textAnchor="middle" fontSize="11" fill="var(--color-ink-3)">
                    {e.periodo.slice(2).replace("-T", " T")}
                  </text>
                  {(i === 0 || i === evolucao.length - 1) && (
                    <text x={ex(i)} y={ey(e.mediana) - 10} textAnchor={i === 0 ? "start" : "end"} fontSize="11.5" fill="var(--color-ink)">
                      {reais(e.mediana)}
                    </text>
                  )}
                </g>
              ))}
            </svg>
          )}
          <p className="mt-2 text-[12.5px] leading-snug text-ink-3">
            Mediana por trimestre, misturando bairros: mudanças podem refletir onde houve negócios, não só preço. O método deve ser validado com dados separados e revisão profissional antes de qualquer uso tributário.
          </p>
        </Panel>
      </div>
    </>
  );
}

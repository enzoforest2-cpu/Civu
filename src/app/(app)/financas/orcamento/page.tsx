import Link from "next/link";
import { Search } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { fmtMoeda } from "@/lib/dates";
import { Cabecalho, Chip, Panel, Vazio } from "@/components/ui";
import { anoCorrente, execucao, fmtIso } from "@/modulos/financas/dados";
import { AbasFinancas, BarraExecucao, Classificacao, LegendaExecucao, SemAcesso, podeVerFinancas } from "@/modulos/financas/ui";
import { FONTES_DETALHE, FUNCOES, NATUREZAS_DESPESA, TIPOS_CREDITO, fmtCompacto, fmtPct } from "@/modulos/financas/classificacao";

export const dynamic = "force-dynamic";

type SP = { ug?: string; funcao?: string; fonte?: string; q?: string; saldo?: string };

export default async function OrcamentoPage({ searchParams }: { searchParams: Promise<SP> }) {
  const u = await requireUser();
  if (!podeVerFinancas(u)) return <SemAcesso />;
  const sp = await searchParams;
  const ano = anoCorrente();
  const ex = await execucao(u.municipioId, ano);
  const q = (sp.q ?? "").toLowerCase();
  const lista = ex.dotacoes.filter(
    (d) =>
      (!sp.ug || d.unidadeGestoraId === sp.ug) &&
      (!sp.funcao || d.funcao === sp.funcao) &&
      (!sp.fonte || d.fonte === sp.fonte) &&
      (!q || `${d.acaoNome} ${d.programaNome} ${d.unidadeNome} ${d.natureza} ${NATUREZAS_DESPESA[d.natureza] ?? ""}`.toLowerCase().includes(q)) &&
      (sp.saldo !== "baixo" || (d.atualizado > 50000 && d.disponivel / d.atualizado < 0.03 && !d.natureza.startsWith("3.1."))),
  );
  const filtrado = lista.length !== ex.dotacoes.length;
  const soma = (k: "valorInicial" | "atualizado" | "empenhado" | "liquidado" | "pago" | "disponivel" | "reservado") => lista.reduce((s, d) => s + d[k], 0);
  const unidades = [...new Set(lista.map((d) => d.unidade))];
  const funcoes = [...new Set(ex.dotacoes.map((d) => d.funcao))].sort();
  const fontes = [...new Set(ex.dotacoes.map((d) => d.fonte))].sort();
  const creditos = ex.dotacoes
    .flatMap((d) => d.creditosLista.map((c) => ({ ...c, d })))
    .sort((a, b) => b.decretoData.localeCompare(a.decretoData));

  return (
    <>
      <Cabecalho
        titulo="Orçamento"
        sub={`Lei Orçamentária Anual de ${ano} por dotação: quanto foi autorizado, quanto já foi comprometido (empenhado), entregue (liquidado) e pago.`}
      />
      <AbasFinancas atual="/financas/orcamento" />

      <form method="get" className="panel mb-6 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr_auto]">
        <div className="relative">
          <label className="label" htmlFor="q">
            Buscar
          </label>
          <Search size={16} className="pointer-events-none absolute bottom-3.5 left-3 text-ink-3" />
          <input id="q" name="q" defaultValue={sp.q} className="input !pl-9" placeholder="Ação, programa ou natureza" />
        </div>
        <div>
          <label className="label" htmlFor="ug">
            Unidade gestora
          </label>
          <select id="ug" name="ug" className="input" defaultValue={sp.ug ?? ""}>
            <option value="">Todas</option>
            {ex.ugs.map((g) => (
              <option key={g.id} value={g.id}>
                {g.codigo} · {g.nome}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="funcao">
            Função
          </label>
          <select id="funcao" name="funcao" className="input" defaultValue={sp.funcao ?? ""}>
            <option value="">Todas</option>
            {funcoes.map((f) => (
              <option key={f} value={f}>
                {f} · {FUNCOES[f]?.nome ?? f}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="fonte">
            Fonte
          </label>
          <select id="fonte" name="fonte" className="input" defaultValue={sp.fonte ?? ""}>
            <option value="">Todas</option>
            {fontes.map((f) => (
              <option key={f} value={f}>
                {f} · {FONTES_DETALHE[f]?.nome ?? f}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end gap-2">
          <button className="btn btn-primary">Filtrar</button>
          {(filtrado || sp.saldo) && (
            <Link href="/financas/orcamento" className="btn btn-quiet">
              Limpar
            </Link>
          )}
        </div>
        {sp.saldo === "baixo" && <input type="hidden" name="saldo" value="baixo" />}
      </form>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {(
          [
            ["Inicial (LOA)", soma("valorInicial")],
            ["Atualizado", soma("atualizado")],
            ["Empenhado", soma("empenhado")],
            ["Liquidado", soma("liquidado")],
            ["Pago", soma("pago")],
            ["Disponível", soma("disponivel")],
          ] as const
        ).map(([r, v]) => (
          <div key={r} className="rounded-xl bg-sunken px-4 py-3">
            <div className="text-[12px] font-medium text-ink-3">{r}</div>
            <div className="display tnum text-[17px] font-semibold text-ink">{fmtCompacto(v)}</div>
          </div>
        ))}
      </div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <LegendaExecucao reservado />
        <div className="flex gap-2 text-[13px]">
          {sp.saldo === "baixo" ? (
            <Chip tone="warn">Mostrando dotações com menos de 3% de saldo</Chip>
          ) : (
            <Link href="/financas/orcamento?saldo=baixo" className="font-semibold text-brand-2 hover:underline">
              Ver dotações quase esgotadas
            </Link>
          )}
        </div>
      </div>

      {lista.length === 0 ? (
        <Vazio>Nenhuma dotação com esses filtros.</Vazio>
      ) : (
        <div className="space-y-5">
          {unidades.map((un) => {
            const ds = lista.filter((d) => d.unidade === un);
            const at = ds.reduce((s, d) => s + d.atualizado, 0);
            const em = ds.reduce((s, d) => s + d.empenhado, 0);
            return (
              <Panel key={un} pad={false}>
                <header className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-4 pb-2">
                  <h2 className="font-semibold text-ink">
                    <span className="tnum text-ink-3">{un}</span> {ds[0].unidadeNome}
                    <span className="ml-2 text-[12.5px] font-normal text-ink-3">UG {ds[0].ug?.codigo} · {ds[0].ug?.nome}</span>
                  </h2>
                  <span className="tnum text-[13px] text-ink-2">
                    {fmtCompacto(em)} empenhados de {fmtCompacto(at)} ({fmtPct(at ? (em / at) * 100 : 0, 0)})
                  </span>
                </header>
                <div className="overflow-x-auto">
                  <table className="lista">
                    <thead>
                      <tr>
                        <th>Dotação</th>
                        <th className="text-right">Atualizado</th>
                        <th className="text-right">Empenhado</th>
                        <th className="text-right">Pago</th>
                        <th className="text-right">Disponível</th>
                        <th className="w-[140px]">Execução</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ds.map((d) => (
                        <tr key={d.id} className="linha">
                          <td className="min-w-[280px]">
                            <Link href={`/financas/orcamento/${d.id}`} className="font-medium text-ink hover:text-brand-2 hover:underline">
                              {d.acaoNome}
                            </Link>
                            <div className="text-[12.5px] text-ink-2">
                              {NATUREZAS_DESPESA[d.natureza] ?? d.natureza} · {FONTES_DETALHE[d.fonte]?.nome ?? d.fonte}
                            </div>
                            <Classificacao d={d} />
                          </td>
                          <td className="tnum text-right whitespace-nowrap">
                            {fmtMoeda(d.atualizado)}
                            {d.creditos - d.reducoes !== 0 && (
                              <div className="text-[12px] text-ink-3">
                                {d.creditos - d.reducoes > 0 ? "+" : "−"}
                                {fmtCompacto(Math.abs(d.creditos - d.reducoes))} créditos
                              </div>
                            )}
                          </td>
                          <td className="tnum text-right whitespace-nowrap">
                            {fmtMoeda(d.empenhado)}
                            {d.reservado > 0 && <div className="text-[12px] text-warn">{fmtCompacto(d.reservado)} reservado</div>}
                          </td>
                          <td className="tnum text-right whitespace-nowrap">{fmtMoeda(d.pago)}</td>
                          <td className={`tnum text-right font-semibold whitespace-nowrap ${d.atualizado > 0 && d.disponivel / d.atualizado < 0.03 && !d.natureza.startsWith("3.1.") ? "text-warn" : "text-ink"}`}>
                            {fmtMoeda(d.disponivel)}
                          </td>
                          <td>
                            <BarraExecucao autorizado={d.atualizado} empenhado={d.empenhado} liquidado={d.liquidado} pago={d.pago} reservado={d.reservado} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            );
          })}
        </div>
      )}

      <Panel title="Créditos adicionais e anulações do exercício" className="mt-8" pad={false}>
        {creditos.length === 0 ? (
          <div className="p-6">
            <Vazio>Nenhum crédito adicional aberto neste exercício.</Vazio>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="lista">
              <thead>
                <tr>
                  <th>Decreto</th>
                  <th>Tipo</th>
                  <th>Dotação</th>
                  <th className="text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {creditos.map((c) => (
                  <tr key={c.id}>
                    <td className="tnum whitespace-nowrap">
                      <div className="font-semibold text-ink">Nº {c.decretoNumero}</div>
                      <div className="text-[12.5px] text-ink-3">{fmtIso(c.decretoData)}</div>
                    </td>
                    <td>
                      <Chip tone={c.valor < 0 ? "neutral" : "brand"}>{TIPOS_CREDITO[c.tipo] ?? c.tipo}</Chip>
                    </td>
                    <td className="min-w-[260px]">
                      <Link href={`/financas/orcamento/${c.d.id}`} className="font-medium text-ink hover:text-brand-2 hover:underline">
                        {c.d.acaoNome} · {c.d.natureza} · {c.d.fonte}
                      </Link>
                      {c.justificativa && <div className="text-[12.5px] text-ink-2">{c.justificativa}</div>}
                    </td>
                    <td className={`tnum text-right font-semibold whitespace-nowrap ${c.valor < 0 ? "text-ink-2" : "text-ink"}`}>
                      {c.valor < 0 ? "−" : "+"}
                      {fmtMoeda(Math.abs(c.valor))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <p className="mt-4 max-w-3xl text-[13px] text-ink-3">
        Disponível = atualizado − empenhado − reservado. Saldo de orçamento não é dinheiro em caixa: para saber se há recurso para pagar, veja{" "}
        <Link href="/financas/caixa" className="font-semibold text-brand-2 hover:underline">
          Caixa e projeção
        </Link>
        .
      </p>
    </>
  );
}

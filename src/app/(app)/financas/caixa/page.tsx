import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { fmtMoeda } from "@/lib/dates";
import { Cabecalho, Chip, Panel } from "@/components/ui";
import { CENARIOS, anoCorrente, caixa, fmtIso, projecao, type Cenario } from "@/modulos/financas/dados";
import { AbasFinancas, GraficoSaldo, Kpi, SemAcesso, podeVerFinancas } from "@/modulos/financas/ui";
import { fmtCompacto, nomeGrupo } from "@/modulos/financas/classificacao";

export const dynamic = "force-dynamic";

export default async function CaixaPage({ searchParams }: { searchParams: Promise<{ cenario?: string }> }) {
  const u = await requireUser();
  if (!podeVerFinancas(u)) return <SemAcesso />;
  const sp = await searchParams;
  const cenario: Cenario = sp.cenario && sp.cenario in CENARIOS ? (sp.cenario as Cenario) : "base";
  const ano = anoCorrente();
  const [cx, proj] = await Promise.all([caixa(u.municipioId, ano), projecao(u.municipioId, ano, cenario)]);
  const t = cx.totais;
  const negativas = proj.series.filter((s) => s.primeiroNegativo);
  const extrato = cx.contas[0]?.extratoEm;

  return (
    <>
      <Cabecalho titulo="Caixa e projeção" sub="Dinheiro em conta por fonte de recurso, o que já está comprometido com ele e como o saldo deve andar nos próximos 90 dias." />
      <AbasFinancas atual="/financas/caixa" />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi rotulo="Saldo em contas" valor={fmtCompacto(t.saldo)} sub={extrato ? `extratos de ${fmtIso(extrato)} (simulados)` : "sem contas cadastradas"} />
        <Kpi rotulo="Liquidado a pagar" valor={fmtCompacto(t.aPagar)} sub="despesas já entregues, aguardando pagamento" />
        <Kpi rotulo="Empenhado a liquidar" valor={fmtCompacto(t.aLiquidar)} sub="compromissos ainda não entregues" />
        <Kpi rotulo="Após todos os compromissos" valor={fmtCompacto(t.liquida)} sub="sem contar receitas futuras" tom={t.liquida < 0 ? "bad" : undefined} />
      </div>

      <Panel title="Disponibilidade por fonte" pad={false} className="mb-6">
        <div className="overflow-x-auto">
          <table className="lista">
            <thead>
              <tr>
                <th>Fonte</th>
                <th className="text-right">Saldo bancário</th>
                <th className="text-right">(−) Liquidado a pagar</th>
                <th className="text-right">= Após obrigações</th>
                <th className="text-right">(−) Empenhado a liquidar</th>
                <th className="text-right">= Disponibilidade líquida</th>
              </tr>
            </thead>
            <tbody>
              {cx.fontes.map((f) => (
                <tr key={f.grupo} className="linha">
                  <td className="min-w-[200px]">
                    <div className="font-medium text-ink">{nomeGrupo(f.grupo)}</div>
                    <div className="text-[12.5px] text-ink-3">
                      {f.contas.length} {f.contas.length === 1 ? "conta" : "contas"}
                    </div>
                  </td>
                  <td className="tnum text-right whitespace-nowrap">{fmtCompacto(f.saldo)}</td>
                  <td className="tnum text-right whitespace-nowrap">
                    {fmtCompacto(f.aPagar)}
                    {f.vencido > 0 && (
                      <div>
                        <Link href="/financas/empenhos?situacao=vencidos" className="text-[12px] font-semibold text-bad hover:underline">
                          {fmtCompacto(f.vencido)} vencido
                        </Link>
                      </div>
                    )}
                  </td>
                  <td className={`tnum text-right whitespace-nowrap ${f.aposLiquidadas < 0 ? "font-semibold text-bad" : ""}`}>{fmtCompacto(f.aposLiquidadas)}</td>
                  <td className="tnum text-right whitespace-nowrap">{fmtCompacto(f.aLiquidar)}</td>
                  <td className={`tnum text-right font-semibold whitespace-nowrap ${f.liquida < 0 ? "text-bad" : "text-ink"}`}>{fmtCompacto(f.liquida)}</td>
                </tr>
              ))}
              <tr>
                <td className="font-semibold">Total</td>
                <td className="tnum text-right font-semibold whitespace-nowrap">{fmtCompacto(t.saldo)}</td>
                <td className="tnum text-right font-semibold whitespace-nowrap">{fmtCompacto(t.aPagar)}</td>
                <td className="tnum text-right font-semibold whitespace-nowrap">{fmtCompacto(t.aposLiquidadas)}</td>
                <td className="tnum text-right font-semibold whitespace-nowrap">{fmtCompacto(t.aLiquidar)}</td>
                <td className="tnum text-right font-semibold whitespace-nowrap">{fmtCompacto(t.liquida)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="px-6 py-3 text-[14px] text-ink-3">
          Dinheiro vinculado (saúde, educação, assistência e convênios) só paga despesas da própria fonte. Disponibilidade líquida negativa significa que os compromissos
          dependem de receita que ainda vai entrar: veja a projeção abaixo.
        </p>
      </Panel>

      <section id="projecao" className="scroll-mt-24">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="display text-[22px] font-semibold text-ink">Projeção de caixa — 90 dias</h2>
            <p className="text-[14px] text-ink-2">
              De {fmtIso(proj.hoje)} a {fmtIso(proj.fim)}, por fonte. Estimativa: não é registro contábil.
            </p>
          </div>
          <div className="flex gap-1 rounded-full border border-line bg-white p-1" role="tablist" aria-label="Cenário">
            {(Object.keys(CENARIOS) as Cenario[]).map((c) => (
              <Link
                key={c}
                href={`/financas/caixa?cenario=${c}#projecao`}
                aria-current={c === cenario ? "page" : undefined}
                className={`rounded-full px-3.5 py-1.5 text-[14px] font-medium ${c === cenario ? "bg-ink text-white" : "text-ink-2 hover:bg-sunken"}`}
              >
                {CENARIOS[c].nome}
              </Link>
            ))}
          </div>
        </div>

        {negativas.length > 0 ? (
          <div className="mb-5 flex items-start gap-3 rounded-xl border border-red-200 bg-bad-soft px-4 py-3 text-[14px] text-bad">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" />
            <div>
              {negativas.map((s) => (
                <div key={s.grupo}>
                  <strong>{nomeGrupo(s.grupo)}</strong> fica negativa a partir de {fmtIso(s.primeiroNegativo!.data)} e chega a {fmtMoeda(s.min.saldo)} em {fmtIso(s.min.data)}.
                </div>
              ))}
              <div className="mt-1 text-[13px] text-bad/80">Antecipe a cobrança do repasse, reprograme medições ou pagamentos dessa fonte. Recurso livre só cobre se houver decisão formal.</div>
            </div>
          </div>
        ) : (
          <div className="mb-5 rounded-xl border border-green-200 bg-ok-soft px-4 py-3 text-[14px] text-ok">Nenhuma fonte fica negativa nos próximos 90 dias neste cenário.</div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {proj.series.map((s) => (
            <div key={s.grupo} className={`panel p-5 ${s.primeiroNegativo ? "border-red-200" : ""}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="font-semibold text-ink">{nomeGrupo(s.grupo)}</div>
                {s.primeiroNegativo ? <Chip tone="bad">Negativa</Chip> : <Chip tone="ok">Positiva</Chip>}
              </div>
              <div className="mt-1 grid grid-cols-3 gap-2 text-[12.5px]">
                <div>
                  <div className="text-ink-3">Hoje</div>
                  <div className="tnum font-semibold text-ink">{fmtCompacto(s.inicial)}</div>
                </div>
                <div>
                  <div className="text-ink-3">Mínimo</div>
                  <div className={`tnum font-semibold ${s.min.saldo < 0 ? "text-bad" : "text-ink"}`}>{fmtCompacto(s.min.saldo)}</div>
                </div>
                <div>
                  <div className="text-ink-3">Em 90 dias</div>
                  <div className={`tnum font-semibold ${s.final < 0 ? "text-bad" : "text-ink"}`}>{fmtCompacto(s.final)}</div>
                </div>
              </div>
              <div className="mt-3">
                <GraficoSaldo pontos={s.pontos} />
              </div>
              <div className="mt-1 text-[12px] text-ink-3">
                Entram {fmtCompacto(s.entradas)} · saem {fmtCompacto(s.saidas)}
              </div>
            </div>
          ))}
        </div>

        <Panel title={`Premissas do cenário ${CENARIOS[cenario].nome.toLowerCase()}`} className="mt-6">
          <ul className="list-disc space-y-1.5 pl-5 text-[14px] text-ink-2">
            {proj.premissas.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </Panel>
      </section>

      <Panel title="Contas bancárias" pad={false} className="mt-6">
        <div className="overflow-x-auto">
          <table className="lista">
            <thead>
              <tr>
                <th>Conta</th>
                <th>Fonte</th>
                <th className="text-right">Extrato</th>
                <th className="text-right">Pagamentos depois do extrato</th>
                <th className="text-right">Saldo atual</th>
              </tr>
            </thead>
            <tbody>
              {cx.contas.map((c) => (
                <tr key={c.id}>
                  <td className="min-w-[240px]">
                    <div className="font-medium text-ink">{c.nome}</div>
                    <div className="tnum text-[12.5px] text-ink-3">
                      {c.banco} · ag. {c.agencia} · c/c {c.numero}
                    </div>
                  </td>
                  <td className="text-[14px] whitespace-nowrap text-ink-2">{nomeGrupo(c.grupoFonte)}</td>
                  <td className="tnum text-right whitespace-nowrap">
                    {fmtMoeda(c.saldoExtrato)}
                    <div className="text-[12px] text-ink-3">{fmtIso(c.extratoEm)}</div>
                  </td>
                  <td className="tnum text-right whitespace-nowrap">{c.debitosApos ? `−${fmtMoeda(c.debitosApos)}` : "—"}</td>
                  <td className="tnum text-right font-semibold whitespace-nowrap">{fmtMoeda(c.saldoAtual)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <p className="mt-4 max-w-3xl text-[14px] text-ink-3">
        Demonstração: os extratos são simulados. Em produção, os saldos chegam pelo arquivo de extrato do banco (CNAB/OFX) ou por API bancária, com conciliação
        diária; nenhum pagamento é executado sem a confirmação do banco.
      </p>
    </>
  );
}

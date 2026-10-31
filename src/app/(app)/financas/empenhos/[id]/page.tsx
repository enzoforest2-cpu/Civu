import Link from "next/link";
import { notFound } from "next/navigation";
import { inArray } from "drizzle-orm";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { db } from "@/db";
import { processos, tiposProcesso } from "@/db/schema";
import { requireUser, temPapel } from "@/lib/auth";
import { fmtMoeda } from "@/lib/dates";
import { fmtCnpj } from "@/lib/pagamentos";
import { nomeDaEtapa, type WorkflowDef } from "@/lib/workflow";
import { Chip, Panel, Vazio } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { addDiasIso, anoCorrente, caixa, execucao, fmtIso, hojeIso } from "@/modulos/financas/dados";
import { anularEmpenhoAction, liquidarAction, pagarAction, vincularProcessoAction } from "@/modulos/financas/acoes";
import { BarraExecucao, LegendaExecucao, SemAcesso, podeVerFinancas } from "@/modulos/financas/ui";
import { FONTES_DETALHE, NATUREZAS_DESPESA, TIPOS_EMPENHO, nomeGrupo } from "@/modulos/financas/classificacao";

export const dynamic = "force-dynamic";

export default async function EmpenhoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ novo?: string; aviso?: string }> }) {
  const u = await requireUser();
  if (!podeVerFinancas(u)) return <SemAcesso />;
  const { id } = await params;
  const sp = await searchParams;
  const ano = anoCorrente();
  const [ex, cx] = await Promise.all([execucao(u.municipioId, ano), caixa(u.municipioId, ano)]);
  const e = ex.empenhos.find((x) => x.id === id);
  if (!e) notFound();
  const d = ex.dotacoes.find((x) => x.id === e.dotacaoId)!;
  const hoje = hojeIso();
  const procs = e.processoIds.length ? await db.query.processos.findMany({ where: inArray(processos.id, e.processoIds) }) : [];
  const tipos = procs.length ? await db.query.tiposProcesso.findMany({ where: inArray(tiposProcesso.id, [...new Set(procs.map((p) => p.tipoId))]) }) : [];
  const contas = cx.contas.filter((c) => c.grupoFonte === e.grupo);
  const contab = temPapel(u, "CONTABILIDADE");
  const tesouraria = temPapel(u, "TESOURARIA");
  // liquidações a pagar mais antigas na mesma fonte (ordem cronológica)
  const aFrenteDe = (data: string, lid: string) =>
    ex.liquidacoesCalc.filter((x) => {
      if (x.id === lid || x.aPagar <= 0 || x.data >= data) return false;
      const o = ex.empenhos.find((y) => y.id === x.empenhoId)!;
      return o.grupo === e.grupo && !o.dotacao.natureza.startsWith("3.1.");
    }).length;
  const pagamentosDe = (lid: string) => ex.pagamentos.filter((p) => p.liquidacaoId === lid);
  const contaNome = new Map(cx.contas.map((c) => [c.id, c.nome]));

  return (
    <>
      <Link href="/financas/empenhos" className="mb-4 inline-flex items-center gap-1.5 text-[14px] font-medium text-ink-2 hover:text-ink">
        <ArrowLeft size={16} /> Empenhos
      </Link>
      {sp.novo && (
        <div className="mb-5 flex items-start gap-2 rounded-xl border border-green-200 bg-ok-soft px-4 py-3 text-[14px] text-ok">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
          <div>
            Empenho emitido.
            {e.processoIds.length > 0 && !sp.aviso && " A nota de empenho foi juntada ao processo e aguarda as assinaturas do contador e do ordenador."}
            {sp.aviso && <span className="block text-warn">Não foi possível juntar a nota ao processo: {sp.aviso}</span>}
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="display text-[28px] leading-tight font-semibold text-ink sm:text-[34px]">
          Empenho {e.numero}/{e.ano}
        </h1>
        <Chip tone="brand">{TIPOS_EMPENHO[e.tipo]?.nome}</Chip>
        {e.aLiquidar <= 0 && e.aPagar <= 0 && <Chip tone="ok">Quitado</Chip>}
      </div>
      <p className="mt-1 max-w-3xl text-[15px] text-ink-2">{e.historico}</p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <Panel>
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-5">
              {(
                [
                  ["Empenhado", e.liquido],
                  ["Liquidado", e.liquidado],
                  ["Pago", e.pago],
                  ["A liquidar", e.aLiquidar],
                  ["A pagar", e.aPagar],
                ] as const
              ).map(([r, v]) => (
                <div key={r}>
                  <div className="text-[12.5px] text-ink-3">{r}</div>
                  <div className="tnum font-semibold text-ink">{fmtMoeda(v)}</div>
                </div>
              ))}
            </div>
            <div className="mt-4">
              <BarraExecucao autorizado={e.liquido} empenhado={e.liquido} liquidado={e.liquidado} pago={e.pago} alto />
              <div className="mt-2">
                <LegendaExecucao />
              </div>
            </div>
          </Panel>

          <Panel title="Liquidações e pagamentos" pad={false}>
            {e.liquidacoes.length === 0 ? (
              <div className="p-6">
                <Vazio>Nada liquidado ainda. A liquidação é feita quando o bem é entregue ou o serviço é prestado e atestado.</Vazio>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {[...e.liquidacoes].reverse().map((l) => {
                  const pags = pagamentosDe(l.id);
                  const vencida = l.aPagar > 0 && l.vencimento < hoje;
                  const aFrente = l.aPagar > 0 ? aFrenteDe(l.data, l.id) : 0;
                  return (
                    <li key={l.id} className="px-6 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="font-medium text-ink">
                            {l.documentoFiscal} · <span className="tnum">{fmtMoeda(l.valor)}</span>
                          </div>
                          <div className="tnum text-[12.5px] text-ink-3">
                            Liquidada em {fmtIso(l.data)} · vence em {fmtIso(l.vencimento)}
                          </div>
                          {pags.map((p) => (
                            <div key={p.id} className="tnum mt-1 text-[12.5px] text-ok">
                              Pago {fmtMoeda(p.valor)} em {fmtIso(p.data)} · {contaNome.get(p.contaId)}
                              {p.justificativaOrdem && <span className="block text-warn">Fora da ordem: {p.justificativaOrdem}</span>}
                            </div>
                          ))}
                        </div>
                        {l.aPagar <= 0 ? <Chip tone="ok">Pago</Chip> : vencida ? <Chip tone="bad">Vencido · {fmtMoeda(l.aPagar)}</Chip> : <Chip tone="warn">A pagar · {fmtMoeda(l.aPagar)}</Chip>}
                      </div>
                      {l.aPagar > 0 && tesouraria && (
                        <details className="mt-3 rounded-xl border border-line bg-sunken/40">
                          <summary className="px-4 py-2.5 text-[14px] font-semibold text-brand-2">Registrar pagamento</summary>
                          <ActionForm action={pagarAction} className="space-y-3 px-4 pb-4">
                            <input type="hidden" name="liquidacaoId" value={l.id} />
                            <div className="grid gap-3 sm:grid-cols-2">
                              <div>
                                <label className="label" htmlFor={`conta-${l.id}`}>
                                  Conta ({nomeGrupo(e.grupo)})
                                </label>
                                <select id={`conta-${l.id}`} name="contaId" className="input" required>
                                  {contas.map((c) => (
                                    <option key={c.id} value={c.id}>
                                      {c.nome} — saldo {fmtMoeda(c.saldoAtual)}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="label" htmlFor={`vp-${l.id}`}>
                                  Valor
                                </label>
                                <input
                                  id={`vp-${l.id}`}
                                  name="valor"
                                  className="input tnum"
                                  inputMode="decimal"
                                  defaultValue={l.aPagar.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                                  required
                                />
                              </div>
                            </div>
                            {aFrente > 0 && (
                              <div>
                                <label className="label" htmlFor={`j-${l.id}`}>
                                  Justificativa para pagar fora da ordem
                                </label>
                                <textarea id={`j-${l.id}`} name="justificativa" rows={2} className="input" placeholder="Fica pública na fila de pagamentos." />
                                <p className="hint">
                                  {aFrente} {aFrente === 1 ? "despesa desta fonte foi liquidada antes e ainda não foi paga" : "despesas desta fonte foram liquidadas antes e ainda não foram pagas"} (Lei 14.133, art. 141).
                                </p>
                              </div>
                            )}
                            <SubmitButton>Pagar</SubmitButton>
                          </ActionForm>
                        </details>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          {contab && e.aLiquidar > 0 && (
            <Panel title="Liquidar">
              <ActionForm action={liquidarAction} className="space-y-3">
                <input type="hidden" name="empenhoId" value={e.id} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor="doc">
                      Nota fiscal ou documento
                    </label>
                    <input id="doc" name="documento" className="input" placeholder="NF-e 1234" required />
                  </div>
                  <div>
                    <label className="label" htmlFor="vl">
                      Valor
                    </label>
                    <input id="vl" name="valor" className="input tnum" inputMode="decimal" defaultValue={e.tipo === "ORDINARIO" ? e.aLiquidar.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : ""} placeholder="0,00" required />
                    <p className="hint">Saldo a liquidar: {fmtMoeda(e.aLiquidar)}</p>
                  </div>
                  <div>
                    <label className="label" htmlFor="dl">
                      Data da liquidação
                    </label>
                    <input id="dl" name="data" type="date" className="input tnum" defaultValue={hoje} max={hoje} required />
                  </div>
                  <div>
                    <label className="label" htmlFor="venc">
                      Vencimento
                    </label>
                    <input id="venc" name="vencimento" type="date" className="input tnum" defaultValue={addDiasIso(hoje, 20)} required />
                  </div>
                </div>
                <p className="text-[14px] text-ink-3">Liquide só com a nota fiscal atestada pelo fiscal do contrato (Lei 4.320, art. 63).</p>
                <SubmitButton>Registrar liquidação</SubmitButton>
              </ActionForm>
            </Panel>
          )}
        </div>

        <div className="space-y-6">
          <Panel title="Credor">
            <div className="font-semibold text-ink">{e.credorNome}</div>
            {e.credorDocumento && <div className="tnum text-[14px] text-ink-2">CNPJ {fmtCnpj(e.credorDocumento)}</div>}
            {!e.empresaId && !e.credorDocumento && <div className="text-[13px] text-ink-3">Credor sem CNPJ (folha ou previdência).</div>}
            <div className="mt-2 text-[13px] text-ink-3">Emitido em {fmtIso(e.data)}</div>
          </Panel>
          <Panel title="Dotação">
            <Link href={`/financas/orcamento/${d.id}`} className="font-semibold text-ink hover:text-brand-2 hover:underline">
              {d.acaoNome}
            </Link>
            <div className="text-[14px] text-ink-2">
              {NATUREZAS_DESPESA[d.natureza]} · {FONTES_DETALHE[d.fonte]?.nome}
            </div>
            <div className="tnum text-[12.5px] text-ink-3">
              {d.unidade} · {d.funcao}.{d.subfuncao}.{d.programa}.{d.acao} · {d.natureza} · {d.fonte}
            </div>
            <div className="mt-2 text-[13px] text-ink-2">Disponível na dotação: {fmtMoeda(d.disponivel)}</div>
          </Panel>
          <Panel title="Processo vinculado">
            {procs.length === 0 ? (
              <p className="text-[14px] text-ink-3">Este empenho não está ligado a nenhum processo.</p>
            ) : (
              <ul className="space-y-3">
                {procs.map((p) => {
                  const t = tipos.find((x) => x.id === p.tipoId);
                  const estado = nomeDaEtapa(t?.definicao as WorkflowDef | undefined, p.estadoAtual);
                  return (
                    <li key={p.id}>
                      <Link href={`/processos/${p.id}`} className="tnum font-semibold text-brand-2 hover:underline">
                        {p.numero}
                      </Link>{" "}
                      <span className="text-ink">{p.assunto}</span>
                      <div className="mt-1">
                        <Chip tone={p.encerradoEm ? "ok" : "neutral"}>{estado}</Chip>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {contab && (
              <ActionForm action={vincularProcessoAction} className="mt-4 flex gap-2">
                <input type="hidden" name="empenhoId" value={e.id} />
                <input name="processo" className="input tnum" placeholder={`${ano}/000000`} aria-label="Número do processo" />
                <SubmitButton className="btn btn-quiet">Vincular</SubmitButton>
              </ActionForm>
            )}
          </Panel>
          {(e.anulacoes?.length ?? 0) > 0 && (
            <Panel title="Anulações">
              <ul className="space-y-2 text-[14px]">
                {e.anulacoes!.map((a, i) => (
                  <li key={i}>
                    <span className="tnum font-semibold">{fmtMoeda(a.valor)}</span> em {fmtIso(a.data)} por {a.autor}
                    <div className="text-ink-2">{a.motivo}</div>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          {contab && e.aLiquidar > 0 && (
            <details className="panel">
              <summary className="px-6 py-4 text-[14px] font-semibold text-ink-2">Anular saldo não liquidado</summary>
              <ActionForm action={anularEmpenhoAction} className="space-y-3 px-6 pb-5">
                <input type="hidden" name="empenhoId" value={e.id} />
                <div>
                  <label className="label" htmlFor="va">
                    Valor a anular
                  </label>
                  <input id="va" name="valor" className="input tnum" inputMode="decimal" defaultValue={e.aLiquidar.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} required />
                </div>
                <div>
                  <label className="label" htmlFor="mot">
                    Motivo
                  </label>
                  <input id="mot" name="motivo" className="input" placeholder="Ex.: entrega concluída por valor menor" required />
                </div>
                <SubmitButton className="btn btn-danger">Anular</SubmitButton>
              </ActionForm>
            </details>
          )}
        </div>
      </div>
    </>
  );
}

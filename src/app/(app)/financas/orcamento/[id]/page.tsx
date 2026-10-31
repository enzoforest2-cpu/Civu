import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser, temPapel } from "@/lib/auth";
import { fmtMoeda } from "@/lib/dates";
import { Chip, Panel, Vazio } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { anoCorrente, execucao, fmtIso, hojeIso } from "@/modulos/financas/dados";
import { anularReservaAction, creditoAction, reservaAction } from "@/modulos/financas/acoes";
import { BarraExecucao, LegendaExecucao, SemAcesso, podeVerFinancas } from "@/modulos/financas/ui";
import { FONTES_DETALHE, FUNCOES, NATUREZAS_DESPESA, SUBFUNCOES, TIPOS_CREDITO, TIPOS_EMPENHO, nomeGrupo } from "@/modulos/financas/classificacao";

export const dynamic = "force-dynamic";

export default async function DotacaoPage({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  if (!podeVerFinancas(u)) return <SemAcesso />;
  const { id } = await params;
  const ex = await execucao(u.municipioId, anoCorrente());
  const d = ex.dotacoes.find((x) => x.id === id);
  if (!d) notFound();
  const reservas = ex.reservasCalc.filter((r) => r.dotacaoId === d.id).sort((a, b) => b.numero - a.numero);
  const empenhos = ex.empenhos.filter((e) => e.dotacaoId === d.id).sort((a, b) => b.numero - a.numero);
  const contab = temPapel(u, "CONTABILIDADE");

  const classif: [string, string, string][] = [
    ["Órgão", d.orgao, d.orgaoNome],
    ["Unidade orçamentária", d.unidade, d.unidadeNome],
    ["Função", d.funcao, FUNCOES[d.funcao]?.nome ?? ""],
    ["Subfunção", d.subfuncao, SUBFUNCOES[d.subfuncao] ?? ""],
    ["Programa", d.programa, d.programaNome],
    ["Ação", d.acao, d.acaoNome],
    ["Natureza da despesa", d.natureza, NATUREZAS_DESPESA[d.natureza] ?? ""],
    ["Fonte de recurso", d.fonte, `${FONTES_DETALHE[d.fonte]?.nome ?? ""} · caixa: ${nomeGrupo(d.grupo)}`],
  ];

  return (
    <>
      <Link href="/financas/orcamento" className="mb-4 inline-flex items-center gap-1.5 text-[14px] font-medium text-ink-2 hover:text-ink">
        <ArrowLeft size={16} /> Orçamento
      </Link>
      <h1 className="display text-[26px] leading-tight font-semibold text-ink sm:text-[32px]">{d.acaoNome}</h1>
      <p className="mt-1 text-[15px] text-ink-2">
        {NATUREZAS_DESPESA[d.natureza]} · {FONTES_DETALHE[d.fonte]?.nome} · UG {d.ug?.codigo} {d.ug?.nome}
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-6">
          <Panel>
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
              {(
                [
                  ["Inicial", d.valorInicial],
                  ["Créditos", d.creditos - d.reducoes],
                  ["Atualizado", d.atualizado],
                  ["Reservado", d.reservado],
                  ["Empenhado", d.empenhado],
                  ["Liquidado", d.liquidado],
                  ["Pago", d.pago],
                  ["Disponível", d.disponivel],
                ] as const
              ).map(([r, v]) => (
                <div key={r}>
                  <div className="text-[12.5px] text-ink-3">{r}</div>
                  <div className={`tnum font-semibold ${r === "Disponível" ? "text-brand-ink" : "text-ink"}`}>{fmtMoeda(v)}</div>
                </div>
              ))}
            </div>
            <div className="mt-5">
              <BarraExecucao autorizado={d.atualizado} empenhado={d.empenhado} liquidado={d.liquidado} pago={d.pago} reservado={d.reservado} alto />
              <div className="mt-2">
                <LegendaExecucao reservado />
              </div>
            </div>
          </Panel>

          <Panel title={`Empenhos (${empenhos.length})`} pad={false}>
            {empenhos.length === 0 ? (
              <div className="p-6">
                <Vazio>Nenhum empenho nesta dotação.</Vazio>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="lista">
                  <thead>
                    <tr>
                      <th>Empenho</th>
                      <th>Credor</th>
                      <th className="text-right">Valor</th>
                      <th className="text-right">A pagar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {empenhos.map((e) => (
                      <tr key={e.id} className="linha">
                        <td className="tnum whitespace-nowrap">
                          <Link href={`/financas/empenhos/${e.id}`} className="font-semibold text-brand-2 hover:underline">
                            {e.numero}/{e.ano}
                          </Link>
                          <div className="text-[12.5px] text-ink-3">
                            {TIPOS_EMPENHO[e.tipo]?.nome} · {fmtIso(e.data)}
                          </div>
                        </td>
                        <td className="min-w-[220px]">
                          <div className="font-medium text-ink">{e.credorNome}</div>
                          <div className="line-clamp-1 text-[12.5px] text-ink-2">{e.historico}</div>
                        </td>
                        <td className="tnum text-right whitespace-nowrap">{fmtMoeda(e.liquido)}</td>
                        <td className="tnum text-right whitespace-nowrap">{fmtMoeda(e.aPagar)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title={`Reservas (${reservas.length})`} pad={false}>
            {reservas.length === 0 ? (
              <div className="p-6">
                <Vazio>Nenhuma reserva nesta dotação.</Vazio>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {reservas.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-3.5">
                    <div className="min-w-0">
                      <div className="font-medium text-ink">
                        Reserva {r.numero}/{r.ano} · {fmtMoeda(r.valor)}
                      </div>
                      <div className="text-[12.5px] text-ink-2">
                        {fmtIso(r.data)} · {r.historico}
                      </div>
                      {r.processoId && (
                        <Link href={`/processos/${r.processoId}`} className="text-[12.5px] font-semibold text-brand-2 hover:underline">
                          Ver processo
                        </Link>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {r.situacao === "ANULADA" ? (
                        <Chip>Anulada</Chip>
                      ) : r.saldo > 0 ? (
                        <>
                          <Chip tone="warn">Saldo {fmtMoeda(r.saldo)}</Chip>
                          {contab && (
                            <ActionForm action={anularReservaAction}>
                              <input type="hidden" name="reservaId" value={r.id} />
                              <SubmitButton className="btn btn-quiet !px-3 !py-1.5 text-[13px]">Anular saldo</SubmitButton>
                            </ActionForm>
                          )}
                        </>
                      ) : (
                        <Chip tone="ok">Empenhada</Chip>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Classificação">
            <dl className="space-y-2.5 text-[14px]">
              {classif.map(([r, c, n]) => (
                <div key={r} className="grid grid-cols-[130px_1fr] gap-3">
                  <dt className="text-ink-3">{r}</dt>
                  <dd>
                    <span className="tnum font-semibold text-ink">{c}</span> <span className="text-ink-2">{n}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </Panel>

          {d.creditosLista.length > 0 && (
            <Panel title="Créditos e anulações">
              <ul className="space-y-3 text-[14px]">
                {d.creditosLista.map((c) => (
                  <li key={c.id}>
                    <div className="flex justify-between gap-3">
                      <span className="font-medium text-ink">
                        {TIPOS_CREDITO[c.tipo]} · Decreto {c.decretoNumero}
                      </span>
                      <span className="tnum font-semibold">
                        {c.valor < 0 ? "−" : "+"}
                        {fmtMoeda(Math.abs(c.valor))}
                      </span>
                    </div>
                    <div className="text-[12.5px] text-ink-3">
                      {fmtIso(c.decretoData)}
                      {c.justificativa ? ` · ${c.justificativa}` : ""}
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          {contab ? (
            <>
              <Panel title="Reservar saldo">
                <ActionForm action={reservaAction} className="space-y-3">
                  <input type="hidden" name="dotacaoId" value={d.id} />
                  <div>
                    <label className="label" htmlFor="r-valor">
                      Valor
                    </label>
                    <input id="r-valor" name="valor" className="input tnum" inputMode="decimal" placeholder="0,00" required />
                    <p className="hint">Disponível agora: {fmtMoeda(d.disponivel)}</p>
                  </div>
                  <div>
                    <label className="label" htmlFor="r-proc">
                      Processo (opcional)
                    </label>
                    <input id="r-proc" name="processo" className="input tnum" placeholder={`${anoCorrente()}/000000`} />
                  </div>
                  <div>
                    <label className="label" htmlFor="r-hist">
                      Para quê
                    </label>
                    <input id="r-hist" name="historico" className="input" required />
                  </div>
                  <SubmitButton>Registrar reserva</SubmitButton>
                </ActionForm>
              </Panel>
              <Panel title="Crédito adicional ou anulação">
                <ActionForm action={creditoAction} className="space-y-3">
                  <input type="hidden" name="dotacaoId" value={d.id} />
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="label" htmlFor="c-tipo">
                        Tipo
                      </label>
                      <select id="c-tipo" name="tipo" className="input" defaultValue="SUPLEMENTAR">
                        {Object.entries(TIPOS_CREDITO).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label" htmlFor="c-dec">
                        Decreto nº
                      </label>
                      <input id="c-dec" name="decreto" className="input tnum" placeholder="5.001/2026" required />
                    </div>
                    <div>
                      <label className="label" htmlFor="c-data">
                        Data
                      </label>
                      <input id="c-data" name="data" type="date" className="input tnum" defaultValue={hojeIso()} required />
                    </div>
                    <div className="col-span-2">
                      <label className="label" htmlFor="c-valor">
                        Valor
                      </label>
                      <input id="c-valor" name="valor" className="input tnum" inputMode="decimal" placeholder="0,00" required />
                    </div>
                    <div className="col-span-2">
                      <label className="label" htmlFor="c-just">
                        Justificativa e origem do recurso
                      </label>
                      <input id="c-just" name="justificativa" className="input" placeholder="Ex.: excesso de arrecadação do ISS" />
                    </div>
                  </div>
                  <SubmitButton>Registrar decreto</SubmitButton>
                </ActionForm>
              </Panel>
            </>
          ) : (
            <p className="text-[14px] text-ink-3">Reservas e créditos adicionais são registrados pela contabilidade.</p>
          )}
        </div>
      </div>
    </>
  );
}

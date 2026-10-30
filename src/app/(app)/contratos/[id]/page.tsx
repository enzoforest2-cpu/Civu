import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, ExternalLink, HardHat } from "lucide-react";
import { requireUser, temPapel } from "@/lib/auth";
import { fmtData, fmtDataHora, fmtMoeda } from "@/lib/dates";
import { fmtCnpj, nomeFonte } from "@/lib/pagamentos";
import { Chip, Panel, Vazio } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { carregarContrato } from "@/modulos/contratos/dados";
import { ehFiscalDo, podeEnviarLiquidacao, podeGerir } from "@/modulos/contratos/operacoes";
import {
  MODALIDADES_CONTRATO,
  NATUREZAS_CONTRATO,
  SITUACAO_OBRA,
  TIPOS_ADITIVO,
  TIPOS_APOSTILAMENTO,
  competenciaDe,
  dataLocal,
  num,
  rotuloMes,
} from "@/modulos/contratos/regras";
import { BarraPct, BarraSaldo, ChipContrato, ChipNota, CurvaS, Dado, TrilhoNota, pct } from "@/modulos/contratos/componentes";
import { AcoesNota } from "@/modulos/contratos/acoes-nota";
import { FormAditivo } from "@/modulos/contratos/form-aditivo";
import { apostilamentoAction, diarioAction, encerrarAction, medicaoAction, notaInternaAction, situacaoObraAction } from "@/modulos/contratos/acoes";

const dl = (d: string | null | undefined) => (d ? fmtData(dataLocal(d)) : "—");

export default async function ContratoPage({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  const { id } = await params;
  const c = await carregarContrato(u.municipioId, id);
  if (!c) notFound();
  const { fin, obra } = c;
  const gerir = podeGerir(u, c) && c.situacao === "ATIVO";
  const fiscal = ehFiscalDo(u, c);
  const enviar = podeEnviarLiquidacao(u, c);
  const ativo = c.situacao === "ATIVO";
  const podeNota = ativo && (fiscal || gerir || temPapel(u, "PROTOCOLO", "CONTABILIDADE"));
  const medicoesSemNota = c.medicoes.filter((m) => !c.notas.some((n) => n.medicaoId === m.id && n.situacao !== "GLOSADA"));
  const hoje = new Date();
  const mesAtual = competenciaDe(hoje);

  return (
    <>
      <Link href="/contratos" className="mb-4 inline-flex items-center gap-1.5 text-[13.5px] font-medium text-ink-2 hover:text-ink">
        <ArrowLeft size={15} /> Contratos
      </Link>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="tnum text-[13.5px] font-semibold text-ink-3">Contrato {c.rotulo}</span>
            <ChipContrato s={fin.situacao} />
            {obra && <Chip tone={SITUACAO_OBRA[obra.situacao].tone}>Obra {SITUACAO_OBRA[obra.situacao].texto.toLowerCase()}</Chip>}
            {fin.acimaDoLimite && (
              <Chip tone="bad">
                <AlertTriangle size={12} /> Acréscimos acima de {fin.limite}%
              </Chip>
            )}
          </div>
          <h1 className="display mt-2 text-[24px] leading-[1.15] font-semibold text-ink sm:text-[30px]">{c.objeto}</h1>
          <p className="mt-2 text-[15px] text-ink-2">
            <strong className="font-semibold text-ink">{c.empresa.razaoSocial}</strong> · CNPJ <span className="tnum">{fmtCnpj(c.empresa.cnpj)}</span>
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          {/* Saldo */}
          <Panel title="Execução financeira">
            <div className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Dado rotulo="Valor global">
                <span className="tnum">{fmtMoeda(fin.global)}</span>
              </Dado>
              <Dado rotulo="Aditivos e reajustes">
                <span className="tnum">{fmtMoeda(fin.aditivosValor + fin.reajustes)}</span>
              </Dado>
              <Dado rotulo="Valor atualizado">
                <span className="display tnum text-[17px] font-semibold">{fmtMoeda(fin.valorAtual)}</span>
              </Dado>
              <Dado rotulo="Saldo">
                <span className={`display tnum text-[17px] font-semibold ${fin.pctSaldo < 10 ? "text-bad" : ""}`}>{fmtMoeda(fin.saldo)}</span>
              </Dado>
            </div>
            <BarraSaldo fin={fin} />
            <p className="mt-4 text-[13px] text-ink-3">
              Saldo = valor global + aditivos + reajustes − notas atestadas (inclusive as já em liquidação ou pagas). Acréscimos de valor somam{" "}
              <strong className={`tnum ${fin.acimaDoLimite ? "text-bad" : "text-ink-2"}`}>{pct(fin.acrescimoPct)}</strong> do valor inicial atualizado; o limite do art. 125 da
              Lei 14.133 para {NATUREZAS_CONTRATO[c.natureza]?.nome.toLowerCase()} é {fin.limite}%.
            </p>
          </Panel>

          {/* Notas */}
          <section id="notas" className="scroll-mt-24">
            <Panel title="Notas fiscais e pagamentos" pad={false}>
              <p className="px-6 pt-1 pb-3 text-[13px] text-ink-3">
                Cada nota atestada abre um processo de pagamento (liquidação, fila cronológica da fonte {nomeFonte(c.fonte)} e pagamento). O fornecedor acompanha o mesmo
                andamento no Civu Empresas.
              </p>
              {c.notas.length === 0 ? (
                <div className="px-6 pb-6">
                  <Vazio>Nenhuma nota enviada ainda. O fornecedor envia pelo Civu Empresas ou o fiscal registra abaixo.</Vazio>
                </div>
              ) : (
                <ul className="divide-y divide-line border-t border-line">
                  {c.notas.map((n) => {
                    const s = c.status[n.id];
                    return (
                      <li key={n.id} className="grid gap-3 px-6 py-4 md:grid-cols-[minmax(0,1fr)_auto]">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span className="font-semibold text-ink">NF {n.numero}</span>
                            <span className="display tnum text-[16px] font-semibold text-ink">{fmtMoeda(n.valor)}</span>
                            <span className="text-[13px] text-ink-3">competência {rotuloMes(n.competencia)}</span>
                            {n.origem === "PORTAL" && <Chip tone="neutral">Enviada pelo portal</Chip>}
                          </div>
                          {n.descricao && <p className="mt-0.5 text-[13.5px] text-ink-2">{n.descricao}</p>}
                          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
                            {s && <TrilhoNota s={s} />}
                            <span className={`text-[13px] ${s?.tone === "bad" ? "font-semibold text-bad" : "text-ink-2"}`}>
                              {s?.etapa === "FILA" && s.fila
                                ? `${s.fila.posicao}º de ${s.fila.total} na fila de ${s.fila.fonteNome}${s.fila.aFrente ? ` · ${fmtMoeda(s.fila.valorAFrente)} à frente` : " · é o próximo"}`
                                : s?.etapa === "PAGO"
                                  ? `Pago em ${fmtData(s.pagoEm)}${s.processo ? "" : " (registro importado)"}`
                                  : s?.etapa === "GLOSADA"
                                    ? `Glosada: ${n.glosaMotivo}`
                                    : s?.etapa === "ATESTO"
                                      ? `Aguardando atesto · ${s.detalhe?.toLowerCase()}`
                                      : s?.etapa === "ATESTADA"
                                        ? `Atestada em ${fmtDataHora(n.atestadaEm)} por ${n.atestadaPor?.nome ?? "—"}`
                                        : s?.detalhe}
                            </span>
                          </div>
                          {s?.processo && (
                            <Link href={`/processos/${s.processo.id}`} className="mt-1.5 inline-flex items-center gap-1 text-[13px] font-semibold text-brand hover:underline">
                              Processo de pagamento <span className="tnum">{s.processo.numero}</span> <ExternalLink size={12} />
                            </Link>
                          )}
                        </div>
                        <div className="md:max-w-[300px] md:text-right">
                          <AcoesNota notaId={n.id} contratoId={c.id} situacao={n.situacao} podeAtestar={fiscal} podeEnviar={enviar} />
                          {(n.situacao === "AGUARDANDO_ATESTO" || n.situacao === "ATESTADA") && !fiscal && !enviar && <ChipNota s={s} />}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              {podeNota && (
                <details className="mx-6 mt-2 mb-6 rounded-xl border border-line open:bg-sunken/50">
                  <summary className="px-4 py-3 text-[14px] font-semibold text-brand">Registrar nota recebida no balcão</summary>
                  <ActionForm action={notaInternaAction} className="grid gap-3 px-4 pb-4 sm:grid-cols-2">
                    <input type="hidden" name="contratoId" value={c.id} />
                    <div>
                      <label className="label" htmlFor="nf-numero">
                        Número da nota
                      </label>
                      <input id="nf-numero" name="numero" className="input tnum" required />
                    </div>
                    <div>
                      <label className="label" htmlFor="nf-valor">
                        Valor (R$)
                      </label>
                      <input id="nf-valor" name="valor" className="input tnum" inputMode="decimal" required />
                    </div>
                    <div>
                      <label className="label" htmlFor="nf-comp">
                        Competência
                      </label>
                      <input id="nf-comp" name="competencia" type="month" className="input" defaultValue={mesAtual} required />
                    </div>
                    <div>
                      <label className="label" htmlFor="nf-emissao">
                        Emitida em
                      </label>
                      <input id="nf-emissao" name="emitidaEm" type="date" className="input" required />
                    </div>
                    {medicoesSemNota.length > 0 && (
                      <div className="sm:col-span-2">
                        <label className="label" htmlFor="nf-med">
                          Medição correspondente
                        </label>
                        <select id="nf-med" name="medicaoId" className="input">
                          <option value="">Nenhuma</option>
                          {medicoesSemNota.map((m) => (
                            <option key={m.id} value={m.id}>
                              Medição {m.numero} — {rotuloMes(m.competencia)} — {fmtMoeda(m.valor)}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div className="sm:col-span-2">
                      <label className="label" htmlFor="nf-desc">
                        Descrição (opcional)
                      </label>
                      <input id="nf-desc" name="descricao" className="input" />
                    </div>
                    <div className="sm:col-span-2">
                      <SubmitButton pendingText="Registrando…">Registrar nota</SubmitButton>
                    </div>
                  </ActionForm>
                </details>
              )}
            </Panel>
          </section>

          {/* Obra */}
          {obra && (
            <section id="obra" className="scroll-mt-24 space-y-6">
              <Panel
                title={
                  <span className="flex items-center gap-2">
                    <HardHat size={17} className="text-brand" /> Obra: cronograma físico-financeiro
                  </span>
                }
              >
                <div className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Dado rotulo="Executado (físico)">
                    <span className="display tnum text-[20px] font-semibold">{pct(obra.fisico)}</span>
                  </Dado>
                  <Dado rotulo={`Previsto até ${obra.refMes ? rotuloMes(obra.refMes) : "—"}`}>
                    <span className="display tnum text-[20px] font-semibold">{pct(obra.previstoRef)}</span>
                  </Dado>
                  <Dado rotulo="Desvio">
                    <span className={`display tnum text-[20px] font-semibold ${obra.desvio > 10 ? "text-bad" : obra.desvio > 5 ? "text-warn" : ""}`}>
                      {obra.desvio > 0 ? `−${obra.desvio.toFixed(1).replace(".", ",")}` : `+${(-obra.desvio).toFixed(1).replace(".", ",")}`} p.p.
                    </span>
                  </Dado>
                  <Dado rotulo="Situação">
                    <Chip tone={SITUACAO_OBRA[obra.situacao].tone}>{SITUACAO_OBRA[obra.situacao].texto}</Chip>
                  </Dado>
                </div>
                <CurvaS obra={obra} />
                {c.obraMotivo && (
                  <div className="mt-4 rounded-lg bg-warn-soft px-4 py-3 text-[14px] text-ink">
                    <strong className="font-semibold">Motivo informado na página pública:</strong> {c.obraMotivo}
                  </div>
                )}
                <div className="mt-6 overflow-x-auto">
                  <table className="lista">
                    <thead>
                      <tr>
                        <th>Etapa</th>
                        <th className="text-right">Valor</th>
                        <th>Executado × previsto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {obra.porEtapa.map((e) => (
                        <tr key={e.id}>
                          <td className="min-w-[200px] font-medium text-ink">{e.nome}</td>
                          <td className="tnum text-right whitespace-nowrap">{fmtMoeda(e.valor)}</td>
                          <td className="min-w-[200px]">
                            <BarraPct valor={e.executado} previsto={e.previstoAteRef} tone={e.previstoAteRef - e.executado > 10 ? "bad" : "brand"} />
                            <div className="tnum mt-1 text-[12.5px] text-ink-3">
                              {pct(e.executado, 0)} executado · {pct(e.previstoAteRef, 0)} previsto
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>

              <Panel title="Medições mensais">
                {c.medicoes.length === 0 ? (
                  <Vazio>Nenhuma medição registrada.</Vazio>
                ) : (
                  <ul className="divide-y divide-line">
                    {[...c.medicoes].reverse().map((m) => {
                      const nm = c.notas.find((n) => n.medicaoId === m.id && n.situacao !== "GLOSADA");
                      return (
                        <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                          <span>
                            <span className="font-semibold text-ink">Medição {m.numero}</span> <span className="text-ink-3">· {rotuloMes(m.competencia)}</span>
                            <span className="block text-[13px] text-ink-2">
                              {Object.entries(m.executado)
                                .map(([eid, v]) => `${c.etapas.find((e) => e.id === eid)?.nome ?? "Etapa"}: ${String(v).replace(".", ",")}%`)
                                .join(" · ")}
                            </span>
                          </span>
                          <span className="flex items-center gap-3">
                            <span className="display tnum font-semibold text-ink">{fmtMoeda(m.valor)}</span>
                            {nm ? <ChipNota s={c.status[nm.id]} /> : <Chip tone="neutral">Sem nota</Chip>}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {fiscal && ativo && (
                  <details className="mt-4 rounded-xl border border-line open:bg-sunken/50">
                    <summary className="px-4 py-3 text-[14px] font-semibold text-brand">Registrar medição do mês</summary>
                    <ActionForm action={medicaoAction} className="space-y-3 px-4 pb-4">
                      <input type="hidden" name="contratoId" value={c.id} />
                      <div className="max-w-[220px]">
                        <label className="label" htmlFor="med-comp">
                          Mês medido
                        </label>
                        <input id="med-comp" name="competencia" type="month" className="input" required />
                      </div>
                      <p className="text-[13px] text-ink-3">Percentual de cada etapa executado no mês (não acumulado). O valor é calculado pelo cronograma.</p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {obra.porEtapa.map((e) => (
                          <div key={e.id}>
                            <label className="label !text-[13px]" htmlFor={`med-${e.id}`}>
                              {e.nome} <span className="font-normal text-ink-3">(já medido {pct(e.executado, 0)})</span>
                            </label>
                            <input id={`med-${e.id}`} name={`etapa.${e.id}`} className="input tnum" inputMode="decimal" placeholder="0" disabled={e.executado >= 100} />
                          </div>
                        ))}
                      </div>
                      <div>
                        <label className="label" htmlFor="med-obs">
                          Observação
                        </label>
                        <input id="med-obs" name="observacao" className="input" />
                      </div>
                      <SubmitButton pendingText="Registrando…">Registrar medição</SubmitButton>
                    </ActionForm>
                  </details>
                )}
              </Panel>

              <Panel title="Diário de obra">
                {(fiscal || u.id === c.gestorId) && ativo && (
                  <details className="mb-4 rounded-xl border border-line open:bg-sunken/50">
                    <summary className="px-4 py-3 text-[14px] font-semibold text-brand">Novo registro</summary>
                    <ActionForm action={diarioAction} className="grid gap-3 px-4 pb-4 sm:grid-cols-3">
                      <input type="hidden" name="contratoId" value={c.id} />
                      <div>
                        <label className="label" htmlFor="di-data">
                          Data
                        </label>
                        <input id="di-data" name="data" type="date" className="input" defaultValue={hoje.toISOString().slice(0, 10)} required />
                      </div>
                      <div>
                        <label className="label" htmlFor="di-clima">
                          Clima
                        </label>
                        <select id="di-clima" name="clima" className="input">
                          {["Sol", "Nublado", "Chuva"].map((x) => (
                            <option key={x}>{x}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="label" htmlFor="di-ef">
                          Trabalhadores na obra
                        </label>
                        <input id="di-ef" name="efetivo" type="number" min={0} className="input tnum" />
                      </div>
                      <div className="sm:col-span-3">
                        <label className="label" htmlFor="di-texto">
                          O que foi feito e ocorrências
                        </label>
                        <textarea id="di-texto" name="texto" rows={2} className="input" required minLength={10} />
                      </div>
                      <div className="sm:col-span-3">
                        <SubmitButton pendingText="Salvando…">Salvar no diário</SubmitButton>
                      </div>
                    </ActionForm>
                  </details>
                )}
                {c.diario.length === 0 ? (
                  <Vazio>Nenhum registro no diário.</Vazio>
                ) : (
                  <ol className="space-y-3">
                    {c.diario.map((r) => (
                      <li key={r.id} className="rounded-xl bg-sunken/60 px-4 py-3">
                        <div className="flex flex-wrap gap-x-3 text-[12.5px] text-ink-3">
                          <span className="tnum font-semibold text-ink-2">{dl(r.data)}</span>
                          {r.clima && <span>{r.clima}</span>}
                          {r.efetivo != null && <span>{r.efetivo} trabalhadores</span>}
                          <span>{r.autor?.nome}</span>
                        </div>
                        <p className="mt-1 text-[14px] text-ink">{r.texto}</p>
                      </li>
                    ))}
                  </ol>
                )}
              </Panel>
            </section>
          )}

          {/* Aditivos e apostilamentos */}
          <Panel title="Aditivos e apostilamentos">
            {c.aditivos.length === 0 && c.apostilamentos.length === 0 ? (
              <Vazio>Nenhum aditivo ou apostilamento.</Vazio>
            ) : (
              <ul className="divide-y divide-line">
                {c.aditivos.map((a) => (
                  <li key={a.id} className="py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-ink">{a.numero}º termo aditivo</span>
                      <Chip tone="neutral">{TIPOS_ADITIVO[a.tipo] ?? a.tipo}</Chip>
                      {a.acimaDoLimite && (
                        <Chip tone="bad">
                          <AlertTriangle size={12} /> Acima do limite do art. 125
                        </Chip>
                      )}
                      <span className="text-[13px] text-ink-3">assinado em {dl(a.assinadoEm)}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 text-[13.5px] text-ink-2">
                      {num(a.valor) !== 0 && <span className="tnum">{num(a.valor) > 0 ? "+" : "−"}{fmtMoeda(Math.abs(num(a.valor)))}</span>}
                      {a.novaVigenciaFim && <span>Vigência até {dl(a.novaVigenciaFim)}</span>}
                      {a.acrescimoAcumulado && a.tipo !== "PRAZO" && a.tipo !== "RENOVACAO" && <span>Acréscimo acumulado: {pct(num(a.acrescimoAcumulado))}</span>}
                    </div>
                    <p className="mt-1 text-[13.5px] text-ink-2">{a.justificativa}</p>
                  </li>
                ))}
                {c.apostilamentos.map((a) => (
                  <li key={a.id} className="py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-ink">{a.numero}º apostilamento</span>
                      <Chip tone="neutral">{TIPOS_APOSTILAMENTO[a.tipo] ?? a.tipo}</Chip>
                      <span className="text-[13px] text-ink-3">{dl(a.data)}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 text-[13.5px] text-ink-2">
                      {a.indice && (
                        <span>
                          {a.indice} {pct(num(a.percentual), 2)}
                        </span>
                      )}
                      {num(a.valor) > 0 && <span className="tnum">+{fmtMoeda(a.valor)}</span>}
                    </div>
                    <p className="mt-1 text-[13.5px] text-ink-2">{a.descricao}</p>
                  </li>
                ))}
              </ul>
            )}
            {gerir && (
              <div className="mt-4 space-y-3">
                <details className="rounded-xl border border-line open:bg-sunken/50">
                  <summary className="px-4 py-3 text-[14px] font-semibold text-brand">Registrar termo aditivo</summary>
                  <div className="px-4 pb-4">
                    <FormAditivo contratoId={c.id} natureza={c.natureza} baseLimite={fin.baseLimite} acrescimos={fin.acrescimos} continuo={c.natureza === "SERVICO_CONTINUO"} />
                  </div>
                </details>
                <details className="rounded-xl border border-line open:bg-sunken/50">
                  <summary className="px-4 py-3 text-[14px] font-semibold text-brand">Registrar apostilamento (reajuste)</summary>
                  <ActionForm action={apostilamentoAction} className="grid gap-3 px-4 pb-4 sm:grid-cols-2">
                    <input type="hidden" name="contratoId" value={c.id} />
                    <div>
                      <label className="label" htmlFor="ap-tipo">
                        Tipo
                      </label>
                      <select id="ap-tipo" name="tipo" className="input">
                        {Object.entries(TIPOS_APOSTILAMENTO).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label" htmlFor="ap-data">
                        Data
                      </label>
                      <input id="ap-data" name="data" type="date" className="input" required />
                    </div>
                    <div>
                      <label className="label" htmlFor="ap-indice">
                        Índice (reajuste)
                      </label>
                      <input id="ap-indice" name="indice" className="input" placeholder="IPCA" />
                    </div>
                    <div>
                      <label className="label" htmlFor="ap-pct">
                        Percentual (%)
                      </label>
                      <input id="ap-pct" name="percentual" className="input tnum" inputMode="decimal" placeholder="4,62" />
                      <p className="hint">Sem valor informado, o reajuste incide sobre o saldo atual ({fmtMoeda(fin.saldo)}).</p>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="label" htmlFor="ap-desc">
                        Descrição
                      </label>
                      <input id="ap-desc" name="descricao" className="input" required minLength={10} />
                    </div>
                    <div className="sm:col-span-2">
                      <SubmitButton pendingText="Registrando…">Registrar apostilamento</SubmitButton>
                    </div>
                  </ActionForm>
                </details>
              </div>
            )}
          </Panel>
        </div>

        {/* Lateral */}
        <aside className="space-y-6">
          <Panel title="Dados do contrato">
            <dl className="space-y-3.5">
              <Dado rotulo="Vigência">
                <span className="tnum">
                  {dl(c.vigenciaInicio)} a {dl(fin.vigenciaFimAtual)}
                </span>
                {fin.vigenciaFimAtual !== c.vigenciaFim && <span className="block text-[12.5px] text-ink-3">Fim original: {dl(c.vigenciaFim)}</span>}
                {fin.ativo && <span className="block text-[12.5px] text-ink-3">{fin.diasParaVencer} dias para terminar</span>}
              </Dado>
              <Dado rotulo="Natureza">{NATUREZAS_CONTRATO[c.natureza]?.nome ?? c.natureza}</Dado>
              <Dado rotulo="Modalidade">{MODALIDADES_CONTRATO[c.modalidade] ?? c.modalidade}</Dado>
              <Dado rotulo="Fonte de recurso">{nomeFonte(c.fonte)}</Dado>
              {c.unidadeGestora && <Dado rotulo="Unidade gestora">{c.unidadeGestora.nome}</Dado>}
              {c.setor && <Dado rotulo="Secretaria">{c.setor.nome}</Dado>}
              <Dado rotulo="Assinado em">{dl(c.assinadoEm)}</Dado>
              <Dado rotulo="Fiscal">
                {c.fiscal?.nome ?? "—"}
                {c.fiscal?.cargo && <span className="block text-[12.5px] text-ink-3">{c.fiscal.cargo}</span>}
              </Dado>
              <Dado rotulo="Gestor">
                {c.gestor?.nome ?? "—"}
                {c.gestor?.cargo && <span className="block text-[12.5px] text-ink-3">{c.gestor.cargo}</span>}
              </Dado>
              <Dado rotulo="Processo de origem">
                {c.processoOrigem ? (
                  <Link href={`/processos/${c.processoOrigem.id}`} className="font-semibold text-brand hover:underline">
                    <span className="tnum">{c.processoOrigem.numero}</span>
                    <span className="block text-[12.5px] font-normal text-ink-2">{c.processoOrigem.assunto}</span>
                  </Link>
                ) : (
                  <span className="text-ink-3">Não vinculado</span>
                )}
              </Dado>
              {obra && (
                <>
                  <Dado rotulo="Local da obra">{c.obraLocal}</Dado>
                  <Dado rotulo="Início e previsão de término">
                    <span className="tnum">
                      {dl(c.obraInicio)} a {dl(c.obraPrevisaoFim)}
                    </span>
                  </Dado>
                </>
              )}
              {c.situacao !== "ATIVO" && (
                <Dado rotulo={c.situacao === "RESCINDIDO" ? "Rescindido em" : "Encerrado em"}>
                  {dl(c.encerradoEm)}
                  {c.motivoEncerramento && <span className="block text-[13px] text-ink-2">{c.motivoEncerramento}</span>}
                </Dado>
              )}
            </dl>
          </Panel>

          {obra && (fiscal || gerir) && ativo && (
            <Panel title="Situação da obra">
              <ActionForm action={situacaoObraAction} className="space-y-3" resetOnOk={false}>
                <input type="hidden" name="contratoId" value={c.id} />
                <select name="situacao" className="input" defaultValue={c.obraSituacao ?? "EM_EXECUCAO"} aria-label="Situação da obra">
                  <option value="EM_EXECUCAO">Em execução</option>
                  <option value="PARALISADA">Paralisada</option>
                  <option value="CONCLUIDA">Concluída</option>
                </select>
                <div>
                  <label className="label" htmlFor="ob-motivo">
                    Motivo do atraso ou da paralisação (público)
                  </label>
                  <textarea id="ob-motivo" name="motivo" rows={3} className="input text-[13.5px]" defaultValue={c.obraMotivo ?? ""} />
                </div>
                <SubmitButton className="btn btn-quiet" pendingText="Salvando…">
                  Atualizar
                </SubmitButton>
              </ActionForm>
            </Panel>
          )}

          {gerir && (
            <details className="panel">
              <summary className="px-6 py-4 text-[14px] font-semibold text-ink-2">Encerrar ou rescindir</summary>
              <ActionForm action={encerrarAction} className="space-y-3 px-6 pb-6">
                <input type="hidden" name="contratoId" value={c.id} />
                <select name="tipo" className="input" aria-label="Tipo de encerramento">
                  <option value="ENCERRADO">Encerramento (objeto concluído)</option>
                  <option value="RESCINDIDO">Rescisão (extinção antecipada)</option>
                </select>
                <input name="data" type="date" className="input" required aria-label="Data" />
                <textarea name="motivo" rows={3} className="input text-[13.5px]" placeholder="Motivo e fundamento" required minLength={15} aria-label="Motivo" />
                <SubmitButton className="btn btn-danger" pendingText="Registrando…">
                  Registrar
                </SubmitButton>
              </ActionForm>
            </details>
          )}
          <p className="px-1 text-[12.5px] leading-relaxed text-ink-3">
            Garantias, documentos do contrato e publicação no PNCP ficam no processo de origem. As notas desta tela são registros de demonstração, sem validação na
            Receita (NF-e) ou no sistema de NFS-e.
          </p>
        </aside>
      </div>
    </>
  );
}

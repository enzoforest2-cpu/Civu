/* eslint-disable react-hooks/purity -- painel depende da hora atual; renderizado a cada requisição */
import Link from "next/link";
import { AlertOctagon, AlertTriangle, ArrowUpRight, CalendarClock, Info, PenLine, Sparkles, Timer } from "lucide-react";
import { exigirRota } from "@/lib/acesso";
import { obrigacoes } from "@/lib/conformidade";
import { filaDePagamentos, historicoDePagamentos } from "@/lib/pagamentos";
import { fmtData, fmtMoeda, relativo } from "@/lib/dates";
import { Cabecalho, Chip, Panel, Vazio, situacaoPrazo } from "@/components/ui";
import { pode } from "@/modulos/gestao/permissoes";
import { assinaturasPendentes, itensGabinete, numerosDaSemana } from "@/modulos/gestao/gabinete";
import { carregarIndicadores } from "@/modulos/gestao/indicadores";
import { gerarResumoSemanal } from "@/modulos/gestao/resumo";
import { DecisaoLote, type ItemLote } from "@/modulos/gestao/componentes/decisao-lote";
import { CartaoIndicador } from "@/modulos/gestao/componentes/tendencia";
import type { Gravidade } from "@/modulos/gestao/avaliador";
import { mapaDasSecretarias, type CartaoSecretaria } from "@/modulos/gestao/cabine";
import { RegrasSemaforo, SeloSemaforo } from "@/modulos/gestao/componentes/semaforo";
import { ChipPrazo } from "@/modulos/repasses/componentes";
import { fmtPct } from "@/modulos/financas/classificacao";

export const metadata = { title: "Sala do prefeito · Civu" };

const GRAV: Record<Gravidade, { rotulo: string; tom: "bad" | "warn" | "neutral"; Icone: typeof AlertOctagon }> = {
  ALTA: { rotulo: "Gravidade alta", tom: "bad", Icone: AlertOctagon },
  MEDIA: { rotulo: "Gravidade média", tom: "warn", Icone: AlertTriangle },
  BAIXA: { rotulo: "Gravidade baixa", tom: "neutral", Icone: Info },
};

export default async function GabinetePage() {
  const u = await exigirRota("/gabinete", pode.verGabinete);

  const [itens, assinaturas, painel, obs, filas, hist, semana, mapa] = await Promise.all([
    itensGabinete(u.municipioId),
    assinaturasPendentes(u.municipioId),
    carregarIndicadores(u.municipioId),
    obrigacoes(u.municipioId),
    filaDePagamentos(u.municipioId),
    historicoDePagamentos(u.municipioId, 90),
    numerosDaSemana(u.municipioId),
    mapaDasSecretarias(u.municipioId),
  ]);
  const riscoRep = mapa.repasses.filter((r) => r.risco.emRisco);

  const agora = Date.now();
  const itensLote: ItemLote[] = itens.map((i) => {
    const s = situacaoPrazo(i.prazo);
    return {
      id: i.id,
      numero: i.numero,
      assunto: i.assunto,
      urgencia: i.urgencia,
      etapa: i.etapa,
      tipoNome: i.tipoNome,
      prazoTexto: s.texto,
      prazoTom: s.tone === "brand" ? "ok" : s.tone,
      interessado: i.interessado,
      valorTexto: i.valor ? fmtMoeda(i.valor) : null,
      acaoRotulo: i.acao?.rotulo ?? null,
      gera: i.acao?.gerar.map((g) => g.nome) ?? [],
      bloqueio: i.bloqueio,
      recebido: i.recebido,
    };
  });
  const gabineteVencendo = itens.filter((i) => i.prazo && i.prazo.getTime() < agora + 86400_000).length;
  const obsAbertas = obs.filter((o) => o.situacao !== "cumprida");
  const obsVencidas = obsAbertas.filter((o) => o.situacao === "vencida");
  const obsProximas = obsAbertas.filter((o) => o.situacao !== "vencida" && o.prazo && o.prazo.getTime() < agora + 7 * 86400_000);
  const naFila = filas.reduce((s, f) => s + f.fila.length, 0);
  const valorNaFila = filas.reduce((s, f) => s + f.total, 0);
  // Alertas de repasse e obrigação da área ficam só no bloco "Repasses e obrigações com prazo crítico" (sem repetir em "Alertas")
  const alertasGerais = painel.alertas.filter((a) => !a.chave.startsWith("repasses."));
  const alertasDeRepasse = painel.alertas.length - alertasGerais.length;
  const alertasAltos = alertasGerais.filter((a) => a.gravidade === "ALTA").length;

  const resumo = gerarResumoSemanal({
    municipio: u.municipio.nome,
    inicio: semana.inicio,
    fim: semana.fim,
    abertos: semana.abertos,
    abertosAnterior: semana.abertosAnterior,
    concluidos: semana.concluidos,
    concluidosAnterior: semana.concluidosAnterior,
    estoque: semana.estoque,
    estoqueAnterior: semana.estoqueAnterior,
    atrasados: semana.atrasados,
    aguardandoGabinete: itens.length,
    gabineteVencendo,
    obrigacoesVencidas: obsVencidas.length,
    obrigacoesProximas: obsProximas.length,
    pagamentosNaFila: naFila,
    valorNaFila,
    quebrasOrdem: hist.quebras.length,
    alertasAltos,
    alertasTotal: alertasGerais.length,
    setorMaisCarregado: semana.setorMaisCarregado,
    secretarias: mapa.cartoes.map((c) => ({ nome: c.setor.nome, nivel: c.semaforo.nivel })),
    repassesEmRisco: riscoRep.length,
    valorRepassesEmRisco: riscoRep.reduce((s, r) => s + r.risco.valorEmRisco, 0),
    repassesVencidos: riscoRep.filter((r) => r.situacao === "COM_PENDENCIA" || r.prazoCritico?.alerta.nivel === "vencido").length,
    obrigacoesAreaVencidas: mapa.obrigacoes.filter((o) => o.alerta?.nivel === "vencido").length,
    pendenciasSecretarios: mapa.cartoes.reduce((s, c) => s + c.numeros.pendencias, 0),
  });

  const indicadores = painel.porModulo.flatMap((m) => m.indicadores);
  const indisponiveis = painel.porModulo.filter((m) => m.erro);
  const grupos = (["ALTA", "MEDIA", "BAIXA"] as Gravidade[]).map((g) => ({ g, itens: alertasGerais.filter((a) => a.gravidade === g) })).filter((x) => x.itens.length);

  return (
    <>
      <Cabecalho
        titulo="Sala do prefeito"
        sub={`O que precisa da sua decisão, o que está atrasado e como a prefeitura de ${u.municipio.nome} andou na semana.`}
      />

      {/* Resumo semanal */}
      <section className="mb-6 rounded-2xl border border-brand/20 bg-brand-soft/60 px-5 py-5 sm:px-7">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="display text-[19px] font-semibold text-brand-ink">{resumo.titulo}</h2>
          <span className="inline-flex items-center gap-1.5 text-[12px] text-brand-ink/80">
            <Sparkles size={13} /> Resumo montado por regras a partir dos dados do sistema, sem IA
          </span>
        </div>
        <div className="max-w-4xl space-y-2 text-[15px] leading-relaxed text-ink">
          {resumo.paragrafos.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      </section>

      {/* Mapa das secretarias */}
      <section className="mb-6" aria-labelledby="mapa-secretarias">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="mapa-secretarias" className="display text-[19px] font-semibold text-ink">
              Mapa das secretarias
            </h2>
            <p className="text-[13.5px] text-ink-2">Atrasos, execução do orçamento, repasses e assinaturas de cada pasta. Abra o cartão para ver a cabine da secretaria.</p>
          </div>
          <Resumo cartoes={mapa.cartoes} />
        </div>
        {mapa.cartoes.length === 0 ? (
          <Vazio>Nenhuma secretaria com cabine. Ligue cada secretaria à sua área e ao órgão orçamentário em Configurações, na seção Setores.</Vazio>
        ) : (
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2 xl:grid-cols-3">
            {mapa.cartoes.map((c) => (
              <li key={c.setor.id}>
                <CartaoMapa c={c} />
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3">
          <RegrasSemaforo />
        </div>
      </section>

      <div className="mb-6 grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Panel
            title={
              <span className="flex items-center gap-2">
                Aguardando sua decisão <span className="tnum rounded-full bg-sunken px-2 text-[13px] text-ink-2">{itens.length}</span>
              </span>
            }
          >
            <DecisaoLote itens={itensLote} podeDecidir={pode.decidirEmLote(u)} />
            {!pode.decidirEmLote(u) && itens.length > 0 && <p className="mt-3 text-[13px] text-ink-3">Somente o ordenador de despesa decide por esta tela. Você está vendo em modo consulta.</p>}
          </Panel>

          <Panel title="Documentos aguardando a assinatura do ordenador">
            {assinaturas.length === 0 ? (
              <Vazio icon={<PenLine size={22} className="text-ink-3" />}>Nenhum documento de outro setor esperando a sua assinatura.</Vazio>
            ) : (
              <ul className="divide-y divide-line">
                {assinaturas.map((a) => (
                  <li key={a.id + a.documento} className="flex flex-wrap items-start justify-between gap-2 py-3">
                    <div className="min-w-0">
                      <Link href={`/processos/${a.id}`} className="tnum font-semibold text-brand-2 hover:underline">
                        {a.numero}
                      </Link>{" "}
                      <span className="text-[14px] text-ink">{a.assunto}</span>
                      <div className="text-[13px] text-ink-3">
                        {a.documento} · em {a.setor}
                      </div>
                    </div>
                    <Link href={`/processos/${a.id}`} className="btn btn-quiet !py-1.5 text-[13px]">
                      Abrir e assinar
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            title="Repasses e obrigações com prazo crítico"
            action={
              <Link href="/repasses?situacao=risco" className="inline-flex min-h-[44px] items-center gap-1 text-[13px] font-semibold text-brand-2 hover:underline">
                Ver repasses em risco <ArrowUpRight size={14} aria-hidden />
              </Link>
            }
          >
            {mapa.repassesCriticos.length === 0 && mapa.obrigacoesCriticas.length === 0 ? (
              <Vazio icon={<Timer size={22} className="text-ink-3" aria-hidden />}>
                Nenhum repasse ou obrigação das secretarias vencido, com pendência ou vencendo nos próximos 15 dias.
              </Vazio>
            ) : (
              <ul className="divide-y divide-line">
                {mapa.repassesCriticos.map((r) => (
                  <li key={r.id} className="py-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1 basis-60">
                        <Link href={`/repasses/${r.id}`} className="alvo-toque font-semibold text-brand-2 hover:underline">
                          {r.rotulo}
                        </Link>
                        <span className="text-[13px] text-ink-3"> · {r.setor.nome}</span>
                        <div className="text-[14px] leading-snug text-ink">{r.objeto}</div>
                        <div className="tnum text-[12.5px] text-ink-3">
                          {r.risco.motivo ?? "Com pendência"}
                          {r.risco.valorEmRisco > 0 && <> · {fmtMoeda(r.risco.valorEmRisco)} em risco</>}
                        </div>
                      </div>
                      {r.prazoCritico ? <ChipPrazo alerta={r.prazoCritico.alerta} data={r.prazoCritico.data} rotulo={r.prazoCritico.rotulo} /> : <Chip tone="bad">Com pendência</Chip>}
                    </div>
                  </li>
                ))}
                {mapa.obrigacoesCriticas.map((o) => (
                  <li key={o.id} className="flex flex-wrap items-start justify-between gap-2 py-3">
                    <div className="min-w-0 flex-1 basis-60">
                      <Link href={`/obrigacoes-da-area/${o.id}`} className="alvo-toque font-semibold text-brand-2 hover:underline">
                        {o.nome}
                      </Link>
                      <div className="text-[12.5px] text-ink-3">
                        Obrigação de entrega · {o.setor.nome} · para {o.destinatario}
                        {o.exemplo && " · exemplo da demonstração"}
                      </div>
                    </div>
                    {o.alerta && <ChipPrazo alerta={o.alerta} data={o.proximoVencimento} />}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <Panel title="Alertas">
          {alertasDeRepasse > 0 && (
            <p className="mb-3 text-[13px] text-ink-2">
              Os {alertasDeRepasse === 1 ? "alerta" : "alertas"} de repasses e obrigações das secretarias {alertasDeRepasse === 1 ? "está" : "estão"} no bloco “Repasses e obrigações com prazo crítico”.
            </p>
          )}
          {grupos.length === 0 ? (
            <Vazio>Nenhum alerta aberto.</Vazio>
          ) : (
            <div className="space-y-5">
              {grupos.map(({ g, itens: lista }) => {
                const G = GRAV[g];
                return (
                  <div key={g}>
                    <div className="mb-2 flex items-center gap-2">
                      <Chip tone={G.tom}>
                        <G.Icone size={12} strokeWidth={2.5} /> {G.rotulo}
                      </Chip>
                      <span className="tnum text-[13px] text-ink-3">{lista.length}</span>
                    </div>
                    <ul className="space-y-2.5">
                      {lista.slice(0, 4).map((a) => (
                        <li key={a.chave} className="rounded-xl border border-line p-3">
                          <div className="text-[14px] leading-snug font-semibold text-ink">{a.titulo}</div>
                          {a.motivo && <p className="mt-0.5 text-[13px] leading-snug text-ink-2">{a.motivo}</p>}
                          {a.impacto && <p className="mt-1 text-[12.5px] leading-snug text-ink-3">Impacto: {a.impacto}</p>}
                          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[12px] text-ink-3">
                            <span>
                              {a.modulo}
                              {a.responsavel && <> · {a.responsavel}</>}
                            </span>
                            {a.acao && (
                              <Link href={a.acao.href} className="inline-flex items-center gap-1 font-semibold text-brand-2 hover:underline">
                                {a.acao.rotulo} <ArrowUpRight size={13} />
                              </Link>
                            )}
                          </div>
                        </li>
                      ))}
                      {lista.length > 4 && (
                        <li className="text-[13px] text-ink-3">
                          e mais {lista.length - 4}.{" "}
                          <Link href="/automacoes" className="font-semibold text-brand-2 hover:underline">
                            Ver todos
                          </Link>
                        </li>
                      )}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Indicadores" className="mb-6">
        {indicadores.length === 0 ? (
          <Vazio>Sem indicadores disponíveis.</Vazio>
        ) : (
          <div className="space-y-6">
            {painel.porModulo
              .filter((m) => m.indicadores.length > 0)
              .map((m) => (
                <div key={m.modulo}>
                  <h3 className="mb-2 text-[13px] font-semibold tracking-wide text-ink-3 uppercase">{m.modulo}</h3>
                  <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {m.indicadores.map((i) => (
                      <CartaoIndicador key={i.chave} i={i} />
                    ))}
                  </div>
                </div>
              ))}
          </div>
        )}
        {indisponiveis.length > 0 && (
          <p className="mt-3 flex items-start gap-1.5 text-[13px] text-warn">
            <AlertTriangle size={14} aria-hidden className="mt-0.5 shrink-0" /> Fonte indisponível no momento: {indisponiveis.map((m) => m.modulo).join(", ")}. Os demais indicadores seguem
            atualizados.
          </p>
        )}
        <p className="mt-3 text-[12.5px] text-ink-3">
          Cada indicador diz se é realizado (já aconteceu) ou projetado (estimativa), quem responde por ele e leva à sua origem. A tendência aparece nos que têm série semanal.
        </p>
      </Panel>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
        <Panel
          title="Agenda de prazos legais"
          action={
            <Link href="/obrigacoes" className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand-2 hover:underline">
              Ver todas <ArrowUpRight size={14} />
            </Link>
          }
        >
          {obsAbertas.length === 0 ? (
            <Vazio icon={<CalendarClock size={22} className="text-ink-3" />}>PNCP e Tribunal de Contas em dia.</Vazio>
          ) : (
            <ol className="relative space-y-3 border-l border-line pl-5">
              {obsAbertas.slice(0, 8).map((o) => {
                const tom = o.situacao === "vencida" ? "bad" : o.situacao === "vence" ? "warn" : "neutral";
                return (
                  <li key={o.processoId + o.chave} className="relative">
                    <span className={`absolute top-1.5 -left-[25px] h-2.5 w-2.5 rounded-full ${tom === "bad" ? "bg-bad" : tom === "warn" ? "bg-warn" : "bg-line-2"}`} />
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className="tnum text-[13.5px] font-semibold text-ink">{o.prazo ? fmtData(o.prazo) : "Sem prazo"}</span>
                      <Chip tone={tom}>{o.situacao === "vencida" ? `Venceu ${relativo(o.prazo)}` : o.prazo ? relativo(o.prazo) : "Pendente"}</Chip>
                    </div>
                    <div className="text-[13.5px] text-ink">{o.titulo}</div>
                    <div className="text-[12.5px] text-ink-3">
                      <Link href={`/processos/${o.processoId}#contratacao`} className="tnum font-semibold text-brand-2 hover:underline">
                        {o.numero}
                      </Link>{" "}
                      · {o.assunto}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </Panel>

        <Panel
          title="Pagamentos fora da ordem cronológica"
          action={
            <Link href="/fila-de-pagamentos" className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand-2 hover:underline">
              Fila pública <ArrowUpRight size={14} />
            </Link>
          }
        >
          <p className="mb-3 text-[13.5px] text-ink-2">
            Últimos 90 dias: <span className="tnum font-semibold text-ink">{hist.pagos.length}</span> pagamentos, <span className="tnum font-semibold text-ink">{hist.quebras.length}</span> fora da ordem.
            Na fila agora: <span className="tnum font-semibold text-ink">{naFila}</span> ({fmtMoeda(valorNaFila)}).
          </p>
          {hist.quebras.length === 0 ? (
            <Vazio>Nenhum pagamento fora da ordem nos últimos 90 dias.</Vazio>
          ) : (
            <ul className="space-y-3">
              {hist.quebras.map((q) => (
                <li key={q.processoId} className="rounded-xl border border-line p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <Link href={`/processos/${q.processoId}`} className="tnum font-semibold text-brand-2 hover:underline">
                      {q.numero}
                    </Link>
                    <span className="tnum text-[12.5px] text-ink-3">pago em {fmtData(q.pagoEm)}</span>
                  </div>
                  <div className="text-[13.5px] text-ink">
                    {q.fornecedor ?? q.assunto} · {q.fonteNome}
                  </div>
                  <div className="mt-1 text-[12.5px] text-ink-2">
                    Passou à frente de <span className="tnum">{q.quebra!.aFrente.join(", ")}</span>. Justificativa: “{q.quebra!.justificativa}”
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}

function Resumo({ cartoes }: { cartoes: CartaoSecretaria[] }) {
  const n = (nivel: string) => cartoes.filter((c) => c.semaforo.nivel === nivel).length;
  return (
    <p className="flex flex-wrap gap-2 text-[13px]">
      <SeloSemaforo nivel="vermelho" /> <span className="tnum self-center font-semibold text-ink">{n("vermelho")}</span>
      <SeloSemaforo nivel="amarelo" /> <span className="tnum self-center font-semibold text-ink">{n("amarelo")}</span>
      <SeloSemaforo nivel="verde" /> <span className="tnum self-center font-semibold text-ink">{n("verde")}</span>
    </p>
  );
}

const BORDA = { vermelho: "border-l-bad", amarelo: "border-l-warn", verde: "border-l-ok" } as const;

function CartaoMapa({ c }: { c: CartaoSecretaria }) {
  const x = c.numeros;
  return (
    <Link
      href={`/secretaria/${c.setor.sigla}`}
      className={`group flex h-full flex-col rounded-2xl border border-l-4 border-line bg-white p-4 transition-colors hover:border-line-2 hover:bg-sunken/40 ${BORDA[c.semaforo.nivel]}`}
    >
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0 font-semibold text-ink group-hover:text-brand-2">{c.setor.nome}</span>
        <SeloSemaforo nivel={c.semaforo.nivel} />
      </span>
      <span className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[12.5px] text-ink-3">
        <span>
          <span className={`tnum block text-[17px] font-semibold ${x.atrasados ? "text-bad" : "text-ink"}`}>{x.atrasados}</span>
          {x.atrasados === 1 ? "processo atrasado" : "processos atrasados"} de {x.emAndamento}
        </span>
        <span>
          <span className="tnum block text-[17px] font-semibold text-ink">{x.execucao == null ? "—" : fmtPct(x.execucao, 0)}</span>
          {x.execucao == null ? "sem orçamento próprio" : "do orçamento liquidado"}
        </span>
        <span>
          <span className={`tnum block text-[17px] font-semibold ${x.repassesEmRisco || x.obrigacoesVencidas ? "text-bad" : "text-ink"}`}>{x.repassesEmRisco}</span>
          {x.repassesEmRisco === 1 ? "repasse em risco" : "repasses em risco"}
          {x.obrigacoesVencidas > 0 && `, ${x.obrigacoesVencidas} ${x.obrigacoesVencidas === 1 ? "obrigação vencida" : "obrigações vencidas"}`}
        </span>
        <span>
          <span className={`tnum block text-[17px] font-semibold ${x.pendencias ? "text-warn" : "text-ink"}`}>{x.pendencias}</span>
          {x.pendencias === 1 ? "espera o(a) secretário(a)" : "esperam o(a) secretário(a)"}
        </span>
      </span>
      <span className="mt-3 border-t border-line pt-2.5 text-[12.5px] leading-snug text-ink-2">
        <span className="font-semibold text-ink">Por quê: </span>
        {c.semaforo.porque}
      </span>
      <span className="mt-auto inline-flex items-center gap-1 pt-2 text-[13px] font-semibold text-brand-2">
        Abrir a cabine <ArrowUpRight size={14} aria-hidden />
      </span>
    </Link>
  );
}

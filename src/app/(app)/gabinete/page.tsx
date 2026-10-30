/* eslint-disable react-hooks/purity -- painel depende da hora atual; renderizado a cada requisição */
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertOctagon, AlertTriangle, ArrowUpRight, CalendarClock, Info, PenLine, Sparkles } from "lucide-react";
import { requireUser } from "@/lib/auth";
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

export const metadata = { title: "Painel do prefeito · Civu" };

const GRAV: Record<Gravidade, { rotulo: string; tom: "bad" | "warn" | "neutral"; Icone: typeof AlertOctagon }> = {
  ALTA: { rotulo: "Gravidade alta", tom: "bad", Icone: AlertOctagon },
  MEDIA: { rotulo: "Gravidade média", tom: "warn", Icone: AlertTriangle },
  BAIXA: { rotulo: "Gravidade baixa", tom: "neutral", Icone: Info },
};

export default async function GabinetePage() {
  const u = await requireUser();
  if (!pode.verGabinete(u)) redirect("/painel");

  const [itens, assinaturas, painel, obs, filas, hist, semana] = await Promise.all([
    itensGabinete(u.municipioId),
    assinaturasPendentes(u.municipioId),
    carregarIndicadores(u.municipioId),
    obrigacoes(u.municipioId),
    filaDePagamentos(u.municipioId),
    historicoDePagamentos(u.municipioId, 90),
    numerosDaSemana(u.municipioId),
  ]);

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
  const alertasAltos = painel.alertas.filter((a) => a.gravidade === "ALTA").length;

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
    alertasTotal: painel.alertas.length,
    setorMaisCarregado: semana.setorMaisCarregado,
  });

  const indicadores = painel.porModulo.flatMap((m) => m.indicadores);
  const indisponiveis = painel.porModulo.filter((m) => m.erro);
  const grupos = (["ALTA", "MEDIA", "BAIXA"] as Gravidade[]).map((g) => ({ g, itens: painel.alertas.filter((a) => a.gravidade === g) })).filter((x) => x.itens.length);

  return (
    <>
      <Cabecalho
        titulo="Painel do prefeito"
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
                      <Link href={`/processos/${a.id}`} className="tnum font-semibold text-brand hover:underline">
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
        </div>

        <Panel title="Alertas">
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
                              <Link href={a.acao.href} className="inline-flex items-center gap-1 font-semibold text-brand hover:underline">
                                {a.acao.rotulo} <ArrowUpRight size={13} />
                              </Link>
                            )}
                          </div>
                        </li>
                      ))}
                      {lista.length > 4 && (
                        <li className="text-[13px] text-ink-3">
                          e mais {lista.length - 4}.{" "}
                          <Link href="/automacoes" className="font-semibold text-brand hover:underline">
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

      <Panel title="Indicadores" className="mb-6" action={<span className="text-[12.5px] text-ink-3">Tendência das últimas 8 semanas</span>}>
        {indicadores.length === 0 ? (
          <Vazio>Sem indicadores disponíveis.</Vazio>
        ) : (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {indicadores.map((i) => (
              <CartaoIndicador key={i.chave} i={i} />
            ))}
          </div>
        )}
        {indisponiveis.length > 0 && <p className="mt-3 text-[13px] text-warn">Fonte indisponível no momento: {indisponiveis.map((m) => m.modulo).join(", ")}.</p>}
        <p className="mt-3 text-[12.5px] text-ink-3">
          Todos os números são realizados (não projetados) e levam à sua origem. Indicadores de obras, finanças, tributos e serviços urbanos entram aqui à medida que cada módulo é
          implantado.
        </p>
      </Panel>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
        <Panel
          title="Agenda de prazos legais"
          action={
            <Link href="/obrigacoes" className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand hover:underline">
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
                      <Link href={`/processos/${o.processoId}#contratacao`} className="tnum font-semibold text-brand hover:underline">
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
            <Link href="/fila-de-pagamentos" className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand hover:underline">
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
                    <Link href={`/processos/${q.processoId}`} className="tnum font-semibold text-brand hover:underline">
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

/* eslint-disable react-hooks/purity -- painel depende da hora atual; renderizado a cada requisição */
import Link from "next/link";
import { and, asc, eq, isNull } from "drizzle-orm";
import { AlertTriangle, ArrowUpRight, Hourglass, Inbox, Undo2, ListOrdered } from "lucide-react";
import { db } from "@/db";
import { processos, unidadesGestoras } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { painel } from "@/lib/metricas";
import { obrigacoes, usoDoLimite } from "@/lib/conformidade";
import { filaDePagamentos } from "@/lib/pagamentos";
import { getEstado, nomeEtapa, type WorkflowDef } from "@/lib/workflow";
import { fmtData, fmtMoeda, relativo } from "@/lib/dates";
import { Panel, Vazio, NumeroProcesso, Chip, UrgenciaChip } from "@/components/ui";

function saudacao() {
  const h = Number(new Date().toLocaleString("pt-BR", { timeZone: "America/Fortaleza", hour: "2-digit", hour12: false }));
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export default async function PainelPage() {
  const u = await requireUser();
  const [m, abertos, obrigs, limites, filas, ugs] = await Promise.all([
    painel(u.municipioId),
    db.query.processos.findMany({
      where: and(eq(processos.municipioId, u.municipioId), isNull(processos.encerradoEm)),
      with: { setorAtual: true, tipo: true },
      orderBy: [asc(processos.prazoEtapaEm)],
    }),
    obrigacoes(u.municipioId),
    usoDoLimite(u.municipioId),
    filaDePagamentos(u.municipioId),
    db.query.unidadesGestoras.findMany({ where: eq(unidadesGestoras.municipioId, u.municipioId) }),
  ]);
  const obrigAbertas = obrigs.filter((o) => o.situacao !== "cumprida");
  const obrigVencidas = obrigs.filter((o) => o.situacao === "vencida").length;
  const nomeUg = (id: string) => ugs.find((g) => g.id === id)?.nome ?? "";
  const naFila = filas.reduce((s, f) => s + f.fila.length, 0);
  const agora = Date.now();
  const atrasados = abertos.filter((p) => p.prazoEtapaEm && p.prazoEtapaEm.getTime() < agora);
  const semReceber = abertos.filter((p) => !p.recebidoEm);
  const atencao = abertos.filter((p) => (p.prazoEtapaEm && p.prazoEtapaEm.getTime() < agora) || !p.recebidoEm);

  // fila por setor
  const setoresMap = new Map<string, { nome: string; itens: typeof abertos }>();
  for (const p of abertos) {
    const k = p.setorAtualId ?? "—";
    const cur = setoresMap.get(k) ?? { nome: p.setorAtual?.nome ?? "Sem setor", itens: [] };
    cur.itens.push(p);
    setoresMap.set(k, cur);
  }
  const fila = [...setoresMap.values()].sort((a, b) => b.itens.length - a.itens.length);
  const maxTempo = Math.max(1, ...m.tempoPorEstado.map((t) => t.mediaDias));
  const primeiroNome = u.nome.replace(/^(Dr|Dra)\.?\s+/i, "").split(" ")[0];

  return (
    <>
      {/* Resumo em uma frase — a primeira coisa que o gestor lê */}
      <section className="mb-10">
        <p className="text-[15px] text-ink-2">
          {saudacao()}, {primeiroNome}.
        </p>
        <h1 className="display mt-1 max-w-4xl text-[30px] leading-[1.1] sm:text-[40px] font-semibold text-ink">
          {abertos.length === 0 ? (
            "Nenhum processo em andamento."
          ) : (
            <>
              {plural(abertos.length, "processo em andamento", "processos em andamento")}
              {atrasados.length > 0 ? (
                <span className="text-bad">, {plural(atrasados.length, "com prazo estourado", "com prazo estourado")}</span>
              ) : (
                ", todos dentro do prazo"
              )}
              {semReceber.length > 0 && <> e {plural(semReceber.length, "esperando alguém receber", "esperando alguém receber")}</>}.
            </>
          )}
        </h1>
        <div className="mt-6 flex flex-wrap gap-x-10 gap-y-3 text-[14px] text-ink-2">
          <div>
            <span className="display tnum text-[22px] font-semibold text-ink">{m.totais.abertos30d}</span> abertos nos últimos 30 dias
          </div>
          <div>
            <span className="display tnum text-[22px] font-semibold text-ink">{m.totais.encerrados30d}</span> concluídos nos últimos 30 dias
          </div>
          <div>
            <span className="display tnum text-[22px] font-semibold text-ink">
              {m.totais.tempoMedioEncerradosDias == null ? "—" : Math.round(m.totais.tempoMedioEncerradosDias)}
            </span>{" "}
            dias, em média, da abertura ao arquivamento
          </div>
        </div>
      </section>

      {/* Onde os processos estão agora */}
      <Panel
        title="Onde os processos estão agora"
        action={
          <div className="hidden items-center gap-4 text-[12.5px] text-ink-3 sm:flex">
            <Legenda cor="bg-brand-2" texto="No prazo" />
            <Legenda cor="bg-warn" texto="Não recebido" />
            <Legenda cor="bg-bad" texto="Atrasado" />
          </div>
        }
        className="mb-6"
      >
        {fila.length === 0 ? (
          <Vazio>Nenhum processo em andamento.</Vazio>
        ) : (
          <ul className="divide-y divide-line">
            {fila.map((s) => (
              <li key={s.nome} className="grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-2 py-3.5 md:grid-cols-[240px_1fr_auto]">
                <span className="truncate font-medium text-ink">{s.nome}</span>
                <div className="order-3 col-span-2 flex flex-wrap gap-x-1.5 gap-y-[18px] md:order-none md:col-span-1">
                  {s.itens.map((p) => {
                    const atrasado = p.prazoEtapaEm && p.prazoEtapaEm.getTime() < agora;
                    const cor = atrasado ? "bg-bad hover:bg-bad/80" : !p.recebidoEm ? "bg-warn hover:bg-warn/80" : "bg-brand-2 hover:bg-brand-ink";
                    return (
                      <Link
                        key={p.id}
                        href={`/processos/${p.id}`}
                        title={`${p.numero} — ${p.assunto}`}
                        className={`alvo-toque tnum h-7 rounded-md px-2 text-[12px] leading-7 font-semibold text-white transition-colors ${cor}`}
                      >
                        {p.numero.slice(-4)}
                      </Link>
                    );
                  })}
                </div>
                <span className="display tnum w-8 text-right text-[18px] font-semibold text-ink">{s.itens.length}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* Conformidade: o que o sistema vigia sozinho */}
      <div className="mb-6 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-3">
        <Panel
          title="Obrigações legais"
          action={
            <Link href="/obrigacoes" className="alvo-toque inline-flex items-center gap-1 text-[13px] font-semibold text-brand-2 hover:underline">
              Ver todas <ArrowUpRight size={14} aria-hidden />
            </Link>
          }
        >
          <p className="text-[14px] text-ink-2">
            <span className={`display tnum text-[26px] font-semibold ${obrigVencidas ? "text-bad" : "text-ink"}`}>{obrigVencidas}</span> com prazo vencido ·{" "}
            <span className="tnum font-semibold text-ink">{obrigAbertas.length}</span> em aberto
          </p>
          {obrigAbertas.length === 0 ? (
            <p className="mt-3 text-[13.5px] text-ok">PNCP e Tribunal de Contas em dia.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {obrigAbertas.slice(0, 4).map((o) => (
                <li key={o.processoId + o.chave} className="text-[13.5px] leading-snug">
                  <Link href={`/processos/${o.processoId}#contratacao`} className="tnum font-semibold text-brand-2 hover:underline">
                    {o.numero}
                  </Link>{" "}
                  <span className="text-ink">{o.chave === "PNCP" ? "PNCP" : "Tribunal de Contas"}</span>
                  <span className={o.situacao === "vencida" ? "text-bad" : "text-ink-3"}>
                    {" "}
                    · {o.prazo ? (o.situacao === "vencida" ? `venceu ${relativo(o.prazo)}` : `até ${fmtData(o.prazo)}`) : "sem prazo"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Limite de dispensa no ano">
          {limites.length === 0 ? (
            <Vazio>Nenhuma dispensa por valor registrada neste ano.</Vazio>
          ) : (
            <ul className="space-y-3">
              {limites.slice(0, 4).map((l) => (
                <li key={l.ugId + l.natureza}>
                  <div className="flex items-baseline justify-between gap-2 text-[13.5px]">
                    <span className="truncate text-ink" title={`${l.naturezaNome} · ${nomeUg(l.ugId)}`}>
                      {l.naturezaNome}
                    </span>
                    <span className={`tnum shrink-0 font-semibold ${l.situacao === "excede" ? "text-bad" : l.situacao === "atencao" ? "text-warn" : "text-ink-2"}`}>
                      {Math.round(l.pct * 100)}%
                    </span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-sunken">
                    <div
                      className={`h-2 rounded-full ${l.situacao === "excede" ? "bg-bad" : l.situacao === "atencao" ? "bg-warn" : "bg-brand"}`}
                      style={{ width: `${Math.min(100, Math.max(3, l.pct * 100))}%` }}
                    />
                  </div>
                  <div className="mt-0.5 text-[12px] text-ink-3">
                    {fmtMoeda(l.soma)} de {fmtMoeda(l.limite)} · {nomeUg(l.ugId)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="Fila de pagamentos"
          action={
            <Link href="/fila-de-pagamentos" className="alvo-toque inline-flex items-center gap-1 text-[13px] font-semibold text-brand-2 hover:underline">
              Página pública <ArrowUpRight size={14} aria-hidden />
            </Link>
          }
        >
          {naFila === 0 ? (
            <Vazio icon={<ListOrdered size={22} className="text-ink-3" />}>Nenhum pagamento aguardando.</Vazio>
          ) : (
            <ul className="space-y-2.5">
              {filas.map((f) => (
                <li key={f.fonte} className="text-[13.5px]">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-ink">{f.fonteNome}</span>
                    <span className="tnum shrink-0 text-ink-2">{f.fila.length}</span>
                  </div>
                  <div className="text-[12px] text-ink-3">
                    Próximo: <span className="tnum">{f.fila[0].numero}</span> · {fmtMoeda(f.fila[0].valor)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Panel
          title="Precisa de atenção"
          action={
            <Link href="/processos?situacao=atrasados" className="alvo-toque inline-flex items-center gap-1 text-[13px] font-semibold text-brand-2 hover:underline">
              Ver todos <ArrowUpRight size={14} aria-hidden />
            </Link>
          }
        >
          {atencao.length === 0 ? (
            <Vazio>Tudo em dia. Nenhum processo atrasado ou parado sem recebimento.</Vazio>
          ) : (
            <ul className="divide-y divide-line">
              {atencao.slice(0, 8).map((p) => {
                const atrasado = p.prazoEtapaEm && p.prazoEtapaEm.getTime() < agora;
                const etapa = getEstado(p.tipo.definicao as WorkflowDef, p.estadoAtual);
                return (
                  <li key={p.id} className="flex items-start gap-4 py-3.5">
                    <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${atrasado ? "bg-bad-soft text-bad" : "bg-warn-soft text-warn"}`}>
                      {atrasado ? <AlertTriangle size={17} /> : <Inbox size={17} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <NumeroProcesso id={p.id} numero={p.numero} />
                        <UrgenciaChip u={p.urgencia} />
                      </div>
                      <div className="truncate text-[14.5px] text-ink">{p.assunto}</div>
                      <div className="text-[13px] text-ink-3">
                        {etapa ? nomeEtapa(etapa.nome) : p.estadoAtual} · {p.setorAtual?.nome ?? "—"}
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-[13px]">
                      {atrasado ? (
                        <Chip tone="bad">Atrasado {relativo(p.prazoEtapaEm)}</Chip>
                      ) : (
                        <Chip tone="warn">Não recebido</Chip>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <div className="space-y-6">
          <Panel title="Quanto tempo cada etapa leva">
            {m.tempoPorEstado.length === 0 ? (
              <Vazio icon={<Hourglass size={22} className="text-ink-3" />}>Ainda não há histórico suficiente.</Vazio>
            ) : (
              <ul className="space-y-2.5">
                {m.tempoPorEstado.slice(0, 8).map((t) => (
                  <li key={t.nome} className="grid grid-cols-[minmax(0,190px)_1fr_52px] items-center gap-3 text-[13.5px]">
                    <span className="truncate text-ink-2" title={nomeEtapa(t.nome)}>
                      {nomeEtapa(t.nome)}
                    </span>
                    <span className="h-2 rounded-full bg-sunken">
                      <span className="block h-2 rounded-full bg-brand" style={{ width: `${Math.max(4, (t.mediaDias / maxTempo) * 100)}%` }} />
                    </span>
                    <span className="tnum text-right font-semibold text-ink">{t.mediaDias.toFixed(1)} d</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Devoluções nos últimos 30 dias">
            {m.devolucoes.length === 0 ? (
              <Vazio icon={<Undo2 size={22} className="text-ink-3" />}>Nenhum processo foi devolvido.</Vazio>
            ) : (
              <ul className="space-y-2">
                {m.devolucoes.map((d) => (
                  <li key={d.rotulo} className="flex items-center justify-between gap-3 text-[14px]">
                    <span className="text-ink-2">{d.rotulo}</span>
                    <span className="display tnum font-semibold">{d.n}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}

function Legenda({ cor, texto }: { cor: string; texto: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-sm ${cor}`} />
      {texto}
    </span>
  );
}

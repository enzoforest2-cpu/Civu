import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { indicadores, setoresResponsaveis } from "@/modulos/servicos/dados";
import { Aba, Barra, Estrelas } from "@/modulos/servicos/componentes";
import { Cabecalho, Panel, Vazio } from "@/components/ui";

const PERIODOS = [30, 60, 90];
const fmt1 = (n: number) =>
  n.toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

export default async function IndicadoresServicos({ searchParams }: { searchParams: Promise<{ dias?: string; setor?: string }> }) {
  const u = await requireUser();
  const sp = await searchParams;
  const dias = PERIODOS.includes(Number(sp.dias)) ? Number(sp.dias) : 60;
  const setores = await setoresResponsaveis(u.municipioId);
  const setorSel = setores.find((s) => s.sigla === sp.setor);
  const m = await indicadores(u.municipioId, dias, setorSel?.id);
  const href = (x: { dias?: number; setor?: string | null }) => {
    const p = new URLSearchParams({ dias: String(x.dias ?? dias) });
    const s = x.setor === undefined ? setorSel?.sigla : x.setor;
    if (s) p.set("setor", s);
    return `/servicos/indicadores?${p.toString()}`;
  };
  const maxBairro = Math.max(1, ...m.porBairro.map((b) => b.total));
  const maxNotas = Math.max(1, ...m.notas);
  const maxTempo = Math.max(1, ...m.porServico.map((s) => s.mediaDias ?? 0));

  return (
    <>
      <Cabecalho
        titulo="Indicadores de serviços urbanos"
        sub={`Situação atual das ocorrências e resultado dos pedidos registrados nos últimos ${dias} dias${setorSel ? `, ${setorSel.nome}` : ""}.`}
        acao={
          <Link href={setorSel ? `/servicos?setor=${setorSel.sigla}` : "/servicos?setor=todas"} className="btn btn-quiet">
            Abrir a fila
          </Link>
        }
      />
      <div className="mb-3 flex flex-wrap gap-2">
        <Aba href={href({ setor: null })} ativa={!setorSel} rotulo="Todas as secretarias" />
        {setores.map((s) => (
          <Aba key={s.id} href={href({ setor: s.sigla })} ativa={setorSel?.id === s.id} rotulo={s.nome} />
        ))}
      </div>
      <div className="mb-7 flex flex-wrap gap-2">
        {PERIODOS.map((p) => (
          <Link
            key={p}
            href={href({ dias: p })}
            aria-current={p === dias ? "page" : undefined}
            className={`rounded-lg px-3 py-1.5 text-[13.5px] font-medium ${p === dias ? "bg-brand-soft text-brand-ink" : "text-ink-2 hover:bg-sunken"}`}
          >
            Últimos {p} dias
          </Link>
        ))}
      </div>

      <section className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Tile
          rotulo="Em aberto agora"
          valor={String(m.abertas)}
          extra={`${m.triagem} aguardando triagem`}
          href={`/servicos?setor=${setorSel?.sigla ?? "todas"}`}
        />
        <Tile
          rotulo="Atrasadas no prazo-alvo"
          valor={String(m.atrasadas)}
          extra={m.abertas ? `${Math.round((m.atrasadas / m.abertas) * 100)}% das abertas` : "—"}
          tone={m.atrasadas > 0 ? "bad" : undefined}
          href={`/servicos?setor=${setorSel?.sigla ?? "todas"}&atrasadas=1`}
        />
        <Tile
          rotulo="Concluídas no período"
          valor={String(m.concluidas)}
          extra={m.pctNoPrazo !== null ? `${m.pctNoPrazo}% dentro do prazo-alvo` : "nenhuma concluída"}
        />
        <Tile
          rotulo="Tempo médio de atendimento"
          valor={m.tempoMedioDias !== null ? `${fmt1(m.tempoMedioDias)} dias` : "—"}
          extra="do registro à conclusão, dias corridos"
        />
        <Tile
          rotulo="Satisfação média"
          valor={m.satisfacao !== null ? fmt1(m.satisfacao) : "—"}
          extra={m.satisfacao !== null ? <Estrelas nota={m.satisfacao} tamanho={13} /> : "sem avaliações"}
          rodape={`${m.avaliacoes} ${m.avaliacoes === 1 ? "avaliação" : "avaliações"}`}
        />
      </section>

      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Panel title="Tempo médio de atendimento por serviço" pad={false}>
          {m.porServico.length === 0 ? (
            <div className="p-6">
              <Vazio>Nenhum pedido no período.</Vazio>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="lista">
                <thead>
                  <tr>
                    <th>Serviço</th>
                    <th className="text-right">Pedidos</th>
                    <th className="min-w-[200px]">Tempo médio (dias corridos)</th>
                    <th className="text-right">No prazo</th>
                  </tr>
                </thead>
                <tbody>
                  {m.porServico.map((s) => (
                    <tr key={s.nome}>
                      <td className="min-w-[200px]">
                        <div className="font-medium text-ink">{s.nome}</div>
                        <div className="text-[12.5px] text-ink-3">
                          Prazo-alvo {s.sla} {s.sla === 1 ? "dia útil" : "dias úteis"} · {s.abertas} em aberto
                        </div>
                      </td>
                      <td className="tnum text-right">{s.total}</td>
                      <td title={s.mediaDias !== null ? `${s.concluidas} concluídas, média de ${fmt1(s.mediaDias)} dias` : "Nenhuma concluída no período"}>
                        {s.mediaDias !== null ? (
                          <Barra valor={s.mediaDias} max={maxTempo} rotulo={fmt1(s.mediaDias)} />
                        ) : (
                          <span className="text-[13px] text-ink-3">sem conclusões</span>
                        )}
                      </td>
                      <td className="tnum text-right">{s.concluidas ? `${Math.round((s.noPrazo / s.concluidas) * 100)}%` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Pedidos por bairro" pad={false}>
          {m.porBairro.length === 0 ? (
            <div className="p-6">
              <Vazio>Nenhum pedido no período.</Vazio>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="lista">
                <thead>
                  <tr>
                    <th>Bairro</th>
                    <th className="w-[45%]">Pedidos no período</th>
                    <th className="text-right">Abertos</th>
                    <th className="text-right">Atrasados</th>
                  </tr>
                </thead>
                <tbody>
                  {m.porBairro.map((b) => (
                    <tr key={b.bairro}>
                      <td className="min-w-[140px] text-[14px] font-medium text-ink">{b.bairro}</td>
                      <td title={`${b.total} pedidos, ${b.abertas} em aberto`}>
                        <Barra valor={b.total} max={maxBairro} rotulo={b.total} />
                      </td>
                      <td className="tnum text-right">{b.abertas}</td>
                      <td className={`tnum text-right ${b.atrasadas ? "font-semibold text-bad" : "text-ink-3"}`}>{b.atrasadas}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      <Panel title="O que os cidadãos disseram" className="mt-6">
        {m.avaliacoes === 0 ? (
          <Vazio>Nenhuma avaliação no período. O cidadão avalia pelo portal depois que o serviço é concluído.</Vazio>
        ) : (
          <div className="grid gap-8 lg:grid-cols-[320px_minmax(0,1fr)]">
            <div className="space-y-2">
              {[5, 4, 3, 2, 1].map((n) => (
                <div
                  key={n}
                  className="grid grid-cols-[64px_minmax(0,1fr)] items-center gap-3 text-[13.5px]"
                  title={`${m.notas[n - 1]} avaliações com nota ${n}`}
                >
                  <span className="text-ink-2">
                    {n} {n === 1 ? "estrela" : "estrelas"}
                  </span>
                  <Barra valor={m.notas[n - 1]} max={maxNotas} rotulo={m.notas[n - 1]} />
                </div>
              ))}
            </div>
            <ul className="space-y-4">
              {m.comentarios.map((c) => (
                <li key={c.id} className="border-l-2 border-line pl-4">
                  <Estrelas nota={c.nota} tamanho={13} />
                  <p className="mt-1 text-[14.5px] text-ink">“{c.texto}”</p>
                  <Link href={`/servicos/${c.id}`} className="text-[12.5px] text-ink-3 hover:text-brand-2">
                    {c.servico} · {c.bairro}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Panel>
      <p className="mt-4 max-w-3xl text-[13px] text-ink-3">
        Dados de demonstração do município fictício Vale das Araucárias. O prazo-alvo conta dias úteis a partir do registro, descontando feriados cadastrados;
        pedidos duplicados não entram no tempo médio.
      </p>
    </>
  );
}

function Tile({
  rotulo,
  valor,
  extra,
  rodape,
  tone,
  href,
}: {
  rotulo: string;
  valor: string;
  extra?: React.ReactNode;
  rodape?: string;
  tone?: "bad";
  href?: string;
}) {
  const corpo = (
    <>
      <div className="text-[13px] text-ink-2">{rotulo}</div>
      <div className={`tnum display mt-1 text-[30px] leading-none font-bold ${tone === "bad" ? "text-bad" : "text-ink"}`}>{valor}</div>
      {extra && <div className="mt-2 text-[12.5px] text-ink-3">{extra}</div>}
      {rodape && <div className="mt-1 text-[12.5px] text-ink-3">{rodape}</div>}
    </>
  );
  return href ? (
    <Link href={href} className="panel block p-5 transition-colors hover:border-brand">
      {corpo}
    </Link>
  ) : (
    <div className="panel p-5">{corpo}</div>
  );
}

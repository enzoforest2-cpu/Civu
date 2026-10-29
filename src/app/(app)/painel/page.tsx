import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { painel } from "@/lib/metricas";
import { Card, Stat, PageHeader, Badge, Prazo, NumeroProcesso, Empty, UrgenciaBadge } from "@/components/ui";

export default async function PainelPage() {
  const u = await requireUser();
  const m = await painel(u.municipioId);
  const maxSetor = Math.max(1, ...m.porSetor.map((s) => s.n));
  const maxEstado = Math.max(1, ...m.porEstado.map((s) => s.n));

  return (
    <>
      <PageHeader title="Painel" subtitle={`O que está parado, onde e há quanto tempo — ${u.municipio.nome}`} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label="Em andamento" value={m.totais.abertos} hint={`${m.totais.abertos30d} abertos nos últimos 30 dias`} />
        <Stat label="Com prazo estourado" value={m.totais.atrasados} tone={m.totais.atrasados ? "bad" : "ok"} hint="SLA da etapa vencido" />
        <Stat
          label="Enviados sem recebimento"
          value={m.totais.naoRecebidos}
          tone={m.totais.naoRecebidos ? "warn" : "ok"}
          hint="setor de destino ainda não confirmou"
        />
        <Stat label="Encerrados (30 dias)" value={m.totais.encerrados30d} />
        <Stat
          label="Tempo médio até encerrar"
          value={m.totais.tempoMedioEncerradosDias == null ? "—" : `${m.totais.tempoMedioEncerradosDias.toFixed(0)} d`}
          hint="abertura → arquivamento"
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card title="Processos por setor" className="xl:col-span-1">
          {m.porSetor.length === 0 ? (
            <Empty>Nenhum processo em andamento.</Empty>
          ) : (
            <ul className="space-y-3">
              {m.porSetor.map((s) => (
                <li key={s.setorId ?? "none"}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="truncate font-medium">{s.nome}</span>
                    <span className="ml-3 tabular-nums text-ink-2">{s.n}</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full rounded-full bg-slate-100">
                    <div className="h-1.5 rounded-full bg-brand" style={{ width: `${(s.n / maxSetor) * 100}%` }} />
                  </div>
                  <div className="mt-1 flex gap-2 text-[11px] text-ink-3">
                    {s.atrasados > 0 && <span className="text-bad">{s.atrasados} atrasado(s)</span>}
                    {s.naoRecebidos > 0 && <span className="text-warn">{s.naoRecebidos} sem recebimento</span>}
                    {s.urgentes > 0 && <span>{s.urgentes} urgente(s)</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Processos por etapa" className="xl:col-span-1">
          {m.porEstado.length === 0 ? (
            <Empty>Nenhum processo em andamento.</Empty>
          ) : (
            <ul className="space-y-2.5">
              {m.porEstado.map((e) => (
                <li key={e.nome} className="flex items-center gap-3 text-sm">
                  <span className="w-44 shrink-0 truncate" title={e.nome}>
                    {e.nome}
                  </span>
                  <div className="h-1.5 flex-1 rounded-full bg-slate-100">
                    <div className="h-1.5 rounded-full bg-info" style={{ width: `${(e.n / maxEstado) * 100}%` }} />
                  </div>
                  <span className="w-6 text-right tabular-nums text-ink-2">{e.n}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Tempo médio em cada etapa" className="xl:col-span-1">
          {m.tempoPorEstado.length === 0 ? (
            <Empty>Ainda não há histórico suficiente.</Empty>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Etapa</th>
                  <th className="text-right">Média (dias)</th>
                  <th className="text-right">n</th>
                </tr>
              </thead>
              <tbody>
                {m.tempoPorEstado.slice(0, 10).map((t) => (
                  <tr key={t.nome}>
                    <td className="truncate">{t.nome}</td>
                    <td className="text-right tabular-nums">{t.mediaDias.toFixed(1)}</td>
                    <td className="text-right tabular-nums text-ink-3">{t.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card
          title="Prazos estourados"
          className="xl:col-span-2"
          action={
            <Link href="/processos?atrasados=1" className="text-xs font-semibold text-brand hover:underline">
              ver todos
            </Link>
          }
        >
          {m.parados.length === 0 ? (
            <Empty>Nenhum processo com prazo vencido.</Empty>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Número</th>
                  <th>Assunto</th>
                  <th>Etapa</th>
                  <th>Setor</th>
                  <th>Prazo</th>
                </tr>
              </thead>
              <tbody>
                {m.parados.map((p) => (
                  <tr key={p.id} className="row-link">
                    <td>
                      <NumeroProcesso id={p.id} numero={p.numero} />
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className="truncate">{p.assunto}</span>
                        <UrgenciaBadge u={p.urgencia} />
                      </div>
                    </td>
                    <td className="text-ink-2">{p.estado}</td>
                    <td className="text-ink-2">{p.setor}</td>
                    <td>
                      <Prazo prazo={p.prazoEtapaEm} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title="Devoluções (30 dias)">
          {m.devolucoes.length === 0 ? (
            <Empty>Nenhuma devolução no período.</Empty>
          ) : (
            <ul className="space-y-2">
              {m.devolucoes.map((d) => (
                <li key={d.rotulo} className="flex items-center justify-between text-sm">
                  <span className="truncate">{d.rotulo}</span>
                  <Badge tone="warn">{d.n}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

import "server-only";
import { and, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { eventos, processos, setores, tiposProcesso } from "@/db/schema";
import { nomeDaEtapa, type WorkflowDef } from "./workflow";

export async function painel(municipioId: string) {
  const agora = new Date();
  const [tipos, setoresRows] = await Promise.all([
    db.query.tiposProcesso.findMany({ where: eq(tiposProcesso.municipioId, municipioId) }),
    db.query.setores.findMany({ where: eq(setores.municipioId, municipioId) }),
  ]);
  const nomeEstado = (tipoId: string, chave: string) => {
    const t = tipos.find((x) => x.id === tipoId);
    return nomeDaEtapa(t?.definicao as WorkflowDef | undefined, chave);
  };
  const nomeSetor = (id: string | null) => setoresRows.find((s) => s.id === id)?.nome ?? "Sem setor";

  const abertos = await db
    .select({ tipoId: processos.tipoId, estado: processos.estadoAtual, n: sql<number>`count(*)::int` })
    .from(processos)
    .where(and(eq(processos.municipioId, municipioId), isNull(processos.encerradoEm)))
    .groupBy(processos.tipoId, processos.estadoAtual);

  const porSetor = await db
    .select({
      setorId: processos.setorAtualId,
      n: sql<number>`count(*)::int`,
      atrasados: sql<number>`count(*) filter (where ${processos.prazoEtapaEm} < now())::int`,
      naoRecebidos: sql<number>`count(*) filter (where ${processos.recebidoEm} is null)::int`,
      urgentes: sql<number>`count(*) filter (where ${processos.urgencia} = 'URGENTE')::int`,
    })
    .from(processos)
    .where(and(eq(processos.municipioId, municipioId), isNull(processos.encerradoEm)))
    .groupBy(processos.setorAtualId);

  const [totais] = await db
    .select({
      abertos: sql<number>`count(*) filter (where ${processos.encerradoEm} is null)::int`,
      atrasados: sql<number>`count(*) filter (where ${processos.encerradoEm} is null and ${processos.prazoEtapaEm} < now())::int`,
      naoRecebidos: sql<number>`count(*) filter (where ${processos.encerradoEm} is null and ${processos.recebidoEm} is null)::int`,
      encerrados30d: sql<number>`count(*) filter (where ${processos.encerradoEm} >= now() - interval '30 days')::int`,
      abertos30d: sql<number>`count(*) filter (where ${processos.abertoEm} >= now() - interval '30 days')::int`,
      tempoMedioEncerradosDias: sql<
        number | null
      >`avg(extract(epoch from (${processos.encerradoEm} - ${processos.abertoEm})) / 86400) filter (where ${processos.encerradoEm} is not null)`,
    })
    .from(processos)
    .where(eq(processos.municipioId, municipioId));

  const parados = await db.query.processos.findMany({
    where: and(eq(processos.municipioId, municipioId), isNull(processos.encerradoEm), lt(processos.prazoEtapaEm, agora)),
    with: { setorAtual: true, tipo: true },
    orderBy: (p, { asc }) => [asc(p.prazoEtapaEm)],
    limit: 12,
  });

  // devoluções dos últimos 30 dias por motivo (rótulo da transição)
  const trintaDias = new Date(Date.now() - 30 * 86400_000);
  const devolucoesRows = await db
    .select({ rotulo: sql<string>`coalesce(${eventos.dados}->>'rotulo', 'Devolução')`, n: sql<number>`count(*)::int` })
    .from(eventos)
    .innerJoin(processos, eq(eventos.processoId, processos.id))
    .where(and(eq(processos.municipioId, municipioId), eq(eventos.tipo, "DEVOLUCAO"), gte(eventos.criadoEm, trintaDias)))
    .groupBy(sql`1`)
    .orderBy(sql`2 desc`);

  // tempo médio por estado: duração entre eventos de mudança de estado
  const evs = await db
    .select({
      processoId: eventos.processoId,
      seq: eventos.seq,
      deEstado: eventos.deEstado,
      paraEstado: eventos.paraEstado,
      criadoEm: eventos.criadoEm,
      tipoId: processos.tipoId,
    })
    .from(eventos)
    .innerJoin(processos, eq(eventos.processoId, processos.id))
    .where(and(eq(processos.municipioId, municipioId), inArray(eventos.tipo, ["ABERTURA", "MUDANCA_ESTADO", "DEVOLUCAO", "ENCERRAMENTO"])))
    .orderBy(eventos.processoId, eventos.seq);
  const acum = new Map<string, { soma: number; n: number; nome: string }>();
  for (let i = 1; i < evs.length; i++) {
    const a = evs[i - 1],
      b = evs[i];
    if (a.processoId !== b.processoId || !a.paraEstado) continue;
    const dias = (b.criadoEm.getTime() - a.criadoEm.getTime()) / 86400_000;
    const k = a.tipoId + ":" + a.paraEstado;
    const cur = acum.get(k) ?? { soma: 0, n: 0, nome: nomeEstado(a.tipoId, a.paraEstado) };
    cur.soma += dias;
    cur.n += 1;
    acum.set(k, cur);
  }
  const tempoPorEstado = [...acum.values()].map((v) => ({ nome: v.nome, mediaDias: v.soma / v.n, n: v.n })).sort((x, y) => y.mediaDias - x.mediaDias);

  return {
    totais: { ...totais, tempoMedioEncerradosDias: totais.tempoMedioEncerradosDias == null ? null : Number(totais.tempoMedioEncerradosDias) },
    porEstado: abertos.map((r) => ({ nome: nomeEstado(r.tipoId, r.estado), n: r.n })).sort((a, b) => b.n - a.n),
    porSetor: porSetor.map((r) => ({ ...r, nome: nomeSetor(r.setorId) })).sort((a, b) => b.n - a.n),
    parados: parados.map((p) => ({
      id: p.id,
      numero: p.numero,
      assunto: p.assunto,
      setor: p.setorAtual?.nome ?? "—",
      estado: nomeEstado(p.tipoId, p.estadoAtual),
      prazoEtapaEm: p.prazoEtapaEm,
      urgencia: p.urgencia,
    })),
    devolucoes: devolucoesRows,
    tempoPorEstado,
  };
}

import Link from "next/link";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { municipios, processos } from "@/db/schema";
import { getEstado, type WorkflowDef } from "@/lib/workflow";
import { fmtData, fmtDataHora } from "@/lib/dates";
import { Badge } from "@/components/ui";

export const dynamic = "force-dynamic";

/** Consulta pública: qualquer pessoa acompanha um processo pelo número (LAI, art. 7º). Sem dados pessoais. */
export default async function ConsultaPage({ searchParams }: { searchParams: Promise<{ numero?: string; m?: string }> }) {
  const sp = await searchParams;
  const numero = sp.numero?.trim();
  const lista = await db.query.municipios.findMany({ orderBy: municipios.nome });
  const mun = lista.find((x) => x.slug === sp.m) ?? lista[0];
  const p =
    numero && mun
      ? await db.query.processos.findFirst({
          where: and(eq(processos.municipioId, mun.id), eq(processos.numero, numero)),
          with: {
            tipo: true,
            setorAtual: true,
            eventos: {
              where: (e) => inArray(e.tipo, ["ABERTURA", "MUDANCA_ESTADO", "DEVOLUCAO", "ENVIO", "RECEBIMENTO", "ENCERRAMENTO"]),
              orderBy: (e, { desc }) => [desc(e.seq)],
              with: { deSetor: true, paraSetor: true },
            },
          },
        })
      : null;
  const def = p ? (p.tipo.definicao as WorkflowDef) : null;

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <div className="text-lg font-semibold tracking-tight">Trâmite</div>
          <div className="text-sm text-ink-2">Consulta pública de processos</div>
        </div>
        <Link href="/login" className="text-sm text-brand hover:underline">
          Acesso do servidor
        </Link>
      </div>
      <form className="card flex flex-wrap items-end gap-3 p-5" method="get">
        <div className="min-w-[220px] flex-1">
          <label className="label">Município</label>
          <select name="m" className="input" defaultValue={mun?.slug}>
            {lista.map((x) => (
              <option key={x.id} value={x.slug}>
                {x.nome} – {x.uf}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[220px] flex-1">
          <label className="label">Número do processo</label>
          <input name="numero" className="input font-mono" placeholder="2026/000001" defaultValue={numero ?? ""} required />
        </div>
        <button className="btn btn-primary">Consultar</button>
      </form>

      {numero && !p && (
        <div className="mt-6 rounded-lg border border-line bg-white p-5 text-sm text-ink-2">
          Nenhum processo com o número <span className="font-mono">{numero}</span> em {mun?.nome}.
        </div>
      )}

      {p && def && (
        <div className="card mt-6 p-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono font-semibold text-brand">{p.numero}</span>
            <Badge tone="brand">{p.tipo.nome}</Badge>
            {p.encerradoEm ? <Badge tone="ok">Encerrado em {fmtData(p.encerradoEm)}</Badge> : <Badge tone="info">Em andamento</Badge>}
          </div>
          <h1 className="mt-2 text-lg font-semibold">{p.assunto}</h1>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-ink-3">Etapa atual</dt>
              <dd className="font-medium">{getEstado(def, p.estadoAtual)?.nome ?? p.estadoAtual}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-3">Setor atual</dt>
              <dd className="font-medium">{p.setorAtual?.nome ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-3">Aberto em</dt>
              <dd className="font-medium">{fmtData(p.abertoEm)}</dd>
            </div>
          </dl>
          <div className="mt-6 text-xs font-semibold uppercase tracking-wide text-ink-3">Movimentações</div>
          <ol className="mt-2 space-y-2 border-l border-line pl-4 text-sm">
            {p.eventos.map((e) => (
              <li key={e.id}>
                <div className="font-medium">
                  {e.tipo === "ABERTURA" && "Protocolado"}
                  {e.tipo === "MUDANCA_ESTADO" && `${getEstado(def, e.deEstado ?? "")?.nome ?? ""} → ${getEstado(def, e.paraEstado ?? "")?.nome ?? ""}`}
                  {e.tipo === "DEVOLUCAO" && `Devolvido para ${getEstado(def, e.paraEstado ?? "")?.nome ?? ""}`}
                  {e.tipo === "ENVIO" && `Enviado de ${e.deSetor?.nome ?? "—"} para ${e.paraSetor?.nome ?? "—"}`}
                  {e.tipo === "RECEBIMENTO" && `Recebido por ${e.paraSetor?.nome ?? "—"}`}
                  {e.tipo === "ENCERRAMENTO" && "Encerrado"}
                </div>
                <div className="text-xs text-ink-3">{fmtDataHora(e.criadoEm)}</div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </main>
  );
}

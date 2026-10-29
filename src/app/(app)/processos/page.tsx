import Link from "next/link";
import { and, desc, eq, ilike, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { processos, setores, tiposProcesso } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { Cabecalho, Panel } from "@/components/ui";
import { TabelaProcessos } from "@/components/tabela-processos";

const SITUACOES = [
  { v: "abertos", r: "Em andamento" },
  { v: "atrasados", r: "Atrasados" },
  { v: "nao_recebidos", r: "Não recebidos" },
  { v: "encerrados", r: "Concluídos" },
  { v: "todos", r: "Todos" },
] as const;

export default async function ProcessosPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await requireUser();
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const situacao = sp.situacao ?? (sp.atrasados ? "atrasados" : "abertos");
  const setorId = sp.setor ?? "";
  const tipoId = sp.tipo ?? "";

  const base = [eq(processos.municipioId, u.municipioId)];
  if (q) base.push(or(ilike(processos.numero, `%${q}%`), ilike(processos.assunto, `%${q}%`))!);
  if (setorId) base.push(eq(processos.setorAtualId, setorId));
  if (tipoId) base.push(eq(processos.tipoId, tipoId));
  const cond = [...base];
  if (situacao === "abertos") cond.push(isNull(processos.encerradoEm));
  if (situacao === "encerrados") cond.push(isNotNull(processos.encerradoEm));
  if (situacao === "atrasados") cond.push(isNull(processos.encerradoEm), lt(processos.prazoEtapaEm, new Date()));
  if (situacao === "nao_recebidos") cond.push(isNull(processos.encerradoEm), isNull(processos.recebidoEm));

  const [linhas, listaSetores, listaTipos, [contagem]] = await Promise.all([
    db.query.processos.findMany({ where: and(...cond), with: { setorAtual: true, tipo: true, abertoPor: true }, orderBy: [desc(processos.abertoEm)], limit: 200 }),
    db.query.setores.findMany({ where: eq(setores.municipioId, u.municipioId), orderBy: setores.nome }),
    db.query.tiposProcesso.findMany({ where: eq(tiposProcesso.municipioId, u.municipioId) }),
    db
      .select({
        abertos: sql<number>`count(*) filter (where ${processos.encerradoEm} is null)::int`,
        atrasados: sql<number>`count(*) filter (where ${processos.encerradoEm} is null and ${processos.prazoEtapaEm} < now())::int`,
        nao_recebidos: sql<number>`count(*) filter (where ${processos.encerradoEm} is null and ${processos.recebidoEm} is null)::int`,
        encerrados: sql<number>`count(*) filter (where ${processos.encerradoEm} is not null)::int`,
        todos: sql<number>`count(*)::int`,
      })
      .from(processos)
      .where(and(...base)),
  ]);

  const href = (v: string) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (setorId) p.set("setor", setorId);
    if (tipoId) p.set("tipo", tipoId);
    p.set("situacao", v);
    return `/processos?${p}`;
  };

  return (
    <>
      <Cabecalho titulo="Processos" sub={q ? `Resultado da busca por “${q}”.` : "Todos os processos da prefeitura, com a etapa em que cada um está e o prazo."} />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap gap-1 rounded-xl bg-sunken p-1" aria-label="Situação">
          {SITUACOES.map((s) => {
            const ativo = situacao === s.v;
            const n = contagem[s.v];
            return (
              <Link
                key={s.v}
                href={href(s.v)}
                aria-current={ativo ? "page" : undefined}
                className={`rounded-lg px-3.5 py-1.5 text-[13.5px] font-semibold transition-colors ${ativo ? "bg-white text-ink shadow-[0_1px_2px_rgb(13_21_48/0.08)]" : "text-ink-2 hover:text-ink"}`}
              >
                {s.r}{" "}
                <span className={`tnum ml-0.5 ${s.v === "atrasados" && n > 0 ? "text-bad" : "text-ink-3"}`}>{n}</span>
              </Link>
            );
          })}
        </nav>
        <form className="flex flex-wrap gap-2" method="get">
          {q && <input type="hidden" name="q" value={q} />}
          <input type="hidden" name="situacao" value={situacao} />
          <select name="setor" className="input !w-auto !py-2" defaultValue={setorId} aria-label="Setor">
            <option value="">Todos os setores</option>
            {listaSetores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
              </option>
            ))}
          </select>
          <select name="tipo" className="input !w-auto !py-2" defaultValue={tipoId} aria-label="Tipo de processo">
            <option value="">Todos os tipos</option>
            {listaTipos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </select>
          <button className="btn btn-quiet !py-2">Filtrar</button>
        </form>
      </div>

      <Panel pad={false}>
        <div className="px-6 py-2">
          <TabelaProcessos linhas={linhas} vazio={q ? "Nenhum processo com esse número ou assunto." : "Nenhum processo nesta situação."} />
        </div>
      </Panel>
    </>
  );
}

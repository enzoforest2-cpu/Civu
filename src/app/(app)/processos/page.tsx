import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, ilike, inArray, isNotNull, isNull, lt, notInArray, or, sql, type SQL } from "drizzle-orm";
import { X } from "lucide-react";
import { db } from "@/db";
import { processos, setores, tiposProcesso, usuarios } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { WORKFLOW_COMPRA, nomeDaEtapa, type WorkflowDef } from "@/lib/workflow";
import { Cabecalho, Panel } from "@/components/ui";
import { TabelaProcessos } from "@/components/tabela-processos";
import { autorizarCabine, semAcessoCabine } from "@/modulos/gestao/cabine";

/** Etapas da compra entre o pedido e o contrato (filtro "fase=compra", usado pela cabine da secretaria). */
const ETAPAS_ATE_CONTRATO = WORKFLOW_COMPRA.estados.slice(0, WORKFLOW_COMPRA.estados.findIndex((e) => e.chave === "CONTRATADO")).map((e) => e.chave);

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
  const etapa = /^[A-Z_]{2,40}$/.test(sp.etapa ?? "") ? sp.etapa! : "";
  const fase = sp.fase === "compra" ? "compra" : "";

  // Recorte "da pasta" (vindo da cabine): processos abertos pelos setores da secretaria. Conferido no servidor:
  // quem não abre a cabine daquela pasta também não lê a lista dela por aqui.
  let pasta: { sigla: string; nome: string; ids: string[] } | null = null;
  if (sp.pasta) {
    const a = await autorizarCabine(u, sp.pasta);
    if (!a.ok) redirect(a.motivo === "inexistente" ? "/processos" : semAcessoCabine(sp.pasta.toUpperCase(), a.area, "/processos"));
    pasta = { sigla: a.cabine.setor.sigla, nome: a.cabine.setor.nome, ids: a.cabine.ids };
  }
  const fora = !!pasta && sp.fora === "1";

  const base: SQL[] = [eq(processos.municipioId, u.municipioId)];
  if (pasta) base.push(inArray(processos.abertoPorId, db.select({ id: usuarios.id }).from(usuarios).where(inArray(usuarios.setorId, pasta.ids))));
  if (fora && pasta) base.push(or(isNull(processos.setorAtualId), notInArray(processos.setorAtualId, pasta.ids))!);
  if (etapa) base.push(eq(processos.estadoAtual, etapa));
  if (fase)
    base.push(
      inArray(processos.estadoAtual, ETAPAS_ATE_CONTRATO),
      inArray(processos.tipoId, db.select({ id: tiposProcesso.id }).from(tiposProcesso).where(and(eq(tiposProcesso.municipioId, u.municipioId), eq(tiposProcesso.chave, "COMPRA")))),
    );
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

  const defEtapa = etapa ? listaTipos.map((t) => t.definicao as WorkflowDef).find((d) => d.estados.some((e) => e.chave === etapa)) : undefined;
  const nomeEtapaFiltro = etapa ? nomeDaEtapa(defEtapa, etapa) : "";
  const href = (v: string) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (setorId) p.set("setor", setorId);
    if (tipoId) p.set("tipo", tipoId);
    if (pasta) p.set("pasta", pasta.sigla);
    if (fora) p.set("fora", "1");
    if (etapa) p.set("etapa", etapa);
    if (fase) p.set("fase", fase);
    p.set("situacao", v);
    return `/processos?${p}`;
  };

  return (
    <>
      <Cabecalho
        titulo="Processos"
        sub={
          q
            ? `Resultado da busca por “${q}”.`
            : pasta
              ? `Processos abertos pela ${pasta.nome}, com a etapa em que cada um está e o prazo.`
              : "Todos os processos da prefeitura, com a etapa em que cada um está e o prazo."
        }
      />
      {(pasta || etapa || fase) && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-[14px]">
          <span className="text-ink-2">Mostrando:</span>
          {pasta && <span className="chip bg-brand-soft text-brand-ink">Da pasta: {pasta.nome}</span>}
          {fora && <span className="chip bg-brand-soft text-brand-ink">Fora da secretaria</span>}
          {etapa && <span className="chip bg-brand-soft text-brand-ink">Etapa: {nomeEtapaFiltro}</span>}
          {fase && <span className="chip bg-brand-soft text-brand-ink">Compras do pedido ao contrato</span>}
          <Link href={`/processos?situacao=${situacao}`} className="inline-flex min-h-[44px] items-center gap-1 font-semibold text-brand-2 hover:underline">
            <X size={14} aria-hidden /> Limpar filtros
          </Link>
          {pasta && (
            <Link href={`/secretaria/${pasta.sigla}`} className="inline-flex min-h-[44px] items-center font-semibold text-brand-2 hover:underline">
              Voltar à cabine
            </Link>
          )}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap gap-x-1 gap-y-[14px] rounded-xl bg-sunken p-1" aria-label="Situação">
          {SITUACOES.map((s) => {
            const ativo = situacao === s.v;
            const n = contagem[s.v];
            return (
              <Link
                key={s.v}
                href={href(s.v)}
                aria-current={ativo ? "page" : undefined}
                className={`alvo-toque rounded-lg px-3.5 py-1.5 text-[14px] font-semibold transition-colors ${ativo ? "bg-white text-ink shadow-[0_1px_2px_rgb(13_21_48/0.08)]" : "text-ink-2 hover:text-ink"}`}
              >
                {s.r}{" "}
                <span className={`tnum ml-0.5 ${s.v === "atrasados" && n > 0 ? "text-bad" : "text-ink-3"}`}>{n}</span>
              </Link>
            );
          })}
        </nav>
        <form className="flex flex-wrap gap-2" method="get">
          {q && <input type="hidden" name="q" value={q} />}
          {pasta && <input type="hidden" name="pasta" value={pasta.sigla} />}
          {fora && <input type="hidden" name="fora" value="1" />}
          {etapa && <input type="hidden" name="etapa" value={etapa} />}
          {fase && <input type="hidden" name="fase" value={fase} />}
          <input type="hidden" name="situacao" value={situacao} />
          <select name="setor" className="input min-h-[44px] !w-auto !py-2" defaultValue={setorId} aria-label="Setor">
            <option value="">Todos os setores</option>
            {listaSetores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
              </option>
            ))}
          </select>
          <select name="tipo" className="input min-h-[44px] !w-auto !py-2" defaultValue={tipoId} aria-label="Tipo de processo">
            <option value="">Todos os tipos</option>
            {listaTipos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </select>
          <button className="btn btn-quiet min-h-[44px] !py-2">Filtrar</button>
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

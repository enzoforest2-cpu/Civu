import Link from "next/link";
import { and, desc, eq, ilike, isNotNull, isNull, lt, or } from "drizzle-orm";
import { db } from "@/db";
import { processos, setores, tiposProcesso } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";
import { TabelaProcessos } from "@/components/tabela-processos";

export default async function ProcessosPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await requireUser();
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const situacao = sp.situacao ?? (sp.atrasados ? "atrasados" : "abertos");
  const setorId = sp.setor ?? "";
  const tipoId = sp.tipo ?? "";

  const cond = [eq(processos.municipioId, u.municipioId)];
  if (q) cond.push(or(ilike(processos.numero, `%${q}%`), ilike(processos.assunto, `%${q}%`))!);
  if (situacao === "abertos") cond.push(isNull(processos.encerradoEm));
  if (situacao === "encerrados") cond.push(isNotNull(processos.encerradoEm));
  if (situacao === "atrasados") cond.push(isNull(processos.encerradoEm), lt(processos.prazoEtapaEm, new Date()));
  if (situacao === "nao_recebidos") cond.push(isNull(processos.encerradoEm), isNull(processos.recebidoEm));
  if (setorId) cond.push(eq(processos.setorAtualId, setorId));
  if (tipoId) cond.push(eq(processos.tipoId, tipoId));

  const [linhas, listaSetores, listaTipos] = await Promise.all([
    db.query.processos.findMany({
      where: and(...cond),
      with: { setorAtual: true, tipo: true, abertoPor: true },
      orderBy: [desc(processos.abertoEm)],
      limit: 200,
    }),
    db.query.setores.findMany({ where: eq(setores.municipioId, u.municipioId), orderBy: setores.nome }),
    db.query.tiposProcesso.findMany({ where: eq(tiposProcesso.municipioId, u.municipioId) }),
  ]);

  return (
    <>
      <PageHeader
        title="Processos"
        subtitle="Todos os processos do município, com situação e prazo da etapa atual."
        action={
          <Link href="/processos/novo" className="btn btn-primary">
            Abrir processo
          </Link>
        }
      />
      <Card>
        <form className="mb-4 grid gap-3 md:grid-cols-[1fr_180px_200px_200px_auto]" method="get">
          <input name="q" className="input" placeholder="Buscar por número ou assunto" defaultValue={q} />
          <select name="situacao" className="input" defaultValue={situacao}>
            <option value="abertos">Em andamento</option>
            <option value="atrasados">Prazo estourado</option>
            <option value="nao_recebidos">Sem recebimento</option>
            <option value="encerrados">Encerrados</option>
            <option value="todos">Todos</option>
          </select>
          <select name="setor" className="input" defaultValue={setorId}>
            <option value="">Todos os setores</option>
            {listaSetores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
              </option>
            ))}
          </select>
          <select name="tipo" className="input" defaultValue={tipoId}>
            <option value="">Todos os tipos</option>
            {listaTipos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </select>
          <button className="btn btn-ghost">Filtrar</button>
        </form>
        <TabelaProcessos linhas={linhas} />
      </Card>
    </>
  );
}

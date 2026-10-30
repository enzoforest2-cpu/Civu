import Link from "next/link";
import { and, eq, inArray } from "drizzle-orm";
import { Search } from "lucide-react";
import { db } from "@/db";
import { municipios, processos, setores } from "@/db/schema";
import { caminhoPrincipal, getEstado, nomeEtapa, type WorkflowDef } from "@/lib/workflow";
import { fmtData, fmtDataHora } from "@/lib/dates";
import { Chip } from "@/components/ui";
import { Marca, MarcaCompleta } from "@/components/marca";
import { Trilho } from "@/components/trilho";

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
  const listaSetores = p && mun ? await db.query.setores.findMany({ where: eq(setores.municipioId, mun.id) }) : [];
  const nome = (k: string | null) => (def && k ? nomeEtapa(getEstado(def, k)?.nome ?? k) : "");

  return (
    <main className="min-h-screen bg-bg">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <MarcaCompleta altura={26} />
            <div className="leading-tight border-l border-line pl-2.5">
              <div className="text-[12.5px] text-ink-3">Consulta pública de processos</div>
            </div>
          </div>
          <Link href="/login" className="text-[14px] font-semibold text-brand hover:underline">
            Sou servidor
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-12">
        <h1 className="display text-[38px] leading-[1.1] font-semibold text-ink">Acompanhe um processo da prefeitura</h1>
        <p className="mt-2 text-[15px] text-ink-2">Digite o número que você recebeu no protocolo para ver em que etapa ele está.</p>

        <form className="panel mt-7 flex flex-wrap items-end gap-3 p-5" method="get">
          <div className="min-w-[220px] flex-1">
            <label className="label" htmlFor="m">
              Município
            </label>
            <select id="m" name="m" className="input" defaultValue={mun?.slug}>
              {lista.map((x) => (
                <option key={x.id} value={x.slug}>
                  {x.nome} – {x.uf}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[220px] flex-1">
            <label className="label" htmlFor="numero">
              Número do processo
            </label>
            <input id="numero" name="numero" className="input tnum" placeholder="Ex.: 2026/000001" defaultValue={numero ?? ""} required />
          </div>
          <button className="btn btn-primary btn-lg">
            <Search size={17} /> Consultar
          </button>
        </form>

        {numero && !p && (
          <div className="mt-6 rounded-xl bg-warn-soft px-5 py-4 text-[14.5px] text-ink">
            Não encontramos o processo <strong>{numero}</strong> em {mun?.nome}. Confira se o número está no formato ano/sequência, como 2026/000001.
          </div>
        )}

        {p && def && (
          <article className="mt-8 space-y-6">
            <div className="panel p-6">
              <div className="flex flex-wrap items-center gap-2 text-[14px]">
                <span className="tnum font-semibold text-brand">Processo {p.numero}</span>
                <Chip tone="brand">{p.tipo.nome}</Chip>
                {p.encerradoEm ? <Chip tone="ok">Concluído em {fmtData(p.encerradoEm)}</Chip> : <Chip>Em andamento</Chip>}
              </div>
              <h2 className="display mt-2 text-[26px] leading-tight font-semibold text-ink">{p.assunto}</h2>
              <p className="mt-2 text-[14.5px] text-ink-2">
                {p.encerradoEm ? "Este processo já foi concluído." : (
                  <>
                    Agora está em <strong className="font-semibold text-ink">{nome(p.estadoAtual)}</strong>, com{" "}
                    <strong className="font-semibold text-ink">{p.setorAtual?.nome ?? "—"}</strong>. Aberto em {fmtData(p.abertoEm)}.
                  </>
                )}
              </p>
              <div className="mt-6">
                <Trilho
                  estacoes={def.estados.map((e) => ({
                    chave: e.chave,
                    nome: nomeEtapa(e.nome),
                    setor: e.setor && e.setor !== "LIVRE" ? listaSetores.find((s) => s.sigla === e.setor)?.nome.replace(/^(Secretaria|Setor) de /, "") : null,
                    opcional: !caminhoPrincipal(def).includes(e.chave),
                  }))}
                  atual={p.estadoAtual}
                  encerrado={!!p.encerradoEm}
                  visitadas={p.eventos.map((e) => e.paraEstado).filter((x): x is string => !!x)}
                />
              </div>
            </div>

            <div className="panel p-6">
              <h3 className="text-[16px] font-semibold text-ink">Movimentações</h3>
              <ol className="mt-4 space-y-4">
                {p.eventos.map((e) => (
                  <li key={e.id} className="grid grid-cols-[150px_1fr] gap-4 text-[14.5px]">
                    <span className="tnum text-ink-3">{fmtDataHora(e.criadoEm)}</span>
                    <span className="text-ink">
                      {e.tipo === "ABERTURA" && "Processo protocolado"}
                      {e.tipo === "MUDANCA_ESTADO" && `Avançou para “${nome(e.paraEstado)}”`}
                      {e.tipo === "DEVOLUCAO" && `Voltou para “${nome(e.paraEstado)}” para correção`}
                      {e.tipo === "ENVIO" && `Enviado para ${e.paraSetor?.nome ?? "—"}`}
                      {e.tipo === "RECEBIMENTO" && `Recebido por ${e.paraSetor?.nome ?? "—"}`}
                      {e.tipo === "ENCERRAMENTO" && "Processo concluído"}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </article>
        )}
      </div>
    </main>
  );
}

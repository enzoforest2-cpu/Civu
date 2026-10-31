import { eq } from "drizzle-orm";
import { Clock, FileCheck2, Undo2, Users } from "lucide-react";
import { db } from "@/db";
import { setores, tiposProcesso } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { Cabecalho, Chip } from "@/components/ui";
import { DOCUMENTO_TIPOS, PAPEL_NOME, caminhoPrincipal, nomeEtapa, type WorkflowDef } from "@/lib/workflow";

export default async function FluxosPage() {
  const u = await requireUser();
  const [tipos, listaSetores] = await Promise.all([
    db.query.tiposProcesso.findMany({ where: eq(tiposProcesso.municipioId, u.municipioId) }),
    db.query.setores.findMany({ where: eq(setores.municipioId, u.municipioId) }),
  ]);
  const nomeSetor = (s: string | null) => (s === "LIVRE" ? "Qualquer setor envolvido" : s === null ? "Setor de quem pediu" : (listaSetores.find((x) => x.sigla === s)?.nome ?? s));

  return (
    <>
      <Cabecalho
        titulo="Como os fluxos funcionam"
        sub="Cada tipo de processo segue um caminho. Em cada etapa o sistema mostra quem é responsável, o prazo e o que precisa estar pronto para seguir."
      />
      <div className="space-y-12">
        {tipos.map((t) => {
          const def = t.definicao as WorkflowDef;
          const principal = caminhoPrincipal(def);
          return (
            <section key={t.id}>
              <div className="mb-5 flex flex-wrap items-baseline gap-3">
                <h2 className="display text-[24px] font-semibold text-ink">{t.nome}</h2>
                <span className="text-[14px] text-ink-3">
                  {def.estados.length} etapas · versão {t.versao}
                </span>
              </div>
              {t.descricao && <p className="-mt-3 mb-6 max-w-3xl text-[14.5px] text-ink-2">{t.descricao}</p>}
              <ol className="relative">
                {def.estados.map((e, i) => {
                  const opcional = !principal.includes(e.chave);
                  const ultimo = i === def.estados.length - 1;
                  return (
                    <li key={e.chave} className="relative grid grid-cols-[44px_minmax(0,1fr)] gap-4 pb-6">
                      {!ultimo && <span aria-hidden className="absolute top-9 bottom-0 left-[21px] w-[2px] bg-line" />}
                      <span
                        className={`display tnum relative z-10 flex h-[44px] w-[44px] items-center justify-center rounded-full text-[15px] font-semibold ${
                          e.final ? "bg-ok text-white" : opcional ? "border-2 border-dashed border-line-2 bg-white text-ink-3" : "bg-brand-2 text-white"
                        }`}
                      >
                        {i + 1}
                      </span>
                      <div className="panel px-5 py-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-[16px] font-semibold text-ink">{nomeEtapa(e.nome)}</h3>
                          {opcional && <Chip>Só quando necessário</Chip>}
                          {e.final && <Chip tone="ok">Fim</Chip>}
                        </div>
                        {e.descricao && <p className="mt-1 text-[14px] text-ink-2">{e.descricao}</p>}
                        <dl className="mt-3 grid gap-3 text-[14px] md:grid-cols-3">
                          <div className="flex gap-2">
                            <Users size={16} className="mt-0.5 shrink-0 text-ink-3" />
                            <div>
                              <dt className="text-ink-3">Responsável</dt>
                              <dd className="text-ink">{nomeSetor(e.setor)}</dd>
                              <dd className="text-ink-3">{e.papeis.map((p) => PAPEL_NOME[p]).join(", ")}</dd>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Clock size={16} className="mt-0.5 shrink-0 text-ink-3" />
                            <div>
                              <dt className="text-ink-3">Prazo</dt>
                              <dd className="text-ink">{e.slaDiasUteis ? `${e.slaDiasUteis} ${e.slaDiasUteis === 1 ? "dia útil" : "dias úteis"}` : "—"}</dd>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <FileCheck2 size={16} className="mt-0.5 shrink-0 text-ink-3" />
                            <div>
                              <dt className="text-ink-3">Precisa ter</dt>
                              {e.gates.length === 0 ? (
                                <dd className="text-ink">Nada</dd>
                              ) : (
                                e.gates.map((g, k) => (
                                  <dd key={k} className="text-ink">
                                    {g.tipo === "documento" ? (DOCUMENTO_TIPOS[g.documentoTipo] ?? g.documentoTipo) : g.tipo === "campo" ? g.campo : g.descricao}
                                    {g.tipo === "documento" && g.assinadoPor?.length ? (
                                      <span className="text-ink-3"> — assinado por {g.assinadoPor.map((p) => PAPEL_NOME[p]).join(" e ")}</span>
                                    ) : null}
                                    {g.tipo === "documento" && g.assinadoPorQualquer?.length ? (
                                      <span className="text-ink-3"> — assinado por {g.assinadoPorQualquer.map((p) => PAPEL_NOME[p]).join(" ou ")}</span>
                                    ) : null}
                                  </dd>
                                ))
                              )}
                            </div>
                          </div>
                        </dl>
                        {e.devolucoes.length > 0 && (
                          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3 text-[13px] text-ink-2">
                            <Undo2 size={14} className="text-bad" />
                            Pode voltar: {e.devolucoes.map((d) => d.rotulo.replace(/^[^:]+:\s*/, "")).join("; ")}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          );
        })}
      </div>
    </>
  );
}

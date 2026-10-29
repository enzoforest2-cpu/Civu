import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { setores } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { carregarProcesso, avaliarGates, podeAgir, verificarCadeia } from "@/lib/engine";
import { DOCUMENTO_TIPOS, PAPEL_NOME, type Papel } from "@/lib/workflow";
import { fmtData, fmtDataHora, fmtMoeda } from "@/lib/dates";
import { Badge, Card, Prazo, UrgenciaBadge } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { avancarAction, devolverAction, receberAction, tramitarAction, juntarDocumentoAction, assinarAction, despacharAction } from "@/app/actions";
import { Timeline } from "./timeline";

export default async function ProcessoPage({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  const { id } = await params;
  const p = await carregarProcesso(u.municipioId, id);
  if (!p) notFound();
  const gates = avaliarGates(p);
  const pode = podeAgir(u, p);
  const cadeia = verificarCadeia(p.eventos);
  const listaSetores = await db.query.setores.findMany({ where: eq(setores.municipioId, u.municipioId), orderBy: setores.nome });
  const meta = (p.metadados ?? {}) as Record<string, unknown>;
  const camposMeta = p.def.camposAbertura ?? [];
  const noMeuSetor = p.setorAtualId === u.setorId;
  const podeTramitarLivre = !p.encerradoEm && (p.estado.setor === "LIVRE" || u.papeis.includes("ADMIN") || u.papeis.includes("PROTOCOLO"));
  const idx = p.def.estados.findIndex((e) => e.chave === p.estadoAtual);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-semibold text-brand">{p.numero}</span>
            <Badge tone="brand">{p.tipo.nome}</Badge>
            <UrgenciaBadge u={p.urgencia} />
            {p.encerradoEm ? <Badge tone="ok">Encerrado em {fmtData(p.encerradoEm)}</Badge> : null}
          </div>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">{p.assunto}</h1>
          <div className="mt-1 text-sm text-ink-2">
            Aberto por {p.abertoPor.nome} ({p.abertoPor.setor?.nome ?? "—"}) em {fmtDataHora(p.abertoEm)} · {p.unidadeGestora.nome}
          </div>
        </div>
        <div className="card px-4 py-3 text-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-3">Situação</div>
          <div className="mt-1 font-semibold">{p.estado.nome}</div>
          <div className="text-ink-2">
            {p.setorAtual?.nome ?? "Sem setor"} · {p.recebidoEm ? "recebido" : <span className="text-warn">aguardando recebimento</span>}
          </div>
          <div className="mt-1">
            <Prazo prazo={p.prazoEtapaEm} encerrado={p.encerradoEm} />
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          {/* Etapa atual */}
          <Card title={`Etapa atual: ${p.estado.nome}`}>
            {p.estado.descricao && <p className="text-sm text-ink-2">{p.estado.descricao}</p>}
            {p.estado.gates.length > 0 && (
              <div className="mt-4">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">Requisitos para avançar</div>
                <ul className="space-y-1.5">
                  {gates.map((g, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span
                        className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${g.ok ? "bg-ok-soft text-ok" : "bg-slate-100 text-ink-3"}`}
                      >
                        {g.ok ? "✓" : "•"}
                      </span>
                      <span>
                        {g.gate.tipo === "documento"
                          ? (g.gate.descricao ?? DOCUMENTO_TIPOS[g.gate.documentoTipo] ?? g.gate.documentoTipo)
                          : (g.gate.descricao ?? g.gate.campo)}
                        {!g.ok && <span className="ml-2 text-xs text-warn">{g.motivo}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {!p.encerradoEm && (
              <div className="mt-5 space-y-4 border-t border-line pt-4">
                {!p.recebidoEm && (noMeuSetor || u.papeis.includes("ADMIN")) && (
                  <ActionForm action={receberAction}>
                    <div className="flex items-center justify-between gap-3 rounded-lg bg-warn-soft px-4 py-3 text-sm">
                      <span>Este processo chegou ao seu setor e ainda não foi recebido.</span>
                      <input type="hidden" name="processoId" value={p.id} />
                      <SubmitButton className="btn btn-primary" pendingText="Confirmando…">
                        Confirmar recebimento
                      </SubmitButton>
                    </div>
                  </ActionForm>
                )}

                {pode ? (
                  <>
                    {p.estado.avancos.length > 0 && (
                      <ActionForm action={avancarAction}>
                        <div>
                          <input type="hidden" name="processoId" value={p.id} />
                          <label className="label">Despacho (opcional)</label>
                          <textarea name="despacho" className="input" rows={2} placeholder="Observação que acompanha a movimentação" />
                          <div className="mt-3 flex flex-wrap gap-2">
                            {p.estado.avancos.map((t) => (
                              <SubmitButton key={t.para} name="para" value={t.para} pendingText="Movimentando…">
                                {t.rotulo}
                              </SubmitButton>
                            ))}
                          </div>
                        </div>
                      </ActionForm>
                    )}
                    {p.estado.devolucoes.length > 0 && (
                      <ActionForm action={devolverAction}>
                        <details className="rounded-lg border border-line p-3">
                          <summary className="cursor-pointer text-sm font-semibold text-ink-2">Devolver</summary>
                          <div className="mt-3 grid gap-3 md:grid-cols-[260px_1fr_auto]">
                            <input type="hidden" name="processoId" value={p.id} />
                            <select name="para" className="input">
                              {p.estado.devolucoes.map((t) => (
                                <option key={t.para} value={t.para}>
                                  {t.rotulo}
                                </option>
                              ))}
                            </select>
                            <input name="motivo" className="input" placeholder="Motivo da devolução (obrigatório)" />
                            <SubmitButton className="btn btn-danger" pendingText="Devolvendo…">
                              Devolver
                            </SubmitButton>
                          </div>
                        </details>
                      </ActionForm>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-ink-3">
                    Esta etapa é de{" "}
                    {p.estado.setor === "LIVRE"
                      ? "tramitação livre"
                      : p.estado.setor === null
                        ? "responsabilidade do requisitante"
                        : `responsabilidade do setor ${p.setorAtual?.nome ?? p.estado.setor}`}{" "}
                    ({p.estado.papeis.map((x) => PAPEL_NOME[x]).join(", ")}). Você pode consultar e juntar documentos, mas não movimentar.
                  </p>
                )}

                {podeTramitarLivre && (
                  <ActionForm action={tramitarAction}>
                    <details className="rounded-lg border border-line p-3">
                      <summary className="cursor-pointer text-sm font-semibold text-ink-2">Enviar a outro setor (tramitação sem mudar de etapa)</summary>
                      <div className="mt-3 grid gap-3 md:grid-cols-[260px_1fr_auto]">
                        <input type="hidden" name="processoId" value={p.id} />
                        <select name="paraSetorId" className="input">
                          {listaSetores
                            .filter((s) => s.id !== p.setorAtualId)
                            .map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.nome}
                              </option>
                            ))}
                        </select>
                        <input name="despacho" className="input" placeholder="Despacho de encaminhamento" />
                        <SubmitButton className="btn btn-ghost" pendingText="Enviando…">
                          Enviar
                        </SubmitButton>
                      </div>
                    </details>
                  </ActionForm>
                )}
              </div>
            )}
          </Card>

          {/* Documentos */}
          <Card title={`Documentos (${p.documentos.length})`}>
            {p.documentos.length === 0 ? (
              <p className="text-sm text-ink-3">Nenhum documento juntado ainda.</p>
            ) : (
              <ul className="divide-y divide-line">
                {p.documentos.map((d) => (
                  <li key={d.id} className="py-3">
                    <details>
                      <summary className="cursor-pointer">
                        <div className="inline-flex flex-wrap items-center gap-2 align-middle">
                          <span className="font-semibold">{d.titulo}</span>
                          <Badge>{DOCUMENTO_TIPOS[d.tipo] ?? d.tipo}</Badge>
                          <span className="text-xs text-ink-3">
                            v{d.versao} · {d.criadoPor.nome} · {fmtDataHora(d.criadoEm)}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {d.assinaturas.map((a) => (
                            <Badge key={a.id} tone="ok">
                              assinado: {a.usuario.nome} ({PAPEL_NOME[a.papel as Papel] ?? a.papel})
                            </Badge>
                          ))}
                          {d.assinaturas.length === 0 && <span className="text-xs text-ink-3">sem assinaturas</span>}
                        </div>
                      </summary>
                      <div className="mt-3 rounded-lg bg-slate-50 p-4">
                        <div className="prose-doc">{d.conteudo}</div>
                        <div className="mt-3 break-all font-mono text-[11px] text-ink-3">sha256 {d.hash}</div>
                      </div>
                      {!p.encerradoEm && (
                        <ActionForm action={assinarAction} className="mt-3">
                          <div className="flex flex-wrap items-end gap-2">
                            <input type="hidden" name="processoId" value={p.id} />
                            <input type="hidden" name="documentoId" value={d.id} />
                            <div>
                              <label className="label">Assinar como</label>
                              <select name="papel" className="input">
                                {u.papeis
                                  .filter((x) => x !== "ADMIN")
                                  .map((x) => (
                                    <option key={x} value={x}>
                                      {PAPEL_NOME[x]}
                                    </option>
                                  ))}
                              </select>
                            </div>
                            <div>
                              <label className="label">Senha (reautenticação)</label>
                              <input name="senha" type="password" className="input" required autoComplete="current-password" />
                            </div>
                            <SubmitButton className="btn btn-ghost" pendingText="Assinando…">
                              Assinar
                            </SubmitButton>
                          </div>
                        </ActionForm>
                      )}
                    </details>
                  </li>
                ))}
              </ul>
            )}

            {!p.encerradoEm && (
              <ActionForm action={juntarDocumentoAction} className="mt-5 border-t border-line pt-4">
                <div className="space-y-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-ink-3">Juntar documento</div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <input type="hidden" name="processoId" value={p.id} />
                    <div>
                      <label className="label">Tipo</label>
                      <select
                        name="tipo"
                        className="input"
                        defaultValue={
                          gates.find((g) => !g.ok && g.gate.tipo === "documento")?.gate.tipo === "documento"
                            ? (gates.find((g) => !g.ok && g.gate.tipo === "documento")!.gate as { documentoTipo: string }).documentoTipo
                            : "DESPACHO"
                        }
                      >
                        {Object.entries(DOCUMENTO_TIPOS).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label">Título</label>
                      <input name="titulo" className="input" required />
                    </div>
                  </div>
                  <div>
                    <label className="label">Conteúdo</label>
                    <textarea
                      name="conteudo"
                      className="input font-mono text-xs"
                      rows={6}
                      required
                      placeholder="Texto do documento. Upload de PDF/imagem entra na próxima fase."
                    />
                  </div>
                  <div className="flex justify-end">
                    <SubmitButton pendingText="Juntando…">Juntar ao processo</SubmitButton>
                  </div>
                </div>
              </ActionForm>
            )}
          </Card>

          {!p.encerradoEm && (
            <Card title="Despacho">
              <ActionForm action={despacharAction}>
                <div className="flex gap-3">
                  <input type="hidden" name="processoId" value={p.id} />
                  <input name="texto" className="input" placeholder="Registrar um despacho ou observação no histórico" required />
                  <SubmitButton className="btn btn-ghost" pendingText="Salvando…">
                    Registrar
                  </SubmitButton>
                </div>
              </ActionForm>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          {camposMeta.length > 0 && (
            <Card title={p.tipo.chave === "COMPRA" ? "Dados da demanda (DFD)" : "Dados da abertura"}>
              <dl className="space-y-2 text-sm">
                {camposMeta.map((c) => (
                  <div key={c.chave}>
                    <dt className="text-xs text-ink-3">{c.rotulo}</dt>
                    <dd className="font-medium">
                      {c.chave === "valorEstimado"
                        ? fmtMoeda(meta[c.chave] as string)
                        : c.tipo === "data"
                          ? fmtData(meta[c.chave] as string)
                          : String(meta[c.chave] ?? "—")}
                    </dd>
                  </div>
                ))}
                {p.descricao && (
                  <div>
                    <dt className="text-xs text-ink-3">Descrição</dt>
                    <dd>{p.descricao}</dd>
                  </div>
                )}
              </dl>
            </Card>
          )}

          <Card title="Caminho do fluxo">
            <ol className="space-y-1.5 text-sm">
              {p.def.estados.map((e, i) => {
                const passado = i < idx || !!p.encerradoEm;
                const atual = e.chave === p.estadoAtual && !p.encerradoEm;
                return (
                  <li key={e.chave} className={`flex items-center gap-2 ${atual ? "font-semibold text-ink" : passado ? "text-ink-2" : "text-ink-3"}`}>
                    <span className={`h-2 w-2 shrink-0 rounded-full ${atual ? "bg-brand" : passado ? "bg-ok" : "bg-slate-200"}`} />
                    <span className="truncate">{e.nome}</span>
                    {e.slaDiasUteis > 0 && <span className="ml-auto text-[11px] text-ink-3">{e.slaDiasUteis} d.ú.</span>}
                  </li>
                );
              })}
            </ol>
          </Card>

          <Card
            title="Histórico"
            action={
              cadeia.ok ? <Badge tone="ok">cadeia íntegra · {cadeia.seq} eventos</Badge> : <Badge tone="bad">cadeia violada no evento {cadeia.seq}</Badge>
            }
          >
            <Timeline eventos={p.eventos} def={p.def} />
          </Card>
        </div>
      </div>
    </>
  );
}

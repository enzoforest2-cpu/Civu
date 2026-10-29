import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ArrowDownToLine, ArrowRight, CheckCircle2, Circle, FileText, Lock, PenLine, Send, ShieldCheck, ShieldAlert, Undo2, Plus } from "lucide-react";
import { db } from "@/db";
import { setores } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { carregarProcesso, avaliarGates, podeAgir, verificarCadeia } from "@/lib/engine";
import { DOCUMENTO_TIPOS, PAPEL_NOME, caminhoPrincipal, nomeEtapa, type Papel } from "@/lib/workflow";
import { fmtData, fmtDataHora, fmtMoeda } from "@/lib/dates";
import { Chip, Panel, Prazo, UrgenciaChip, Avatar } from "@/components/ui";
import { Trilho } from "@/components/trilho";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { avancarAction, devolverAction, receberAction, tramitarAction, juntarDocumentoAction, assinarAction, despacharAction } from "@/app/actions";
import { Timeline } from "./timeline";

const ROTULO_OPCAO: Record<string, string> = { BAIXA: "Baixa", MEDIA: "Média", ALTA: "Alta", SIM: "Sim", NAO: "Não", NAO_SEI: "Não sabe" };

export default async function ProcessoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ doc?: string }> }) {
  const u = await requireUser();
  const { id } = await params;
  const { doc: docSugerido } = await searchParams;
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
  const principal = caminhoPrincipal(p.def);
  const visitadas = p.eventos.map((e) => e.paraEstado).filter((x): x is string => !!x);
  const estacoes = p.def.estados.map((e) => ({
    chave: e.chave,
    nome: nomeEtapa(e.nome),
    setor: e.setor && e.setor !== "LIVRE" ? listaSetores.find((s) => s.sigla === e.setor)?.nome.replace(/^(Secretaria|Setor) de /, "") : null,
    opcional: !principal.includes(e.chave),
  }));
  const pendentes = gates.filter((g) => !g.ok);
  const prontoParaAvancar = pendentes.length === 0;
  const primeiroDocPendente = pendentes.find((g) => g.gate.tipo === "documento")?.gate;
  const tipoDocPadrao =
    docSugerido && DOCUMENTO_TIPOS[docSugerido] ? docSugerido : primeiroDocPendente && primeiroDocPendente.tipo === "documento" ? primeiroDocPendente.documentoTipo : "DESPACHO";
  const etapaAtual = nomeEtapa(p.estado.nome);

  return (
    <>
      {/* Cabeçalho do processo */}
      <header className="mb-7">
        <div className="flex flex-wrap items-center gap-2.5 text-[14px]">
          <span className="tnum font-semibold text-brand">Processo {p.numero}</span>
          <Chip tone="brand">{p.tipo.nome}</Chip>
          <UrgenciaChip u={p.urgencia} />
          {p.encerradoEm && <Chip tone="ok">Concluído em {fmtData(p.encerradoEm)}</Chip>}
        </div>
        <h1 className="display mt-2 max-w-4xl text-[26px] leading-[1.12] font-semibold text-ink sm:text-[34px]">{p.assunto}</h1>
        <p className="mt-2 text-[14.5px] text-ink-2">
          Aberto por {p.abertoPor.nome}
          {p.abertoPor.setor ? ` (${p.abertoPor.setor.nome})` : ""} em {fmtDataHora(p.abertoEm)} · {p.unidadeGestora.nome}
        </p>
      </header>

      {/* Trilho: onde o processo está */}
      <section className="panel mb-6 px-6 pt-6 pb-4">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="text-[15px]">
            {p.encerradoEm ? (
              <span className="font-semibold text-ok">Processo concluído e arquivado.</span>
            ) : (
              <>
                Está em <strong className="font-semibold text-ink">{etapaAtual}</strong>, com <strong className="font-semibold text-ink">{p.setorAtual?.nome ?? "—"}</strong>
                {!p.recebidoEm && <span className="text-warn"> — ainda não recebido</span>}
              </>
            )}
          </div>
          <Prazo prazo={p.prazoEtapaEm} encerrado={p.encerradoEm} />
        </div>
        <Trilho estacoes={estacoes} atual={p.estadoAtual} encerrado={!!p.encerradoEm} visitadas={visitadas} />
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          {/* O que fazer agora */}
          {!p.encerradoEm && (
            <section className="panel overflow-hidden">
              {!p.recebidoEm && (noMeuSetor || u.papeis.includes("ADMIN")) && (
                <ActionForm action={receberAction}>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-warn/25 bg-warn-soft px-6 py-4">
                    <div className="text-[14.5px] text-ink">
                      <strong className="font-semibold">Este processo chegou ao seu setor.</strong> Confirme o recebimento para poder trabalhar nele.
                    </div>
                    <input type="hidden" name="processoId" value={p.id} />
                    <SubmitButton className="btn btn-primary" pendingText="Confirmando…">
                      <ArrowDownToLine size={16} /> Confirmar recebimento
                    </SubmitButton>
                  </div>
                </ActionForm>
              )}

              <div className="px-6 pt-5 pb-6">
                <h2 className="text-[17px] font-semibold text-ink">{pode ? "O que fazer agora" : "O que esta etapa exige"}</h2>
                {p.estado.descricao && <p className="mt-1 text-[14.5px] text-ink-2">{p.estado.descricao}</p>}

                {p.estado.gates.length > 0 && (
                  <ul className="mt-4 space-y-2">
                    {gates.map((g, i) => {
                      const nomeDoc = g.gate.tipo === "documento" ? (g.gate.descricao ?? DOCUMENTO_TIPOS[g.gate.documentoTipo]) : (g.gate.descricao ?? g.gate.campo);
                      return (
                        <li key={i} className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${g.ok ? "border-ok/20 bg-ok-soft/50" : "border-line bg-white"}`}>
                          {g.ok ? <CheckCircle2 size={20} className="shrink-0 text-ok" /> : <Circle size={20} className="shrink-0 text-line-2" />}
                          <div className="min-w-0 flex-1">
                            <div className={`text-[14.5px] ${g.ok ? "text-ink-2" : "font-medium text-ink"}`}>{nomeDoc}</div>
                            {!g.ok && <div className="text-[12.5px] text-warn">{g.motivo}</div>}
                          </div>
                          {!g.ok && g.gate.tipo === "documento" && g.motivo === "Documento não juntado" && (
                            <Link href={`?doc=${g.gate.documentoTipo}#juntar`} scroll={false} className="btn btn-quiet !px-3 !py-1.5 text-[13px]">
                              <Plus size={14} /> Juntar
                            </Link>
                          )}
                          {!g.ok && g.gate.tipo === "documento" && g.motivo !== "Documento não juntado" && (
                            <a href="#documentos" className="btn btn-quiet !px-3 !py-1.5 text-[13px]">
                              <PenLine size={14} /> Assinar
                            </a>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}

                {pode ? (
                  <div className="mt-6 space-y-4">
                    {p.estado.avancos.length > 0 && (
                      <ActionForm action={avancarAction}>
                        <input type="hidden" name="processoId" value={p.id} />
                        <label className="label" htmlFor="despacho">
                          Observação para o próximo setor <span className="font-normal text-ink-3">(opcional)</span>
                        </label>
                        <textarea id="despacho" name="despacho" className="input" rows={2} placeholder="Ex.: Segue com a pesquisa de preços atualizada." />
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {p.estado.avancos.map((t, i) => (
                            <SubmitButton
                              key={t.para}
                              name="para"
                              value={t.para}
                              disabled={!prontoParaAvancar || !p.recebidoEm}
                              className={`btn btn-lg ${i === 0 ? "btn-primary" : "btn-quiet"}`}
                              pendingText="Enviando…"
                            >
                              {t.rotulo} <ArrowRight size={17} />
                            </SubmitButton>
                          ))}
                          {!p.recebidoEm ? (
                            <span className="text-[13px] text-ink-3">Confirme o recebimento para liberar o envio.</span>
                          ) : (
                            !prontoParaAvancar && <span className="text-[13px] text-ink-3">Falta {pendentes.length === 1 ? "1 item" : `${pendentes.length} itens`} da lista acima para liberar o envio.</span>
                          )}
                        </div>
                      </ActionForm>
                    )}
                    <div className="flex flex-wrap gap-2 border-t border-line pt-4">
                      {p.estado.devolucoes.length > 0 && (
                        <details className="group w-full rounded-xl border border-line open:bg-sunken/50">
                          <summary className="flex items-center gap-2 px-4 py-3 text-[14px] font-semibold text-ink-2 hover:text-ink">
                            <Undo2 size={16} /> Devolver com pendência
                          </summary>
                          <ActionForm action={devolverAction} className="px-4 pb-4">
                            <input type="hidden" name="processoId" value={p.id} />
                            <div className="grid gap-3 md:grid-cols-[260px_1fr]">
                              <div>
                                <label className="label">Para onde volta</label>
                                <select name="para" className="input">
                                  {p.estado.devolucoes.map((t) => (
                                    <option key={t.para} value={t.para}>
                                      {t.rotulo}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="label">O que precisa ser corrigido</label>
                                <input name="motivo" className="input" placeholder="Ex.: Falta a terceira cotação de preço" />
                              </div>
                            </div>
                            <div className="mt-3">
                              <SubmitButton className="btn btn-danger" pendingText="Devolvendo…">
                                <Undo2 size={16} /> Devolver processo
                              </SubmitButton>
                            </div>
                          </ActionForm>
                        </details>
                      )}
                      {podeTramitarLivre && <EnviarSetor processoId={p.id} setores={listaSetores.filter((s) => s.id !== p.setorAtualId)} />}
                    </div>
                  </div>
                ) : (
                  <div className="mt-5 flex items-start gap-3 rounded-xl bg-sunken px-4 py-3 text-[14px] text-ink-2">
                    <Lock size={17} className="mt-0.5 shrink-0 text-ink-3" />
                    <div>
                      Quem movimenta esta etapa é{" "}
                      <strong className="font-semibold text-ink">
                        {p.estado.setor === "LIVRE" ? "qualquer setor envolvido" : p.estado.setor === null ? "quem abriu a demanda" : (p.setorAtual?.nome ?? p.estado.setor)}
                      </strong>{" "}
                      ({p.estado.papeis.map((x) => PAPEL_NOME[x]).join(", ")}). Você pode consultar e juntar documentos.
                      {podeTramitarLivre && (
                        <div className="mt-3">
                          <EnviarSetor processoId={p.id} setores={listaSetores.filter((s) => s.id !== p.setorAtualId)} />
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Documentos */}
          <section id="documentos" className="panel">
            <header className="flex items-center justify-between px-6 pt-5 pb-2">
              <h2 className="text-[17px] font-semibold text-ink">
                Documentos <span className="tnum font-normal text-ink-3">{p.documentos.length}</span>
              </h2>
            </header>
            {p.documentos.length === 0 ? (
              <p className="px-6 pb-4 text-[14px] text-ink-3">Nenhum documento juntado ainda.</p>
            ) : (
              <ul className="divide-y divide-line border-t border-line">
                {p.documentos.map((d) => (
                  <li key={d.id}>
                    <details className="group">
                      <summary className="flex items-center gap-4 px-6 py-3.5 hover:bg-[#f8f9fc]">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
                          <FileText size={18} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[14.5px] font-medium text-ink">{d.titulo}</div>
                          <div className="truncate text-[12.5px] text-ink-3">
                            {DOCUMENTO_TIPOS[d.tipo] ?? d.tipo} · {d.criadoPor.nome} · {fmtDataHora(d.criadoEm)}
                            {d.versao > 1 ? ` · versão ${d.versao}` : ""}
                          </div>
                        </div>
                        <div className="hidden shrink-0 flex-wrap justify-end gap-1.5 sm:flex">
                          {d.assinaturas.length === 0 ? (
                            <Chip>Sem assinatura</Chip>
                          ) : (
                            d.assinaturas.map((a) => (
                              <Chip key={a.id} tone="ok">
                                <PenLine size={11} strokeWidth={2.5} /> {a.usuario.nome.split(" ")[0]} · {PAPEL_NOME[a.papel as Papel] ?? a.papel}
                              </Chip>
                            ))
                          )}
                        </div>
                      </summary>
                      <div className="px-6 pb-5">
                        <div className="rounded-xl border border-line bg-sunken/60 p-5">
                          <div className="doc-texto">{d.conteudo}</div>
                          <div className="mt-4 text-[11.5px] break-all text-ink-3">Impressão digital do documento (SHA-256): {d.hash}</div>
                        </div>
                        {!p.encerradoEm && u.papeis.some((x) => x !== "ADMIN") && (
                          <ActionForm action={assinarAction} className="mt-3">
                            <input type="hidden" name="processoId" value={p.id} />
                            <input type="hidden" name="documentoId" value={d.id} />
                            <div className="flex flex-wrap items-end gap-3">
                              <div>
                                <label className="label">Assinar como</label>
                                <select name="papel" className="input !w-auto">
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
                                <label className="label">Sua senha</label>
                                <input name="senha" type="password" className="input !w-56" required autoComplete="current-password" />
                              </div>
                              <SubmitButton className="btn btn-primary" pendingText="Assinando…">
                                <PenLine size={16} /> Assinar documento
                              </SubmitButton>
                            </div>
                          </ActionForm>
                        )}
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            )}

            {!p.encerradoEm && (
              <details id="juntar" className="border-t border-line" open={!!docSugerido}>
                <summary className="flex items-center gap-2 px-6 py-4 text-[14.5px] font-semibold text-brand hover:text-brand-2">
                  <Plus size={17} /> Juntar documento
                </summary>
                <ActionForm action={juntarDocumentoAction} className="px-6 pb-6">
                  <input type="hidden" name="processoId" value={p.id} />
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="label">Tipo de documento</label>
                      <select name="tipo" className="input" defaultValue={tipoDocPadrao} key={tipoDocPadrao}>
                        {Object.entries(DOCUMENTO_TIPOS).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label">Título</label>
                      <input name="titulo" className="input" required placeholder="Ex.: Pesquisa de preços — 3 cotações" />
                    </div>
                  </div>
                  <div className="mt-4">
                    <label className="label">Conteúdo</label>
                    <textarea name="conteudo" className="input" rows={6} required placeholder="Escreva ou cole o texto do documento." />
                    <p className="hint">Envio de PDF e imagens chega na próxima versão.</p>
                  </div>
                  <div className="mt-4">
                    <SubmitButton pendingText="Juntando…">
                      <Plus size={16} /> Juntar ao processo
                    </SubmitButton>
                  </div>
                </ActionForm>
              </details>
            )}
          </section>
        </div>

        {/* Coluna lateral */}
        <div className="min-w-0 space-y-6">
          {camposMeta.length > 0 && (
            <Panel title={p.tipo.chave === "COMPRA" ? "Dados da demanda" : "Dados da abertura"}>
              <dl className="space-y-3.5">
                {camposMeta.map((c) => {
                  const v = meta[c.chave];
                  const txt =
                    v == null || v === ""
                      ? "—"
                      : c.chave === "valorEstimado"
                        ? fmtMoeda(v as string)
                        : c.tipo === "data"
                          ? fmtData(String(v) + "T12:00:00")
                          : c.tipo === "opcao"
                            ? (ROTULO_OPCAO[String(v)] ?? String(v))
                            : String(v);
                  return (
                    <div key={c.chave}>
                      <dt className="text-[12.5px] text-ink-3">{c.rotulo}</dt>
                      <dd className={`text-[14.5px] text-ink ${c.chave === "valorEstimado" ? "display tnum text-[20px] font-semibold" : ""}`}>{txt}</dd>
                    </div>
                  );
                })}
              </dl>
            </Panel>
          )}

          <Panel
            title="Histórico"
            action={
              cadeia.ok ? (
                <span className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-ok" title="Nenhum registro foi alterado depois de gravado">
                  <ShieldCheck size={14} /> Registro íntegro
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-bad">
                  <ShieldAlert size={14} /> Alteração detectada no registro {cadeia.seq}
                </span>
              )
            }
          >
            {!p.encerradoEm && (
              <ActionForm action={despacharAction} className="mb-5">
                <input type="hidden" name="processoId" value={p.id} />
                <div className="flex items-start gap-2.5">
                  <Avatar nome={u.nome} size={32} />
                  <div className="flex-1">
                    <input name="texto" className="input !py-2" placeholder="Registrar uma observação" required />
                    <div className="mt-2 text-right">
                      <SubmitButton className="btn btn-quiet !px-3 !py-1.5 text-[13px]" pendingText="Salvando…">
                        Registrar
                      </SubmitButton>
                    </div>
                  </div>
                </div>
              </ActionForm>
            )}
            <Timeline eventos={p.eventos} def={p.def} />
          </Panel>
        </div>
      </div>
    </>
  );
}

function EnviarSetor({ processoId, setores }: { processoId: string; setores: { id: string; nome: string }[] }) {
  return (
    <details className="w-full rounded-xl border border-line open:bg-sunken/50">
      <summary className="flex items-center gap-2 px-4 py-3 text-[14px] font-semibold text-ink-2 hover:text-ink">
        <Send size={16} /> Enviar para outro setor sem mudar de etapa
      </summary>
      <ActionForm action={tramitarAction} className="px-4 pb-4">
        <input type="hidden" name="processoId" value={processoId} />
        <div className="grid gap-3 md:grid-cols-[260px_1fr]">
          <div>
            <label className="label">Setor</label>
            <select name="paraSetorId" className="input">
              {setores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Pedido ao setor</label>
            <input name="despacho" className="input" placeholder="Ex.: Informar se há obra prevista no local" />
          </div>
        </div>
        <div className="mt-3">
          <SubmitButton className="btn btn-quiet" pendingText="Enviando…">
            <Send size={16} /> Enviar
          </SubmitButton>
        </div>
      </ActionForm>
    </details>
  );
}

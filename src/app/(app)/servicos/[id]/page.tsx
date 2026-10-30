import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ClipboardPlus, MapPin } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { candidatasDuplicidade, carregarOcorrencia, podeAtuar, todosSetores } from "@/modulos/servicos/dados";
import { triagemAction } from "@/modulos/servicos/acoes";
import { Estrelas, LinhaDoTempo, SlaChip, StatusChip, StatusOrdemChip } from "@/modulos/servicos/componentes";
import { CANAIS, fmtDia } from "@/modulos/servicos/constantes";
import { fmtData, fmtDataHora } from "@/lib/dates";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Chip, Panel } from "@/components/ui";

export default async function OcorrenciaGestao({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  const { id } = await params;
  const o = await carregarOcorrencia(u.municipioId, id);
  if (!o) notFound();
  const pode = podeAtuar(u, o.setorId);
  const triavel = o.status === "ABERTA" || o.status === "ACEITA";
  const [candidatas, setores] = pode && triavel ? await Promise.all([candidatasDuplicidade(o), todosSetores(u.municipioId)]) : [[], []];
  const solicitante = o.empresa ? o.empresa.razaoSocial : (o.pessoa?.nome ?? o.solicitanteNome ?? "Não identificado");

  return (
    <>
      <Link href="/servicos" className="inline-flex items-center gap-1 text-[14px] font-medium text-ink-2 hover:text-brand">
        <ArrowLeft size={16} /> Ocorrências urbanas
      </Link>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="tnum text-[15px] font-semibold text-brand">{o.protocolo}</span>
        <StatusChip status={o.status} />
        <SlaChip o={o} />
      </div>
      <h1 className="display mt-2 text-[28px] leading-tight font-semibold text-ink sm:text-[32px]">{o.servico.nome}</h1>
      <p className="mt-1 flex items-start gap-1.5 text-[15px] text-ink-2">
        <MapPin size={17} className="mt-0.5 shrink-0" />
        <span>
          {o.logradouro}
          {o.numero ? `, ${o.numero}` : ""} · {o.bairro}
          {o.referencia ? ` · ${o.referencia}` : ""}
          {o.lat !== null && o.lng !== null && (
            <span className="tnum text-ink-3">
              {" "}
              · {o.lat.toFixed(5)}, {o.lng.toFixed(5)}
            </span>
          )}
        </span>
      </p>

      <div className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Panel title="Pedido">
            <p className="text-[15px] text-ink">“{o.descricao}”</p>
            <dl className="mt-5 grid gap-4 text-[14px] sm:grid-cols-2">
              <Item rotulo="Solicitante" valor={solicitante} extra={o.empresa && o.pessoa ? `por ${o.pessoa.nome}` : undefined} />
              <Item rotulo="Canal" valor={CANAIS[o.canal] ?? o.canal} extra={fmtDataHora(o.abertaEm)} />
              <Item rotulo="Secretaria responsável" valor={o.setor.nome} />
              <Item
                rotulo="Prazo-alvo"
                valor={fmtData(o.prazoEm)}
                extra={`${o.servico.slaDiasUteis} ${o.servico.slaDiasUteis === 1 ? "dia útil" : "dias úteis"}${o.servico.exigeFoto ? " · serviço pede foto" : ""}`}
              />
              {o.concluidaEm && <Item rotulo="Concluída em" valor={fmtDataHora(o.concluidaEm)} />}
              {o.motivoRecusa && <Item rotulo="Motivo da recusa" valor={o.motivoRecusa} />}
            </dl>
            {o.duplicadaDe && (
              <p className="mt-5 rounded-lg bg-sunken px-3 py-2 text-[14px] text-ink">
                Duplicada de{" "}
                <Link href={`/servicos/${o.duplicadaDe.id}`} className="tnum font-semibold text-brand hover:underline">
                  {o.duplicadaDe.protocolo}
                </Link>
                . O solicitante acompanha pelo pedido principal e recebe a conclusão junto.
              </p>
            )}
            {o.duplicadas.length > 0 && (
              <p className="mt-5 rounded-lg bg-sunken px-3 py-2 text-[14px] text-ink">
                {o.duplicadas.length === 1 ? "Outro pedido aponta" : `${o.duplicadas.length} pedidos apontam`} para este como principal:{" "}
                {o.duplicadas.map((d, i) => (
                  <span key={d.id}>
                    {i > 0 && ", "}
                    <Link href={`/servicos/${d.id}`} className="tnum font-semibold text-brand hover:underline">
                      {d.protocolo}
                    </Link>
                  </span>
                ))}
                .
              </p>
            )}
          </Panel>

          {o.avaliacaoNota && (
            <Panel title="Avaliação do cidadão">
              <Estrelas nota={o.avaliacaoNota} tamanho={18} />
              {o.avaliacaoComentario && <p className="mt-2 text-[14.5px] text-ink">“{o.avaliacaoComentario}”</p>}
            </Panel>
          )}

          <Panel title="Linha do tempo">
            <LinhaDoTempo eventos={o.eventos} modo="gestao" />
          </Panel>
        </div>

        <div className="space-y-6">
          {o.ordem && (
            <Panel title="Ordem de serviço">
              <Link href={`/servicos/ordens/${o.ordem.id}`} className="tnum text-[16px] font-semibold text-brand hover:underline">
                {o.ordem.numero}
              </Link>
              <div className="mt-2 flex flex-wrap gap-2">
                <StatusOrdemChip status={o.ordem.status} />
                {o.ordem.programadaPara && <Chip>{fmtDia(o.ordem.programadaPara)}</Chip>}
              </div>
              <p className="mt-2 text-[14px] text-ink-2">{o.ordem.equipe?.nome ?? "Sem equipe"}</p>
            </Panel>
          )}

          {triavel && !pode && (
            <Panel title="Triagem">
              <p className="text-[14px] text-ink-2">Só servidores da {o.setor.nome} podem aceitar, recusar ou programar esta ocorrência.</p>
            </Panel>
          )}

          {triavel && pode && (
            <Panel title="Triagem">
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {o.status === "ABERTA" && (
                    <ActionForm action={triagemAction}>
                      <input type="hidden" name="ocorrenciaId" value={o.id} />
                      <input type="hidden" name="acao" value="aceitar" />
                      <SubmitButton pendingText="Aceitando…">Aceitar</SubmitButton>
                    </ActionForm>
                  )}
                  <Link href={`/servicos/ordens/nova?ids=${o.id}`} className="btn btn-quiet">
                    <ClipboardPlus size={16} /> Gerar OS
                  </Link>
                </div>

                <Acao titulo="Recusar com motivo">
                  <ActionForm action={triagemAction}>
                    <input type="hidden" name="ocorrenciaId" value={o.id} />
                    <input type="hidden" name="acao" value="recusar" />
                    <label className="label" htmlFor="motivo-recusa">
                      Motivo (o cidadão vai ler)
                    </label>
                    <textarea id="motivo-recusa" name="motivo" className="input" rows={3} required minLength={10} />
                    <SubmitButton className="btn btn-danger mt-2" pendingText="Recusando…">
                      Recusar ocorrência
                    </SubmitButton>
                  </ActionForm>
                </Acao>

                <Acao titulo="Marcar como duplicada">
                  {candidatas.length === 0 ? (
                    <p className="text-[13.5px] text-ink-2">Não há outra ocorrência em aberto deste serviço para vincular.</p>
                  ) : (
                    <ActionForm action={triagemAction}>
                      <input type="hidden" name="ocorrenciaId" value={o.id} />
                      <input type="hidden" name="acao" value="duplicada" />
                      <label className="label" htmlFor="principalId">
                        Ocorrência principal
                      </label>
                      <select id="principalId" name="principalId" className="input" required>
                        {candidatas.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.protocolo} · {c.logradouro}
                            {c.numero ? `, ${c.numero}` : ""} ({c.bairro})
                          </option>
                        ))}
                      </select>
                      <p className="hint">Mesmo serviço, ainda em aberto. As do mesmo bairro aparecem primeiro.</p>
                      <SubmitButton className="btn btn-quiet mt-2" pendingText="Vinculando…">
                        Vincular como duplicada
                      </SubmitButton>
                    </ActionForm>
                  )}
                </Acao>

                <Acao titulo="Encaminhar a outra secretaria">
                  <ActionForm action={triagemAction}>
                    <input type="hidden" name="ocorrenciaId" value={o.id} />
                    <input type="hidden" name="acao" value="encaminhar" />
                    <label className="label" htmlFor="setorId">
                      Secretaria
                    </label>
                    <select id="setorId" name="setorId" className="input" required defaultValue="">
                      <option value="" disabled>
                        Escolha…
                      </option>
                      {setores
                        .filter((s) => s.id !== o.setorId)
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.nome}
                          </option>
                        ))}
                    </select>
                    <label className="label mt-3" htmlFor="motivo-enc">
                      Motivo <span className="font-normal text-ink-3">(interno)</span>
                    </label>
                    <input id="motivo-enc" name="motivo" className="input" />
                    <SubmitButton className="btn btn-quiet mt-2" pendingText="Encaminhando…">
                      Encaminhar
                    </SubmitButton>
                  </ActionForm>
                </Acao>
              </div>
            </Panel>
          )}

          {pode && (
            <Panel title="Anotação interna">
              <ActionForm action={triagemAction}>
                <input type="hidden" name="ocorrenciaId" value={o.id} />
                <input type="hidden" name="acao" value="nota" />
                <label className="sr-only" htmlFor="nota">
                  Anotação
                </label>
                <textarea id="nota" name="texto" className="input" rows={2} placeholder="Visível só para a gestão" required />
                <SubmitButton className="btn btn-quiet mt-2" pendingText="Salvando…">
                  Anotar
                </SubmitButton>
              </ActionForm>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}

function Item({ rotulo, valor, extra }: { rotulo: string; valor: string; extra?: string }) {
  return (
    <div>
      <dt className="text-[12.5px] text-ink-3">{rotulo}</dt>
      <dd className="font-medium text-ink">{valor}</dd>
      {extra && <dd className="text-[12.5px] text-ink-3">{extra}</dd>}
    </div>
  );
}

function Acao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-xl border border-line">
      <summary className="flex items-center justify-between px-4 py-2.5 text-[14px] font-semibold text-ink hover:bg-sunken/60">
        {titulo}
        <span className="text-ink-3 transition-transform group-open:rotate-90" aria-hidden>
          ›
        </span>
      </summary>
      <div className="border-t border-line px-4 py-3">{children}</div>
    </details>
  );
}

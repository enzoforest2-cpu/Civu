import { notFound } from "next/navigation";
import { MessageSquareWarning } from "lucide-react";
import { requirePortal, ErroAcesso } from "@/lib/portal";
import { carregarMeuProcesso } from "@/lib/portal-processos";
import { caminhoPrincipal, getEstado, nomeEtapa } from "@/lib/workflow";
import { fmtData, fmtDataHora } from "@/lib/dates";
import { Chip } from "@/components/ui";
import { Trilho } from "@/components/trilho";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { responderExigenciaAction } from "../../actions";
import type { Exigencia } from "@/lib/engine";

export default async function MeuPedido({ params }: { params: Promise<{ id: string }> }) {
  const s = await requirePortal();
  const { id } = await params;
  let p;
  try {
    p = await carregarMeuProcesso(s, id);
  } catch (e) {
    if (e instanceof ErroAcesso)
      return (
        <div className="panel p-6 text-[15px] text-ink">
          <strong className="font-semibold">Acesso negado.</strong> {e.message}
        </div>
      );
    throw e;
  }
  if (!p) notFound();
  const nome = (k: string | null) => (k ? nomeEtapa(getEstado(p.def, k)?.nome ?? k) : "");
  const exig = (p.metadados as { exigencia?: Exigencia } | null)?.exigencia;
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 text-[14px]">
        <span className="tnum font-semibold text-brand">Pedido {p.numero}</span>
        <Chip tone="brand">{p.tipo.nome}</Chip>
        {p.encerradoEm ? <Chip tone="ok">Concluído em {fmtData(p.encerradoEm)}</Chip> : <Chip>Em andamento</Chip>}
      </div>
      <h1 className="display mt-2 text-[28px] leading-tight font-bold text-ink">{p.assunto}</h1>
      <p className="mt-1 text-[14.5px] text-ink-2">
        {p.municipio.nome} · aberto em {fmtDataHora(p.abertoEm)}
        {!p.encerradoEm && (
          <>
            {" "}
            · agora em <strong className="font-semibold text-ink">{nome(p.estadoAtual)}</strong>, com {p.setorAtual?.nome ?? "—"}
          </>
        )}
      </p>

      {exig && (
        <section className="mt-6 rounded-2xl border border-warn/30 bg-warn-soft p-5">
          <div className="flex items-center gap-2 font-semibold text-ink">
            <MessageSquareWarning size={18} className="text-warn" /> A prefeitura precisa de um complemento até {fmtData(exig.prazo)}
          </div>
          <p className="mt-1.5 text-[14.5px] text-ink">{exig.texto}</p>
          <ActionForm action={responderExigenciaAction} className="mt-4">
            <input type="hidden" name="processoId" value={p.id} />
            <label className="label" htmlFor="texto">
              Sua resposta
            </label>
            <textarea id="texto" name="texto" className="input" rows={3} required />
            <p className="hint">O envio de arquivos chega na próxima versão; por enquanto, descreva ou informe onde está o documento.</p>
            <SubmitButton className="btn btn-primary mt-2" pendingText="Enviando…">
              Enviar resposta
            </SubmitButton>
          </ActionForm>
        </section>
      )}

      <section className="panel mt-6 p-6">
        <Trilho
          estacoes={p.def.estados.map((e) => ({ chave: e.chave, nome: nomeEtapa(e.nome), setor: null, opcional: !caminhoPrincipal(p.def).includes(e.chave) }))}
          atual={p.estadoAtual}
          encerrado={!!p.encerradoEm}
          visitadas={p.eventos.map((e) => e.paraEstado).filter((x): x is string => !!x)}
        />
      </section>

      <section className="panel mt-6 p-6">
        <h2 className="text-[16px] font-semibold text-ink">O que aconteceu</h2>
        <ol className="mt-4 space-y-4">
          {[...p.eventos].reverse().map((e) => {
            const d = (e.dados ?? {}) as Record<string, string>;
            return (
              <li key={e.id} className="grid grid-cols-[minmax(0,130px)_minmax(0,1fr)] gap-4 text-[14.5px]">
                <span className="tnum text-ink-3">{fmtDataHora(e.criadoEm)}</span>
                <span className="text-ink">
                  {e.tipo === "ABERTURA" && "Pedido registrado"}
                  {e.tipo === "MUDANCA_ESTADO" && `Avançou para “${nome(e.paraEstado)}”`}
                  {e.tipo === "DEVOLUCAO" && `Voltou para “${nome(e.paraEstado)}” para correção`}
                  {e.tipo === "ENVIO" && `Encaminhado para ${e.paraSetor?.nome ?? "—"}`}
                  {e.tipo === "RECEBIMENTO" && `Recebido por ${e.paraSetor?.nome ?? "—"}`}
                  {e.tipo === "ENCERRAMENTO" && "Pedido concluído"}
                  {e.tipo === "EXIGENCIA" && (
                    <>
                      A prefeitura pediu: <span className="text-ink-2">{d.texto}</span>
                    </>
                  )}
                  {e.tipo === "RESPOSTA_EXIGENCIA" && (
                    <>
                      {d.nome} respondeu: <span className="text-ink-2">{d.texto}</span>
                    </>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      </section>
    </>
  );
}

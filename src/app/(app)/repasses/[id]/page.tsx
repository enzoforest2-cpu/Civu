import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { exigirRota } from "@/lib/acesso";
import { urlSemAcesso } from "@/lib/areas";
import { fmtDataHora, fmtMoeda } from "@/lib/dates";
import { Cabecalho, Chip, NumeroProcesso, Panel, Vazio } from "@/components/ui";
import { carregarRepasse, processosParaVincular } from "@/modulos/repasses/dados";
import { BarraExecucao, ChipPrazo, ChipSituacao } from "@/modulos/repasses/componentes";
import { FormDesvincular, FormVincular } from "@/modulos/repasses/formularios";
import { TIPOS_REPASSE, dataBr, podeEditarNaArea, podeVerNaArea } from "@/modulos/repasses/regras";

export default async function RepassePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await exigirRota(`/repasses/${id}`);
  const r = await carregarRepasse(u.municipioId, id);
  if (!r) notFound();
  // leitura conforme a área da secretaria responsável: secretário de outra pasta não abre por URL
  if (!podeVerNaArea(u, r.area)) redirect(urlSemAcesso(`/repasses/${id}`));
  const pode = podeEditarNaArea(u, r.area);
  const candidatos = pode && r.situacao !== "PRESTADO" ? await processosParaVincular(u.municipioId, r.area) : [];
  const datas: [string, string | null][] = [
    ["Assinatura ou publicação", r.assinadoEm],
    ["Fim da vigência", r.vigenciaFim],
    ["Prazo de execução", r.prazoExecucao],
    ["Prestação de contas", r.prazoPrestacaoContas],
  ];
  const alertaDe = new Map(r.prazos.map((p) => [p.rotulo, p]));

  return (
    <>
      <Link href="/repasses" className="mb-4 inline-flex items-center gap-1.5 text-[14px] font-medium text-ink-2 hover:text-ink">
        <ArrowLeft size={15} aria-hidden /> Repasses e convênios
      </Link>
      <Cabecalho
        titulo={r.objeto}
        sub={
          <span className="flex flex-wrap items-center gap-2">
            <span>
              {r.rotulo} · {r.concedente}
            </span>
            <ChipSituacao s={r.situacao} />
          </span>
        }
        acao={
          pode ? (
            <Link href={`/repasses/${r.id}/editar`} className="btn btn-quiet">
              <Pencil size={16} aria-hidden /> Alterar dados
            </Link>
          ) : undefined
        }
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <Panel title="Execução">
            <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="display tnum text-[30px] leading-none font-semibold text-ink">{r.execucao.percentual.toLocaleString("pt-BR")}%</span>
              <span className="text-[14px] text-ink-2">
                pago de {fmtMoeda(r.valorPrevisto)} previstos · recebido {fmtMoeda(r.valorRecebido)}
              </span>
            </div>
            <BarraExecucao previsto={r.valorPrevisto} {...r.execucao} />
            <p className="hint mt-4">Contratado, liquidado e pago vêm dos processos vinculados abaixo (valor da contratação registrada em cada processo).</p>
          </Panel>

          <Panel title={`Processos vinculados (${r.processos.length})`} pad={false}>
            {r.processos.length === 0 ? (
              <div className="px-6 pt-3 pb-6">
                <Vazio>{pode ? "Nenhum processo vinculado. Vincule abaixo as compras e os pagamentos feitos com este recurso." : "Nenhum processo vinculado a este repasse."}</Vazio>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {r.processos.map((p) => (
                  <li key={p.id} className="px-6 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <NumeroProcesso id={p.id} numero={p.numero} />
                      <span className="flex flex-wrap gap-1.5">
                        {p.pago ? <Chip tone="ok">Pago</Chip> : p.liquidado ? <Chip tone="brand">Liquidado</Chip> : p.valor != null ? <Chip tone="warn">Contratado</Chip> : <Chip>Sem contratação</Chip>}
                        {p.cancelado && <Chip tone="neutral">Encerrado sem pagamento</Chip>}
                      </span>
                    </div>
                    <div className="mt-1 text-[14px] leading-snug text-ink">{p.assunto}</div>
                    <div className="mt-0.5 text-[13px] text-ink-2">
                      {p.etapa}
                      {p.fornecedor ? ` · ${p.fornecedor}` : ""}
                      {p.valor != null ? ` · ${fmtMoeda(p.valor)}` : ""}
                    </div>
                    {pode && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-[14px] font-medium text-ink-2 hover:text-ink">Desvincular deste repasse</summary>
                        <FormDesvincular repasseId={r.id} processoId={p.id} numero={p.numero} />
                      </details>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {pode && r.situacao !== "PRESTADO" && (
              <div className="border-t border-line px-6 pt-4 pb-6">
                <h3 className="mb-3 text-[15px] font-semibold text-ink">Vincular processo</h3>
                {candidatos.length === 0 ? (
                  <p className="text-[14px] text-ink-2">Não há processo de compra ou de pagamento livre para vincular. Ao abrir uma compra, escolha este repasse no pedido.</p>
                ) : (
                  <FormVincular repasseId={r.id} processos={candidatos.map((c) => ({ id: c.id, daArea: c.daArea, rotulo: `${c.numero} · ${c.assunto} (${c.etapa})` }))} />
                )}
              </div>
            )}
          </Panel>

          <Panel title="Linha do tempo">
            {r.linhaDoTempo.length === 0 ? (
              <Vazio>Sem registros.</Vazio>
            ) : (
              <ol className="space-y-4">
                {r.linhaDoTempo.map((e) => (
                  <li key={e.id} className="border-l-2 border-line pl-4 text-[14px]">
                    <div className="font-medium text-ink">
                      {e.titulo}
                      {e.processo && (
                        <>
                          {" "}
                          <Link href={`/processos/${e.processo.id}`} className="tnum font-semibold text-brand-2 hover:underline">
                            {e.processo.numero}
                          </Link>
                        </>
                      )}
                    </div>
                    {e.detalhe && <div className="mt-0.5 text-ink-2">{e.detalhe}</div>}
                    <div className="mt-0.5 text-[12.5px] text-ink-3">
                      {e.autor ?? "Sistema"} · {fmtDataHora(e.quando)}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>

        <aside className="min-w-0 space-y-6">
          <Panel title="Prazos">
            <dl className="space-y-3 text-[14px]">
              {datas.map(([rotulo, data]) => {
                const p = alertaDe.get(rotulo);
                return (
                  <div key={rotulo}>
                    <dt className="text-[13px] text-ink-3">{rotulo}</dt>
                    <dd className="tnum text-ink">
                      {data ? (p && p.alerta.nivel !== "ok" ? <ChipPrazo alerta={p.alerta} data={data} /> : dataBr(data)) : <span className="text-ink-3">Não informado</span>}
                    </dd>
                  </div>
                );
              })}
            </dl>
            {r.risco.emRisco && <p className="mt-4 rounded-lg bg-bad-soft px-3 py-2 text-[13.5px] text-bad">{r.risco.motivo}. Valor em risco: {fmtMoeda(r.risco.valorEmRisco)}.</p>}
          </Panel>
          <Panel title="Dados">
            <dl className="space-y-3 text-[14px]">
              <div>
                <dt className="text-[13px] text-ink-3">Tipo</dt>
                <dd className="text-ink">{r.tipoNome}</dd>
                <dd className="text-[13px] text-ink-2">{TIPOS_REPASSE[r.tipo]?.descricao}</dd>
              </div>
              <div>
                <dt className="text-[13px] text-ink-3">Número</dt>
                <dd className="tnum text-ink">{r.identificacao ?? "Sem número informado"}</dd>
              </div>
              <div>
                <dt className="text-[13px] text-ink-3">Secretaria responsável</dt>
                <dd className="text-ink">{r.setor.nome}</dd>
              </div>
              <div>
                <dt className="text-[13px] text-ink-3">Concedente</dt>
                <dd className="text-ink">{r.concedente}</dd>
              </div>
              {r.observacao && (
                <div>
                  <dt className="text-[13px] text-ink-3">Observação</dt>
                  <dd className="text-ink">{r.observacao}</dd>
                </div>
              )}
            </dl>
            {!pode && <p className="hint mt-4">Só quem é da área da secretaria responsável ou do Gabinete altera este repasse.</p>}
          </Panel>
        </aside>
      </div>
    </>
  );
}

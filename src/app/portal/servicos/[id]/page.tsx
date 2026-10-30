import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, MapPin } from "lucide-react";
import { requirePortal, ErroAcesso } from "@/lib/portal";
import { carregarMinhaOcorrencia, ErroServico, previsao } from "@/modulos/servicos/dados";
import { Estrelas, LinhaDoTempo, StatusChip } from "@/modulos/servicos/componentes";
import { CANAIS, enderecoCurto, STATUS_CIDADAO, type StatusOcorrencia } from "@/modulos/servicos/constantes";
import { FormAvaliacao } from "@/modulos/servicos/form-avaliacao";
import { fmtData, fmtDataHora } from "@/lib/dates";

const PASSOS: { chave: StatusOcorrencia[]; nome: string }[] = [
  { chave: ["ABERTA"], nome: "Recebido" },
  { chave: ["ACEITA"], nome: "Aceito" },
  { chave: ["PROGRAMADA"], nome: "Programado" },
  { chave: ["EM_EXECUCAO"], nome: "Em execução" },
  { chave: ["CONCLUIDA"], nome: "Concluído" },
];

export default async function MeuPedidoServico({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ novo?: string }> }) {
  const s = await requirePortal();
  const { id } = await params;
  const { novo } = await searchParams;
  let o;
  try {
    o = await carregarMinhaOcorrencia(s, id);
  } catch (e) {
    if (e instanceof ErroAcesso || e instanceof ErroServico)
      return (
        <div className="panel p-6 text-[15px] text-ink">
          <strong className="font-semibold">Acesso negado.</strong> {e.message}
        </div>
      );
    throw e;
  }
  if (!o) notFound();
  const referencia = o.duplicadaDe && o.status === "DUPLICADA" ? o.duplicadaDe : o;
  const idx = PASSOS.findIndex((p) => p.chave.includes(referencia.status as StatusOcorrencia));
  const prev = previsao({ ...referencia, ordem: referencia.ordem });
  const fora = ["RECUSADA"].includes(o.status);

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/portal/servicos" className="inline-flex items-center gap-1 text-[14px] font-medium text-ink-2 hover:text-brand">
        <ArrowLeft size={16} /> Meus pedidos de serviço
      </Link>

      {novo && (
        <div className="mt-4 flex items-start gap-3 rounded-2xl border border-ok/30 bg-ok-soft p-4 text-[14.5px] text-ink">
          <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-ok" />
          <div>
            <strong className="font-semibold">Pedido registrado. Seu protocolo é {o.protocolo}.</strong> A {o.setor.nome} vai analisar e programar o
            atendimento. As atualizações aparecem aqui.
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 text-[14px]">
        <span className="tnum font-semibold text-brand">Protocolo {o.protocolo}</span>
        <StatusChip status={o.status} publico />
      </div>
      <h1 className="display mt-2 text-[26px] leading-tight font-bold text-ink sm:text-[30px]">{o.servico.nome}</h1>
      <p className="mt-1 flex items-start gap-1.5 text-[14.5px] text-ink-2">
        <MapPin size={16} className="mt-0.5 shrink-0" />
        <span>
          {enderecoCurto(o)}
          {o.referencia ? ` · ${o.referencia}` : ""}
        </span>
      </p>

      {o.status === "DUPLICADA" && o.duplicadaDe && (
        <p className="mt-4 rounded-xl bg-sunken px-4 py-3 text-[14.5px] text-ink">
          Este problema já tinha sido informado no pedido <strong className="tnum font-semibold">{o.duplicadaDe.protocolo}</strong>. Os dois serão atendidos
          juntos; a situação abaixo é a do pedido principal:{" "}
          <strong className="font-semibold">{STATUS_CIDADAO[o.duplicadaDe.status as StatusOcorrencia]?.rotulo}</strong>.
        </p>
      )}

      {fora ? (
        <section className="mt-6 rounded-2xl border border-bad/25 bg-bad-soft p-5">
          <h2 className="font-semibold text-ink">A prefeitura não vai atender este pedido</h2>
          <p className="mt-1 text-[14.5px] text-ink">{o.motivoRecusa}</p>
          <p className="mt-2 text-[13.5px] text-ink-2">Se discordar, procure a {o.setor.nome} ou faça um novo pedido com mais detalhes.</p>
        </section>
      ) : (
        <section className="panel mt-6 p-5 sm:p-6">
          <ol className="grid grid-cols-5 gap-1" aria-label="Andamento do pedido">
            {PASSOS.map((p, i) => {
              const feito = i <= idx;
              return (
                <li key={p.nome} className="flex flex-col items-center gap-2 text-center">
                  <span className={`h-2 w-full rounded-full ${feito ? "bg-brand" : "bg-line"}`} aria-hidden />
                  <span className={`text-[12px] leading-tight sm:text-[13px] ${i === idx ? "font-semibold text-ink" : feito ? "text-ink-2" : "text-ink-3"}`}>
                    {p.nome}
                    {i === idx && <span className="sr-only"> (situação atual)</span>}
                  </span>
                </li>
              );
            })}
          </ol>
          <dl className="mt-5 grid gap-4 text-[14.5px] sm:grid-cols-3">
            <div>
              <dt className="text-[12.5px] text-ink-3">Responsável</dt>
              <dd className="font-medium text-ink">{o.setor.nome}</dd>
            </div>
            <div>
              <dt className="text-[12.5px] text-ink-3">
                {o.status === "CONCLUIDA" ? "Concluído em" : referencia.status === "EM_EXECUCAO" ? "Situação" : "Previsão"}
              </dt>
              <dd className="font-medium text-ink">{o.status === "CONCLUIDA" ? fmtData(o.concluidaEm) : (prev ?? "—")}</dd>
            </div>
            <div>
              <dt className="text-[12.5px] text-ink-3">Registrado</dt>
              <dd className="font-medium text-ink">
                {fmtDataHora(o.abertaEm)} · {CANAIS[o.canal] ?? o.canal}
              </dd>
            </div>
          </dl>
          {(referencia.status === "ABERTA" || referencia.status === "ACEITA") && (
            <p className="mt-4 text-[13px] text-ink-3">
              O prazo-alvo deste serviço é de {o.servico.slaDiasUteis} {o.servico.slaDiasUteis === 1 ? "dia útil" : "dias úteis"}. A data só é confirmada quando
              a secretaria programa a equipe.
            </p>
          )}
        </section>
      )}

      {o.status === "CONCLUIDA" && (
        <section className="panel mt-6 p-5 sm:p-6">
          <h2 className="text-[16px] font-semibold text-ink">Sua avaliação</h2>
          {o.avaliacaoNota ? (
            <div className="mt-2 text-[14.5px] text-ink">
              <Estrelas nota={o.avaliacaoNota} tamanho={20} />
              {o.avaliacaoComentario && <p className="mt-2 text-ink-2">“{o.avaliacaoComentario}”</p>}
              <p className="mt-2 text-[13px] text-ink-3">Avaliado em {fmtData(o.avaliadaEm)}. Obrigado.</p>
            </div>
          ) : (
            <div className="mt-3">
              <FormAvaliacao ocorrenciaId={o.id} />
            </div>
          )}
        </section>
      )}

      <section className="panel mt-6 p-5 sm:p-6">
        <h2 className="text-[16px] font-semibold text-ink">O que aconteceu</h2>
        <p className="mt-1 text-[14px] text-ink-2">“{o.descricao}”</p>
        <div className="mt-5">
          <LinhaDoTempo eventos={o.eventos} modo="cidadao" />
        </div>
      </section>
    </div>
  );
}

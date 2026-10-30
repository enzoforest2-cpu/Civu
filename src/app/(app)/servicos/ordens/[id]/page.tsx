import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { carregarOrdem, equipes as listarEquipes, podeAtuar } from "@/modulos/servicos/dados";
import { ordemAction } from "@/modulos/servicos/acoes";
import { StatusChip, StatusOrdemChip } from "@/modulos/servicos/componentes";
import { Concluir, Iniciar, Materiais } from "@/modulos/servicos/execucao";
import { fmtDia, hojeIso } from "@/modulos/servicos/constantes";
import { fmtDataHora } from "@/lib/dates";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Panel } from "@/components/ui";

export default async function OrdemPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ nova?: string }> }) {
  const u = await requireUser();
  const { id } = await params;
  const { nova } = await searchParams;
  const os = await carregarOrdem(u.municipioId, id);
  if (!os) notFound();
  const pode = podeAtuar(u, os.setorId) || os.equipe?.encarregadoId === u.id;
  const aberta = os.status === "PROGRAMADA" || os.status === "EM_EXECUCAO";
  const eqs = pode && aberta ? await listarEquipes(u.municipioId, os.setorId) : [];

  return (
    <>
      <Link href="/servicos/ordens" className="inline-flex items-center gap-1 text-[14px] font-medium text-ink-2 hover:text-brand">
        <ArrowLeft size={16} /> Ordens de serviço
      </Link>
      {nova && (
        <div className="mt-4 flex items-start gap-3 rounded-2xl border border-ok/30 bg-ok-soft p-4 text-[14.5px] text-ink">
          <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-ok" />
          <span>
            <strong className="font-semibold">{os.numero} gerada.</strong> Os cidadãos já veem a data programada no portal, e a equipe vê a OS na tela de campo.
          </span>
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="tnum text-[15px] font-semibold text-brand">{os.numero}</span>
        <StatusOrdemChip status={os.status} />
      </div>
      <h1 className="display mt-2 text-[28px] leading-tight font-semibold text-ink sm:text-[32px]">
        {os.equipe?.nome ?? "Sem equipe"} · {fmtDia(os.programadaPara)}
      </h1>
      <p className="mt-1 text-[14.5px] text-ink-2">
        {os.setor.nome} · criada por {os.criadaPor.nome} em {fmtDataHora(os.criadaEm)}
        {os.iniciadaEm ? ` · iniciada em ${fmtDataHora(os.iniciadaEm)}` : ""}
        {os.concluidaEm ? ` · concluída em ${fmtDataHora(os.concluidaEm)}` : ""}
      </p>

      <div className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Panel title={`Ocorrências (${os.ocorrencias.length})`} pad={false}>
            <ul className="divide-y divide-line">
              {os.ocorrencias.map((o) => (
                <li key={o.id} className="flex flex-wrap items-start justify-between gap-2 px-6 py-3.5">
                  <div className="min-w-0">
                    <Link href={`/servicos/${o.id}`} className="tnum text-[13.5px] font-semibold text-brand hover:underline">
                      {o.protocolo}
                    </Link>
                    {o.duplicadas.length > 0 && <span className="ml-2 text-[12.5px] text-ink-3">+{o.duplicadas.length} duplicada(s)</span>}
                    <div className="font-medium text-ink">
                      {o.logradouro}
                      {o.numero ? `, ${o.numero}` : ""} · {o.bairro}
                    </div>
                    <div className="text-[13.5px] text-ink-2">
                      {o.servico.nome}
                      {o.referencia ? ` · ${o.referencia}` : ""}
                    </div>
                    <p className="mt-1 text-[13.5px] text-ink-2">“{o.descricao}”</p>
                  </div>
                  <StatusChip status={o.status} />
                </li>
              ))}
            </ul>
          </Panel>
          {os.instrucoes && (
            <Panel title="Instruções para a equipe">
              <p className="text-[14.5px] text-ink">{os.instrucoes}</p>
            </Panel>
          )}
          {os.equipe?.membros && (
            <Panel title="Equipe">
              <p className="text-[14.5px] text-ink">{os.equipe.membros}</p>
            </Panel>
          )}
        </div>

        <div className="space-y-6">
          {os.status === "CONCLUIDA" && os.observacao && (
            <Panel title="Resultado">
              <p className="text-[14.5px] text-ink">{os.observacao}</p>
            </Panel>
          )}
          {pode && os.status === "PROGRAMADA" && (
            <Panel title="Execução">
              <p className="mb-3 text-[14px] text-ink-2">A equipe pode iniciar pela tela de campo ou aqui.</p>
              <Iniciar ordemId={os.id} />
            </Panel>
          )}
          <Panel title="Materiais usados">
            <Materiais ordemId={os.id} materiais={os.materiais} editavel={pode && aberta} />
          </Panel>
          {pode && aberta && (
            <Panel title="Concluir">
              <Concluir ordemId={os.id} />
            </Panel>
          )}
          {pode && aberta && (
            <Panel title="Reprogramar">
              <ActionForm action={ordemAction} resetOnOk={false}>
                <input type="hidden" name="ordemId" value={os.id} />
                <input type="hidden" name="acao" value="reprogramar" />
                <label className="label" htmlFor="equipe-r">
                  Equipe
                </label>
                <select id="equipe-r" name="equipeId" className="input" defaultValue={os.equipeId ?? ""}>
                  {eqs.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.nome}
                    </option>
                  ))}
                </select>
                <label className="label mt-3" htmlFor="data-r">
                  Nova data
                </label>
                <input
                  id="data-r"
                  name="data"
                  type="date"
                  className="input"
                  min={hojeIso()}
                  defaultValue={os.programadaPara && os.programadaPara >= hojeIso() ? os.programadaPara : hojeIso()}
                  required
                />
                <label className="label mt-3" htmlFor="motivo-r">
                  Motivo <span className="font-normal text-ink-3">(o cidadão vê)</span>
                </label>
                <input id="motivo-r" name="motivo" className="input" placeholder="Ex.: chuva forte; caminhão em manutenção" required minLength={5} />
                <SubmitButton className="btn btn-quiet mt-3" pendingText="Salvando…">
                  Salvar programação
                </SubmitButton>
              </ActionForm>
            </Panel>
          )}
          {!pode && aberta && (
            <Panel title="Execução">
              <p className="text-[14px] text-ink-2">Só servidores da {os.setor.nome} ou o encarregado da equipe podem movimentar esta OS.</p>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}

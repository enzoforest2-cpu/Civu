import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { equipes as listarEquipes, ocorrenciasParaOrdem, podeAtuar } from "@/modulos/servicos/dados";
import { criarOrdemAction } from "@/modulos/servicos/acoes";
import { SlaChip, StatusChip } from "@/modulos/servicos/componentes";
import { hojeIso } from "@/modulos/servicos/constantes";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Cabecalho, Panel, Vazio } from "@/components/ui";

export default async function NovaOrdem({ searchParams }: { searchParams: Promise<{ ids?: string | string[] }> }) {
  const u = await requireUser();
  const { ids } = await searchParams;
  const lista = await ocorrenciasParaOrdem(u, ([] as string[]).concat(ids ?? []));
  const validas = lista.filter((o) => o.status === "ABERTA" || o.status === "ACEITA");
  const setores = [...new Set(validas.map((o) => o.setorId))];
  const setor = validas[0]?.setor;
  const eqs = setores.length === 1 ? await listarEquipes(u.municipioId, setores[0]) : [];
  const erro =
    validas.length === 0
      ? "Nenhuma ocorrência selecionada pode entrar numa OS. Volte à fila e marque ocorrências aguardando triagem ou aceitas."
      : setores.length > 1
        ? "As ocorrências marcadas são de secretarias diferentes. Uma OS reúne ocorrências de uma única secretaria."
        : !podeAtuar(u, setores[0])
          ? `Só servidores da ${setor?.nome} podem programar estas ocorrências.`
          : eqs.length === 0
            ? `A ${setor?.nome} ainda não tem equipes cadastradas. Cadastre uma em Catálogo e equipes.`
            : null;

  return (
    <>
      <Link href="/servicos" className="inline-flex items-center gap-1 text-[14px] font-medium text-ink-2 hover:text-brand">
        <ArrowLeft size={16} /> Fila de ocorrências
      </Link>
      <div className="mt-3">
        <Cabecalho
          titulo="Nova ordem de serviço"
          sub={setor ? `${setor.nome} · ${validas.length} ${validas.length === 1 ? "ocorrência" : "ocorrências"}` : undefined}
        />
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Panel title="Ocorrências incluídas" pad={false}>
          {validas.length === 0 ? (
            <div className="p-6">
              <Vazio>Nenhuma ocorrência selecionada.</Vazio>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {validas.map((o) => (
                <li key={o.id} className="flex flex-wrap items-start justify-between gap-2 px-6 py-3.5">
                  <div className="min-w-0">
                    <Link href={`/servicos/${o.id}`} className="tnum text-[13.5px] font-semibold text-brand hover:underline">
                      {o.protocolo}
                    </Link>
                    <div className="font-medium text-ink">{o.servico.nome}</div>
                    <div className="text-[13.5px] text-ink-2">
                      {o.logradouro}
                      {o.numero ? `, ${o.numero}` : ""} · {o.bairro}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <StatusChip status={o.status} />
                    <SlaChip o={o} />
                  </div>
                </li>
              ))}
            </ul>
          )}
          {lista.length > validas.length && (
            <p className="border-t border-line px-6 py-3 text-[13px] text-ink-3">
              {lista.length - validas.length} ocorrência(s) marcada(s) já estavam em outra OS ou encerradas e ficaram de fora.
            </p>
          )}
        </Panel>

        <Panel title="Programação">
          {erro ? (
            <p className="rounded-lg bg-warn-soft px-3 py-2 text-[14px] text-ink">{erro}</p>
          ) : (
            <ActionForm action={criarOrdemAction} resetOnOk={false}>
              {validas.map((o) => (
                <input key={o.id} type="hidden" name="ids" value={o.id} />
              ))}
              <label className="label" htmlFor="equipeId">
                Equipe
              </label>
              <select id="equipeId" name="equipeId" className="input" required>
                {eqs.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nome}
                  </option>
                ))}
              </select>
              <label className="label mt-4" htmlFor="data">
                Data programada
              </label>
              <input id="data" name="data" type="date" className="input" required min={hojeIso()} defaultValue={hojeIso()} />
              <p className="hint">O cidadão vê esta data como previsão de atendimento.</p>
              <label className="label mt-4" htmlFor="instrucoes">
                Instruções para a equipe <span className="font-normal text-ink-3">(opcional)</span>
              </label>
              <textarea id="instrucoes" name="instrucoes" className="input" rows={3} placeholder="Ordem das paradas, material a levar, cuidados no local" />
              <SubmitButton className="btn btn-primary mt-4 w-full" pendingText="Gerando…">
                Gerar OS e avisar os cidadãos
              </SubmitButton>
            </ActionForm>
          )}
        </Panel>
      </div>
    </>
  );
}

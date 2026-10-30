import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { fmtDataHora } from "@/lib/dates";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Cabecalho, Chip, Panel, Vazio } from "@/components/ui";
import { pode } from "@/modulos/gestao/permissoes";
import { chamadasRecentes, listarIntegracoes, STATUS_ROTULO, type StatusIntegracao } from "@/modulos/gestao/integracoes";
import { configurarIntegracaoAction, testarIntegracaoAction } from "@/modulos/gestao/acoes";

export const metadata = { title: "Integrações · Civu" };

const TOM_STATUS: Record<StatusIntegracao, "ok" | "brand" | "neutral"> = { ATIVA: "ok", SIMULADA: "brand", NAO_CONFIGURADA: "neutral" };
const TOM_CHAMADA: Record<string, "ok" | "bad" | "warn" | "neutral"> = { SUCESSO: "ok", FALHA: "bad", REJEITADA: "bad", PENDENTE: "warn" };
const ROTULO_CHAMADA: Record<string, string> = { SUCESSO: "Sucesso", FALHA: "Falha", REJEITADA: "Rejeitada", PENDENTE: "Pendente" };
const DIRECAO: Record<string, string> = { ENVIO: "Envio", CONSULTA: "Consulta", RETORNO: "Retorno" };

export default async function IntegracoesPage({ searchParams }: { searchParams: Promise<{ conector?: string }> }) {
  const u = await requireUser();
  if (!pode.verIntegracoes(u)) redirect("/painel");
  const { conector } = await searchParams;
  const [lista, chamadas] = await Promise.all([listarIntegracoes(u.municipioId), chamadasRecentes(u.municipioId, conector || undefined)]);
  const admin = pode.configurarIntegracoes(u);
  const cont = (s: StatusIntegracao) => lista.filter((i) => i.status === s).length;
  const filtrado = lista.find((i) => i.chave === conector);

  return (
    <>
      <Cabecalho
        titulo="Central de integrações"
        sub="Situação de cada conexão com órgãos externos, último sincronismo, responsável e o registro de cada envio e retorno."
      />

      <div className="mb-6 rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-[13.5px] leading-relaxed text-ink">
        <span className="font-semibold">Ambiente de demonstração.</span> Nenhum conector desta versão fala com o órgão real: as chamadas abaixo são simuladas, com resultados de exemplo,
        e ficam marcadas como tal. &quot;Conectado&quot; não significa que todas as operações de uma instituição estejam disponíveis; cada uma exige acesso, contrato de dados e teste
        próprios.
      </div>

      <div className="mb-6 flex flex-wrap gap-x-8 gap-y-2 text-[14px] text-ink-2">
        {(["ATIVA", "SIMULADA", "NAO_CONFIGURADA"] as StatusIntegracao[]).map((s) => (
          <div key={s}>
            <span className="display tnum text-[22px] font-semibold text-ink">{cont(s)}</span> {STATUS_ROTULO[s].toLowerCase()}
            {s === "ATIVA" && cont(s) === 0 && <span className="text-ink-3"> (nenhuma em produção)</span>}
          </div>
        ))}
      </div>

      <div className="mb-6 grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2 xl:grid-cols-3">
        {lista.map((i) => (
          <article key={i.chave} className="panel flex flex-col p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[16px] font-semibold text-ink">{i.nome}</h2>
                <div className="text-[12.5px] text-ink-3">{i.orgao}</div>
              </div>
              <Chip tone={TOM_STATUS[i.status]}>{STATUS_ROTULO[i.status]}</Chip>
            </div>
            <p className="mt-2 text-[13.5px] leading-snug text-ink-2">{i.finalidade}</p>
            <dl className="mt-3 space-y-1 text-[12.5px]">
              <div>
                <dt className="inline font-semibold text-ink">Condição para produção: </dt>
                <dd className="inline text-ink-2">{i.condicao}</dd>
              </div>
              <div>
                <dt className="inline font-semibold text-ink">Meio: </dt>
                <dd className="inline text-ink-2">{i.meio}</dd>
              </div>
              <div>
                <dt className="inline font-semibold text-ink">Último sincronismo: </dt>
                <dd className="inline tnum text-ink-2">{i.registro?.ultimoSincronismo ? fmtDataHora(i.registro.ultimoSincronismo) : "nunca"}</dd>
              </div>
              {i.registro?.responsavel && (
                <div>
                  <dt className="inline font-semibold text-ink">Responsável: </dt>
                  <dd className="inline text-ink-2">{i.registro.responsavel.nome}</dd>
                </div>
              )}
              {i.registro?.pendencias && (
                <div>
                  <dt className="inline font-semibold text-ink">Pendências: </dt>
                  <dd className="inline text-ink-2">{i.registro.pendencias}</dd>
                </div>
              )}
            </dl>
            <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
              <Link href={`/integracoes?conector=${i.chave}#chamadas`} className="text-[13px] font-semibold text-brand hover:underline">
                Ver chamadas
              </Link>
              {admin && (
                <div className="ml-auto flex flex-wrap gap-1.5">
                  {i.status === "SIMULADA" && (
                    <ActionForm action={testarIntegracaoAction} resetOnOk={false}>
                      <input type="hidden" name="chave" value={i.chave} />
                      <SubmitButton className="btn btn-quiet !px-2.5 !py-1 text-[12.5px]" pendingText="Testando…">
                        Testar (simulado)
                      </SubmitButton>
                    </ActionForm>
                  )}
                  <ActionForm action={configurarIntegracaoAction} resetOnOk={false}>
                    <input type="hidden" name="chave" value={i.chave} />
                    <input type="hidden" name="status" value={i.status === "NAO_CONFIGURADA" ? "SIMULADA" : "NAO_CONFIGURADA"} />
                    <SubmitButton className="btn btn-quiet !px-2.5 !py-1 text-[12.5px]">{i.status === "NAO_CONFIGURADA" ? "Ligar em modo simulado" : "Desligar"}</SubmitButton>
                  </ActionForm>
                </div>
              )}
            </div>
          </article>
        ))}
      </div>

      <div id="chamadas" className="scroll-mt-24">
        <Panel
          title={filtrado ? `Chamadas recentes: ${filtrado.nome}` : "Chamadas recentes"}
          pad={false}
          action={
            filtrado ? (
              <Link href="/integracoes#chamadas" className="text-[13px] font-semibold text-brand hover:underline">
                Ver todas
              </Link>
            ) : undefined
          }
        >
          {chamadas.length === 0 ? (
            <div className="p-6">
              <Vazio>Nenhuma chamada registrada{filtrado ? " para esta integração" : ""}.</Vazio>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="lista">
                <thead>
                  <tr>
                    <th>Quando</th>
                    <th>Integração</th>
                    <th>Operação</th>
                    <th>Resultado</th>
                    <th>Identificador</th>
                  </tr>
                </thead>
                <tbody>
                  {chamadas.map((c) => (
                    <tr key={c.id}>
                      <td className="tnum whitespace-nowrap">{fmtDataHora(c.criadoEm)}</td>
                      <td className="whitespace-nowrap font-medium text-ink">{c.nome}</td>
                      <td className="min-w-[260px]">
                        <div className="text-ink">
                          {DIRECAO[c.direcao] ?? c.direcao}: {c.operacao}
                        </div>
                        <div className="text-[12.5px] leading-snug text-ink-3">{c.resumo}</div>
                      </td>
                      <td className="whitespace-nowrap">
                        <Chip tone={TOM_CHAMADA[c.status] ?? "neutral"}>{ROTULO_CHAMADA[c.status] ?? c.status}</Chip>
                        <div className="tnum mt-0.5 text-[12px] text-ink-3">
                          {c.codigo ? `código ${c.codigo}` : ""}
                          {c.duracaoMs != null ? ` · ${c.duracaoMs} ms` : ""}
                        </div>
                      </td>
                      <td className="tnum text-[12.5px] whitespace-nowrap text-ink-2">
                        {c.idOperacao}
                        {c.simulada && <div className="text-[11.5px] text-warn">simulada</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { ArrowRight, FileSignature, History, Play } from "lucide-react";
import { db } from "@/db";
import { setores as tSetores } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { fmtDataHora } from "@/lib/dates";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Cabecalho, Chip, Panel, Vazio } from "@/components/ui";
import { pode } from "@/modulos/gestao/permissoes";
import { alertasAbertos, listarExecucoes, listarRegras, RESULTADO_ROTULO, type ResultadoItem } from "@/modulos/gestao/automacoes";
import { descreverRegra, GATILHO_ROTULO, GRAVIDADE_ROTULO, NIVEL_ROTULO, type Gatilho, type Gravidade, type Nivel, type RegraAvaliavel } from "@/modulos/gestao/avaliador";
import { alternarRegraAction, rodarRegraAction, tratarAlertaAction } from "@/modulos/gestao/acoes";
import { NovaRegra } from "@/modulos/gestao/componentes/nova-regra";

export const metadata = { title: "Automações · Civu" };

const TOM_GRAV: Record<Gravidade, "bad" | "warn" | "neutral"> = { ALTA: "bad", MEDIA: "warn", BAIXA: "neutral" };

export default async function AutomacoesPage() {
  const u = await requireUser();
  if (!pode.verAutomacoes(u)) redirect("/painel");
  const [regras, execucoes, alertas, setores] = await Promise.all([
    listarRegras(u.municipioId),
    listarExecucoes(u.municipioId),
    alertasAbertos(u.municipioId),
    db.query.setores.findMany({ where: eq(tSetores.municipioId, u.municipioId), orderBy: (s, { asc }) => [asc(s.nome)] }),
  ]);
  const nomeSetor = (sigla: string) => setores.find((s) => s.sigla === sigla)?.nome ?? sigla;
  const podeRodar = pode.rodarAutomacoes(u);
  const podeConfigurar = pode.configurarAutomacoes(u);
  const podeTratar = pode.tratarAlertas(u);

  return (
    <>
      <Cabecalho
        titulo="Automações"
        sub="Regras do município que vigiam prazos, encaminham pedidos e cobram respostas. Cada execução fica registrada com a versão da regra e quem a acionou."
        acao={
          <div className="flex flex-wrap gap-2">
            <Link href="/automacoes/redacao" className="btn btn-quiet">
              <FileSignature size={16} /> Assistente de redação
            </Link>
            {podeRodar && regras.some((r) => r.ativa) && (
              <ActionForm action={rodarRegraAction} resetOnOk={false}>
                <SubmitButton pendingText="Avaliando…">
                  <Play size={16} /> Rodar todas agora
                </SubmitButton>
              </ActionForm>
            )}
          </div>
        }
      />

      <div className="mb-6 rounded-xl border border-line bg-white px-4 py-3 text-[14px] text-ink-2">
        As regras rodam quando alguém aciona &quot;Rodar agora&quot;; o agendamento automático virá com a fila de tarefas. Encaminhamentos com nível &quot;Executar&quot; passam pelo
        fluxo do processo, em nome de quem acionou, e nunca decidem atos reservados (pagamento, licitação, lançamento).
      </div>

      <div className="mb-6 grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Panel title={`Regras do município (${regras.length})`}>
          {regras.length === 0 ? (
            <Vazio>Nenhuma regra cadastrada. {podeConfigurar ? "Crie a primeira ao lado." : "Peça ao administrador para cadastrar."}</Vazio>
          ) : (
            <ul className="space-y-3">
              {regras.map((r) => {
                const d = descreverRegra(r as unknown as RegraAvaliavel, nomeSetor);
                const ult = r.execucoes[0];
                return (
                  <li key={r.id} className={`rounded-xl border p-4 ${r.ativa ? "border-line bg-white" : "border-dashed border-line-2 bg-sunken/50"}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="mr-auto text-[15px] font-semibold text-ink">{r.nome}</h3>
                      <Chip tone={r.ativa ? "ok" : "neutral"}>{r.ativa ? "Ativa" : "Suspensa"}</Chip>
                      <Chip tone="brand">{NIVEL_ROTULO[r.nivel as Nivel]}</Chip>
                    </div>
                    <p className="mt-1.5 text-[14px] leading-snug text-ink-2">
                      <span className="font-semibold text-ink">Quando</span> {d.quando}, <span className="font-semibold text-ink">então</span> {d.entao}.
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-ink-3">
                      <span>{GATILHO_ROTULO[r.gatilho as Gatilho]}</span>
                      <span>Versão {r.versao}</span>
                      <span>
                        {ult
                          ? `Última execução ${fmtDataHora(ult.criadoEm)} por ${ult.usuario?.nome ?? "sistema"}: ${ult.disparos} ${ult.disparos === 1 ? "disparo" : "disparos"}`
                          : "Ainda não executada"}
                      </span>
                    </div>
                    {(podeRodar || podeConfigurar) && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {podeRodar && r.ativa && (
                          <ActionForm action={rodarRegraAction} resetOnOk={false}>
                            <input type="hidden" name="regraId" value={r.id} />
                            <SubmitButton className="btn btn-quiet !py-1.5 text-[13px]" pendingText="Avaliando…">
                              <Play size={14} /> Rodar agora
                            </SubmitButton>
                          </ActionForm>
                        )}
                        {podeConfigurar && (
                          <ActionForm action={alternarRegraAction} resetOnOk={false}>
                            <input type="hidden" name="regraId" value={r.id} />
                            <SubmitButton className="btn btn-quiet !py-1.5 text-[13px]">{r.ativa ? "Suspender" : "Ativar"}</SubmitButton>
                          </ActionForm>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <div className="space-y-6">
          <Panel title={`Alertas e sugestões abertos (${alertas.length})`}>
            {alertas.length === 0 ? (
              <Vazio>Nenhum alerta aberto pelas automações.</Vazio>
            ) : (
              <ul className="space-y-3">
                {alertas.map((a) => (
                  <li key={a.id} className="rounded-xl border border-line p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Chip tone={TOM_GRAV[a.gravidade as Gravidade]}>{GRAVIDADE_ROTULO[a.gravidade as Gravidade]}</Chip>
                      {a.tipo === "SUGESTAO" && <Chip tone="brand">Sugestão</Chip>}
                      <span className="text-[12px] text-ink-3">{fmtDataHora(a.criadoEm)}</span>
                    </div>
                    <div className="mt-1 text-[14px] font-semibold text-ink">{a.titulo}</div>
                    {a.detalhe && <p className="text-[14px] leading-snug text-ink-2">{a.detalhe}</p>}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {a.processoId && (
                        <Link href={`/processos/${a.processoId}`} className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand-2 hover:underline">
                          Abrir processo <ArrowRight size={13} />
                        </Link>
                      )}
                      {podeTratar && (
                        <div className="ml-auto flex gap-1.5">
                          <ActionForm action={tratarAlertaAction} resetOnOk={false}>
                            <input type="hidden" name="alertaId" value={a.id} />
                            <input type="hidden" name="situacao" value="RESOLVIDO" />
                            <SubmitButton className="btn btn-quiet !px-2.5 !py-1 text-[12.5px]">Resolvido</SubmitButton>
                          </ActionForm>
                          <ActionForm action={tratarAlertaAction} resetOnOk={false}>
                            <input type="hidden" name="alertaId" value={a.id} />
                            <input type="hidden" name="situacao" value="DESCARTADO" />
                            <SubmitButton className="btn btn-quiet !px-2.5 !py-1 text-[12.5px]">Descartar</SubmitButton>
                          </ActionForm>
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {podeConfigurar && (
            <Panel title="Nova regra">
              <NovaRegra setores={setores.map((s) => ({ sigla: s.sigla, nome: s.nome }))} />
            </Panel>
          )}
        </div>
      </div>

      <Panel title="Histórico de execuções" pad={false} action={<History size={16} className="text-ink-3" />}>
        {execucoes.length === 0 ? (
          <div className="p-6">
            <Vazio>Nenhuma execução registrada.</Vazio>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="lista">
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Regra</th>
                  <th>Acionada por</th>
                  <th className="text-right">Avaliados</th>
                  <th className="text-right">Disparos</th>
                  <th>O que aconteceu</th>
                </tr>
              </thead>
              <tbody>
                {execucoes.map((e) => {
                  const itens = e.itens as ResultadoItem[];
                  return (
                    <tr key={e.id}>
                      <td className="tnum whitespace-nowrap">{fmtDataHora(e.criadoEm)}</td>
                      <td className="min-w-[200px]">
                        <div className="font-medium text-ink">{e.regra.nome}</div>
                        <div className="text-[12px] text-ink-3">versão {e.regraVersao}</div>
                      </td>
                      <td className="whitespace-nowrap">{e.usuario?.nome ?? "Sistema"}</td>
                      <td className="tnum text-right">{e.avaliados}</td>
                      <td className="tnum text-right font-semibold">{e.disparos}</td>
                      <td className="min-w-[260px]">
                        {itens.length === 0 ? (
                          <span className="text-ink-3">Nada a fazer.</span>
                        ) : (
                          <details>
                            <summary className="cursor-pointer text-[14px] text-brand-2">
                              {Object.entries(
                                itens.reduce<Record<string, number>>((acc, i) => ({ ...acc, [i.resultado]: (acc[i.resultado] ?? 0) + 1 }), {}),
                              )
                                .map(([k, n]) => `${RESULTADO_ROTULO[k as ResultadoItem["resultado"]]}: ${n}`)
                                .join(" · ")}
                            </summary>
                            <ul className="mt-2 space-y-1.5">
                              {itens.map((i) => (
                                <li key={i.processoId} className="text-[13px] leading-snug">
                                  <Link href={`/processos/${i.processoId}`} className="tnum font-semibold text-brand-2 hover:underline">
                                    {i.numero}
                                  </Link>{" "}
                                  <span className={i.resultado === "FALHA" ? "text-bad" : "text-ink-2"}>{RESULTADO_ROTULO[i.resultado]}</span>
                                  <span className="text-ink-3"> — {i.detalhe ?? i.motivo}</span>
                                </li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}

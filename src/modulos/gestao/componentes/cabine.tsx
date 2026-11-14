// Cabine da secretaria: a mesma estrutura para todas as pastas, nesta ordem (especificação, Parte 2):
// 1 frase de situação · 2 depende de você · 3 processos · 4 orçamento · 5 contratos · 6 compras · 7 repasses e obrigações
// · 8 blocos próprios da área (só onde há módulo). Cada número leva à lista filtrada que o explica.
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRight, CheckCircle2, FileSignature, Info, PenLine } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Chip, Panel, Prazo, UrgenciaChip, Vazio } from "@/components/ui";
import { fmtData, fmtDataHora, fmtMoeda } from "@/lib/dates";
import { nomeDaArea } from "@/lib/areas";
import { NATUREZAS_DESPESA, fmtPct } from "@/modulos/financas/classificacao";
import { BarraExecucao, LegendaExecucao } from "@/modulos/financas/ui";
import { ChipObra, ChipContrato } from "@/modulos/contratos/componentes";
import { dataLocal } from "@/modulos/contratos/regras";
import { ChipPrazo, ChipSituacao } from "@/modulos/repasses/componentes";
import { dataBr } from "@/modulos/repasses/regras";
import { aprovarNaCabineAction, assinarNaCabineAction } from "../acoes-cabine";
import type { Cabine, DadosCabine, Pendencia } from "../cabine";
import { ListaSinais, SeloSemaforo } from "./semaforo";

const pl = (n: number, um: string, varios: string) => `${n.toLocaleString("pt-BR")} ${n === 1 ? um : varios}`;

/** Número com link para a lista que o explica. */
function Numero({ href, valor, rotulo, detalhe, tom }: { href: string; valor: ReactNode; rotulo: string; detalhe?: ReactNode; tom?: "bad" | "warn" }) {
  return (
    <Link href={href} className="group block min-h-[44px] rounded-xl border border-line bg-white px-3 py-3 sm:px-4 transition-colors hover:border-line-2 hover:bg-sunken/60">
      <span className={`display tnum block text-[19px] sm:text-[22px] leading-tight font-semibold break-words ${tom === "bad" ? "text-bad" : tom === "warn" ? "text-warn" : "text-ink"}`}>{valor}</span>
      <span className="mt-1 flex items-start justify-between gap-2 text-[13.5px] leading-snug font-medium text-ink">
        {rotulo} <ArrowUpRight size={14} aria-hidden className="mt-0.5 shrink-0 text-ink-3 group-hover:text-brand-2" />
      </span>
      {detalhe && <span className="mt-0.5 block text-[12.5px] leading-snug text-ink-3">{detalhe}</span>}
    </Link>
  );
}

function LinkVer({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex min-h-[44px] items-center gap-1 text-[14px] font-semibold text-brand-2 hover:underline">
      {children} <ArrowUpRight size={14} aria-hidden />
    </Link>
  );
}

export function VisaoCabine({ cab, d, euSouSecretario, veOutras }: { cab: Cabine; d: DadosCabine; euSouSecretario: boolean; veOutras: boolean }) {
  const s = cab.setor;
  const sigla = s.sigla;
  const pasta = `pasta=${sigla}`;
  const atrasados = d.processos.filter((p) => p.atrasado);
  const fora = d.processos.filter((p) => !p.naPasta).sort((a, b) => b.diasNoSetor - a.diasNoSetor);
  const t = d.orcamento.totais;
  const execPct = t && t.atualizado > 0 ? (t.liquidado / t.atualizado) * 100 : null;
  const orgaoQ = d.orcamento.orgaos.length === 1 ? `orgao=${d.orcamento.orgaos[0]}` : "";
  const hrefOrc = `/financas/orcamento${orgaoQ ? "?" + orgaoQ : ""}`;
  const quem = euSouSecretario ? "você" : "o(a) secretário(a)";
  const Quem = euSouSecretario ? "Você" : "O(a) secretário(a)";

  return (
    <>
      {/* 1. Frase de situação */}
      <section className="mb-8" aria-labelledby="titulo-cabine">
        <p className="text-[14px] font-medium text-ink-2">
          Cabine da secretaria · área de {nomeDaArea(s.area)}
          {veOutras && (
            <>
              {" "}
              ·{" "}
              <Link href="/secretaria" className="font-semibold text-brand-2 hover:underline">
                outras secretarias
              </Link>
            </>
          )}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 id="titulo-cabine" className="display text-[28px] leading-[1.1] font-semibold text-ink sm:text-[34px]">
            {s.nome}
          </h1>
          <SeloSemaforo nivel={d.semaforo.nivel} />
        </div>
        <p className="display mt-3 max-w-4xl text-[19px] leading-snug font-medium text-ink sm:text-[22px]">
          {d.pendencias.length === 0 ? (
            <>Nada depende de {quem} hoje. </>
          ) : (
            <>
              Hoje{" "}
              <Link href="#depende" className="font-semibold text-brand-2 underline decoration-brand/40 underline-offset-4 hover:decoration-brand-2">
                {pl(d.pendencias.length, d.pendencias.length === 1 ? "item depende" : "itens dependem", "itens dependem")}
              </Link>{" "}
              de {quem}.{" "}
            </>
          )}
          {atrasados.length === 0 ? (
            <>Nenhum processo da pasta está atrasado. </>
          ) : (
            <>
              <Link href={`/processos?${pasta}&situacao=atrasados`} className="font-semibold text-bad underline decoration-bad/40 underline-offset-4">
                {pl(atrasados.length, "processo da pasta está atrasado", "processos da pasta estão atrasados")}
              </Link>
              .{" "}
            </>
          )}
          {execPct == null ? (
            <>A secretaria não tem orçamento próprio.</>
          ) : (
            <>
              A pasta{" "}
              <Link href={hrefOrc} className="font-semibold text-brand-2 underline decoration-brand/40 underline-offset-4 hover:decoration-brand-2">
                liquidou {fmtPct(execPct, 0)} do orçamento
              </Link>{" "}
              de {d.orcamento.ano}.
            </>
          )}
        </p>
        <details className="mt-3 max-w-3xl">
          <summary className="inline-flex min-h-[44px] cursor-pointer items-center text-[14px] font-semibold text-brand-2">Por que está “{d.semaforo.rotulo}”</summary>
          <div className="mt-1 rounded-xl border border-line bg-white p-4">
            <p className="mb-3 text-[13.5px] text-ink-2">{d.semaforo.porque}</p>
            <ListaSinais sinais={d.semaforo.sinais} />
          </div>
        </details>
        <div className="mt-5 grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
          <Numero href="#depende" valor={d.pendencias.length} rotulo={euSouSecretario ? "dependem de você" : "esperam o(a) secretário(a)"} detalhe="assinaturas e aprovações" tom={d.pendencias.some((p) => p.vencida) ? "bad" : d.pendencias.length ? "warn" : undefined} />
          <Numero href={`/processos?${pasta}&situacao=abertos`} valor={d.processos.length} rotulo="processos em andamento" detalhe={`${pl(fora.length, "fora da secretaria", "fora da secretaria")}`} />
          <Numero href={`/processos?${pasta}&situacao=atrasados`} valor={atrasados.length} rotulo={atrasados.length === 1 ? "atrasado" : "atrasados"} detalhe="prazo da etapa vencido" tom={atrasados.length ? "bad" : undefined} />
          {execPct == null ? (
            <Numero href={`/repasses?setor=${s.id}&situacao=todos`} valor={d.repasses.length} rotulo={d.repasses.length === 1 ? "repasse" : "repasses"} detalhe="sem orçamento próprio" />
          ) : (
            <Numero href={hrefOrc} valor={fmtPct(execPct, 0)} rotulo="do orçamento liquidado" detalhe={`${fmtMoeda(t!.liquidado)} de ${fmtMoeda(t!.atualizado)}`} />
          )}
        </div>
      </section>

      {/* 2. Depende de você */}
      <Panel id="depende" className="mb-6 scroll-mt-6" title={euSouSecretario ? "Depende de você" : "Depende do(a) secretário(a)"}>
        {d.pendencias.length === 0 ? (
          <Vazio icon={<CheckCircle2 size={22} className="text-ok" aria-hidden />}>
            Nenhuma assinatura ou aprovação esperando {quem}. Quando um pedido da pasta chegar à etapa do(a) secretário(a), ele aparece aqui.
          </Vazio>
        ) : (
          <>
            {!euSouSecretario && <p className="mb-3 text-[13.5px] text-ink-2">Você está vendo em modo consulta: só o(a) secretário(a) da pasta assina e aprova por aqui.</p>}
            <ul className="divide-y divide-line">
              {d.pendencias.map((p) => (
                <ItemPendencia key={p.processoId + p.tipo} p={p} podeAgir={euSouSecretario} Quem={Quem} />
              ))}
            </ul>
          </>
        )}
      </Panel>

      {/* 3. Processos da pasta */}
      <BlocoProcessos d={d} pasta={pasta} />

      {/* 4. Orçamento da pasta */}
      <Panel
        className="mb-6"
        title="Orçamento da pasta"
        action={
          d.orcamento.totais ? (
            <LinkVer href={hrefOrc}>Ver dotações</LinkVer>
          ) : undefined
        }
      >
        {!d.orcamento.totais ? (
          <Vazio>
            Esta secretaria não tem órgão orçamentário ligado. O administrador liga o setor ao órgão da Lei Orçamentária em Configurações, na seção Setores; o orçamento da pasta
            aparece aqui em seguida.
          </Vazio>
        ) : (
          <BlocoOrcamento d={d} hrefOrc={hrefOrc} orgaoQ={orgaoQ} />
        )}
      </Panel>

      {/* 5. Contratos da pasta */}
      <BlocoContratos d={d} pasta={pasta} />

      {/* 6. Compras em andamento */}
      <BlocoCompras d={d} pasta={pasta} />

      {/* 7. Repasses e obrigações */}
      <BlocoRepasses d={d} setorId={s.id} />

      {/* 8. Blocos próprios da área */}
      <BlocoDaArea d={d} cab={cab} />
    </>
  );
}

// ---------------------------------------------------------------------------

function ItemPendencia({ p, podeAgir, Quem }: { p: Pendencia; podeAgir: boolean; Quem: string }) {
  const precisaSenha = p.documentos.length > 0;
  return (
    <li className="py-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-64">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/processos/${p.processoId}`} className="alvo-toque tnum font-semibold text-brand-2 hover:underline">
              {p.numero}
            </Link>
            <Chip tone={p.tipo === "APROVACAO" ? "brand" : "neutral"}>
              {p.tipo === "APROVACAO" ? <CheckCircle2 size={12} strokeWidth={2.5} aria-hidden /> : <PenLine size={12} strokeWidth={2.5} aria-hidden />}
              {p.tipo === "APROVACAO" ? "Aprovação" : "Assinatura"}
            </Chip>
          </div>
          <div className="mt-0.5 text-[15px] leading-snug text-ink">{p.assunto}</div>
          <div className="mt-0.5 text-[13.5px] text-ink-2">
            {p.etapa}
            {p.documentos.length > 0 && <> · falta assinar: {p.documentos.map((x) => x.nome).join(", ")}</>}
          </div>
        </div>
        <Prazo prazo={p.prazo} />
      </div>
      {p.bloqueio ? (
        <p className="mt-2 text-[13.5px] text-warn">
          {p.bloqueio}{" "}
          <Link href={`/processos/${p.processoId}`} className="font-semibold text-brand-2 hover:underline">
            Abrir o processo
          </Link>
        </p>
      ) : podeAgir ? (
        p.tipo === "APROVACAO" && p.aprovar ? (
          <ActionForm action={aprovarNaCabineAction} className="mt-3">
            <input type="hidden" name="processoId" value={p.processoId} />
            <input type="hidden" name="para" value={p.aprovar.para} />
            <div className="flex flex-wrap items-end gap-3">
              {precisaSenha && <CampoSenha id={`senha-ap-${p.processoId}`} />}
              <SubmitButton className="btn btn-primary min-h-[44px]" pendingText="Aprovando…">
                {precisaSenha ? "Assinar e aprovar" : p.aprovar.rotulo}
              </SubmitButton>
              <Link href={`/processos/${p.processoId}`} className="btn btn-quiet min-h-[44px]">
                Ver antes
              </Link>
            </div>
            {precisaSenha && <p className="mt-2 text-[12.5px] text-ink-3">Assina {p.documentos.map((x) => x.nome).join(" e ")} como secretário(a) e segue: {p.aprovar.rotulo.toLowerCase()}.</p>}
          </ActionForm>
        ) : (
          p.documentos.map((doc) => (
            <ActionForm key={doc.id} action={assinarNaCabineAction} className="mt-3">
              <input type="hidden" name="processoId" value={p.processoId} />
              <input type="hidden" name="documentoId" value={doc.id} />
              <div className="flex flex-wrap items-end gap-3">
                <CampoSenha id={`senha-as-${doc.id}`} />
                <SubmitButton className="btn btn-primary min-h-[44px]" pendingText="Assinando…">
                  <FileSignature size={16} aria-hidden /> Assinar {doc.nome}
                </SubmitButton>
              </div>
            </ActionForm>
          ))
        )
      ) : (
        <p className="mt-2 text-[13px] text-ink-3">{Quem} assina e aprova pela cabine da pasta ou pelo processo.</p>
      )}
    </li>
  );
}

function CampoSenha({ id }: { id: string }) {
  return (
    <div className="w-full min-[420px]:w-56">
      <label className="label" htmlFor={id}>
        Sua senha
      </label>
      <input id={id} name="senha" type="password" className="input" required autoComplete="current-password" />
    </div>
  );
}

function BlocoProcessos({ d, pasta }: { d: DadosCabine; pasta: string }) {
  const porEtapa = [...new Map(d.processos.map((p) => [p.estado, p])).values()]
    .map((x) => ({ estado: x.estado, etapa: x.etapa, n: d.processos.filter((p) => p.estado === x.estado).length, atrasados: d.processos.filter((p) => p.estado === x.estado && p.atrasado).length }))
    .sort((a, b) => b.n - a.n || a.etapa.localeCompare(b.etapa));
  const atrasados = d.processos.filter((p) => p.atrasado);
  const fora = d.processos.filter((p) => !p.naPasta).sort((a, b) => b.diasNoSetor - a.diasNoSetor);
  return (
    <Panel className="mb-6" title="Processos da pasta" action={d.processos.length ? <LinkVer href={`/processos?${pasta}&situacao=abertos`}>Ver todos</LinkVer> : undefined}>
      {d.processos.length === 0 ? (
        <Vazio>Nenhum processo aberto pela secretaria está em andamento. Para pedir uma compra ou um serviço, abra um processo em Processos, Novo processo.</Vazio>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-3">
          <div>
            <h3 className="mb-2 text-[13px] font-semibold tracking-wide text-ink-3 uppercase">Em andamento por etapa</h3>
            <ul className="divide-y divide-line">
              {porEtapa.map((e) => (
                <li key={e.estado}>
                  <Link href={`/processos?${pasta}&etapa=${e.estado}&situacao=abertos`} className="flex min-h-[44px] items-center justify-between gap-3 py-2 hover:text-brand-2">
                    <span className="min-w-0 text-[14px] text-ink">{e.etapa}</span>
                    <span className="tnum shrink-0 text-[14px] font-semibold text-ink">
                      {e.n}
                      {e.atrasados > 0 && <span className="ml-1.5 text-[12.5px] font-semibold text-bad">{e.atrasados} atras.</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-2 text-[13px] font-semibold tracking-wide text-ink-3 uppercase">Atrasados</h3>
            {atrasados.length === 0 ? (
              <p className="text-[14px] text-ink-2">Nenhum processo da pasta com o prazo da etapa vencido.</p>
            ) : (
              <ul className="divide-y divide-line">
                {atrasados.slice(0, 5).map((p) => (
                  <li key={p.id} className="py-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/processos/${p.id}`} className="alvo-toque tnum text-[14px] font-semibold text-brand-2 hover:underline">
                        {p.numero}
                      </Link>
                      <UrgenciaChip u={p.urgencia} />
                    </div>
                    <div className="text-[14px] leading-snug text-ink">{p.assunto}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px] text-ink-3">
                      {p.etapa} · {p.setorAtual?.nome ?? "sem setor"} <Prazo prazo={p.prazo} />
                    </div>
                  </li>
                ))}
                {atrasados.length > 5 && (
                  <li className="pt-1">
                    <LinkVer href={`/processos?${pasta}&situacao=atrasados`}>Ver os {atrasados.length} atrasados</LinkVer>
                  </li>
                )}
              </ul>
            )}
          </div>
          <div>
            <h3 className="mb-2 text-[13px] font-semibold tracking-wide text-ink-3 uppercase">Fora da secretaria</h3>
            {fora.length === 0 ? (
              <p className="text-[14px] text-ink-2">Todos os processos da pasta estão com a própria secretaria.</p>
            ) : (
              <ul className="divide-y divide-line">
                {fora.slice(0, 5).map((p) => (
                  <li key={p.id} className="py-2.5">
                    <Link href={`/processos/${p.id}`} className="alvo-toque tnum text-[14px] font-semibold text-brand-2 hover:underline">
                      {p.numero}
                    </Link>
                    <div className="text-[14px] leading-snug text-ink">{p.assunto}</div>
                    <div className={`text-[12.5px] ${p.atrasado ? "font-semibold text-bad" : "text-ink-3"}`}>
                      Em {p.setorAtual?.nome ?? "setor não informado"} há {pl(p.diasNoSetor, "dia", "dias")}
                      {p.atrasado ? " · atrasado" : ""}
                    </div>
                  </li>
                ))}
                {fora.length > 5 && (
                  <li className="pt-1">
                    <LinkVer href={`/processos?${pasta}&fora=1&situacao=abertos`}>Ver os {fora.length} fora da secretaria</LinkVer>
                  </li>
                )}
              </ul>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}

function BlocoOrcamento({ d, hrefOrc, orgaoQ }: { d: DadosCabine; hrefOrc: string; orgaoQ: string }) {
  const t = d.orcamento.totais!;
  const tiles: [string, number][] = [
    ["Dotação atualizada", t.atualizado],
    ["Reservado", t.reservado],
    ["Empenhado", t.empenhado],
    ["Liquidado", t.liquidado],
    ["Pago", t.pago],
    ["Saldo disponível", t.saldo],
  ];
  const linhas = d.orcamento.linhas.slice(0, 8);
  const hrefLinha = (acao: string) => `/financas/orcamento?${orgaoQ ? orgaoQ + "&" : ""}q=${encodeURIComponent(acao)}`;
  return (
    <>
      <p className="mb-3 text-[13.5px] text-ink-2">
        {d.orcamento.orgaoNome ? `Órgão ${d.orcamento.orgaos.join(", ")} · ${d.orcamento.orgaoNome}` : "Órgão da pasta"}, exercício {d.orcamento.ano}.
        {d.compartilhamOrgao.length > 0 && <> O órgão é compartilhado com {d.compartilhamOrgao.map((x) => x.nome).join(" e ")}: os números abaixo são do órgão inteiro.</>}
      </p>
      <ul className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-3 xl:grid-cols-6">
        {tiles.map(([r, v]) => (
          <li key={r}>
            <Link href={hrefOrc} className="block min-h-[44px] rounded-xl bg-sunken px-4 py-3 hover:bg-line">
              <span className="block text-[12.5px] font-medium text-ink-3">{r}</span>
              <span className="tnum block text-[15px] font-semibold text-ink">{fmtMoeda(v)}</span>
            </Link>
          </li>
        ))}
      </ul>
      <BarraExecucao autorizado={t.atualizado} empenhado={t.empenhado} liquidado={t.liquidado} pago={t.pago} reservado={t.reservado} alto />
      <div className="mt-2 mb-5">
        <LegendaExecucao reservado />
      </div>
      <h3 className="mb-1 text-[13px] font-semibold tracking-wide text-ink-3 uppercase">Por ação e elemento</h3>
      <ul className="divide-y divide-line">
        {linhas.map((l) => (
          <li key={l.chave} className="py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <Link href={hrefLinha(l.acao)} className="min-w-0 font-medium text-ink hover:text-brand-2 hover:underline">
                {l.acao}
              </Link>
              <span className="tnum text-[13.5px] text-ink-2">
                saldo <span className={`font-semibold ${l.atualizado > 0 && l.saldo / l.atualizado < 0.03 && !l.natureza.startsWith("3.1.") ? "text-warn" : "text-ink"}`}>{fmtMoeda(l.saldo)}</span>
              </span>
            </div>
            <div className="text-[12.5px] text-ink-3">{NATUREZAS_DESPESA[l.natureza] ?? "Elemento de despesa"}</div>
            <div className="mt-1.5">
              <BarraExecucao autorizado={l.atualizado} empenhado={l.empenhado} liquidado={l.liquidado} pago={l.pago} reservado={l.reservado} />
            </div>
            <div className="tnum mt-1 text-[12.5px] text-ink-3">
              {fmtMoeda(l.liquidado)} liquidado de {fmtMoeda(l.atualizado)}
              {l.reservado > 0 && <> · {fmtMoeda(l.reservado)} reservado</>}
            </div>
          </li>
        ))}
      </ul>
      {d.orcamento.linhas.length > linhas.length && (
        <LinkVer href={hrefOrc}>Ver as {d.orcamento.linhas.length} linhas do orçamento da pasta</LinkVer>
      )}
    </>
  );
}

function BlocoContratos({ d, pasta }: { d: DadosCabine; pasta: string }) {
  const vigentes = d.contratos.filter((c) => c.fin.ativo);
  const vencendo = vigentes.filter((c) => c.fin.diasParaVencer <= 90);
  const saldo = vigentes.reduce((s, c) => s + c.fin.saldo, 0);
  const notas = d.contratos.flatMap((c) => c.notas).filter((n) => n.situacao === "AGUARDANDO_ATESTO");
  const lista = [...vigentes].sort((a, b) => a.fin.diasParaVencer - b.fin.diasParaVencer).slice(0, 5);
  return (
    <Panel className="mb-6" title="Contratos da pasta" action={d.contratos.length ? <LinkVer href={`/contratos?${pasta}&aba=todos`}>Ver todos</LinkVer> : undefined}>
      {d.contratos.length === 0 ? (
        <Vazio>A secretaria ainda não tem contratos. Os contratos nascem das compras da pasta: quando Compras registrar um contrato com a secretaria como responsável, ele aparece aqui.</Vazio>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
            <Numero href={`/contratos?${pasta}&aba=ativos`} valor={vigentes.length} rotulo={vigentes.length === 1 ? "contrato vigente" : "contratos vigentes"} detalhe={fmtMoeda(vigentes.reduce((s, c) => s + c.fin.valorAtual, 0))} />
            <Numero href={`/contratos?${pasta}&aba=vencer`} valor={vencendo.length} rotulo="vencem em 90 dias" tom={vencendo.some((c) => c.fin.diasParaVencer <= 30) ? "bad" : vencendo.length ? "warn" : undefined} />
            <Numero href={`/contratos?${pasta}&aba=ativos`} valor={fmtMoeda(saldo)} rotulo="de saldo a executar" />
            <Numero href={`/contratos/atestos?${pasta}`} valor={notas.length} rotulo={notas.length === 1 ? "nota aguardando atesto" : "notas aguardando atesto"} tom={notas.length ? "warn" : undefined} />
          </div>
          {lista.length > 0 && (
            <ul className="divide-y divide-line">
              {lista.map((c) => (
                <li key={c.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-3">
                  <div className="min-w-0 flex-1 basis-64">
                    <Link href={`/contratos/${c.id}`} className="alvo-toque tnum font-semibold text-brand-2 hover:underline">
                      Contrato {c.rotulo}
                    </Link>
                    <div className="text-[14px] leading-snug text-ink">{c.objeto}</div>
                    <div className="tnum text-[12.5px] text-ink-3">
                      {c.empresa.nomeFantasia ?? c.empresa.razaoSocial} · saldo {fmtMoeda(c.fin.saldo)} · até {fmtData(dataLocal(c.fin.vigenciaFimAtual))}
                    </div>
                  </div>
                  <ChipContrato s={c.fin.situacao} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Panel>
  );
}

function BlocoCompras({ d, pasta }: { d: DadosCabine; pasta: string }) {
  const compras = d.processos.filter((p) => p.antesDoContrato).sort((a, b) => a.ordem - b.ordem);
  return (
    <Panel className="mb-6" title="Compras em andamento" action={compras.length ? <LinkVer href={`/processos?${pasta}&fase=compra&situacao=abertos`}>Ver na lista</LinkVer> : undefined}>
      {compras.length === 0 ? (
        <Vazio>Nenhuma compra da pasta entre o pedido e o contrato. Para pedir uma compra, abra um processo do tipo Compra em Processos, Novo processo.</Vazio>
      ) : (
        <>
          <p className="mb-2 text-[13.5px] text-ink-2">Do pedido ao contrato, na ordem do fluxo: em que etapa cada compra está, com quem e até quando.</p>
          <ul className="divide-y divide-line">
            {compras.map((p) => (
              <li key={p.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 py-3">
                <div className="min-w-0 flex-1 basis-64">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/processos/${p.id}`} className="alvo-toque tnum font-semibold text-brand-2 hover:underline">
                      {p.numero}
                    </Link>
                    <UrgenciaChip u={p.urgencia} />
                  </div>
                  <div className="text-[14px] leading-snug text-ink">{p.assunto}</div>
                  <div className="text-[12.5px] text-ink-3">
                    {p.etapa} · {p.setorAtual?.nome ?? "sem setor"}
                    {p.valor != null && <span className="tnum"> · {fmtMoeda(p.valor)}</span>}
                  </div>
                </div>
                <Prazo prazo={p.prazo} />
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}

function BlocoRepasses({ d, setorId }: { d: DadosCabine; setorId: string }) {
  const ativos = d.repasses.filter((r) => r.situacao === "VIGENTE" || r.situacao === "EM_EXECUCAO");
  const risco = d.repasses.filter((r) => r.risco.emRisco);
  const valorRisco = risco.reduce((s, r) => s + r.risco.valorEmRisco, 0);
  const abertas = d.obrigacoes.filter((o) => o.alerta);
  const vencidas = abertas.filter((o) => o.alerta?.nivel === "vencido");
  const proximas = abertas.filter((o) => o.alerta && o.alerta.nivel !== "vencido" && o.alerta.dias <= 30);
  const lista = [...risco, ...d.repasses.filter((r) => !r.risco.emRisco && ativos.includes(r))].slice(0, 4);
  return (
    <Panel className="mb-6" title="Repasses e obrigações da área">
      {d.repasses.length === 0 && d.obrigacoes.length === 0 ? (
        <Vazio>
          Nenhum repasse, convênio ou obrigação de entrega cadastrado para a secretaria. Cadastre emendas e convênios em Repasses e convênios e as entregas recorrentes em
          Obrigações da área.
        </Vazio>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
            <Numero href={`/repasses?setor=${setorId}&situacao=ativos`} valor={ativos.length} rotulo={ativos.length === 1 ? "repasse vigente" : "repasses vigentes"} detalhe={`${fmtMoeda(ativos.reduce((s, r) => s + r.valorPrevisto, 0))} previstos`} />
            <Numero href={`/repasses?setor=${setorId}&situacao=risco`} valor={risco.length} rotulo="em risco" detalhe={valorRisco > 0 ? `${fmtMoeda(valorRisco)} em risco` : "prazo em até 30 dias ou pendência"} tom={risco.length ? "bad" : undefined} />
            <Numero href={`/obrigacoes-da-area?setor=${setorId}&situacao=vencidas`} valor={vencidas.length} rotulo={vencidas.length === 1 ? "obrigação vencida" : "obrigações vencidas"} tom={vencidas.length ? "bad" : undefined} />
            <Numero href={`/obrigacoes-da-area?setor=${setorId}&situacao=vencer`} valor={proximas.length} rotulo="obrigações em 30 dias" tom={proximas.length ? "warn" : undefined} />
          </div>
          {lista.length > 0 && (
            <ul className="divide-y divide-line">
              {lista.map((r) => (
                <li key={r.id} className="py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link href={`/repasses/${r.id}`} className="alvo-toque font-semibold text-brand-2 hover:underline">
                      {r.rotulo}
                    </Link>
                    <ChipSituacao s={r.situacao} />
                  </div>
                  <div className="text-[14px] leading-snug text-ink">{r.objeto}</div>
                  <div className="tnum text-[12.5px] text-ink-3">
                    Pago {fmtMoeda(r.execucao.pago)} de {fmtMoeda(r.valorPrevisto)} ({r.execucao.percentual.toLocaleString("pt-BR")}%) · {r.concedente}
                  </div>
                  {r.prazoCritico && r.prazoCritico.alerta.nivel !== "ok" && (
                    <div className="mt-1.5">
                      <ChipPrazo alerta={r.prazoCritico.alerta} data={r.prazoCritico.data} rotulo={r.prazoCritico.rotulo} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          {abertas.length > 0 && (
            <>
              <h3 className="mt-4 mb-1 text-[13px] font-semibold tracking-wide text-ink-3 uppercase">Próximas entregas</h3>
              <ul className="divide-y divide-line">
                {abertas.slice(0, 3).map((o) => (
                  <li key={o.id} className="flex flex-wrap items-start justify-between gap-2 py-2.5">
                    <div className="min-w-0 flex-1 basis-56">
                      <Link href={`/obrigacoes-da-area/${o.id}`} className="alvo-toque font-medium text-ink hover:text-brand-2 hover:underline">
                        {o.nome}
                      </Link>
                      <div className="text-[12.5px] text-ink-3">
                        Para {o.destinatario} · {dataBr(o.proximoVencimento)}
                        {o.exemplo && " · exemplo da demonstração"}
                      </div>
                    </div>
                    {o.alerta && <ChipPrazo alerta={o.alerta} data={o.proximoVencimento} />}
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </Panel>
  );
}

function BlocoDaArea({ d, cab }: { d: DadosCabine; cab: Cabine }) {
  const p = d.proprio;
  if (!p)
    return (
      <p className="mb-2 flex max-w-3xl items-start gap-2 text-[13.5px] leading-relaxed text-ink-2">
        <Info size={16} aria-hidden className="mt-0.5 shrink-0 text-ink-3" />
        Os indicadores próprios da área de {nomeDaArea(cab.setor.area)} entram nesta cabine quando o módulo da área existir na Civu. Por enquanto, a cabine mostra processos,
        orçamento, contratos, compras, repasses e obrigações da pasta.
      </p>
    );
  if (p.tipo === "INFRAESTRUTURA")
    return (
      <Panel className="mb-6" title="Serviços urbanos e obras">
        <div className="mb-4 grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
          <Numero href="/servicos?setor=todas&situacao=abertas" valor={p.ocorrencias.abertas} rotulo="chamados em aberto" detalhe={`${pl(p.ocorrencias.triagem, "aguarda triagem", "aguardam triagem")}`} />
          <Numero href="/servicos?setor=todas&situacao=abertas&atrasadas=1" valor={p.ocorrencias.atrasadas} rotulo="fora do prazo" tom={p.ocorrencias.atrasadas ? "bad" : undefined} />
          <Numero href="/servicos/ordens" valor={p.ordens.programadas + p.ordens.emExecucao} rotulo="ordens de serviço abertas" detalhe={`${p.ordens.emExecucao} em execução`} />
          <Numero
            href="/servicos/indicadores"
            valor={p.ocorrencias.concluidas30 ? fmtPct((p.ocorrencias.noPrazo30 / p.ocorrencias.concluidas30) * 100, 0) : "—"}
            rotulo="concluídos no prazo"
            detalhe={`${pl(p.ocorrencias.concluidas30, "chamado concluído", "chamados concluídos")} em 30 dias`}
          />
        </div>
        <h3 className="mb-1 text-[13px] font-semibold tracking-wide text-ink-3 uppercase">Obras em andamento</h3>
        {p.obras.length === 0 ? (
          <p className="text-[14px] text-ink-2">Nenhuma obra da pasta em andamento.</p>
        ) : (
          <ul className="divide-y divide-line">
            {p.obras.map((c) => (
              <li key={c.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-3">
                <div className="min-w-0 flex-1 basis-64">
                  <Link href={`/contratos/${c.id}#obra`} className="font-medium text-ink hover:text-brand-2 hover:underline">
                    {c.objeto}
                  </Link>
                  <div className="tnum text-[12.5px] text-ink-3">
                    Físico {fmtPct(c.obra!.realizadoRef, 0)} medido × {fmtPct(c.obra!.previstoRef, 0)} previsto · financeiro {fmtPct(c.fin.pctExecutado, 0)} · contrato {c.rotulo}
                  </div>
                </div>
                <ChipObra s={c.obra!.situacao} />
              </li>
            ))}
          </ul>
        )}
      </Panel>
    );
  if (p.tipo === "FAZENDA")
    return (
      <Panel className="mb-6" title="Arrecadação, dívida e caixa">
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
          <Numero href="/tributos" valor={fmtMoeda(p.arrecadado)} rotulo={`arrecadado em ${p.ano}`} detalhe={p.previsto ? `${fmtPct((p.arrecadado / p.previsto) * 100, 0)} dos ${fmtMoeda(p.previsto)} previstos (IPTU, ITBI, ISS e taxas)` : "sem previsão cadastrada"} />
          <Numero href="/tributos" valor={p.inadVencido ? fmtPct((p.inadAberto / p.inadVencido) * 100, 1) : "—"} rotulo="de inadimplência" detalhe={`${fmtMoeda(p.inadAberto)} vencidos sem pagamento no exercício`} tom={p.inadVencido && p.inadAberto / p.inadVencido > 0.15 ? "warn" : undefined} />
          <Numero href="/tributos/divida-ativa" valor={fmtMoeda(p.dividaValor)} rotulo="em dívida ativa" detalhe={`${pl(p.dividaInscricoes, "inscrição ativa ou ajuizada", "inscrições ativas ou ajuizadas")}, valor atualizado`} />
          <Numero href="/financas/caixa" valor={fmtMoeda(p.caixa.saldo)} rotulo="em caixa" detalhe={`${fmtMoeda(p.caixa.aPagar)} liquidados a pagar · sobra ${fmtMoeda(p.caixa.aposLiquidadas)}`} tom={p.caixa.aposLiquidadas < 0 ? "bad" : undefined} />
        </div>
      </Panel>
    );
  if (p.tipo === "COMPRAS")
    return (
      <Panel className="mb-6" title="Fila de contratações">
        <div className="mb-4 grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-3">
          <Numero href={`/processos?setor=${cab.setor.id}&situacao=abertos`} valor={p.fila.length} rotulo="processos com Compras" detalhe={`${p.fila.filter((x) => x.atrasado).length} atrasados`} tom={p.fila.some((x) => x.atrasado) ? "bad" : undefined} />
          <Numero href="/processos?situacao=encerrados" valor={p.mediaDiasAteContrato == null ? "—" : pl(p.mediaDiasAteContrato, "dia", "dias")} rotulo="do pedido ao contrato, em média" detalhe={`${pl(p.contratados12m, "compra contratada", "compras contratadas")} em 12 meses`} />
        </div>
        {p.fila.length === 0 ? (
          <p className="text-[14px] text-ink-2">Nenhum processo esperando Compras.</p>
        ) : (
          <ul className="divide-y divide-line">
            {p.fila.slice(0, 8).map((x) => (
              <li key={x.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-3">
                <div className="min-w-0 flex-1 basis-64">
                  <Link href={`/processos/${x.id}`} className="alvo-toque tnum font-semibold text-brand-2 hover:underline">
                    {x.numero}
                  </Link>
                  <div className="text-[14px] leading-snug text-ink">{x.assunto}</div>
                  <div className="text-[12.5px] text-ink-3">{x.etapa}</div>
                </div>
                <Prazo prazo={x.prazo} />
              </li>
            ))}
          </ul>
        )}
      </Panel>
    );
  return (
    <Panel className="mb-6" title="Achados e trilha de auditoria">
      <h3 className="mb-1 text-[13px] font-semibold tracking-wide text-ink-3 uppercase">Achados do sistema</h3>
      <ul className="mb-5 divide-y divide-line">
        {p.achados.map((a) => (
          <li key={a.chave}>
            <Link href={a.href} className="flex min-h-[44px] items-center justify-between gap-3 py-2 hover:text-brand-2">
              <span className="text-[14px] text-ink">{a.rotulo}</span>
              <span className={`tnum shrink-0 text-[16px] font-semibold ${a.n ? "text-bad" : "text-ink-3"}`}>{a.n}</span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[13px] font-semibold tracking-wide text-ink-3 uppercase">Últimos registros da trilha</h3>
        <LinkVer href="/governanca?aba=trilha">Abrir a trilha</LinkVer>
      </div>
      {p.trilha.length === 0 ? (
        <p className="text-[14px] text-ink-2">Nada registrado ainda.</p>
      ) : (
        <ul className="divide-y divide-line">
          {p.trilha.map((x) => (
            <li key={x.id} className="py-2.5 text-[13.5px]">
              <div className="text-ink">
                {x.acao}
                {x.objeto && (
                  <>
                    {" · "}
                    {x.href ? (
                      <Link href={x.href} className="font-semibold text-brand-2 hover:underline">
                        {x.objeto}
                      </Link>
                    ) : (
                      x.objeto
                    )}
                  </>
                )}
              </div>
              <div className="tnum text-[12.5px] text-ink-3">
                {fmtDataHora(x.quando)} · {x.autor}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { ArrowLeft, Link2 } from "lucide-react";
import { db } from "@/db";
import { processos } from "@/db/schema";
import { requireUser, temPapel } from "@/lib/auth";
import { fmtMoeda } from "@/lib/dates";
import { fmtCnpj } from "@/lib/pagamentos";
import { NATUREZAS } from "@/lib/workflow";
import { Cabecalho, Panel, Vazio } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { anoCorrente, execucao } from "@/modulos/financas/dados";
import { empenhoAction } from "@/modulos/financas/acoes";
import { SemAcesso, podeVerFinancas } from "@/modulos/financas/ui";
import { ELEMENTO_DO_OBJETO, TIPOS_EMPENHO, nomeGrupo } from "@/modulos/financas/classificacao";

export const dynamic = "force-dynamic";

type Ct = { fornecedor?: string; cnpj?: string; valor?: string; fonte?: string };

export default async function NovoEmpenhoPage({ searchParams }: { searchParams: Promise<{ processo?: string; dotacao?: string }> }) {
  const u = await requireUser();
  if (!podeVerFinancas(u)) return <SemAcesso />;
  if (!temPapel(u, "CONTABILIDADE"))
    return (
      <>
        <Cabecalho titulo="Novo empenho" />
        <Vazio>Empenhos são emitidos pela contabilidade. Seu perfil pode consultar, mas não emitir.</Vazio>
      </>
    );
  const sp = await searchParams;
  const ano = anoCorrente();
  const ex = await execucao(u.municipioId, ano);

  // pré-preenchimento a partir do processo (só sugere: quem empenha confere tudo antes de emitir)
  const proc = sp.processo ? await db.query.processos.findFirst({ where: and(eq(processos.municipioId, u.municipioId), eq(processos.id, sp.processo)) }) : null;
  const meta = (proc?.metadados ?? {}) as { contratacao?: Ct; natureza?: string; objeto?: string; valorEstimado?: number };
  const ct = meta.contratacao ?? null;
  const reservaDoProc = proc ? ex.reservasCalc.find((r) => r.processoId === proc.id && r.saldo > 0) : undefined;
  const elemento = meta.natureza ? ELEMENTO_DO_OBJETO[meta.natureza] : undefined;
  let dotSugerida = sp.dotacao ? ex.dotacoes.find((d) => d.id === sp.dotacao) : undefined;
  let comoDot = "";
  if (!dotSugerida && reservaDoProc) {
    dotSugerida = ex.dotacoes.find((d) => d.id === reservaDoProc.dotacaoId);
    comoDot = `dotação da reserva ${reservaDoProc.numero}/${reservaDoProc.ano} do processo`;
  }
  if (!dotSugerida && proc && elemento) {
    dotSugerida = ex.dotacoes
      .filter((d) => d.natureza === elemento && (!ct?.fonte || d.grupo === ct.fonte) && d.unidadeGestoraId === proc.unidadeGestoraId)
      .sort((a, b) => b.disponivel - a.disponivel)[0];
    if (dotSugerida) comoDot = `elemento ${elemento} (${NATUREZAS[meta.natureza!]?.nome.toLowerCase()})${ct?.fonte ? ` e fonte ${nomeGrupo(ct.fonte).toLowerCase()}` : ""}, com maior saldo`;
  }
  const valorSugerido = ct?.valor ? Number(ct.valor) : (meta.valorEstimado ?? null);
  const unidades = [...new Set(ex.dotacoes.map((d) => d.unidade))];
  const reservasAbertas = ex.reservasCalc.filter((r) => r.saldo > 0);
  const avisos: string[] = [];
  if (proc && !ct) avisos.push("Compras ainda não informou fornecedor, CNPJ, valor e fonte no processo. Preencha o credor aqui ou peça o registro da contratação.");
  if (proc && !dotSugerida) avisos.push("Não encontramos dotação compatível com a natureza e a fonte do processo. Escolha manualmente.");
  if (dotSugerida && valorSugerido && valorSugerido > dotSugerida.disponivel + (reservaDoProc?.saldo ?? 0))
    avisos.push(`O valor do processo (${fmtMoeda(valorSugerido)}) passa do saldo da dotação sugerida. Será preciso crédito adicional.`);

  return (
    <>
      <Link href="/financas/empenhos" className="mb-4 inline-flex items-center gap-1.5 text-[14px] font-medium text-ink-2 hover:text-ink">
        <ArrowLeft size={16} /> Empenhos
      </Link>
      <Cabecalho titulo="Novo empenho" sub="O empenho compromete o saldo da dotação com um credor (Lei 4.320, art. 58). Depois vêm a liquidação e o pagamento." />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Panel>
          <ActionForm action={empenhoAction} className="space-y-4" resetOnOk={false}>
            {proc && <input type="hidden" name="processoId" value={proc.id} />}
            <div>
              <label className="label" htmlFor="dotacaoId">
                Dotação
              </label>
              <select id="dotacaoId" name="dotacaoId" className="input" defaultValue={dotSugerida?.id ?? ""} required>
                <option value="" disabled>
                  Escolha a dotação
                </option>
                {unidades.map((un) => {
                  const ds = ex.dotacoes.filter((d) => d.unidade === un && !d.natureza.startsWith("3.1."));
                  if (!ds.length) return null;
                  return (
                    <optgroup key={un} label={`${un} ${ds[0].unidadeNome}`}>
                      {ds.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.acaoNome} · {d.natureza} · {d.fonte} — disponível {fmtMoeda(d.disponivel)}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
              <p className="hint">Folha de pagamento (grupo 3.1) é empenhada por estimativa no início do ano, a partir do sistema de pessoal.</p>
            </div>
            <div>
              <label className="label" htmlFor="reservaId">
                Usar reserva (opcional)
              </label>
              <select id="reservaId" name="reservaId" className="input" defaultValue={reservaDoProc?.id ?? ""}>
                <option value="">Sem reserva</option>
                {reservasAbertas.map((r) => (
                  <option key={r.id} value={r.id}>
                    Reserva {r.numero}/{r.ano} · saldo {fmtMoeda(r.saldo)} · {r.historico.slice(0, 60)}
                  </option>
                ))}
              </select>
            </div>
            <fieldset>
              <legend className="label">Tipo de empenho</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {Object.entries(TIPOS_EMPENHO).map(([k, t]) => (
                  <label key={k} className="flex cursor-pointer gap-2 rounded-xl border border-line p-3 has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
                    <input type="radio" name="tipo" value={k} defaultChecked={k === (meta.natureza === "COMBUSTIVEIS" ? "ESTIMATIVO" : "ORDINARIO")} className="mt-1 accent-[var(--color-brand)]" />
                    <span>
                      <span className="block text-[14px] font-semibold text-ink">{t.nome}</span>
                      <span className="block text-[12.5px] leading-snug text-ink-2">{t.explica}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="grid gap-3 sm:grid-cols-[1fr_1.4fr]">
              <div>
                <label className="label" htmlFor="cnpj">
                  CNPJ do credor
                </label>
                <input id="cnpj" name="cnpj" className="input tnum" inputMode="numeric" defaultValue={ct?.cnpj ? fmtCnpj(ct.cnpj) : ""} placeholder="00.000.000/0000-00" />
                <p className="hint">Se a empresa já é cadastrada, o nome vem do cadastro.</p>
              </div>
              <div>
                <label className="label" htmlFor="credor">
                  Credor (razão social)
                </label>
                <input id="credor" name="credor" className="input" defaultValue={ct?.fornecedor ?? ""} />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="historico">
                Histórico (objeto)
              </label>
              <textarea
                id="historico"
                name="historico"
                rows={2}
                className="input"
                defaultValue={proc ? `${meta.objeto ?? proc.assunto} — processo ${proc.numero}` : ""}
                required
              />
            </div>
            <div className="max-w-xs">
              <label className="label" htmlFor="valor">
                Valor
              </label>
              <input
                id="valor"
                name="valor"
                className="input tnum"
                inputMode="decimal"
                defaultValue={valorSugerido ? valorSugerido.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : ""}
                placeholder="0,00"
                required
              />
            </div>
            <SubmitButton pendingText="Emitindo…">Emitir empenho</SubmitButton>
          </ActionForm>
        </Panel>

        <div className="space-y-6">
          {proc ? (
            <Panel title="Preenchido a partir do processo">
              <div className="flex items-start gap-3">
                <Link2 size={18} className="mt-0.5 shrink-0 text-brand-2" />
                <div className="min-w-0 text-[14px]">
                  <Link href={`/processos/${proc.id}`} className="tnum font-semibold text-brand-2 hover:underline">
                    {proc.numero}
                  </Link>{" "}
                  <span className="text-ink">{proc.assunto}</span>
                  <ul className="mt-3 space-y-1.5 text-[14px] text-ink-2">
                    <li>Credor: {ct?.fornecedor ? `${ct.fornecedor} (dados da contratação)` : "não informado"}</li>
                    <li>Valor: {ct?.valor ? `${fmtMoeda(Number(ct.valor))} contratado` : meta.valorEstimado ? `${fmtMoeda(meta.valorEstimado)} estimado (ainda sem contrato)` : "não informado"}</li>
                    <li>Dotação: {dotSugerida ? comoDot || "escolhida" : "escolha manual"}</li>
                    <li>Reserva: {reservaDoProc ? `nº ${reservaDoProc.numero}/${reservaDoProc.ano}, saldo ${fmtMoeda(reservaDoProc.saldo)}` : "nenhuma com saldo"}</li>
                  </ul>
                  <p className="mt-3 text-[14px] text-ink-3">
                    Ao emitir, o empenho fica vinculado ao processo e a nota de empenho é juntada a ele para as assinaturas do contador e do ordenador. Confira tudo antes.
                  </p>
                </div>
              </div>
            </Panel>
          ) : (
            <Panel title="Empenhar a partir de um processo">
              <p className="text-[14px] text-ink-2">
                Para preencher credor, valor e dotação automaticamente, abra o processo de compra na lista{" "}
                <Link href="/financas/empenhos#aguardando" className="font-semibold text-brand-2 hover:underline">
                  aguardando empenho
                </Link>
                .
              </p>
            </Panel>
          )}
          {avisos.length > 0 && (
            <div className="rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-[14px] text-warn">
              <ul className="list-disc space-y-1 pl-4">
                {avisos.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

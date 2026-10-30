import { requirePortal } from "@/lib/portal";
import { dividasDoDono, donoPortalOuMotivo } from "@/modulos/tributos/dados";
import { AvisoDemo, SemAcesso, Titulo, Voltar } from "@/modulos/tributos/componentes";
import { FAIXAS_PARCELAMENTO, simularParcelamento } from "@/modulos/tributos/regras";
import { aderirParcelamentoAction } from "@/modulos/tributos/acoes";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { fmtData, fmtMoeda } from "@/lib/dates";
import { Chip, Panel, Vazio } from "@/components/ui";

export default async function Parcelamento({ searchParams }: { searchParams: Promise<{ d?: string | string[]; n?: string }> }) {
  const s = await requirePortal();
  const sp = await searchParams;
  const { dono, motivo } = donoPortalOuMotivo(s, "TRIBUTOS");
  if (!dono) return <SemAcesso motivo={motivo} />;
  const todas = await dividasDoDono(dono);
  const ativas = todas.filter((d) => d.situacao === "ATIVA");
  const marcadas = sp.d ? (Array.isArray(sp.d) ? sp.d : [sp.d]) : ativas.map((d) => d.id);
  const sel = ativas.filter((d) => marcadas.includes(d.id));
  const n = Math.max(1, Math.min(24, Number(sp.n) || 6));
  const sim = sel.length ? simularParcelamento(sel.map((d) => ({ principal: d.valorOriginal + d.atual.correcao, acrescimos: d.atual.multa + d.atual.juros })), n, dono.tipo) : null;
  const outras = todas.filter((d) => d.situacao !== "ATIVA");

  return (
    <>
      <Voltar href="/portal/guias">Emitir guia</Voltar>
      <Titulo sobre={dono.tipo === "EMPRESA" ? dono.nome : "Em nome próprio"} titulo="Pagar ou parcelar a dívida ativa" sub="Escolha os débitos e o número de parcelas. A simulação não cria nenhum compromisso até você confirmar." />
      {ativas.length === 0 ? (
        <Vazio>Nenhum débito em dívida ativa para parcelar.{outras.length > 0 && " Os débitos inscritos já estão parcelados ou quitados."}</Vazio>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <Panel title="1. Débitos e parcelas">
            <form method="get" className="space-y-5">
              <ul className="divide-y divide-line rounded-xl border border-line">
                {ativas.map((d) => (
                  <li key={d.id}>
                    <label className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-sunken/60">
                      <input type="checkbox" name="d" value={d.id} defaultChecked={marcadas.includes(d.id)} className="h-4 w-4 accent-[var(--color-brand)]" />
                      <span className="min-w-0 flex-1 text-[14px]">
                        <span className="font-medium text-ink">{d.lancamento.descricao}</span>
                        <span className="block text-[12.5px] text-ink-3">
                          Inscrição {d.numeroInscricao} · venceu em {fmtData(d.vencimentoOriginal + "T12:00:00")} · original {fmtMoeda(d.valorOriginal)}
                        </span>
                      </span>
                      <span className="tnum text-right text-[14px] font-semibold text-ink">{fmtMoeda(d.atual.total)}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="label" htmlFor="n">
                    Número de parcelas
                  </label>
                  <select id="n" name="n" defaultValue={String(n)} className="input !w-40">
                    {Array.from({ length: 24 }, (_, i) => i + 1).map((k) => (
                      <option key={k} value={k}>
                        {k === 1 ? "À vista" : `${k} parcelas`}
                      </option>
                    ))}
                  </select>
                </div>
                <button className="btn btn-quiet">Simular</button>
              </div>
              <div className="rounded-xl bg-sunken px-4 py-3 text-[13px] text-ink-2">
                <div className="mb-1 font-semibold text-ink">Desconto sobre multa e juros</div>
                <ul className="grid gap-x-6 gap-y-0.5 sm:grid-cols-2">
                  {FAIXAS_PARCELAMENTO.map((f) => (
                    <li key={f.ate}>
                      {f.rotulo}: <strong className="font-semibold">{Math.round(f.descontoAcrescimos * 100)}%</strong>
                    </li>
                  ))}
                </ul>
                <div className="mt-1 text-ink-3">O valor principal corrigido não tem desconto. Regra de demonstração.</div>
              </div>
            </form>
          </Panel>

          <Panel title="2. Resultado">
            {!sim ? (
              <p className="text-[14px] text-ink-3">Marque ao menos um débito e clique em Simular.</p>
            ) : (
              <>
                <dl className="space-y-1.5 text-[14px]">
                  <div className="flex justify-between">
                    <dt className="text-ink-2">Principal corrigido</dt>
                    <dd className="tnum">{fmtMoeda(sim.principal)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink-2">Multa e juros</dt>
                    <dd className="tnum">{fmtMoeda(sim.acrescimos)}</dd>
                  </div>
                  <div className="flex justify-between text-ok">
                    <dt>Desconto ({sim.faixa.rotulo.toLowerCase()})</dt>
                    <dd className="tnum">− {fmtMoeda(sim.desconto)}</dd>
                  </div>
                  <div className="flex justify-between border-t border-line pt-2 font-semibold">
                    <dt>Total do acordo</dt>
                    <dd className="tnum">{fmtMoeda(sim.total)}</dd>
                  </div>
                </dl>
                <div className="mt-4 rounded-xl bg-brand-soft px-4 py-3 text-brand-ink">
                  <div className="text-[13px]">{n === 1 ? "Pagamento à vista" : `${n} parcelas mensais de`}</div>
                  <div className="display tnum text-[24px] font-semibold">{fmtMoeda(n === 1 ? sim.total : sim.valores[1] ?? sim.valores[0])}</div>
                  {n > 1 && sim.valores[0] !== sim.valores[1] && <div className="text-[12px]">primeira parcela de {fmtMoeda(sim.valores[0])} (ajuste de centavos)</div>}
                </div>
                {!sim.valido ? (
                  <p className="mt-4 text-[13.5px] text-bad">
                    A parcela mínima é de {fmtMoeda(sim.parcelaMinima)}. Para este valor, o máximo é {sim.maxParcelas} {sim.maxParcelas === 1 ? "parcela" : "parcelas"}.
                  </p>
                ) : (
                  <ActionForm action={aderirParcelamentoAction} resetOnOk={false} className="mt-4">
                    {sel.map((d) => (
                      <input key={d.id} type="hidden" name="divida" value={d.id} />
                    ))}
                    <input type="hidden" name="parcelas" value={n} />
                    <label className="flex items-start gap-2 text-[13.5px] text-ink-2">
                      <input type="checkbox" name="ciente" value="sim" className="mt-0.5 h-4 w-4 accent-[var(--color-brand)]" />
                      Li as condições: o acordo confessa a dívida; atrasar 3 parcelas cancela o parcelamento e retoma a cobrança do saldo.
                    </label>
                    <SubmitButton className="btn btn-primary mt-3 w-full" pendingText="Registrando acordo…">
                      {n === 1 ? "Confirmar e gerar guia à vista" : "Confirmar parcelamento e gerar 1ª guia"}
                    </SubmitButton>
                  </ActionForm>
                )}
              </>
            )}
          </Panel>
        </div>
      )}
      {outras.length > 0 && (
        <Panel title="Acordos e débitos já tratados" className="mt-6">
          <ul className="divide-y divide-line">
            {outras.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-[14px]">
                <span className="text-ink">
                  {d.lancamento.descricao} <span className="text-ink-3">· {d.numeroInscricao}</span>
                </span>
                <Chip tone={d.situacao === "QUITADA" ? "ok" : d.situacao === "PARCELADA" ? "brand" : "warn"}>{d.situacao === "QUITADA" ? "Quitada" : d.situacao === "PARCELADA" ? "Parcelada" : d.situacao === "AJUIZADA" ? "Em cobrança judicial" : d.situacao}</Chip>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      <div className="mt-6">
        <AvisoDemo>Correção, multa, juros e descontos usam índices de demonstração. Em produção, a regra vem da lei municipal vigente e fica registrada com o fundamento.</AvisoDemo>
      </div>
    </>
  );
}

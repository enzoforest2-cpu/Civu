import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageSquareWarning } from "lucide-react";
import { avaliacaoSugerida, carregarItbi, requireTributos } from "@/modulos/tributos/dados";
import { Campo, Titulo, Voltar } from "@/modulos/tributos/componentes";
import { AMOSTRA_MINIMA, NATUREZA_ITBI, PADRAO_NOME, SITUACAO_ITBI, USO_NOME, fmtDocumento, type MemoriaItbi } from "@/modulos/tributos/regras";
import { avaliarItbiAction } from "@/modulos/tributos/acoes";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { fmtData, fmtDataHora, fmtMoeda } from "@/lib/dates";
import { Chip, Panel } from "@/components/ui";

function Linha({ r, v, forte }: { r: React.ReactNode; v: React.ReactNode; forte?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 py-1.5 ${forte ? "border-t border-line pt-2.5 font-semibold" : ""}`}>
      <dt className={forte ? "text-ink" : "text-ink-2"}>{r}</dt>
      <dd className="tnum text-right text-ink">{v}</dd>
    </div>
  );
}

export default async function AvaliarItbi({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireTributos();
  const { id } = await params;
  const it = await carregarItbi(u.municipioId, id);
  if (!it) notFound();
  const im = it.imovel;
  const pendente = it.situacao === "EM_AVALIACAO" || it.situacao === "CONTESTADO";
  const { mem: sugerida, comps } = await avaliacaoSugerida(u.municipioId, it, im);
  const mem = (pendente ? sugerida : (it.memoria as (MemoriaItbi & { ajusteManual?: boolean; referenciaSugerida?: number }) | null)) ?? sugerida;
  const diferenca = sugerida.valorReferencia ? (sugerida.valorReferencia - it.valorDeclarado) / sugerida.valorReferencia : 0;
  return (
    <>
      <Voltar href="/tributos/itbi">ITBI</Voltar>
      <Titulo
        sobre={`${it.numero} · declarado em ${fmtDataHora(it.declaradoEm)} · ${it.canal === "PORTAL" ? "pelo portal" : "no balcão"}`}
        titulo={`${im.logradouro}, ${im.numero}${im.complemento ? ` — ${im.complemento}` : ""}`}
        sub={`${im.bairro} · ${USO_NOME[im.uso]} · ${NATUREZA_ITBI[it.natureza]}`}
        acao={<Chip tone={pendente ? "warn" : it.situacao === "PAGO" ? "ok" : "brand"}>{SITUACAO_ITBI[it.situacao]}</Chip>}
      />
      {it.situacao === "CONTESTADO" && it.contestacao && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-[14.5px] text-ink">
          <MessageSquareWarning size={19} className="mt-0.5 shrink-0 text-warn" />
          <div>
            <strong className="font-semibold">O contribuinte contestou a avaliação.</strong> {it.contestacao}
          </div>
        </div>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <Panel title="Declaração">
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              <Campo rotulo="Comprador">
                {it.compradorNome}
                <div className="tnum text-[12.5px] text-ink-3">{fmtDocumento(it.compradorDocumento)}</div>
              </Campo>
              <Campo rotulo="Vendedor">
                {it.vendedorNome}
                <div className="tnum text-[12.5px] text-ink-3">{it.vendedorDocumento ? fmtDocumento(it.vendedorDocumento) : "—"}</div>
              </Campo>
              <Campo rotulo="Valor declarado">
                <span className="tnum font-semibold">{fmtMoeda(it.valorDeclarado)}</span>
              </Campo>
              <Campo rotulo="Financiamento SFH">{it.financiado ? fmtMoeda(it.valorFinanciado) : "Não"}</Campo>
              <Campo rotulo="Imóvel">
                <Link href={`/tributos/imoveis/${im.id}`} className="tnum font-semibold text-brand-2 hover:underline">
                  {im.inscricao}
                </Link>
                <div className="text-[12.5px] text-ink-3">
                  {im.areaConstruida ? `${im.areaConstruida.toLocaleString("pt-BR")} m² construídos · ` : ""}
                  {im.areaTerreno.toLocaleString("pt-BR")} m² de terreno · padrão {PADRAO_NOME[im.padrao].toLowerCase()}
                </div>
              </Campo>
              <Campo rotulo="Valor venal (planta)">
                <span className="tnum">{fmtMoeda(im.valorVenal)}</span>
              </Campo>
            </dl>
          </Panel>

          <Panel title="Comparáveis usados na referência" action={<span className="text-[12.5px] text-ink-3">{im.bairro} · 24 meses · ITBI quitado</span>}>
            {comps.length === 0 ? (
              <p className="text-[14px] text-ink-2">Nenhuma transação comparável. A referência mínima é o valor venal e a avaliação deve ser individual (vistoria ou laudo).</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="lista min-w-[460px]">
                  <thead>
                    <tr>
                      <th>ITBI</th>
                      <th>Quitado</th>
                      <th className="text-right">Área</th>
                      <th>Padrão</th>
                      <th className="text-right">R$/m²</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comps.map((c) => (
                      <tr key={c.id}>
                        <td className="tnum">{c.numero}</td>
                        <td className="tnum">{fmtData(c.data)}</td>
                        <td className="tnum text-right">{c.area.toLocaleString("pt-BR")} m²</td>
                        <td>{PADRAO_NOME[c.padrao]}</td>
                        <td className="tnum text-right">{fmtMoeda(c.m2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {comps.length > 0 && comps.length < AMOSTRA_MINIMA && <p className="mt-3 text-[13.5px] text-warn">Amostra abaixo do mínimo de {AMOSTRA_MINIMA}: a mediana não serve como referência.</p>}
          </Panel>
        </div>

        <aside className="space-y-6">
          <Panel title={pendente ? "Referência sugerida" : "Avaliação registrada"} action={<Chip tone={mem.confianca === "ADEQUADA" ? "ok" : "warn"}>Confiança {mem.confianca === "ADEQUADA" ? "adequada" : "baixa"}</Chip>}>
            <dl className="text-[13.5px]">
              {mem.metodo === "MEDIANA_BAIRRO" ? (
                <Linha r={`Mediana ${fmtMoeda(mem.medianaM2)}/m² × ${mem.area.toLocaleString("pt-BR")} m²`} v={fmtMoeda(sugerida.valorReferencia)} />
              ) : (
                <Linha r="Valor venal (referência mínima)" v={fmtMoeda(sugerida.valorReferencia)} />
              )}
              {!pendente && (mem as { ajusteManual?: boolean }).ajusteManual && <Linha r="Referência após avaliação individual" v={fmtMoeda(it.valorReferencia)} />}
              <Linha r="Valor declarado" v={fmtMoeda(it.valorDeclarado)} />
              <Linha r="Base de cálculo (o maior)" v={fmtMoeda(pendente ? sugerida.baseCalculo : it.baseCalculo)} forte />
              {mem.parteFinanciadaSfh > 0 && <Linha r="Parte financiada SFH × 0,5%" v={fmtMoeda(mem.parteFinanciadaSfh * mem.aliquotaSfh)} />}
              <Linha r={`Restante × 2%`} v={fmtMoeda(((pendente ? sugerida.baseCalculo : it.baseCalculo ?? 0) - mem.parteFinanciadaSfh) * mem.aliquota)} />
              <Linha r="ITBI" v={fmtMoeda(pendente ? sugerida.valorImposto : it.valorImposto)} forte />
            </dl>
            <p className="mt-3 text-[12.5px] leading-snug text-ink-3">{sugerida.observacao}</p>
            {pendente && Math.abs(diferenca) > 0.05 && (
              <p className={`mt-2 text-[13px] ${diferenca > 0 ? "text-warn" : "text-ink-2"}`}>
                O declarado está {Math.abs(Math.round(diferenca * 100))}% {diferenca > 0 ? "abaixo" : "acima"} da referência.
              </p>
            )}
            {!pendente && it.avaliadoPor && (
              <p className="mt-3 border-t border-line pt-3 text-[13px] text-ink-2">
                Avaliado por {it.avaliadoPor.nome} em {fmtDataHora(it.avaliadoEm)}. {it.justificativa}
              </p>
            )}
          </Panel>

          {pendente && (
            <Panel title="Decisão">
              <ActionForm action={avaliarItbiAction} resetOnOk={false} className="space-y-3">
                <input type="hidden" name="itbiId" value={it.id} />
                <label className="flex items-start gap-2 text-[14px]">
                  <input type="radio" name="modo" value="REFERENCIA" defaultChecked={mem.confianca === "ADEQUADA"} className="mt-1 accent-[var(--color-brand)]" />
                  <span>
                    <strong className="font-semibold">Aceitar a referência sugerida</strong>
                    <span className="block text-[12.5px] text-ink-3">Gera a guia de {fmtMoeda(sugerida.valorImposto)} com vencimento em 30 dias.</span>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-[14px]">
                  <input type="radio" name="modo" value="AJUSTE" defaultChecked={mem.confianca !== "ADEQUADA"} className="mt-1 accent-[var(--color-brand)]" />
                  <span>
                    <strong className="font-semibold">Avaliação individual</strong>
                    <span className="block text-[12.5px] text-ink-3">Informe o valor de referência e o fundamento (vistoria, laudo, comparáveis).</span>
                  </span>
                </label>
                <div>
                  <label className="label" htmlFor="valorAvaliado">
                    Valor de referência avaliado (R$)
                  </label>
                  <input id="valorAvaliado" name="valorAvaliado" inputMode="decimal" className="input tnum" placeholder={sugerida.valorReferencia.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} />
                </div>
                <div>
                  <label className="label" htmlFor="justificativa">
                    Fundamentação
                  </label>
                  <textarea id="justificativa" name="justificativa" rows={3} className="input" placeholder="Obrigatória na avaliação individual. Fica visível ao contribuinte." />
                </div>
                <SubmitButton className="btn btn-primary w-full" pendingText="Registrando…">
                  Registrar avaliação e emitir guia
                </SubmitButton>
                <p className="hint">A avaliação apoia, mas não substitui, o procedimento previsto em lei. O contribuinte pode contestar antes de pagar.</p>
              </ActionForm>
            </Panel>
          )}
        </aside>
      </div>
    </>
  );
}

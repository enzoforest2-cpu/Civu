import Link from "next/link";
import { ArrowLeftRight, Plus } from "lucide-react";
import { requirePortal } from "@/lib/portal";
import { donoPortalOuMotivo, meusItbi } from "@/modulos/tributos/dados";
import { SemAcesso, Titulo } from "@/modulos/tributos/componentes";
import { NATUREZA_ITBI, SITUACAO_ITBI, type MemoriaItbi } from "@/modulos/tributos/regras";
import { contestarItbiAction } from "@/modulos/tributos/acoes";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { fmtData, fmtMoeda } from "@/lib/dates";
import { Chip, Vazio, type Tone } from "@/components/ui";

const TOM: Record<string, Tone> = { EM_AVALIACAO: "warn", AVALIADO: "brand", PAGO: "ok", CONTESTADO: "warn", CANCELADO: "neutral" };

export default async function MeusItbi({ searchParams }: { searchParams: Promise<{ enviado?: string }> }) {
  const s = await requirePortal();
  const sp = await searchParams;
  const { dono, motivo } = donoPortalOuMotivo(s, "TRIBUTOS");
  if (!dono) return <SemAcesso motivo={motivo} />;
  const lista = await meusItbi(dono);
  return (
    <>
      <Titulo
        sobre={dono.tipo === "EMPRESA" ? dono.nome : "Em nome próprio"}
        titulo="ITBI — compra de imóvel"
        sub="Declare a transação, acompanhe a avaliação da prefeitura e pague a guia. Depois do pagamento, o cadastro passa o imóvel para o seu nome."
        acao={
          <Link href="/portal/itbi/novo" className="btn btn-primary">
            <Plus size={16} /> Nova declaração
          </Link>
        }
      />
      {sp.enviado && (
        <div className="mb-5 rounded-xl border border-ok/30 bg-ok-soft px-4 py-3 text-[14px] text-ok">
          Declaração enviada. A tributação avalia em até 5 dias úteis e você recebe a guia aqui mesmo.
        </div>
      )}
      {lista.length === 0 ? (
        <Vazio icon={<ArrowLeftRight size={22} className="text-ink-3" />}>Nenhuma declaração de ITBI em seu nome. Use “Nova declaração” quando fechar a compra de um imóvel.</Vazio>
      ) : (
        <ul className="space-y-4">
          {lista.map((it) => {
            const mem = it.memoria as (MemoriaItbi & { ajusteManual?: boolean }) | null;
            const parcela = it.lancamento?.parcelas.find((p) => p.situacao === "ABERTA");
            return (
              <li key={it.id} className="panel p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="tnum text-[13px] text-ink-3">
                      {it.numero} · declarado em {fmtData(it.declaradoEm)} · {NATUREZA_ITBI[it.natureza]}
                    </div>
                    <div className="mt-0.5 text-[17px] font-semibold text-ink">
                      {it.imovel.logradouro}, {it.imovel.numero}
                      {it.imovel.complemento ? ` — ${it.imovel.complemento}` : ""} · {it.imovel.bairro}
                    </div>
                    <div className="text-[13.5px] text-ink-2">Vendedor: {it.vendedorNome}</div>
                  </div>
                  <Chip tone={TOM[it.situacao]}>{SITUACAO_ITBI[it.situacao]}</Chip>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-line pt-3 text-[14px] sm:grid-cols-4">
                  <div>
                    <dt className="text-[12.5px] text-ink-3">Valor declarado</dt>
                    <dd className="tnum text-ink">{fmtMoeda(it.valorDeclarado)}</dd>
                  </div>
                  <div>
                    <dt className="text-[12.5px] text-ink-3">Referência fiscal</dt>
                    <dd className="tnum text-ink">{it.valorReferencia ? fmtMoeda(it.valorReferencia) : "em avaliação"}</dd>
                  </div>
                  <div>
                    <dt className="text-[12.5px] text-ink-3">Base de cálculo</dt>
                    <dd className="tnum text-ink">{it.baseCalculo ? fmtMoeda(it.baseCalculo) : "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-[12.5px] text-ink-3">ITBI</dt>
                    <dd className="tnum font-semibold text-ink">{it.valorImposto ? fmtMoeda(it.valorImposto) : "—"}</dd>
                  </div>
                </dl>
                {mem && (
                  <p className="mt-3 rounded-lg bg-sunken px-3 py-2 text-[13px] leading-snug text-ink-2">
                    <strong className="font-semibold text-ink">Como chegamos à base:</strong> a base é o maior valor entre o declarado e a referência fiscal. {mem.ajusteManual ? "A referência foi definida em avaliação individual. " : mem.observacao}{" "}
                    {it.justificativa}
                    {mem.parteFinanciadaSfh > 0 && ` A parte financiada pelo SFH (${fmtMoeda(mem.parteFinanciadaSfh)}) paga 0,5%; o restante, 2%.`}
                  </p>
                )}
                {it.situacao === "CONTESTADO" && it.contestacao && (
                  <p className="mt-3 text-[13.5px] text-ink-2">
                    <strong className="font-semibold text-ink">Sua contestação:</strong> {it.contestacao} A tributação vai reavaliar e emitir nova guia.
                  </p>
                )}
                {it.situacao === "AVALIADO" && (
                  <div className="mt-4 flex flex-wrap items-start gap-3">
                    {parcela && (
                      <Link href="/portal/guias" className="btn btn-primary">
                        Pagar guia de {fmtMoeda(parcela.valor)} até {fmtData(parcela.vencimento + "T12:00:00")}
                      </Link>
                    )}
                    <details className="min-w-0 flex-1">
                      <summary className="btn btn-quiet">Discordo da avaliação</summary>
                      <ActionForm action={contestarItbiAction} className="mt-3 max-w-xl">
                        <input type="hidden" name="itbiId" value={it.id} />
                        <label className="label" htmlFor={`t-${it.id}`}>
                          Por que o valor não reflete o imóvel?
                        </label>
                        <textarea id={`t-${it.id}`} name="texto" rows={3} className="input" placeholder="Estado de conservação, laudo de avaliação, negócios parecidos na região…" />
                        <p className="hint">A contestação suspende a guia até a nova análise (CTN, com a redação da LC 227/2026, exige avaliação fundamentada e direito de contestar).</p>
                        <SubmitButton className="btn btn-quiet mt-2" pendingText="Enviando…">
                          Enviar contestação
                        </SubmitButton>
                      </ActionForm>
                    </details>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

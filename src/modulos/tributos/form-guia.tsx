// Lista de débitos em aberto com seleção para emitir uma guia (portal).
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Chip } from "@/components/ui";
import { fmtData, fmtMoeda } from "@/lib/dates";
import { emitirGuiaFormAction } from "./acoes";
import type { Debito } from "./dados";
import { TRIBUTO_NOME } from "./regras";

export function FormGuia({ debitos, agrupar = true }: { debitos: Debito[]; agrupar?: boolean }) {
  const grupos = new Map<string, Debito[]>();
  for (const d of debitos) grupos.set(agrupar ? d.lancamentoId : "todos", [...(grupos.get(agrupar ? d.lancamentoId : "todos") ?? []), d]);
  return (
    <ActionForm action={emitirGuiaFormAction} resetOnOk={false}>
      <div className="space-y-5">
        {[...grupos.values()].map((lista) => {
          const unica = lista.find((d) => d.numero === 0);
          return (
            <fieldset key={lista[0].lancamentoId} className="rounded-xl border border-line">
              {agrupar && (
                <legend className="ml-3 px-1.5 text-[13.5px] font-semibold text-ink">
                  {TRIBUTO_NOME[lista[0].tributo] ?? lista[0].tributo} · {lista[0].descricao.replace(/^[^—]+—\s*/, "")}
                </legend>
              )}
              {unica && lista.length > 1 && (
                <p className="px-4 pt-2 text-[12.5px] text-ink-3">Escolha a cota única (com desconto) ou as parcelas — não as duas.</p>
              )}
              <ul className="divide-y divide-line">
                {lista.map((d) => (
                  <li key={d.parcelaId}>
                    <label className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-sunken/60">
                      <input type="checkbox" name="parcela" value={d.parcelaId} defaultChecked={d.vencida} className="h-4 w-4 accent-[var(--color-brand)]" />
                      <span className="min-w-0 flex-1 text-[14px] text-ink">
                        {!agrupar && <span className="text-ink-3">{TRIBUTO_NOME[d.tributo] ?? d.tributo} · </span>}
                        {d.numero === 0 ? (d.tributo === "IPTU" ? "Cota única com desconto" : "Parcela única") : `${d.numero}ª parcela`}
                        <span className="text-ink-3"> · vence {fmtData(d.vencimento + "T12:00:00")}</span>
                      </span>
                      {d.vencida && <Chip tone="bad">Vencida</Chip>}
                      <span className="tnum w-28 text-right text-[14px] font-semibold text-ink">
                        {fmtMoeda(d.total)}
                        {d.acrescimos > 0 && <span className="block text-[12px] font-normal text-bad">+{fmtMoeda(d.acrescimos)} de acréscimos</span>}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
          );
        })}
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <SubmitButton pendingText="Gerando guia…">Gerar guia com os itens marcados</SubmitButton>
        <span className="text-[13px] text-ink-3">Parcelas vencidas já vêm marcadas, com multa e juros calculados até hoje.</span>
      </div>
    </ActionForm>
  );
}

import { Chip, Panel } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { fmtMoeda } from "@/lib/dates";
import { regraPesquisaPrecos, type PesquisaPrecos } from "@/lib/regras-fluxo";
import { pesquisaPrecosAction } from "./acoes";
import { FontesPrecos } from "./fontes-precos";
import { SoConsulta, dataBr, listaDe, metaDe, type PropsEtapa } from "./util";

/** Pesquisa de preços estruturada (art. 23): fontes, justificativa quando há menos de 3, mediana como valor estimado. */
export function PainelPesquisaPrecos({ p, pode }: PropsEtapa) {
  const meta = metaDe(p);
  const pesquisa = meta.pesquisaPrecos as PesquisaPrecos | undefined;
  const fontes = listaDe<{ fonte: string; data: string; valor: number }>(pesquisa?.fontes);
  const r = regraPesquisaPrecos(pesquisa);
  return (
    <Panel title="Pesquisa de preços" action={pesquisa ? <Chip tone={r.ok ? "ok" : "warn"}>{r.ok ? "Completa" : "Incompleta"}</Chip> : undefined}>
      <p className="text-[14px] text-ink-2">
        Registre ao menos 3 fontes (art. 23). O valor estimado do processo passa a ser a mediana das fontes
        {meta.valorEstimado ? (
          <>
            ; hoje está em <strong className="tnum font-semibold text-ink">{fmtMoeda(String(meta.valorEstimado))}</strong>
          </>
        ) : null}
        .
      </p>
      {pode ? (
        <ActionForm action={pesquisaPrecosAction} className="mt-4" resetOnOk={false}>
          <input type="hidden" name="processoId" value={p.id} />
          <FontesPrecos inicial={fontes} justificativaInicial={pesquisa?.justificativa ?? ""} />
          <div className="mt-4">
            <SubmitButton pendingText="Salvando…">Salvar pesquisa</SubmitButton>
          </div>
        </ActionForm>
      ) : fontes.length ? (
        <>
          <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
            {fontes.map((f, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-[14px]">
                <span className="min-w-0 text-ink">{f.fonte}</span>
                <span className="tnum text-ink-2">
                  {dataBr(f.data)} · {fmtMoeda(f.valor)}
                </span>
              </li>
            ))}
          </ul>
          <SoConsulta />
        </>
      ) : (
        <SoConsulta>Compras ainda não registrou a pesquisa de preços.</SoConsulta>
      )}
    </Panel>
  );
}

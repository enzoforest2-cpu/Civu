import { Chip, Panel } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { fmtMoeda } from "@/lib/dates";
import { hojeIso } from "@/lib/engine";
import { fmtCnpj } from "@/lib/pagamentos";
import type { ResultadoSessao } from "@/lib/regras-fluxo";
import { resultadoSessaoAction } from "./acoes";
import { Dado, SoConsulta, dataBr, metaDe, type PropsEtapa } from "./util";

const SITUACAO: Record<ResultadoSessao["situacao"], { texto: string; tone: "ok" | "bad" | "warn" }> = {
  VENCEDOR: { texto: "Com vencedor", tone: "ok" },
  DESERTA: { texto: "Deserta", tone: "warn" },
  FRACASSADA: { texto: "Fracassada", tone: "bad" },
};

/** Resultado da sessão pública. A disputa em si acontece na plataforma externa. */
export function PainelSessao({ p, pode }: PropsEtapa) {
  const meta = metaDe(p);
  const r = meta.resultadoSessao as ResultadoSessao | undefined;
  const sit = r ? SITUACAO[r.situacao] : undefined;
  return (
    <Panel title="Sessão de disputa" action={sit ? <Chip tone={sit.tone}>{sit.texto}</Chip> : undefined}>
      <p className="text-[14px] text-ink-2">A disputa acontece na plataforma; aqui fica o resultado.</p>
      {r && (
        <dl className="mt-4 grid gap-3 rounded-xl border border-line px-4 py-3 sm:grid-cols-2">
          <Dado rotulo="Ata de">{dataBr(r.ataEm)}</Dado>
          {r.situacao === "VENCEDOR" ? (
            <>
              <Dado rotulo="Vencedor">
                {r.fornecedor}
                <div className="tnum text-[13px] text-ink-2">CNPJ {fmtCnpj(r.cnpj ?? "")}</div>
              </Dado>
              <Dado rotulo="Valor">
                <span className="tnum font-semibold">{fmtMoeda(r.valor ?? null)}</span>
              </Dado>
            </>
          ) : (
            <Dado rotulo="Situação">{sit?.texto}: devolva à instrução para refazer o edital ou mudar a modalidade.</Dado>
          )}
        </dl>
      )}
      {pode ? (
        <ActionForm action={resultadoSessaoAction} className="mt-4 space-y-3">
          <input type="hidden" name="processoId" value={p.id} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="ses-situacao">
                Situação
              </label>
              <select id="ses-situacao" name="situacao" className="input" defaultValue="VENCEDOR">
                <option value="VENCEDOR">Vencedor definido</option>
                <option value="DESERTA">Deserta (nenhum interessado)</option>
                <option value="FRACASSADA">Fracassada (nenhuma proposta válida)</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="ses-ata">
                Data da ata
              </label>
              <input id="ses-ata" name="ataEm" type="date" className="input" required defaultValue={hojeIso()} />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="ses-fornecedor">
              Fornecedor vencedor
            </label>
            <input id="ses-fornecedor" name="fornecedor" className="input" placeholder="Razão social" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="ses-cnpj">
                CNPJ
              </label>
              <input id="ses-cnpj" name="cnpj" className="input tnum" inputMode="numeric" placeholder="00.000.000/0000-00" />
            </div>
            <div>
              <label className="label" htmlFor="ses-valor">
                Valor (R$)
              </label>
              <input id="ses-valor" name="valor" className="input tnum" inputMode="decimal" placeholder="0,00" />
            </div>
          </div>
          <p className="hint">Fornecedor, CNPJ e valor só são pedidos quando há vencedor.</p>
          <SubmitButton pendingText="Registrando…">Registrar resultado</SubmitButton>
        </ActionForm>
      ) : (
        !r && <SoConsulta>Compras ainda não registrou o resultado da sessão.</SoConsulta>
      )}
    </Panel>
  );
}

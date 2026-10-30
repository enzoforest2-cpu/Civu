import { Chip, Panel } from "@/components/ui";
import { fmtMoeda } from "@/lib/dates";
import { hojeIso } from "@/lib/engine";
import { fmtCnpj } from "@/lib/pagamentos";
import type { ResultadoSessao } from "@/lib/regras-fluxo";
import { SessaoForm } from "./sessao-form";
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
        <SessaoForm processoId={p.id} hoje={hojeIso()} />
      ) : (
        !r && <SoConsulta>Compras ainda não registrou o resultado da sessão.</SoConsulta>
      )}
    </Panel>
  );
}

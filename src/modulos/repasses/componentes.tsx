// Peças visuais do módulo de repasses e obrigações (servidor): situação, alerta de prazo e barra de execução.
import { AlertTriangle, CalendarClock, CheckCircle2, Clock, FlaskConical } from "lucide-react";
import { Chip } from "@/components/ui";
import { fmtMoeda } from "@/lib/dates";
import { SITUACOES_OBRIGACAO, SITUACOES_REPASSE, dataBr, type AlertaPrazo } from "./regras";

export function ChipSituacao({ s }: { s: string }) {
  const x = SITUACOES_REPASSE[s];
  return <Chip tone={x?.tone ?? "neutral"}>{x?.nome ?? "Situação não informada"}</Chip>;
}

export function ChipSituacaoObrigacao({ s }: { s: string }) {
  const x = SITUACOES_OBRIGACAO[s];
  return <Chip tone={x?.tone ?? "neutral"}>{x?.nome ?? s}</Chip>;
}

/** Alerta de prazo (30, 15, 5 dias, vencido), com a data. Com `rotulo`, o nome do prazo vai numa linha acima do selo. */
export function ChipPrazo({ alerta, data, rotulo }: { alerta: AlertaPrazo; data: string; rotulo?: string }) {
  const Icone = alerta.nivel === "vencido" || alerta.nivel === "5" ? AlertTriangle : alerta.nivel === "ok" ? CalendarClock : Clock;
  const selo = (
    <Chip tone={alerta.tone === "ok" ? "ok" : alerta.tone}>
      <Icone size={12} strokeWidth={2.5} aria-hidden />
      <span>{alerta.nivel === "ok" ? dataBr(data) : `${alerta.texto} (${dataBr(data)})`}</span>
    </Chip>
  );
  if (!rotulo) return selo;
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <span className="text-[12.5px] text-ink-2">{rotulo}</span>
      {selo}
    </span>
  );
}

export function ChipEntregue() {
  return (
    <Chip tone="ok">
      <CheckCircle2 size={12} strokeWidth={2.5} aria-hidden /> Entregue
    </Chip>
  );
}

export function ChipExemplo() {
  return (
    <Chip tone="warn">
      <FlaskConical size={12} strokeWidth={2.5} aria-hidden /> Exemplo
    </Chip>
  );
}

const pct = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

/**
 * Barra de execução sobre o valor previsto: pago, liquidado a pagar e contratado a liquidar.
 * `compacta`: só a barra e uma linha de números (listas).
 */
export function BarraExecucao({ previsto, contratado, liquidado, pago, compacta = false }: { previsto: number; contratado: number; liquidado: number; pago: number; compacta?: boolean }) {
  const base = Math.max(previsto, contratado, 1);
  const w = (v: number) => Math.max(0, Math.min(100, (v / base) * 100));
  const pPago = w(pago);
  const pLiq = Math.min(100 - pPago, w(liquidado - pago));
  const pCont = Math.min(100 - pPago - pLiq, w(contratado - liquidado));
  const percentual = previsto > 0 ? (pago / previsto) * 100 : 0;
  return (
    <div>
      <div
        className={`flex overflow-hidden rounded-full bg-sunken ${compacta ? "h-2" : "h-3"}`}
        role="img"
        aria-label={`Pago ${pct(percentual)} do previsto; contratado ${fmtMoeda(contratado)}, liquidado ${fmtMoeda(liquidado)}, pago ${fmtMoeda(pago)}`}
      >
        <div className="bg-brand" style={{ width: `${pPago}%` }} />
        {pLiq > 0 && <div className="bg-brand-2/45" style={{ width: `${pLiq}%` }} />}
        {pCont > 0 && <div className="bg-warn/45" style={{ width: `${pCont}%` }} />}
      </div>
      {compacta ? (
        <div className="tnum mt-1 text-[12.5px] text-ink-2">
          {pct(percentual)} pago · contratado {fmtMoeda(contratado)}
        </div>
      ) : (
        <dl className="mt-3 grid grid-cols-2 gap-x-5 gap-y-2 text-[13px] sm:grid-cols-4">
          <Legenda cor="bg-brand" rotulo="Pago" valor={fmtMoeda(pago)} />
          <Legenda cor="bg-brand-2/45" rotulo="Liquidado" valor={fmtMoeda(liquidado)} />
          <Legenda cor="bg-warn/45" rotulo="Contratado" valor={fmtMoeda(contratado)} />
          <Legenda cor="border border-line-2 bg-sunken" rotulo="Sem contratar" valor={fmtMoeda(Math.max(0, previsto - contratado))} />
        </dl>
      )}
    </div>
  );
}

function Legenda({ cor, rotulo, valor }: { cor: string; rotulo: string; valor: string }) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-ink-2">
        <i className={`h-2.5 w-2.5 shrink-0 rounded-full ${cor}`} aria-hidden /> {rotulo}
      </dt>
      <dd className="tnum font-semibold text-ink">{valor}</dd>
    </div>
  );
}

/** Número de destaque (mesmo desenho dos números dos contratos). */
export function Numero({ valor, rotulo, tone }: { valor: React.ReactNode; rotulo: React.ReactNode; tone?: "bad" | "warn" }) {
  return (
    <div className="panel px-5 py-4">
      <div className={`display tnum text-[24px] leading-tight font-semibold ${tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : "text-ink"}`}>{valor}</div>
      <div className="mt-1 text-[13px] leading-snug text-ink-2">{rotulo}</div>
    </div>
  );
}

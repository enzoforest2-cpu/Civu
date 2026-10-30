// Componentes visuais do módulo de contratos (sem estado; servem à gestão, ao portal e à página pública).
import type { ReactNode } from "react";
import { Check, X } from "lucide-react";
import { fmtMoeda } from "@/lib/dates";
import { Chip } from "@/components/ui";
import { SITUACAO_CONTRATO, SITUACAO_OBRA, rotuloMes, type AnaliseObra, type ResumoFinanceiro, type SituacaoContrato, type SituacaoObra } from "./regras";
import type { EtapaPagamento, SituacaoNota } from "./dados";

export const pct = (v: number, casas = 1) => `${v.toFixed(casas).replace(".", ",")}%`;

export function ChipContrato({ s }: { s: SituacaoContrato }) {
  return <Chip tone={SITUACAO_CONTRATO[s].tone}>{SITUACAO_CONTRATO[s].texto}</Chip>;
}

export function ChipObra({ s }: { s: SituacaoObra }) {
  return <Chip tone={SITUACAO_OBRA[s].tone}>{SITUACAO_OBRA[s].texto}</Chip>;
}

export function ChipNota({ s }: { s: SituacaoNota | undefined }) {
  if (!s) return null;
  return <Chip tone={s.tone}>{s.texto}</Chip>;
}

/** Barra de execução: executado, em atesto e saldo, sobre o valor atualizado. */
export function BarraSaldo({ fin, compacta = false }: { fin: ResumoFinanceiro; compacta?: boolean }) {
  const total = Math.max(fin.valorAtual, 1);
  const ex = Math.min(100, (fin.executado / total) * 100);
  const at = Math.min(100 - ex, (fin.aAtestar / total) * 100);
  const baixo = fin.pctSaldo < 10;
  return (
    <div>
      <div className={`flex overflow-hidden rounded-full bg-sunken ${compacta ? "h-2" : "h-3"}`} role="img" aria-label={`Executado ${pct(ex)}, saldo ${pct(fin.pctSaldo)}`}>
        <div className="bg-brand" style={{ width: `${ex}%` }} />
        {at > 0 && <div className="bg-warn/60" style={{ width: `${at}%` }} />}
      </div>
      {!compacta && (
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-ink-2">
          <span className="flex items-center gap-1.5">
            <i className="h-2.5 w-2.5 rounded-full bg-brand" /> Executado <strong className="tnum font-semibold text-ink">{fmtMoeda(fin.executado)}</strong>
          </span>
          {fin.aAtestar > 0 && (
            <span className="flex items-center gap-1.5">
              <i className="h-2.5 w-2.5 rounded-full bg-warn/60" /> Em atesto <strong className="tnum font-semibold text-ink">{fmtMoeda(fin.aAtestar)}</strong>
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <i className="h-2.5 w-2.5 rounded-full border border-line-2 bg-sunken" /> Saldo{" "}
            <strong className={`tnum font-semibold ${baixo ? "text-bad" : "text-ink"}`}>
              {fmtMoeda(fin.saldo)} ({pct(fin.pctSaldo)})
            </strong>
          </span>
        </div>
      )}
    </div>
  );
}

/** Barra simples de percentual (físico da obra). */
export function BarraPct({ valor, previsto, tone = "brand" }: { valor: number; previsto?: number; tone?: "brand" | "bad" }) {
  return (
    <div className="relative h-2 overflow-hidden rounded-full bg-sunken" role="img" aria-label={`${pct(valor)} executado${previsto != null ? `, previsto ${pct(previsto)}` : ""}`}>
      <div className={tone === "bad" ? "h-full bg-bad" : "h-full bg-brand"} style={{ width: `${Math.min(100, valor)}%` }} />
      {previsto != null && <div className="absolute top-0 h-full w-0.5 bg-ink" style={{ left: `calc(${Math.min(100, previsto)}% - 1px)` }} />}
    </div>
  );
}

/**
 * Curva S do previsto × realizado (percentual físico acumulado), desenhada à mão em SVG.
 * O realizado vai só até o último mês medido; a linha vertical marca o mês de referência da análise.
 */
export function CurvaS({ obra, titulo = "Curva S: previsto × realizado" }: { obra: AnaliseObra; titulo?: string }) {
  const n = obra.meses.length;
  if (n === 0) return null;
  const W = 640;
  const H = 260;
  const L = 40;
  const R = 16;
  const T = 14;
  const B = 34;
  const x = (i: number) => L + (n === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (n - 1));
  const y = (v: number) => T + (1 - v / 100) * (H - T - B);
  const linha = (arr: number[]) => arr.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const refIdx = obra.refMes ? obra.meses.indexOf(obra.refMes) : -1;
  const ultimo = obra.realizadoAcum.length - 1;
  const passo = n > 9 ? 2 : 1;
  return (
    <figure>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={`${titulo}. Previsto até ${obra.refMes ? rotuloMes(obra.refMes) : "—"}: ${pct(obra.previstoRef)}; medido: ${pct(obra.realizadoRef)}.`}
      >
        {[0, 25, 50, 75, 100].map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--color-line)" strokeWidth={1} />
            <text x={L - 8} y={y(v) + 4} textAnchor="end" fontSize={11} fill="var(--color-ink-3)" className="tnum">
              {v}%
            </text>
          </g>
        ))}
        {obra.meses.map((mes, i) =>
          i % passo === 0 || i === n - 1 ? (
            <text key={mes} x={x(i)} y={H - 12} textAnchor="middle" fontSize={11} fill="var(--color-ink-3)">
              {rotuloMes(mes)}
            </text>
          ) : null,
        )}
        {refIdx >= 0 && (
          <g>
            <line x1={x(refIdx)} x2={x(refIdx)} y1={T} y2={H - B} stroke="var(--color-ink-3)" strokeDasharray="2 4" strokeWidth={1} />
          </g>
        )}
        <path d={linha(obra.previstoAcum)} fill="none" stroke="var(--color-ink-3)" strokeWidth={2} strokeDasharray="6 5" />
        {obra.realizadoAcum.length > 0 && (
          <>
            <path
              d={`${linha(obra.realizadoAcum)} L${x(ultimo).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`}
              fill="var(--color-brand)"
              opacity={0.08}
            />
            <path d={linha(obra.realizadoAcum)} fill="none" stroke="var(--color-brand)" strokeWidth={2.5} strokeLinejoin="round" />
            {obra.realizadoAcum.map((v, i) => (
              <circle key={i} cx={x(i)} cy={y(v)} r={i === ultimo ? 4.5 : 3} fill={i === ultimo ? "var(--color-brand)" : "#fff"} stroke="var(--color-brand)" strokeWidth={2} />
            ))}
            <text
              x={Math.min(x(ultimo) + 8, W - R - 40)}
              y={y(obra.realizadoAcum[ultimo]) - 8}
              fontSize={12}
              fontWeight={600}
              fill="var(--color-brand-ink)"
              className="tnum"
            >
              {pct(obra.realizadoAcum[ultimo], 0)}
            </text>
          </>
        )}
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-ink-2">
        <span className="flex items-center gap-2">
          <svg width="22" height="6" aria-hidden>
            <line x1="0" x2="22" y1="3" y2="3" stroke="var(--color-ink-3)" strokeWidth="2" strokeDasharray="5 4" />
          </svg>
          Previsto no cronograma
        </span>
        <span className="flex items-center gap-2">
          <svg width="22" height="6" aria-hidden>
            <line x1="0" x2="22" y1="3" y2="3" stroke="var(--color-brand)" strokeWidth="2.5" />
          </svg>
          Medido pela fiscalização
        </span>
        {obra.refMes && <span className="text-ink-3">Linha pontilhada vertical: último mês completo ({rotuloMes(obra.refMes)})</span>}
      </figcaption>
    </figure>
  );
}

const ORDEM: EtapaPagamento[] = ["ATESTO", "LIQUIDACAO", "FILA", "PAGO"];
const ROTULO: Record<string, string> = { ATESTO: "Atesto", LIQUIDACAO: "Liquidação", FILA: "Fila", PAGO: "Pago" };

/** Trilho curto da nota até o pagamento: onde o dinheiro está. */
export function TrilhoNota({ s }: { s: SituacaoNota }) {
  const atual = s.etapa === "GLOSADA" ? 0 : s.etapa === "ATESTADA" ? 1 : ORDEM.indexOf(s.etapa);
  const feitoAte = s.etapa === "ATESTADA" ? 0 : s.etapa === "PAGO" ? 3 : atual - 1;
  return (
    <ol className="flex items-center gap-1" aria-label={`Situação: ${s.texto}`}>
      {ORDEM.map((e, i) => {
        const feito = i <= feitoAte;
        const corrente = i === atual && s.etapa !== "PAGO";
        const erro = s.etapa === "GLOSADA" && i === 0;
        return (
          <li key={e} className="flex items-center gap-1">
            {i > 0 && <span className={`h-0.5 w-3 sm:w-5 ${i <= feitoAte ? "bg-brand" : "bg-line-2"}`} aria-hidden />}
            <span
              className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${
                erro ? "bg-bad-soft text-bad" : feito ? "bg-brand text-white" : corrente ? "bg-brand-soft text-brand-ink ring-1 ring-brand" : "bg-sunken text-ink-3"
              }`}
            >
              {erro ? <X size={11} strokeWidth={3} /> : feito ? <Check size={11} strokeWidth={3} /> : null}
              {ROTULO[e]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function Dado({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[12.5px] font-medium text-ink-3">{rotulo}</dt>
      <dd className="mt-0.5 text-[14.5px] text-ink">{children}</dd>
    </div>
  );
}

export function Numero({ valor, rotulo, tone }: { valor: ReactNode; rotulo: ReactNode; tone?: "bad" | "warn" }) {
  return (
    <div className="panel px-5 py-4">
      <div className={`display tnum text-[24px] leading-tight font-semibold ${tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : "text-ink"}`}>{valor}</div>
      <div className="mt-1 text-[13px] leading-snug text-ink-2">{rotulo}</div>
    </div>
  );
}

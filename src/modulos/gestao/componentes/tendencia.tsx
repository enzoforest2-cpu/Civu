import type { Indicador } from "../indicadores";
import { fmtDataHora, fmtMoeda } from "@/lib/dates";
import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";

export function fmtIndicador(v: number | null, formato: Indicador["formato"]) {
  if (v == null) return "—";
  if (formato === "moeda") return fmtMoeda(v);
  if (formato === "dias") return `${v.toLocaleString("pt-BR")} ${v === 1 ? "dia" : "dias"}`;
  return v.toLocaleString("pt-BR");
}

/** Linha de tendência simples (SVG), com o último ponto marcado. */
export function Sparkline({ pontos, tom }: { pontos: number[]; tom: "bom" | "ruim" | "neutro" }) {
  if (pontos.length < 2) return null;
  const w = 120;
  const h = 34;
  const min = Math.min(...pontos);
  const max = Math.max(...pontos);
  const amp = max - min || 1;
  const xy = pontos.map((v, i) => [(i / (pontos.length - 1)) * (w - 6) + 3, h - 4 - ((v - min) / amp) * (h - 8)] as const);
  const d = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const cor = tom === "bom" ? "var(--color-ok)" : tom === "ruim" ? "var(--color-bad)" : "var(--color-brand)";

  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden className="overflow-visible">
      <path d={d} fill="none" stroke={cor} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Cartão de indicador: valor, variação na série, tendência, origem e responsável. */
export function CartaoIndicador({ i }: { i: Indicador }) {
  const serie = i.serie?.map((p) => p.valor) ?? [];
  const ant = serie.length >= 2 ? serie[serie.length - 2] : null;
  const atual = serie.length ? serie[serie.length - 1] : i.valor;
  const delta = ant != null && atual != null ? atual - ant : null;
  const melhorou = delta == null || delta === 0 || i.melhorSe === "neutro" ? null : i.melhorSe === "maior" ? delta > 0 : delta < 0;
  const tom = melhorou == null ? "neutro" : melhorou ? "bom" : "ruim";
  const Seta = delta == null || delta === 0 ? ArrowRight : delta > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <div className="flex flex-col rounded-xl border border-line bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[13px] leading-snug text-ink-2">{i.rotulo}</div>
        {i.natureza === "projetado" && <span className="chip bg-warn-soft text-warn">Projetado</span>}
      </div>
      <div className="mt-1">
        <div>
          <div className="display tnum text-[24px] leading-tight font-semibold text-ink">{fmtIndicador(i.valor, i.formato)}</div>
          {delta != null && (
            <div className={`mt-0.5 inline-flex items-center gap-1 text-[12.5px] ${tom === "bom" ? "text-ok" : tom === "ruim" ? "text-bad" : "text-ink-3"}`}>
              <Seta size={13} strokeWidth={2.5} />
              {delta === 0 ? "igual à semana anterior" : `${delta > 0 ? "+" : "−"}${fmtIndicador(Math.abs(delta), i.formato)} na semana`}
            </div>
          )}
        </div>
        {serie.length >= 2 && (
          <div className="mt-2">
            <Sparkline pontos={serie} tom={tom} />
          </div>
        )}
      </div>
      {i.nota && <p className="mt-2 text-[12.5px] leading-snug text-ink-3">{i.nota}</p>}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-1 pt-3 text-[12px] text-ink-3">
        <Link href={i.origem.href} className="font-semibold text-brand-2 hover:underline">
          {i.origem.rotulo}
        </Link>
        <span title={`Atualizado em ${fmtDataHora(i.atualizadoEm)}`}>{i.responsavel}</span>
      </div>
    </div>
  );
}

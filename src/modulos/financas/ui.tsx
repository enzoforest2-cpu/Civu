// Componentes visuais do módulo de finanças (renderizados no servidor; gráficos em SVG puro).
import Link from "next/link";
import type { ReactNode } from "react";
import { fmtMoeda } from "@/lib/dates";
import type { SessaoUsuario } from "@/lib/auth";
import { Vazio } from "@/components/ui";
import { MESES, fmtCompacto, fmtPct } from "./classificacao";
import { foraDoEscopo } from "@/lib/escopo";

const ABAS = [
  { href: "/financas", rotulo: "Visão geral" },
  { href: "/financas/orcamento", rotulo: "Orçamento" },
  { href: "/financas/empenhos", rotulo: "Empenhos" },
  { href: "/financas/receita", rotulo: "Receita" },
  { href: "/financas/caixa", rotulo: "Caixa e projeção" },
  { href: "/financas/indices", rotulo: "Índices legais" },
];

export function AbasFinancas({ atual }: { atual: string }) {
  return (
    <nav aria-label="Seções de finanças" className="-mx-4 mb-7 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="flex w-max gap-1 rounded-full border border-line bg-white p-1">
        {ABAS.filter((a) => !foraDoEscopo(a.href)).map((a) => {
          const ativo = a.href === atual;
          return (
            <Link
              key={a.href}
              href={a.href}
              aria-current={ativo ? "page" : undefined}
              className={`rounded-full px-3.5 py-1.5 text-[13.5px] font-medium whitespace-nowrap transition-colors ${ativo ? "bg-ink text-white" : "text-ink-2 hover:bg-sunken hover:text-ink"}`}
            >
              {a.rotulo}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export const PAPEIS_FINANCAS = ["ADMIN", "ORDENADOR", "CONTABILIDADE", "TESOURARIA", "CONTROLE_INTERNO", "SECRETARIO"] as const;
export const podeVerFinancas = (u: SessaoUsuario) => u.papeis.some((p) => (PAPEIS_FINANCAS as readonly string[]).includes(p));

export function SemAcesso() {
  return (
    <div className="mx-auto max-w-xl py-10">
      <h1 className="display mb-6 text-[28px] leading-[1.1] font-semibold text-ink sm:text-[34px]">Finanças</h1>
      <Vazio>
        As telas de finanças são para gestão, contabilidade, tesouraria, controle interno e secretários. Se precisar destes dados, peça à
        contabilidade.
      </Vazio>
    </div>
  );
}

export function Kpi({ rotulo, valor, sub, tom }: { rotulo: string; valor: ReactNode; sub?: ReactNode; tom?: "bad" | "warn" | "ok" }) {
  return (
    <div className="panel px-5 py-4">
      <div className="text-[12.5px] font-medium text-ink-3">{rotulo}</div>
      <div className={`display tnum mt-1 text-[22px] leading-tight font-semibold ${tom === "bad" ? "text-bad" : tom === "warn" ? "text-warn" : "text-ink"}`}>{valor}</div>
      {sub && <div className="mt-1 text-[12.5px] leading-snug text-ink-2">{sub}</div>}
    </div>
  );
}

/** Barra de execução: pago, liquidado e empenhado sobre o valor autorizado. */
export function BarraExecucao({ autorizado, empenhado, liquidado, pago, reservado = 0, alto = false }: { autorizado: number; empenhado: number; liquidado: number; pago: number; reservado?: number; alto?: boolean }) {
  const p = (v: number) => `${Math.max(0, Math.min(100, autorizado > 0 ? (v / autorizado) * 100 : 0))}%`;
  return (
    <div
      className={`relative w-full overflow-hidden rounded-full bg-sunken ${alto ? "h-3" : "h-2"}`}
      role="img"
      aria-label={`Empenhado ${fmtPct(autorizado ? (empenhado / autorizado) * 100 : 0)}, liquidado ${fmtPct(autorizado ? (liquidado / autorizado) * 100 : 0)}, pago ${fmtPct(autorizado ? (pago / autorizado) * 100 : 0)} do autorizado`}
    >
      {reservado > 0 && <div className="absolute inset-y-0 left-0 bg-warn/35" style={{ width: p(empenhado + reservado) }} />}
      <div className="absolute inset-y-0 left-0 bg-brand/25" style={{ width: p(empenhado) }} />
      <div className="absolute inset-y-0 left-0 bg-brand/55" style={{ width: p(liquidado) }} />
      <div className="absolute inset-y-0 left-0 bg-brand" style={{ width: p(pago) }} />
    </div>
  );
}

export function LegendaExecucao({ reservado = false }: { reservado?: boolean }) {
  const item = (cor: string, t: string) => (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-sm ${cor}`} /> {t}
    </span>
  );
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-ink-3">
      {item("bg-brand", "Pago")}
      {item("bg-brand/55", "Liquidado")}
      {item("bg-brand/25", "Empenhado")}
      {reservado && item("bg-warn/35", "Reservado")}
      {item("bg-sunken border border-line", "Saldo disponível")}
    </div>
  );
}

/** Previsto × arrecadado por mês (barras lado a lado). */
export function GraficoMensal({ dados, altura = 200 }: { dados: { mes: number; previsto: number; arrecadado: number | null }[]; altura?: number }) {
  const max = Math.max(1, ...dados.map((d) => Math.max(d.previsto, d.arrecadado ?? 0)));
  const W = 720;
  const H = altura;
  const base = H - 22;
  const larg = W / 12;
  const y = (v: number) => base - (v / max) * (base - 14);
  const linhas = [0.25, 0.5, 0.75, 1].map((f) => f * max);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Receita prevista e arrecadada por mês">
      {linhas.map((v) => (
        <g key={v}>
          <line x1={0} x2={W} y1={y(v)} y2={y(v)} stroke="var(--color-line)" strokeDasharray="3 4" />
          <text x={2} y={y(v) - 3} fontSize={10} fill="var(--color-ink-3)">
            {fmtCompacto(v)}
          </text>
        </g>
      ))}
      {dados.map((d, i) => {
        const x = i * larg;
        const bw = larg * 0.32;
        return (
          <g key={d.mes}>
            <rect x={x + larg * 0.16} y={y(d.previsto)} width={bw} height={base - y(d.previsto)} rx={3} fill="var(--color-line-2)">
              <title>{`${MESES[i]}: previsto ${fmtMoeda(d.previsto)}`}</title>
            </rect>
            {d.arrecadado != null && (
              <rect
                x={x + larg * 0.16 + bw + 2}
                y={y(d.arrecadado)}
                width={bw}
                height={base - y(d.arrecadado)}
                rx={3}
                fill={d.arrecadado < d.previsto * 0.9 ? "var(--color-warn)" : "var(--color-brand)"}
              >
                <title>{`${MESES[i]}: arrecadado ${fmtMoeda(d.arrecadado)}`}</title>
              </rect>
            )}
            <text x={x + larg / 2} y={H - 6} fontSize={11} textAnchor="middle" fill="var(--color-ink-3)">
              {MESES[i]}
            </text>
          </g>
        );
      })}
      <line x1={0} x2={W} y1={base} y2={base} stroke="var(--color-line-2)" />
    </svg>
  );
}

/** Saldo projetado de uma fonte, com a linha do zero e o trecho negativo em vermelho. */
export function GraficoSaldo({ pontos, altura = 120 }: { pontos: { data: string; saldo: number }[]; altura?: number }) {
  const W = 360;
  const H = altura;
  const vals = pontos.map((p) => p.saldo);
  const max = Math.max(0, ...vals);
  const min = Math.min(0, ...vals);
  const span = max - min || 1;
  const y = (v: number) => 8 + ((max - v) / span) * (H - 26);
  const x = (i: number) => (i / Math.max(1, pontos.length - 1)) * W;
  const d = pontos.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.saldo).toFixed(1)}`).join(" ");
  const area = `${d} L${W},${y(0)} L0,${y(0)} Z`;
  const negativo = min < 0;
  const marcas = [0, 30, 60, 90].filter((i) => i < pontos.length);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Saldo projetado">
      <defs>
        <clipPath id={`neg-${pontos[0]?.data}-${Math.round(min)}`}>
          <rect x={0} y={y(0)} width={W} height={H} />
        </clipPath>
      </defs>
      <path d={area} fill="var(--color-brand)" opacity={0.08} />
      {negativo && <path d={area} fill="var(--color-bad)" opacity={0.18} clipPath={`url(#neg-${pontos[0]?.data}-${Math.round(min)})`} />}
      <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="var(--color-ink-3)" strokeDasharray="4 3" strokeWidth={1} />
      <path d={d} fill="none" stroke={negativo ? "var(--color-bad)" : "var(--color-brand)"} strokeWidth={2} strokeLinejoin="round" />
      {marcas.map((i) => (
        <text key={i} x={Math.min(W - 2, Math.max(2, x(i)))} y={H - 4} fontSize={10} textAnchor={i === 0 ? "start" : i >= 90 ? "end" : "middle"} fill="var(--color-ink-3)">
          {pontos[i].data.slice(8, 10)}/{pontos[i].data.slice(5, 7)}
        </text>
      ))}
    </svg>
  );
}

/** Régua de um índice: escala, limites legais e marcas do realizado e do projetado. */
export function ReguaIndice({
  realizado,
  projetado,
  marcas,
  escalaMax,
  escalaMin = 0,
  tipo,
}: {
  realizado: number | null;
  projetado: number | null;
  marcas: { v: number; rotulo: string; cor: string }[];
  escalaMax: number;
  escalaMin?: number;
  tipo: "minimo" | "maximo";
}) {
  const p = (v: number) => `${Math.max(0, Math.min(100, ((v - escalaMin) / (escalaMax - escalaMin)) * 100))}%`;
  const minimo = tipo === "minimo" ? marcas[0]?.v : null;
  return (
    <div className="pt-7 pb-8">
      <div className="relative h-3 rounded-full bg-sunken">
        {tipo === "minimo" && minimo != null && <div className="absolute inset-y-0 left-0 rounded-l-full bg-bad-soft" style={{ width: p(minimo) }} />}
        {tipo === "maximo" &&
          marcas.map((m, i) => (
            <div
              key={m.v}
              className={`absolute inset-y-0 ${i === marcas.length - 1 ? "rounded-r-full" : ""}`}
              style={{ left: p(m.v), right: i + 1 < marcas.length ? `calc(100% - ${p(marcas[i + 1].v)})` : 0, background: m.cor, opacity: 0.22 }}
            />
          ))}
        {realizado != null && <div className="absolute inset-y-0 left-0 rounded-full bg-brand" style={{ width: p(realizado) }} />}
        {projetado != null && (
          <div className="absolute -top-1.5 h-6 w-0.5 bg-ink" style={{ left: p(projetado) }} title={`Projetado: ${fmtPct(projetado)}`}>
            <span className="tnum absolute -top-5 -translate-x-1/2 text-[12px] font-semibold whitespace-nowrap text-ink">proj. {fmtPct(projetado)}</span>
          </div>
        )}
        {marcas.map((m) => (
          <div key={m.v} className="absolute top-3 h-2 w-px bg-ink-3" style={{ left: p(m.v) }}>
            <span className="tnum absolute top-2 -translate-x-1/2 text-[12px] whitespace-nowrap text-ink-3">
              {tipo === "maximo" ? fmtPct(m.v) : `${m.rotulo} ${fmtPct(m.v)}`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Classificacao({ d }: { d: { unidade: string; funcao: string; subfuncao: string; programa: string; acao: string; natureza: string; fonte: string } }) {
  return (
    <span className="tnum text-[12.5px] text-ink-3">
      {d.unidade} · {d.funcao}.{d.subfuncao}.{d.programa}.{d.acao} · {d.natureza} · {d.fonte}
    </span>
  );
}

export function Simulado({ children }: { children: ReactNode }) {
  return <p className="mt-4 max-w-3xl text-[13px] text-ink-3">{children}</p>;
}

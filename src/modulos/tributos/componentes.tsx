// Componentes visuais do módulo de tributos (servidor). Sem dependências de gráfico: SVG e CSS.
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, FlaskConical, Lock } from "lucide-react";
import { fmtData, fmtMoeda } from "@/lib/dates";
import { Chip, type Tone } from "@/components/ui";
import { qrSvgPath } from "./qr";

export function Voltar({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="mb-4 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-ink-2 hover:text-brand-2">
      <ArrowLeft size={15} /> {children}
    </Link>
  );
}

/** Aviso padrão de algo simulado na demonstração. */
export function AvisoDemo({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-[13.5px] leading-snug text-ink">
      <FlaskConical size={17} className="mt-0.5 shrink-0 text-warn" />
      <div>{children}</div>
    </div>
  );
}

export function SemAcesso({ motivo, dica }: { motivo: string; dica?: ReactNode }) {
  return (
    <div className="panel flex items-start gap-3 p-6 text-[15px] text-ink">
      <Lock size={19} className="mt-0.5 shrink-0 text-ink-3" />
      <div>
        <strong className="font-semibold">Acesso não permitido.</strong> {motivo}
        {dica && <div className="mt-2 text-[14px] text-ink-2">{dica}</div>}
      </div>
    </div>
  );
}

export function Titulo({ sobre, titulo, sub, acao }: { sobre?: ReactNode; titulo: ReactNode; sub?: ReactNode; acao?: ReactNode }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-3xl min-w-0">
        {sobre && <div className="mb-1 text-[13.5px] text-ink-3">{sobre}</div>}
        <h1 className="display text-[28px] leading-[1.1] font-semibold text-ink sm:text-[34px]">{titulo}</h1>
        {sub && <p className="mt-2 text-[15px] text-ink-2">{sub}</p>}
      </div>
      {acao}
    </div>
  );
}

export function Numero({ rotulo, valor, sub, tone }: { rotulo: string; valor: ReactNode; sub?: ReactNode; tone?: "bad" | "warn" | "ok" }) {
  const cor = tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : tone === "ok" ? "text-ok" : "text-ink";
  return (
    <div className="panel min-w-0 p-5">
      <div className="text-[13px] font-medium text-ink-3">{rotulo}</div>
      <div className={`display tnum mt-1 text-[24px] leading-tight font-semibold ${cor}`}>{valor}</div>
      {sub && <div className="mt-1 text-[12.5px] leading-snug text-ink-3">{sub}</div>}
    </div>
  );
}

export function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12.5px] text-ink-3">{rotulo}</dt>
      <dd className="mt-0.5 text-[14.5px] text-ink">{children}</dd>
    </div>
  );
}

const SIT_PARCELA: Record<string, { tone: Tone; texto: string }> = {
  PAGA: { tone: "ok", texto: "Paga" },
  CANCELADA: { tone: "neutral", texto: "Não se aplica" },
};

export function ChipParcela({ situacao, vencimento }: { situacao: string; vencimento: string }) {
  if (SIT_PARCELA[situacao]) return <Chip tone={SIT_PARCELA[situacao].tone}>{SIT_PARCELA[situacao].texto}</Chip>;
  // eslint-disable-next-line react-hooks/purity -- situação depende do dia; renderizado no servidor
  const vencida = new Date(vencimento + "T23:59:59").getTime() < Date.now();
  return vencida ? <Chip tone="bad">Vencida</Chip> : <Chip tone="brand">A vencer</Chip>;
}

export function TabelaParcelas({ parcelas }: { parcelas: { id: string; numero: number; vencimento: string; valor: number; desconto: number; situacao: string; pagoEm: Date | null; valorPago: number | null }[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="lista min-w-[520px]">
        <thead>
          <tr>
            <th>Parcela</th>
            <th>Vencimento</th>
            <th className="text-right">Valor</th>
            <th>Situação</th>
            <th>Pagamento</th>
          </tr>
        </thead>
        <tbody>
          {parcelas.map((p) => (
            <tr key={p.id}>
              <td className="font-medium">{p.numero === 0 ? "Cota única" : `${p.numero}ª`}</td>
              <td className="tnum">{fmtData(p.vencimento + "T12:00:00")}</td>
              <td className="tnum text-right">
                {fmtMoeda(p.valor)}
                {p.desconto > 0 && <div className="text-[12px] text-ok">desconto de {fmtMoeda(p.desconto)}</div>}
              </td>
              <td>
                <ChipParcela situacao={p.situacao} vencimento={p.vencimento} />
              </td>
              <td className="tnum text-[13.5px] text-ink-2">{p.pagoEm ? `${fmtData(p.pagoEm)} · ${fmtMoeda(p.valorPago)}` : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** QR Code em SVG puro. */
export function QrCodigo({ texto, tamanho = 132, titulo }: { texto: string; tamanho?: number; titulo?: string }) {
  const { d, tamanho: n } = qrSvgPath(texto);
  return (
    <svg viewBox={`0 0 ${n} ${n}`} width={tamanho} height={tamanho} role="img" aria-label={titulo ?? `QR Code: ${texto}`} shapeRendering="crispEdges" className="shrink-0 rounded-md bg-white">
      <rect width={n} height={n} fill="#fff" />
      <path d={d} fill="#172d36" />
    </svg>
  );
}

/** Barra horizontal de progresso (arrecadado sobre previsto). */
export function Progresso({ valor, total, tone = "brand" }: { valor: number; total: number; tone?: "brand" | "warn" | "bad" | "ok" }) {
  const pct = total > 0 ? Math.min(100, (valor / total) * 100) : 0;
  const cor = { brand: "bg-brand", warn: "bg-warn", bad: "bg-bad", ok: "bg-ok" }[tone];
  return (
    <div className="h-2.5 w-full rounded-full bg-sunken" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
      <div className={`h-2.5 rounded-full ${cor}`} style={{ width: `${Math.max(pct, valor > 0 ? 2 : 0)}%` }} />
    </div>
  );
}

export const moedaCurta = (v: number) =>
  v >= 1_000_000 ? `R$ ${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} mi` : v >= 10_000 ? `R$ ${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : fmtMoeda(v);

export const m2 = (v: number | null) => (v === null ? "—" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`);

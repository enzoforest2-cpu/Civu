import { AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react";
import type { AnaliseFracionamento } from "@/lib/conformidade";
import { fmtMoeda } from "@/lib/dates";

/** Barra do limite de dispensa por natureza no exercício, com o texto que explica a situação. */
export function LimiteDispensa({ a, ug, compacto = false }: { a: AnaliseFracionamento; ug?: string; compacto?: boolean }) {
  const pctComprometido = Math.min(100, (a.comprometido / a.limite) * 100);
  const pctTotal = Math.min(100, (a.total / a.limite) * 100);
  const tom = a.situacao === "excede" ? "bad" : a.situacao === "atencao" ? "warn" : "ok";
  const Icon = a.situacao === "excede" ? ShieldAlert : a.situacao === "atencao" ? AlertTriangle : CheckCircle2;
  const cores = {
    bad: { caixa: "border-bad/25 bg-bad-soft", texto: "text-bad", barra: "bg-bad" },
    warn: { caixa: "border-warn/30 bg-warn-soft", texto: "text-warn", barra: "bg-warn" },
    ok: { caixa: "border-ok/20 bg-ok-soft/60", texto: "text-ok", barra: "bg-ok" },
  }[tom];
  const titulo =
    a.situacao === "excede"
      ? "Passa do limite de dispensa: risco de fracionamento"
      : a.situacao === "atencao"
        ? "Perto do limite de dispensa"
        : "Dentro do limite de dispensa";
  return (
    <div className={`rounded-xl border px-4 py-3.5 ${cores.caixa}`} role={a.situacao === "excede" ? "alert" : undefined}>
      <div className={`flex items-center gap-2 text-[14.5px] font-semibold ${cores.texto}`}>
        <Icon size={17} className="shrink-0" /> {titulo}
      </div>
      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/80 ring-1 ring-black/5" aria-hidden>
        <div className="relative h-full">
          <div className={`absolute inset-y-0 left-0 ${cores.barra} opacity-40`} style={{ width: `${pctTotal}%` }} />
          <div className={`absolute inset-y-0 left-0 ${cores.barra}`} style={{ width: `${pctComprometido}%` }} />
        </div>
      </div>
      <p className="mt-2.5 text-[13.5px] leading-snug text-ink">
        {a.naturezaNome}
        {ug ? ` em ${ug}` : ""}: <strong className="tnum font-semibold">{fmtMoeda(a.comprometido)}</strong> já em dispensas neste ano
        {a.valorNovo > 0 && (
          <>
            {" "}+ <strong className="tnum font-semibold">{fmtMoeda(a.valorNovo)}</strong> deste pedido
          </>
        )}{" "}
        = <strong className="tnum font-semibold">{fmtMoeda(a.total)}</strong> de <span className="tnum">{fmtMoeda(a.limite)}</span> ({Math.round(a.pct * 100)}%).
      </p>
      {!compacto && a.situacao === "excede" && (
        <p className="mt-1.5 text-[13px] text-ink-2">
          A lei soma as despesas de mesma natureza no exercício (Lei 14.133, art. 75, §1º). Acima do limite, a contratação precisa ser por licitação ou
          por outra hipótese com justificativa. O processo pode ser aberto, mas o alerta fica registrado no histórico.
        </p>
      )}
      {!compacto && a.itens.length > 0 && (
        <p className="mt-1.5 text-[12.5px] text-ink-3">Dispensas consideradas: {a.itens.map((i) => `${i.numero} (${fmtMoeda(i.valor)})`).join(" · ")}</p>
      )}
    </div>
  );
}

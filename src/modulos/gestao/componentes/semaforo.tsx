// Selo do semáforo das secretarias: cor sempre acompanhada de ícone e texto (nunca só cor).
import { AlertOctagon, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Chip } from "@/components/ui";
import { NOME_NIVEL, REGRAS_SEMAFORO, type NivelSemaforo, type SinalAvaliado } from "../semaforo";

const ESTILO: Record<NivelSemaforo, { tom: "ok" | "warn" | "bad"; Icone: typeof CheckCircle2; texto: string }> = {
  verde: { tom: "ok", Icone: CheckCircle2, texto: "text-ok" },
  amarelo: { tom: "warn", Icone: AlertTriangle, texto: "text-warn" },
  vermelho: { tom: "bad", Icone: AlertOctagon, texto: "text-bad" },
};

export function SeloSemaforo({ nivel }: { nivel: NivelSemaforo }) {
  const e = ESTILO[nivel];
  return (
    <Chip tone={e.tom}>
      <e.Icone size={13} strokeWidth={2.5} aria-hidden /> {NOME_NIVEL[nivel]}
    </Chip>
  );
}

/** Os quatro sinais, cada um com ícone, nome e o porquê. */
export function ListaSinais({ sinais, compacta = false }: { sinais: SinalAvaliado[]; compacta?: boolean }) {
  return (
    <ul className={compacta ? "space-y-1.5" : "space-y-2.5"}>
      {sinais.map((s) => {
        const e = ESTILO[s.nivel];
        return (
          <li key={s.chave} className="flex items-start gap-2">
            <e.Icone size={15} strokeWidth={2.5} aria-hidden className={`mt-0.5 shrink-0 ${e.texto}`} />
            <span className="min-w-0 text-[13.5px] leading-snug text-ink-2">
              <span className="font-semibold text-ink">{s.rotulo}</span>
              <span className="sr-only"> ({NOME_NIVEL[s.nivel]})</span>: {s.texto}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Como o semáforo é calculado, a partir das mesmas regras do código. */
export function RegrasSemaforo() {
  return (
    <details className="group rounded-xl border border-line bg-white px-4 py-1">
      <summary className="flex min-h-[44px] cursor-pointer items-center text-[14px] font-semibold text-brand-2">Como o semáforo é calculado</summary>
      <div className="pb-4 text-[13.5px] leading-relaxed text-ink-2">
        <p className="mb-2">
          A cor de cada secretaria é a do seu pior sinal. <strong className="font-semibold text-ink">Em dia</strong> quando os quatro estão dentro do esperado.
        </p>
        <ul className="space-y-1.5">
          {REGRAS_SEMAFORO.map((r) => (
            <li key={r.sinal}>
              <span className="font-semibold text-ink">{r.sinal}.</span> Atenção: {r.amarelo}. Crítico: {r.vermelho}.
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}

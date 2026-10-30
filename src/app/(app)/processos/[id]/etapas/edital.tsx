import { Chip, Panel } from "@/components/ui";
import { fmtData } from "@/lib/dates";
import { PRAZO_MINIMO_EDITAL, ROTULO_TIPO, aberturaMinima, type Edital, type Impugnacao, type TipoObjetoEdital } from "@/lib/regras-fluxo";
import { EditalForm } from "./edital-form";
import { Dado, SoConsulta, dataBr, listaDe, metaDe, type PropsEtapa } from "./util";

const TIPOS = (Object.keys(PRAZO_MINIMO_EDITAL) as TipoObjetoEdital[]).map((k) => ({
  chave: k,
  rotulo: `${ROTULO_TIPO[k][0].toUpperCase()}${ROTULO_TIPO[k].slice(1)} (${PRAZO_MINIMO_EDITAL[k]} dias úteis)`,
}));

/** Frase da abertura mínima do edital, para o edital já salvo. */
export function fraseAbertura(e: Edital, feriados: Set<string>): string | undefined {
  if (!(e.tipoObjeto in PRAZO_MINIMO_EDITAL) || !e.publicadoEm) return undefined;
  return `Abertura a partir de ${dataBr(aberturaMinima(e.publicadoEm, e.tipoObjeto, feriados))}: ${PRAZO_MINIMO_EDITAL[e.tipoObjeto]} dias úteis (art. 55)`;
}

/** Publicação do edital: número, tipo de objeto (define o prazo mínimo), datas e plataforma. */
export function PainelEdital({ p, pode, feriados }: PropsEtapa) {
  const meta = metaDe(p);
  const edital = meta.edital as Edital | undefined;
  const anteriores = listaDe<{ edital?: Edital | null; impugnacoes?: Impugnacao[]; arquivadoEm?: string }>(meta.historicoEditais).filter((h) => h?.edital);
  return (
    <Panel title="Edital" action={edital ? <Chip tone="ok">Publicado</Chip> : <Chip tone="warn">A publicar</Chip>}>
      <p className="text-[14px] text-ink-2">O tipo de objeto define o prazo mínimo entre a publicação e a abertura, em dias úteis (Lei 14.133, art. 55).</p>
      {pode ? (
        <EditalForm processoId={p.id} tipos={TIPOS} atual={edital} aberturaInicial={edital ? fraseAbertura(edital, feriados) : undefined} />
      ) : edital ? (
        <>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <Dado rotulo="Número">{edital.numero}</Dado>
            <Dado rotulo="Plataforma">{edital.plataforma}</Dado>
            <Dado rotulo="Publicado em">{dataBr(edital.publicadoEm)}</Dado>
            <Dado rotulo="Abertura em">{dataBr(edital.aberturaEm)}</Dado>
          </dl>
          <SoConsulta />
        </>
      ) : (
        <SoConsulta>Compras ainda não publicou o edital.</SoConsulta>
      )}
      {anteriores.length > 0 && (
        <details className="mt-5 rounded-xl border border-line open:bg-sunken/50">
          <summary className="px-4 py-3 text-[14px] font-semibold text-ink-2">Editais anteriores ({anteriores.length})</summary>
          <ul className="space-y-1.5 px-4 pb-4 text-[13.5px] text-ink-2">
            {anteriores.map((h, i) => (
              <li key={i}>
                {h.edital!.numero} · publicado em {dataBr(h.edital!.publicadoEm)}, abertura em {dataBr(h.edital!.aberturaEm)}
                {h.arquivadoEm ? ` · substituído em ${fmtData(h.arquivadoEm)}` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Panel>
  );
}

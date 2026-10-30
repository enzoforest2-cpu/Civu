import Link from "next/link";
import { ExternalLink, MapPin } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { fmtData, fmtMoeda } from "@/lib/dates";
import { Cabecalho, Vazio } from "@/components/ui";
import { listarContratos } from "@/modulos/contratos/dados";
import { dataLocal, rotuloMes } from "@/modulos/contratos/regras";
import { BarraPct, ChipObra, CurvaS, pct } from "@/modulos/contratos/componentes";

export default async function ObrasGestaoPage() {
  const u = await requireUser();
  const obras = (await listarContratos(u.municipioId)).filter((c) => c.obra);
  const ordem = { PARALISADA: 0, ATRASADA: 1, EM_DIA: 2, NAO_INICIADA: 3, CONCLUIDA: 4 };
  obras.sort((a, b) => ordem[a.obra!.situacao] - ordem[b.obra!.situacao]);
  return (
    <>
      <Cabecalho
        titulo="Obras"
        sub="Avanço físico medido pela fiscalização comparado ao cronograma. Desvio acima de 10 pontos marca a obra como atrasada."
        acao={
          <Link href="/obras" className="btn btn-quiet">
            Página pública <ExternalLink size={15} />
          </Link>
        }
      />
      {obras.length === 0 ? (
        <Vazio>Nenhum contrato de obra cadastrado. Crie um contrato com natureza “Obra” ou “Reforma” para acompanhar o cronograma.</Vazio>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          {obras.map((c) => {
            const o = c.obra!;
            return (
              <article key={c.id} className="panel flex flex-col p-6">
                <div className="flex flex-wrap items-center gap-2">
                  <ChipObra s={o.situacao} />
                  <span className="tnum text-[13px] text-ink-3">Contrato {c.rotulo}</span>
                </div>
                <h2 className="mt-2 text-[17px] leading-snug font-semibold text-ink">
                  <Link href={`/contratos/${c.id}#obra`} className="hover:text-brand">
                    {c.objeto}
                  </Link>
                </h2>
                <p className="mt-1 flex items-start gap-1.5 text-[13.5px] text-ink-2">
                  <MapPin size={14} className="mt-0.5 shrink-0 text-ink-3" /> {c.obraLocal}
                </p>
                <div className="mt-4 grid grid-cols-3 gap-3 text-[13px]">
                  <div>
                    <div className="text-ink-3">Executado</div>
                    <div className="display tnum text-[19px] font-semibold text-ink">{pct(o.fisico, 0)}</div>
                  </div>
                  <div>
                    <div className="text-ink-3">Previsto até {o.refMes ? rotuloMes(o.refMes) : "—"}</div>
                    <div className="display tnum text-[19px] font-semibold text-ink">{pct(o.previstoRef, 0)}</div>
                  </div>
                  <div>
                    <div className="text-ink-3">Valor</div>
                    <div className="display tnum text-[15px] font-semibold text-ink">{fmtMoeda(c.fin.valorAtual)}</div>
                  </div>
                </div>
                <div className="mt-3">
                  <BarraPct valor={o.fisico} previsto={o.previstoRef} tone={o.situacao === "ATRASADA" || o.situacao === "PARALISADA" ? "bad" : "brand"} />
                </div>
                <div className="mt-5">
                  <CurvaS obra={o} />
                </div>
                <div className="mt-auto pt-4 text-[13px] text-ink-2">
                  {c.empresa.razaoSocial} · término previsto {fmtData(c.obraPrevisaoFim ? dataLocal(c.obraPrevisaoFim) : null)} · fiscal {c.fiscal?.nome ?? "—"}
                </div>
                {c.obraMotivo && <p className="mt-2 rounded-lg bg-warn-soft px-3 py-2 text-[13px] text-ink">{c.obraMotivo}</p>}
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}

import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { CircleCheck } from "lucide-react";
import { db } from "@/db";
import { tribGuias, municipios } from "@/db/schema";
import { requirePortal } from "@/lib/portal";
import { donoPortalOuMotivo } from "@/modulos/tributos/dados";
import { AvisoDemo, QrCodigo, SemAcesso, Voltar } from "@/modulos/tributos/componentes";
import { fmtDocumento } from "@/modulos/tributos/regras";
import { simularPagamentoAction } from "@/modulos/tributos/acoes";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { fmtData, fmtDataHora, fmtMoeda } from "@/lib/dates";
import { Chip } from "@/components/ui";

export default async function Guia({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ acordo?: string }> }) {
  const s = await requirePortal();
  const { id } = await params;
  const sp = await searchParams;
  const { dono, motivo } = donoPortalOuMotivo(s, "TRIBUTOS");
  if (!dono) return <SemAcesso motivo={motivo} />;
  const g = await db.query.tribGuias.findFirst({ where: eq(tribGuias.id, id) });
  if (!g) notFound();
  if (g.contribuinteDocumento !== dono.documento) return <SemAcesso motivo="Esta guia é de outro contribuinte." />;
  const mun = await db.query.municipios.findFirst({ where: eq(municipios.id, g.municipioId) });
  const paga = g.situacao === "PAGA";
  return (
    <>
      <Voltar href="/portal/guias">Emitir guia</Voltar>
      {sp.acordo && !paga && (
        <div className="mb-4 rounded-xl border border-ok/30 bg-ok-soft px-4 py-3 text-[14px] text-ok">
          Acordo registrado. A dívida fica com a exigibilidade suspensa enquanto as parcelas forem pagas em dia. Esta é a guia da primeira parcela.
        </div>
      )}
      <article className="panel mx-auto max-w-3xl overflow-hidden">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line bg-sunken px-6 py-4">
          <div>
            <div className="text-[12.5px] font-semibold tracking-wide text-ink-3 uppercase">Documento de arrecadação municipal</div>
            <div className="display text-[20px] font-semibold text-ink">
              Prefeitura de {mun?.nome} – {mun?.uf}
            </div>
          </div>
          <div className="text-right">
            <div className="tnum text-[14px] font-semibold text-ink">{g.numero}</div>
            <div className="mt-1">{paga ? <Chip tone="ok">Paga em {fmtDataHora(g.pagaEm)}</Chip> : <Chip tone="warn">Demonstração — não pague</Chip>}</div>
          </div>
        </header>
        <div className="grid gap-x-8 gap-y-4 px-6 py-5 sm:grid-cols-2">
          <div>
            <div className="text-[12.5px] text-ink-3">Contribuinte</div>
            <div className="text-[15px] font-semibold text-ink">{g.contribuinteNome}</div>
            <div className="tnum text-[13.5px] text-ink-2">{fmtDocumento(g.contribuinteDocumento)}</div>
          </div>
          <div>
            <div className="text-[12.5px] text-ink-3">Referente a</div>
            <div className="text-[14px] text-ink">{g.descricao}</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-px border-y border-line bg-line sm:grid-cols-4">
          {[
            ["Vencimento", fmtData(g.vencimento + "T12:00:00")],
            ["Principal", fmtMoeda(g.valorPrincipal)],
            ["Multa, juros e correção", fmtMoeda(g.acrescimos)],
            ["Total a pagar", fmtMoeda(g.valorTotal)],
          ].map(([r, v], i) => (
            <div key={r} className="bg-surface px-5 py-3">
              <div className="text-[12px] text-ink-3">{r}</div>
              <div className={`tnum ${i === 3 ? "display text-[20px] font-semibold text-ink" : "text-[15px] text-ink"}`}>{v}</div>
            </div>
          ))}
        </div>
        <div className="grid gap-6 px-6 py-5 sm:grid-cols-[1fr_auto]">
          <div className="min-w-0 space-y-4">
            <div>
              <div className="text-[12.5px] text-ink-3">Linha digitável (fictícia)</div>
              <div className="tnum mt-1 rounded-lg bg-sunken px-3 py-2 font-mono text-[13px] break-all text-ink">{g.linhaDigitavel}</div>
            </div>
            <div>
              <div className="text-[12.5px] text-ink-3">PIX copia e cola (fictício)</div>
              <div className="mt-1 rounded-lg bg-sunken px-3 py-2 font-mono text-[11.5px] leading-relaxed break-all text-ink-2">{g.pixCopiaCola}</div>
            </div>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className={paga ? "opacity-30" : ""}>
              <QrCodigo texto={g.pixCopiaCola} tamanho={150} titulo="QR Code PIX de demonstração" />
            </div>
            <span className="text-[12px] text-ink-3">PIX de demonstração</span>
          </div>
        </div>
      </article>
      <div className="mx-auto mt-5 max-w-3xl space-y-4">
        <AvisoDemo>
          Linha digitável e PIX são <strong className="font-semibold">fictícios</strong> e não têm valor de pagamento. Para testar o caminho completo, use o botão abaixo: ele simula o aviso do banco e atualiza parcelas, certidão e
          propriedade (no caso do ITBI).
        </AvisoDemo>
        {paga ? (
          <div className="flex items-center gap-2 rounded-xl bg-ok-soft px-4 py-3 text-[14.5px] text-ok">
            <CircleCheck size={18} /> Pagamento confirmado. A situação dos débitos já foi atualizada.
          </div>
        ) : (
          <ActionForm action={simularPagamentoAction} resetOnOk={false}>
            <input type="hidden" name="guiaId" value={g.id} />
            <SubmitButton className="btn btn-quiet" pendingText="Confirmando…">
              Simular pagamento (demonstração)
            </SubmitButton>
          </ActionForm>
        )}
      </div>
    </>
  );
}

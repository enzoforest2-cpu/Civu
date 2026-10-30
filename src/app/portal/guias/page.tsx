import Link from "next/link";
import { CircleCheck, Gavel } from "lucide-react";
import { requirePortal } from "@/lib/portal";
import { debitosEmAberto, dividasDoDono, donoPortalOuMotivo, guiasDoDono } from "@/modulos/tributos/dados";
import { AvisoDemo, SemAcesso, Titulo } from "@/modulos/tributos/componentes";
import { FormGuia } from "@/modulos/tributos/form-guia";
import { fmtData, fmtMoeda } from "@/lib/dates";
import { Chip, Panel } from "@/components/ui";

export default async function EmitirGuia() {
  const s = await requirePortal();
  const { dono, motivo } = donoPortalOuMotivo(s, "TRIBUTOS");
  if (!dono) return <SemAcesso motivo={motivo} dica="Peça ao responsável legal da empresa para incluir “Tributos e guias” na sua representação." />;
  const [debitos, dividas, guias] = await Promise.all([debitosEmAberto(dono), dividasDoDono(dono), guiasDoDono(dono)]);
  const daAbertas = dividas.filter((d) => d.situacao === "ATIVA" || d.situacao === "AJUIZADA");
  const vencidos = debitos.filter((d) => d.vencida);
  return (
    <>
      <Titulo
        sobre={dono.tipo === "EMPRESA" ? dono.nome : "Em nome próprio"}
        titulo="Emitir guia"
        sub="Marque o que quer pagar e gere uma guia com código de barras e PIX. Pode juntar vários débitos numa guia só."
      />
      <div className="mb-6">
        <AvisoDemo>
          <strong className="font-semibold">Demonstração.</strong> A guia gerada aqui tem linha digitável e PIX fictícios: não é possível pagá-la em banco. A integração bancária de verdade depende do convênio do município.
        </AvisoDemo>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <Panel title="Débitos em aberto" action={vencidos.length > 0 && <Chip tone="bad">{vencidos.length === 1 ? "1 vencido" : `${vencidos.length} vencidos`}</Chip>}>
            {debitos.length === 0 ? (
              <div className="flex items-center gap-2 rounded-xl bg-ok-soft px-4 py-3 text-[14.5px] text-ok">
                <CircleCheck size={18} /> Nenhum débito em aberto. Tudo em dia.
              </div>
            ) : (
              <FormGuia debitos={debitos} />
            )}
          </Panel>
          {daAbertas.length > 0 && (
            <Panel title="Dívida ativa">
              <p className="text-[14px] text-ink-2">
                {daAbertas.length === 1 ? "Há 1 débito inscrito" : `Há ${daAbertas.length} débitos inscritos`} em dívida ativa, somando{" "}
                <span className="tnum font-semibold text-ink">{fmtMoeda(daAbertas.reduce((a, d) => a + d.atual.total, 0))}</span> com correção, multa e juros. Para pagar, faça um acordo à vista (com desconto nos acréscimos) ou parcelado.
              </p>
              <Link href="/portal/parcelamento" className="btn btn-primary mt-4">
                <Gavel size={16} /> Simular pagamento ou parcelamento
              </Link>
            </Panel>
          )}
        </div>
        <aside>
          <Panel title="Guias emitidas">
            {guias.length === 0 ? (
              <p className="text-[14px] text-ink-3">Nenhuma guia emitida ainda.</p>
            ) : (
              <ul className="divide-y divide-line">
                {guias.map((g) => (
                  <li key={g.id}>
                    <Link href={`/portal/guias/${g.id}`} className="block py-2.5 hover:text-brand">
                      <div className="flex items-center justify-between gap-2">
                        <span className="tnum text-[13px] font-semibold text-ink">{g.numero}</span>
                        <Chip tone={g.situacao === "PAGA" ? "ok" : "brand"}>{g.situacao === "PAGA" ? "Paga" : `Vence ${fmtData(g.vencimento + "T12:00:00")}`}</Chip>
                      </div>
                      <div className="mt-0.5 line-clamp-2 text-[13px] text-ink-2">{g.descricao}</div>
                      <div className="tnum text-[13px] font-semibold text-ink">{fmtMoeda(g.valorTotal)}</div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </aside>
      </div>
    </>
  );
}

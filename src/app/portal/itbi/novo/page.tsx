import Link from "next/link";
import { and, eq, isNull, ne } from "drizzle-orm";
import { Search } from "lucide-react";
import { db } from "@/db";
import { tribImoveis, tribProprietarios } from "@/db/schema";
import { requirePortal } from "@/lib/portal";
import { donoPortalOuMotivo, municipioPortal, nomeProprietario } from "@/modulos/tributos/dados";
import { AvisoDemo, SemAcesso, Titulo, Voltar } from "@/modulos/tributos/componentes";
import { NATUREZA_ITBI, USO_NOME, fmtDocumento } from "@/modulos/tributos/regras";
import { pedirItbiAction } from "@/modulos/tributos/acoes";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { fmtMoeda } from "@/lib/dates";
import { Panel } from "@/components/ui";

export default async function NovoItbi({ searchParams }: { searchParams: Promise<{ inscricao?: string }> }) {
  const s = await requirePortal();
  const sp = await searchParams;
  const { dono, motivo } = donoPortalOuMotivo(s, "TRIBUTOS");
  if (!dono) return <SemAcesso motivo={motivo} />;
  const mun = await municipioPortal();
  const inscricao = sp.inscricao?.trim();
  const im = inscricao
    ? await db.query.tribImoveis.findFirst({
        where: and(eq(tribImoveis.municipioId, mun.id), eq(tribImoveis.inscricao, inscricao)),
        with: { proprietarios: { where: isNull(tribProprietarios.ate), with: { pessoa: true, empresa: true } } },
      })
    : null;
  const exemplo = !inscricao
    ? await db.query.tribImoveis.findFirst({ where: and(eq(tribImoveis.municipioId, mun.id), eq(tribImoveis.uso, "RESIDENCIAL"), eq(tribImoveis.bairro, "Jardim América"), ne(tribImoveis.inscricao, "")) })
    : null;

  return (
    <>
      <Voltar href="/portal/itbi">ITBI</Voltar>
      <Titulo sobre={dono.tipo === "EMPRESA" ? `Comprador: ${dono.nome}` : "Comprador: você"} titulo="Declarar compra de imóvel" sub="Informe a inscrição imobiliária do imóvel (está no carnê do IPTU ou na certidão da matrícula)." />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <Panel title="1. Qual imóvel?">
            <form method="get" className="flex flex-wrap items-end gap-3">
              <div className="min-w-0 flex-1">
                <label className="label" htmlFor="inscricao">
                  Inscrição imobiliária
                </label>
                <input id="inscricao" name="inscricao" defaultValue={inscricao} className="input tnum" placeholder="00.000.0000.000" required />
              </div>
              <button className="btn btn-quiet">
                <Search size={16} /> Buscar
              </button>
            </form>
            {exemplo && <p className="hint mt-2">Para testar a demonstração, use a inscrição {exemplo.inscricao}.</p>}
            {inscricao && !im && <p className="mt-3 text-[14px] text-bad">Não encontramos imóvel com a inscrição {inscricao}. Confira os números.</p>}
            {im && (
              <div className="mt-4 rounded-xl border border-line bg-sunken px-4 py-3 text-[14px]">
                <div className="font-semibold text-ink">
                  {im.logradouro}, {im.numero}
                  {im.complemento ? ` — ${im.complemento}` : ""} · {im.bairro}
                </div>
                <div className="text-ink-2">
                  {USO_NOME[im.uso]} · {im.areaConstruida > 0 ? `${im.areaConstruida.toLocaleString("pt-BR")} m² construídos` : `${im.areaTerreno.toLocaleString("pt-BR")} m² de terreno`} · valor venal {fmtMoeda(im.valorVenal)}
                </div>
                <div className="mt-1 text-ink-2">
                  Proprietário no cadastro (vendedor): <strong className="font-semibold text-ink">{im.proprietarios.map(nomeProprietario).join(", ") || "—"}</strong>
                </div>
              </div>
            )}
          </Panel>

          {im && (
            <Panel title="2. Dados da transação">
              <ActionForm action={pedirItbiAction} resetOnOk={false} className="space-y-4">
                <input type="hidden" name="inscricao" value={im.inscricao} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor="natureza">
                      Tipo de transação
                    </label>
                    <select id="natureza" name="natureza" className="input">
                      {Object.entries(NATUREZA_ITBI).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="valor">
                      Valor da transação (R$)
                    </label>
                    <input id="valor" name="valor" inputMode="decimal" className="input tnum" placeholder="450.000,00" required />
                  </div>
                </div>
                <fieldset>
                  <legend className="label">Parte do valor é financiada pelo Sistema Financeiro da Habitação?</legend>
                  <div className="flex flex-wrap gap-4 text-[14px]">
                    <label className="flex items-center gap-2">
                      <input type="radio" name="financiado" value="nao" defaultChecked className="accent-[var(--color-brand)]" /> Não
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="radio" name="financiado" value="sim" className="accent-[var(--color-brand)]" /> Sim
                    </label>
                  </div>
                </fieldset>
                <div className="sm:w-1/2">
                  <label className="label" htmlFor="valorFinanciado">
                    Valor financiado (se houver)
                  </label>
                  <input id="valorFinanciado" name="valorFinanciado" inputMode="decimal" className="input tnum" placeholder="0,00" />
                  <p className="hint">A parte financiada pelo SFH paga alíquota de 0,5%; o restante, 2%.</p>
                </div>
                <div className="rounded-xl bg-sunken px-4 py-3 text-[13.5px] text-ink-2">
                  <div>
                    Comprador: <strong className="font-semibold text-ink">{dono.nome}</strong> · {fmtDocumento(dono.documento)}
                  </div>
                  <div>
                    Vendedor: <strong className="font-semibold text-ink">{im.proprietarios.map(nomeProprietario).join(", ") || "—"}</strong>
                  </div>
                </div>
                <label className="flex items-start gap-2 text-[13.5px] text-ink-2">
                  <input type="checkbox" name="declaro" value="sim" className="mt-0.5 h-4 w-4 accent-[var(--color-brand)]" />
                  Declaro que as informações são verdadeiras e que o valor informado é o valor real do negócio.
                </label>
                <SubmitButton pendingText="Enviando…">Enviar declaração</SubmitButton>
              </ActionForm>
            </Panel>
          )}
        </div>
        <aside className="space-y-4">
          <Panel title="Como funciona">
            <ol className="list-decimal space-y-2 pl-4 text-[13.5px] text-ink-2">
              <li>Você declara o valor do negócio.</li>
              <li>A tributação compara com a referência fiscal: a mediana do m² dos negócios quitados no bairro nos últimos 24 meses.</li>
              <li>O imposto é calculado sobre o maior dos dois valores, com a memória de cálculo visível.</li>
              <li>Se discordar, você contesta com laudo ou outras provas antes de pagar.</li>
              <li>Pago o ITBI, o cadastro passa o imóvel para o seu nome. O registro no cartório continua necessário.</li>
            </ol>
          </Panel>
          <AvisoDemo>O envio de documentos (contrato, matrícula) ao cartório não faz parte desta demonstração.</AvisoDemo>
          <Link href="/portal/itbi" className="block text-center text-[13.5px] font-semibold text-brand-2 hover:underline">
            Ver minhas declarações
          </Link>
        </aside>
      </div>
    </>
  );
}

import { notFound } from "next/navigation";
import { requirePortal } from "@/lib/portal";
import { carregarImovel, debitosEmAberto, dividasDoDono, donoPortalOuMotivo, imovelDoDono, nomeProprietario, resumoParcelas } from "@/modulos/tributos/dados";
import { Campo, SemAcesso, TabelaParcelas, Titulo, Voltar } from "@/modulos/tributos/componentes";
import { FormGuia } from "@/modulos/tributos/form-guia";
import { PADRAO_NOME, USO_NOME, type MemoriaValorVenal } from "@/modulos/tributos/regras";
import { fmtData, fmtMoeda } from "@/lib/dates";
import { Chip, Panel } from "@/components/ui";
import Link from "next/link";
import { db } from "@/db";

export default async function MeuImovel({ params }: { params: Promise<{ id: string }> }) {
  const s = await requirePortal();
  const { id } = await params;
  const { dono, motivo } = donoPortalOuMotivo(s, "TRIBUTOS");
  if (!dono) return <SemAcesso motivo={motivo} />;
  if (!(await imovelDoDono(dono, id))) return <SemAcesso motivo="Este imóvel não está no cadastro em nome de quem você está representando agora." />;
  const imBase = await db.query.tribImoveis.findFirst({ where: (t, { eq }) => eq(t.id, id) });
  if (!imBase) notFound();
  const im = await carregarImovel(imBase.municipioId, id);
  if (!im) notFound();
  const ano = new Date().getFullYear();
  const atual = im.lancamentos.find((l) => l.tributo === "IPTU" && l.exercicio === ano);
  const resumo = atual ? resumoParcelas(atual.parcelas) : null;
  const debitos = (await debitosEmAberto(dono)).filter((d) => im.lancamentos.some((l) => l.id === d.lancamentoId));
  const dividas = (await dividasDoDono(dono)).filter((d) => im.lancamentos.some((l) => l.id === d.lancamentoId));
  const mem = im.memoriaValor as MemoriaValorVenal | null;
  const atuais = im.proprietarios.filter((p) => !p.ate);
  return (
    <>
      <Voltar href="/portal/imoveis">Meus imóveis</Voltar>
      <Titulo
        sobre={`Inscrição imobiliária ${im.inscricao}`}
        titulo={`${im.logradouro}, ${im.numero}${im.complemento ? ` — ${im.complemento}` : ""}`}
        sub={`${im.bairro} · ${USO_NOME[im.uso]}`}
      />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <Panel
            title={`IPTU ${ano}`}
            action={resumo && <Chip tone={resumo.situacao.tone}>{resumo.situacao.texto}</Chip>}
          >
            {atual ? (
              <>
                <p className="mb-4 text-[14px] text-ink-2">
                  Valor do imposto <span className="tnum font-semibold text-ink">{fmtMoeda(atual.valor)}</span>: {((atual.aliquota ?? 0) * 100).toLocaleString("pt-BR")}% sobre o valor venal de{" "}
                  <span className="tnum">{fmtMoeda(atual.baseCalculo)}</span>. Cota única com 10% de desconto até 10/03 ou 10 parcelas de março a dezembro.
                </p>
                <TabelaParcelas parcelas={atual.parcelas} />
              </>
            ) : (
              <p className="text-[14px] text-ink-2">O IPTU deste exercício ainda não foi lançado.</p>
            )}
          </Panel>

          {debitos.length > 0 && (
            <Panel title="Pagar">
              <FormGuia debitos={debitos} />
            </Panel>
          )}

          {dividas.length > 0 && (
            <Panel title="Débitos em dívida ativa">
              <ul className="divide-y divide-line">
                {dividas.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-[14px]">
                    <span>
                      <span className="font-medium text-ink">{d.lancamento.descricao.split(" — ")[0]}</span>
                      <span className="text-ink-3"> · inscrição {d.numeroInscricao}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <Chip tone={d.situacao === "PARCELADA" ? "brand" : d.situacao === "QUITADA" ? "ok" : "bad"}>{d.situacao === "ATIVA" ? "Em aberto" : d.situacao === "PARCELADA" ? "Parcelada" : d.situacao === "QUITADA" ? "Quitada" : "Em cobrança judicial"}</Chip>
                      <span className="tnum font-semibold text-ink">{fmtMoeda(d.situacao === "ATIVA" || d.situacao === "AJUIZADA" ? d.atual.total : d.valorOriginal)}</span>
                    </span>
                  </li>
                ))}
              </ul>
              {dividas.some((d) => d.situacao === "ATIVA") && (
                <Link href="/portal/parcelamento" className="btn btn-quiet mt-4">
                  Simular parcelamento
                </Link>
              )}
            </Panel>
          )}

          <Panel title="Lançamentos anteriores">
            <ul className="divide-y divide-line">
              {im.lancamentos
                .filter((l) => !(l.tributo === "IPTU" && l.exercicio === ano))
                .map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-[14px]">
                    <span className="text-ink">{l.descricao.split(" — ")[0]}</span>
                    <span className="flex items-center gap-2">
                      <span className="tnum text-ink-2">{fmtMoeda(l.valor)}</span>
                      <Chip tone={l.situacao === "PAGO" ? "ok" : l.situacao === "DIVIDA_ATIVA" ? "bad" : l.situacao === "CANCELADO" ? "neutral" : "warn"}>
                        {l.situacao === "PAGO" ? "Pago" : l.situacao === "DIVIDA_ATIVA" ? "Em dívida ativa" : l.situacao === "CANCELADO" ? "Cancelado" : "Em aberto"}
                      </Chip>
                    </span>
                  </li>
                ))}
              {im.lancamentos.filter((l) => !(l.tributo === "IPTU" && l.exercicio === ano)).length === 0 && <li className="py-2 text-[14px] text-ink-3">Sem outros lançamentos registrados.</li>}
            </ul>
          </Panel>
        </div>

        <aside className="space-y-6">
          <Panel title="Cadastro">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Campo rotulo="Área do terreno">{im.areaTerreno.toLocaleString("pt-BR")} m²</Campo>
              <Campo rotulo="Área construída">{im.areaConstruida.toLocaleString("pt-BR")} m²</Campo>
              <Campo rotulo="Padrão">{PADRAO_NOME[im.padrao]}</Campo>
              <Campo rotulo="Construção">{im.anoConstrucao ?? "—"}</Campo>
              <Campo rotulo="Quadra / lote">
                {im.quadra} / {im.lote}
              </Campo>
              <Campo rotulo="CEP">{im.cep ?? "—"}</Campo>
            </dl>
            <div className="mt-4 border-t border-line pt-3">
              <div className="text-[12.5px] text-ink-3">Proprietários</div>
              <ul className="mt-1 space-y-0.5 text-[14px] text-ink">
                {atuais.map((p) => (
                  <li key={p.id}>
                    {nomeProprietario(p)} {p.fracao < 100 && <span className="text-ink-3">({p.fracao.toLocaleString("pt-BR")}%)</span>}
                  </li>
                ))}
              </ul>
            </div>
          </Panel>
          {mem && (
            <Panel title="Como o valor venal é calculado">
              <dl className="space-y-2 text-[13.5px]">
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-2">
                    Terreno: {mem.areaTerreno.toLocaleString("pt-BR")} m² × {fmtMoeda(mem.m2Terreno)}
                  </dt>
                  <dd className="tnum text-ink">{fmtMoeda(mem.valorTerreno)}</dd>
                </div>
                {mem.areaConstruida > 0 && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-2">
                      Construção: {mem.areaConstruida.toLocaleString("pt-BR")} m² × {fmtMoeda(mem.m2Construcao)} × padrão {mem.fatorPadrao.toLocaleString("pt-BR")} × idade {mem.fatorIdade.toLocaleString("pt-BR")}
                    </dt>
                    <dd className="tnum text-ink">{fmtMoeda(mem.valorConstrucao)}</dd>
                  </div>
                )}
                <div className="flex justify-between gap-3 border-t border-line pt-2 font-semibold">
                  <dt>Valor venal {mem.exercicio}</dt>
                  <dd className="tnum">{fmtMoeda(mem.valorVenal)}</dd>
                </div>
              </dl>
              <p className="mt-3 text-[12.5px] leading-snug text-ink-3">
                Valores do m² da planta genérica de valores do bairro {mem.bairro}. Se algum dado do cadastro estiver errado, peça revisão pelo protocolo — a área e o padrão mudam o valor.
              </p>
            </Panel>
          )}
          {im.itbis.length > 0 && (
            <Panel title="Transmissões (ITBI)">
              <ul className="space-y-1 text-[13.5px] text-ink-2">
                {im.itbis.map((i) => (
                  <li key={i.id}>
                    {i.numero} · {fmtData(i.declaradoEm)}
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </aside>
      </div>
    </>
  );
}

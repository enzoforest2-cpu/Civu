import Link from "next/link";
import { notFound } from "next/navigation";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { tribDividaAtiva } from "@/db/schema";
import { carregarImovel, comparaveis, nomeProprietario, requireTributos, resumoParcelas } from "@/modulos/tributos/dados";
import { Campo, TabelaParcelas, Titulo, Voltar } from "@/modulos/tributos/componentes";
import { PADRAO_NOME, SITUACAO_ITBI, TRIBUTO_NOME, USO_NOME, atualizar, mascararDocumento, mediana, type MemoriaValorVenal } from "@/modulos/tributos/regras";
import { fmtData, fmtMoeda } from "@/lib/dates";
import { Chip, Panel } from "@/components/ui";

export default async function FichaImovel({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireTributos();
  const { id } = await params;
  const im = await carregarImovel(u.municipioId, id);
  if (!im) notFound();
  const mem = im.memoriaValor as MemoriaValorVenal | null;
  const comps = im.uso !== "TERRENO" ? await comparaveis(u.municipioId, im.bairro, im.uso) : [];
  const med = mediana(comps.map((c) => c.m2));
  const das = await db.query.tribDividaAtiva.findMany({ where: inArray(tribDividaAtiva.lancamentoId, im.lancamentos.map((l) => l.id).concat("—")) });
  const atuais = im.proprietarios.filter((p) => !p.ate);
  const anteriores = im.proprietarios.filter((p) => p.ate);
  const doc = (p: (typeof im.proprietarios)[number]) => mascararDocumento(p.pessoa?.cpf ?? p.empresa?.cnpj ?? "");
  return (
    <>
      <Voltar href="/tributos/imoveis">Cadastro imobiliário</Voltar>
      <Titulo sobre={`Inscrição ${im.inscricao} · quadra ${im.quadra}, lote ${im.lote}`} titulo={`${im.logradouro}, ${im.numero}${im.complemento ? ` — ${im.complemento}` : ""}`} sub={`${im.bairro} · ${USO_NOME[im.uso]}`} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Panel title="Lançamentos">
            <div className="space-y-3">
              {im.lancamentos.map((l) => {
                const r = l.parcelas.length ? resumoParcelas(l.parcelas) : null;
                const da = das.find((d) => d.lancamentoId === l.id);
                return (
                  <details key={l.id} className="rounded-xl border border-line" open={l.tributo === "IPTU" && l.exercicio === new Date().getFullYear()}>
                    <summary className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                      <span className="font-medium text-ink">
                        {TRIBUTO_NOME[l.tributo]} {l.tributo === "IPTU" ? l.exercicio : l.descricao.split(" — ")[0].replace(/^ITBI /, "")}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="tnum text-[14px] text-ink-2">{fmtMoeda(l.valor)}</span>
                        {da ? (
                          <Chip tone="bad">Dívida ativa {da.numeroInscricao}</Chip>
                        ) : l.situacao === "CANCELADO" ? (
                          <Chip>Cancelado</Chip>
                        ) : r ? (
                          <Chip tone={r.situacao.tone}>{r.situacao.texto}</Chip>
                        ) : null}
                      </span>
                    </summary>
                    <div className="border-t border-line px-2 pb-2">
                      {l.parcelas.length ? (
                        <TabelaParcelas parcelas={l.parcelas} />
                      ) : (
                        <p className="px-2 py-3 text-[13.5px] text-ink-2">
                          {da ? `Inscrito em ${fmtData(da.inscritaEm + "T12:00:00")}; valor atualizado ${fmtMoeda(atualizar(da.valorOriginal, da.vencimentoOriginal).total)} (${da.situacao.toLowerCase()}).` : "Sem parcelas."}
                        </p>
                      )}
                      <p className="px-2 pt-1 text-[12.5px] text-ink-3">
                        Base {fmtMoeda(l.baseCalculo)}
                        {l.aliquota ? ` × ${(l.aliquota * 100).toLocaleString("pt-BR")}%` : ""} · lançado em {fmtData(l.lancadoEm)}
                      </p>
                    </div>
                  </details>
                );
              })}
            </div>
          </Panel>

          <Panel title={`Comparáveis no bairro ${im.bairro}`} action={<span className="text-[12.5px] text-ink-3">ITBI quitado · 24 meses · mesmo uso</span>}>
            {im.uso === "TERRENO" ? (
              <p className="text-[14px] text-ink-2">Terrenos não são comparados por m² construído. A referência fiscal mínima é o valor venal; vendas de terreno pedem avaliação individual.</p>
            ) : comps.length === 0 ? (
              <p className="text-[14px] text-ink-2">Nenhuma transação comparável registrada. Sem amostra, nenhuma conclusão sobre valor de mercado deve ser tirada.</p>
            ) : (
              <>
                <p className="mb-3 text-[14px] text-ink-2">
                  Mediana de <span className="tnum font-semibold text-ink">{fmtMoeda(med)}/m²</span> em {comps.length} {comps.length === 1 ? "transação" : "transações"}. Aplicada aos {im.areaConstruida.toLocaleString("pt-BR")} m² deste imóvel:{" "}
                  <span className="tnum font-semibold text-ink">{fmtMoeda((med ?? 0) * im.areaConstruida)}</span> — contra o valor venal de <span className="tnum">{fmtMoeda(im.valorVenal)}</span>.
                  {comps.length < 5 && <span className="text-warn"> Amostra pequena: confiança baixa.</span>}
                </p>
                <div className="overflow-x-auto">
                  <table className="lista min-w-[480px]">
                    <thead>
                      <tr>
                        <th>ITBI</th>
                        <th>Quitado em</th>
                        <th className="text-right">Área</th>
                        <th>Padrão</th>
                        <th className="text-right">R$/m²</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comps.slice(0, 8).map((c) => (
                        <tr key={c.id}>
                          <td className="tnum">{c.numero}</td>
                          <td className="tnum">{fmtData(c.data)}</td>
                          <td className="tnum text-right">{c.area.toLocaleString("pt-BR")} m²</td>
                          <td>{PADRAO_NOME[c.padrao]}</td>
                          <td className="tnum text-right">{fmtMoeda(c.m2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            <p className="mt-3 text-[12.5px] text-ink-3">
              Preço de transação (ITBI quitado) não é anúncio nem avaliação individual. Veja o{" "}
              <Link href="/tributos/observatorio" className="font-semibold text-brand-2 hover:underline">
                observatório imobiliário
              </Link>
              .
            </p>
          </Panel>

          {im.itbis.length > 0 && (
            <Panel title="Transmissões (ITBI)">
              <ul className="divide-y divide-line">
                {im.itbis.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-[14px]">
                    <Link href={`/tributos/itbi/${i.id}`} className="tnum font-semibold text-brand-2 hover:underline">
                      {i.numero}
                    </Link>
                    <span className="text-ink-2">
                      {i.vendedorNome} → {i.compradorNome}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="tnum">{fmtMoeda(i.baseCalculo ?? i.valorDeclarado)}</span>
                      <Chip tone={i.situacao === "PAGO" ? "ok" : "warn"}>{SITUACAO_ITBI[i.situacao]}</Chip>
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>

        <aside className="space-y-6">
          <Panel title="Características">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Campo rotulo="Terreno">{im.areaTerreno.toLocaleString("pt-BR")} m²</Campo>
              <Campo rotulo="Construída">{im.areaConstruida.toLocaleString("pt-BR")} m²</Campo>
              <Campo rotulo="Padrão">{PADRAO_NOME[im.padrao]}</Campo>
              <Campo rotulo="Ano">{im.anoConstrucao ?? "—"}</Campo>
              <Campo rotulo="CEP">{im.cep ?? "—"}</Campo>
              <Campo rotulo="Valor venal">{fmtMoeda(im.valorVenal)}</Campo>
            </dl>
            {mem && (
              <p className="mt-4 rounded-lg bg-sunken px-3 py-2 text-[12.5px] leading-snug text-ink-2">
                Terreno {mem.areaTerreno.toLocaleString("pt-BR")} m² × {fmtMoeda(mem.m2Terreno)} = {fmtMoeda(mem.valorTerreno)}
                {mem.areaConstruida > 0 && (
                  <>
                    <br />
                    Construção {mem.areaConstruida.toLocaleString("pt-BR")} m² × {fmtMoeda(mem.m2Construcao)} × {mem.fatorPadrao} × {mem.fatorIdade} = {fmtMoeda(mem.valorConstrucao)}
                  </>
                )}
                <br />
                Planta genérica {mem.exercicio}, bairro {mem.bairro}.
              </p>
            )}
          </Panel>
          <Panel title="Proprietários">
            <ul className="space-y-2 text-[14px]">
              {atuais.map((p) => (
                <li key={p.id}>
                  <div className="font-medium text-ink">
                    {nomeProprietario(p)} {p.fracao < 100 && <span className="text-ink-3">({p.fracao}%)</span>}
                  </div>
                  <div className="tnum text-[12.5px] text-ink-3">
                    {doc(p)} · desde {p.desde ? fmtData(p.desde + "T12:00:00") : "—"}
                  </div>
                </li>
              ))}
            </ul>
            {anteriores.length > 0 && (
              <div className="mt-4 border-t border-line pt-3">
                <div className="text-[12.5px] text-ink-3">Histórico</div>
                <ul className="mt-1 space-y-1 text-[13px] text-ink-2">
                  {anteriores.map((p) => (
                    <li key={p.id}>
                      {nomeProprietario(p)} · até {fmtData(p.ate + "T12:00:00")}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Panel>
        </aside>
      </div>
    </>
  );
}

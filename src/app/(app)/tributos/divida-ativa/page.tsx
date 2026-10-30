import Link from "next/link";
import { listarDividaAtiva, requireTributos } from "@/modulos/tributos/dados";
import { AvisoDemo, Numero, Titulo, moedaCurta } from "@/modulos/tributos/componentes";
import { FAIXAS_PARCELAMENTO, TRIBUTO_NOME, mascararDocumento, simularParcelamento } from "@/modulos/tributos/regras";
import { fmtData, fmtMoeda } from "@/lib/dates";
import { Chip, Panel, Vazio, type Tone } from "@/components/ui";

const SIT: Record<string, { rotulo: string; tone: Tone }> = {
  ATIVA: { rotulo: "Em aberto", tone: "bad" },
  PARCELADA: { rotulo: "Parcelada", tone: "brand" },
  AJUIZADA: { rotulo: "Ajuizada", tone: "warn" },
  QUITADA: { rotulo: "Quitada", tone: "ok" },
  SUSPENSA: { rotulo: "Suspensa", tone: "neutral" },
};

export default async function DividaAtiva({ searchParams }: { searchParams: Promise<{ situacao?: string; tributo?: string; devedor?: string; n?: string }> }) {
  const u = await requireTributos();
  const sp = await searchParams;
  const todas = await listarDividaAtiva(u.municipioId, {});
  const lista = todas.filter((d) => (!sp.situacao || d.situacao === sp.situacao) && (!sp.tributo || d.lancamento.tributo === sp.tributo));
  const abertas = todas.filter((d) => d.situacao === "ATIVA" || d.situacao === "AJUIZADA");
  const original = abertas.reduce((a, d) => a + d.valorOriginal, 0);
  const atualizado = abertas.reduce((a, d) => a + d.atual.total, 0);
  const parceladas = todas.filter((d) => d.situacao === "PARCELADA");

  const devedores = new Map<string, { nome: string; doc: string; tipo: "PESSOA" | "EMPRESA"; itens: typeof abertas }>();
  for (const d of todas.filter((x) => x.situacao === "ATIVA")) {
    const k = d.devedorPessoaId ?? d.devedorEmpresaId ?? "";
    const cur = devedores.get(k) ?? { nome: d.pessoa?.nome ?? d.empresa?.razaoSocial ?? "—", doc: d.pessoa?.cpf ?? d.empresa?.cnpj ?? "", tipo: d.pessoa ? "PESSOA" : "EMPRESA", itens: [] };
    cur.itens.push(d);
    devedores.set(k, cur);
  }
  const opcoes = [...devedores.entries()].sort((a, b) => a[1].nome.localeCompare(b[1].nome));
  const escolhido = sp.devedor ? devedores.get(sp.devedor) : undefined;
  const n = Math.max(1, Math.min(24, Number(sp.n) || 6));
  const sim = escolhido ? simularParcelamento(escolhido.itens.map((d) => ({ principal: d.valorOriginal + d.atual.correcao, acrescimos: d.atual.multa + d.atual.juros })), n, escolhido.tipo) : null;

  return (
    <>
      <Titulo titulo="Dívida ativa" sub="Débitos vencidos inscritos para cobrança, com valor atualizado, parcelamentos e situação de cada inscrição." />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Numero rotulo="Estoque em aberto (atualizado)" valor={moedaCurta(atualizado)} sub={`${moedaCurta(original)} de valor original`} />
        <Numero rotulo="Inscrições em aberto" valor={abertas.length} sub={`${todas.filter((d) => d.situacao === "AJUIZADA").length} em execução fiscal`} />
        <Numero rotulo="Parceladas (suspensas)" valor={parceladas.length} sub={moedaCurta(parceladas.reduce((a, d) => a + d.valorOriginal, 0)) + " originais"} />
        <Numero rotulo="Quitadas" valor={todas.filter((d) => d.situacao === "QUITADA").length} tone="ok" />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0">
          <form method="get" className="mb-4 flex flex-wrap gap-2">
            <select name="situacao" defaultValue={sp.situacao ?? ""} className="input !w-auto" aria-label="Situação">
              <option value="">Todas as situações</option>
              {Object.entries(SIT).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.rotulo}
                </option>
              ))}
            </select>
            <select name="tributo" defaultValue={sp.tributo ?? ""} className="input !w-auto" aria-label="Tributo">
              <option value="">Todos os tributos</option>
              <option value="IPTU">IPTU</option>
              <option value="ISS">ISS</option>
            </select>
            <button className="btn btn-quiet">Filtrar</button>
          </form>
          <Panel pad={false}>
            {lista.length === 0 ? (
              <div className="p-6">
                <Vazio>Nenhuma inscrição neste filtro.</Vazio>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="lista min-w-[760px]">
                  <thead>
                    <tr>
                      <th>Inscrição</th>
                      <th>Devedor</th>
                      <th>Origem</th>
                      <th className="text-right">Original</th>
                      <th className="text-right">Atualizado</th>
                      <th>Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lista.map((d) => (
                      <tr key={d.id}>
                        <td>
                          <div className="tnum font-semibold">{d.numeroInscricao}</div>
                          <div className="text-[12.5px] text-ink-3">inscrita em {fmtData(d.inscritaEm + "T12:00:00")}</div>
                        </td>
                        <td>
                          <div className="max-w-[200px] truncate">{d.pessoa?.nome ?? d.empresa?.razaoSocial}</div>
                          <div className="tnum text-[12.5px] text-ink-3">{mascararDocumento(d.pessoa?.cpf ?? d.empresa?.cnpj ?? "")}</div>
                        </td>
                        <td className="max-w-[220px]">
                          <div className="text-[13px]">{TRIBUTO_NOME[d.lancamento.tributo]} {d.lancamento.exercicio}</div>
                          {d.lancamento.imovelId ? (
                            <Link href={`/tributos/imoveis/${d.lancamento.imovelId}`} className="block truncate text-[12.5px] text-brand hover:underline">
                              {d.lancamento.descricao.split(" — ")[1]}
                            </Link>
                          ) : (
                            <div className="truncate text-[12.5px] text-ink-3">{d.lancamento.descricao}</div>
                          )}
                        </td>
                        <td className="tnum text-right">{fmtMoeda(d.valorOriginal)}</td>
                        <td className="tnum text-right font-semibold">{d.situacao === "ATIVA" || d.situacao === "AJUIZADA" ? fmtMoeda(d.atual.total) : "—"}</td>
                        <td>
                          <Chip tone={SIT[d.situacao]?.tone}>{SIT[d.situacao]?.rotulo ?? d.situacao}</Chip>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>

        <aside className="space-y-4">
          <Panel title="Simular parcelamento">
            <form method="get" className="space-y-3">
              <div>
                <label className="label" htmlFor="devedor">
                  Devedor
                </label>
                <select id="devedor" name="devedor" defaultValue={sp.devedor ?? ""} className="input">
                  <option value="">Escolha…</option>
                  {opcoes.map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.nome} ({v.itens.length})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="n">
                  Parcelas
                </label>
                <select id="n" name="n" defaultValue={String(n)} className="input">
                  {Array.from({ length: 24 }, (_, i) => i + 1).map((k) => (
                    <option key={k} value={k}>
                      {k === 1 ? "À vista" : `${k}x`}
                    </option>
                  ))}
                </select>
              </div>
              <button className="btn btn-quiet w-full">Simular</button>
            </form>
            {sim && escolhido && (
              <dl className="mt-4 space-y-1.5 border-t border-line pt-3 text-[13.5px]">
                <div className="flex justify-between">
                  <dt className="text-ink-2">Principal corrigido</dt>
                  <dd className="tnum">{fmtMoeda(sim.principal)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-2">Multa e juros</dt>
                  <dd className="tnum">{fmtMoeda(sim.acrescimos)}</dd>
                </div>
                <div className="flex justify-between text-ok">
                  <dt>Desconto ({Math.round(sim.faixa.descontoAcrescimos * 100)}%)</dt>
                  <dd className="tnum">− {fmtMoeda(sim.desconto)}</dd>
                </div>
                <div className="flex justify-between border-t border-line pt-2 font-semibold">
                  <dt>Total</dt>
                  <dd className="tnum">{fmtMoeda(sim.total)}</dd>
                </div>
                <div className="flex justify-between font-semibold text-brand-ink">
                  <dt>{n === 1 ? "À vista" : `${n} parcelas de`}</dt>
                  <dd className="tnum">{fmtMoeda(n === 1 ? sim.total : sim.valores[1])}</dd>
                </div>
                {!sim.valido && <p className="pt-1 text-bad">Parcela abaixo do mínimo ({fmtMoeda(sim.parcelaMinima)}): máximo de {sim.maxParcelas}x.</p>}
                <p className="pt-1 text-[12.5px] text-ink-3">O contribuinte adere pelo portal (Emitir guia → dívida ativa) ou no balcão.</p>
              </dl>
            )}
          </Panel>
          <Panel title="Regra de desconto">
            <ul className="space-y-1 text-[13.5px] text-ink-2">
              {FAIXAS_PARCELAMENTO.map((f) => (
                <li key={f.ate} className="flex justify-between">
                  <span>{f.rotulo}</span>
                  <span className="tnum font-semibold text-ink">{Math.round(f.descontoAcrescimos * 100)}% dos acréscimos</span>
                </li>
              ))}
            </ul>
          </Panel>
          <AvisoDemo>Correção (0,4% ao mês), multa (0,33% ao dia até 10%) e juros (1% ao mês) são índices de demonstração. Ajuizamento e protesto dependem de integração com o Judiciário e cartórios, fora desta demonstração.</AvisoDemo>
        </aside>
      </div>
    </>
  );
}

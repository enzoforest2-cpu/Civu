/* eslint-disable react-hooks/purity -- prazos e médias dependem da data atual */
import Link from "next/link";
import { ArrowRight, ListOrdered } from "lucide-react";
import { db } from "@/db";
import { fmtData, fmtMoeda } from "@/lib/dates";
import { filaDePagamentos, historicoDePagamentos } from "@/lib/pagamentos";
import { Vazio } from "@/components/ui";
import { pagamentosDaEmpresa, type EtapaPagamento } from "@/modulos/contratos/dados";
import { acessoFornecedor, SemAcesso } from "@/modulos/contratos/portal";
import { num, rotuloMes } from "@/modulos/contratos/regras";
import { TrilhoNota } from "@/modulos/contratos/componentes";

const COLUNAS: { chave: EtapaPagamento[]; rotulo: string; explica: string }[] = [
  { chave: ["ATESTO", "GLOSADA"], rotulo: "Aguardando atesto", explica: "O fiscal confere a entrega" },
  { chave: ["ATESTADA", "LIQUIDACAO"], rotulo: "Em liquidação", explica: "A contabilidade confere a despesa" },
  { chave: ["FILA"], rotulo: "Na fila de pagamento", explica: "Ordem cronológica por fonte" },
  { chave: ["PAGO"], rotulo: "Pago (90 dias)", explica: "Transferido para a empresa" },
];

export default async function MeusPagamentosPage() {
  const a = await acessoFornecedor();
  if (!a.ok) return <SemAcesso a={a} />;
  const { itens } = await pagamentosDaEmpresa(a.empresa.id);
  const noventa = Date.now() - 90 * 86400_000;
  const visiveis = itens.filter((i) => i.sit.etapa !== "PAGO" || (i.sit.pagoEm && i.sit.pagoEm.getTime() >= noventa));
  const ordem: Record<EtapaPagamento, number> = { FILA: 0, LIQUIDACAO: 1, ATESTADA: 2, GLOSADA: 3, ATESTO: 4, PAGO: 5 };
  visiveis.sort((x, y) => ordem[x.sit.etapa] - ordem[y.sit.etapa] || (x.sit.fila?.posicao ?? 0) - (y.sit.fila?.posicao ?? 0) || y.nota.competencia.localeCompare(x.nota.competencia));
  const naFila = visiveis.filter((i) => i.sit.etapa === "FILA");

  // média da liquidação ao pagamento e outros pagamentos da empresa na fila (contratações diretas, fora de contrato)
  const municipiosIds = [...new Set(itens.map((i) => i.contrato.municipioId))];
  const todosMun = await db.query.municipios.findMany();
  const processosDeNotas = new Set(itens.map((i) => i.nota.processoId).filter(Boolean));
  const medias = new Map<string, number | null>();
  const outros: { municipio: string; numero: string; assunto: string; valor: number | null; posicao: number; total: number; fonteNome: string; aFrente: number }[] = [];
  for (const m of todosMun) {
    const filas = await filaDePagamentos(m.id);
    for (const f of filas)
      for (const x of f.fila)
        if (x.cnpj === a.empresa.cnpj && !processosDeNotas.has(x.processoId))
          outros.push({ municipio: m.nome, numero: x.numero, assunto: x.assunto, valor: x.valor, posicao: x.posicao, total: f.fila.length, fonteNome: f.fonteNome, aFrente: x.posicao - 1 });
    if (municipiosIds.includes(m.id) || outros.some((o) => o.municipio === m.nome)) medias.set(m.id, (await historicoDePagamentos(m.id, 180)).mediaDias);
  }

  return (
    <>
      <h1 className="display text-[30px] font-bold text-ink">Meus pagamentos</h1>
      <p className="mt-1 max-w-2xl text-[15px] text-ink-2">
        Onde está cada nota de {a.empresa.razaoSocial}: atesto do fiscal, liquidação, fila cronológica e pagamento. As posições na fila são as mesmas da{" "}
        <Link href="/fila-de-pagamentos" className="font-semibold text-brand-2 hover:underline">
          fila pública
        </Link>
        .
      </p>

      <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Resumo por etapa">
        {COLUNAS.map((col, i) => {
          const doGrupo = visiveis.filter((x) => col.chave.includes(x.sit.etapa));
          const total = doGrupo.reduce((s, x) => s + num(x.nota.valor), 0);
          return (
            <div key={col.rotulo} className={`panel relative px-5 py-4 ${col.chave.includes("FILA") && doGrupo.length ? "border-2 !border-brand" : ""}`}>
              <div className="text-[12px] font-semibold tracking-wide text-ink-3 uppercase">
                {i + 1}. {col.rotulo}
              </div>
              <div className="display tnum mt-1 text-[22px] font-semibold text-ink">{fmtMoeda(total)}</div>
              <div className="text-[13px] text-ink-2">
                {doGrupo.length} {doGrupo.length === 1 ? "nota" : "notas"} · {col.explica}
              </div>
            </div>
          );
        })}
      </section>

      {naFila.length > 0 && (
        <section className="mt-6 space-y-3">
          {naFila.map(({ nota: n, contrato: c, sit: s }) => {
            const media = medias.get(c.municipioId);
            return (
              <div key={n.id} className="rounded-2xl border-2 border-brand bg-brand-soft/50 px-5 py-4">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="display tnum text-[34px] leading-none font-semibold text-brand-2">{s.fila!.posicao}º</span>
                  <span className="text-[15px] text-ink">
                    de {s.fila!.total} na fila de <strong className="font-semibold">{s.fila!.fonteNome}</strong> — {c.municipio.nome}
                  </span>
                </div>
                <p className="mt-2 text-[14.5px] text-ink-2">
                  NF <strong className="font-semibold text-ink">{n.numero}</strong> do contrato {c.rotulo}, {fmtMoeda(n.valor)}, liquidada em {fmtData(s.fila!.liquidadoEm)}.{" "}
                  {s.fila!.aFrente === 0
                    ? "É o próximo pagamento desta fonte."
                    : `${s.fila!.aFrente === 1 ? "1 pagamento" : `${s.fila!.aFrente} pagamentos`} à frente, somando ${fmtMoeda(s.fila!.valorAFrente)}.`}
                  {media != null && ` Nos últimos 6 meses, a prefeitura levou em média ${media} dias entre a liquidação e o pagamento.`}
                </p>
              </div>
            );
          })}
        </section>
      )}

      <section className="panel mt-6 p-2 sm:p-4">
        <h2 className="px-3 pt-2 pb-1 text-[16px] font-semibold text-ink">Todas as notas</h2>
        {visiveis.length === 0 ? (
          <div className="p-3">
            <Vazio>
              Nenhuma nota em andamento.{" "}
              <Link href="/portal/contratos/nota" className="font-semibold text-brand-2 hover:underline">
                Enviar nota fiscal
              </Link>
            </Vazio>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {visiveis.map(({ nota: n, contrato: c, sit: s }) => (
              <li key={n.id} className="grid gap-2 px-3 py-3.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-semibold text-ink">NF {n.numero}</span>
                    <span className="text-[13px] text-ink-3">
                      · {rotuloMes(n.competencia)} ·{" "}
                      <Link href={`/portal/contratos/${c.id}`} className="hover:text-brand-2 hover:underline">
                        contrato {c.rotulo}
                      </Link>
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
                    <TrilhoNota s={s} />
                    <span className={`text-[13px] ${s.etapa === "GLOSADA" || s.tone === "bad" ? "font-semibold text-bad" : "text-ink-2"}`}>
                      {s.etapa === "FILA"
                        ? `${s.fila!.posicao}º de ${s.fila!.total} na fila`
                        : s.etapa === "PAGO"
                          ? `Pago em ${fmtData(s.pagoEm)}`
                          : s.etapa === "GLOSADA"
                            ? `Glosada: ${n.glosaMotivo}`
                            : s.etapa === "ATESTO"
                              ? `Aguardando atesto · ${s.detalhe?.toLowerCase()}${(s.diasUteisSemAtesto ?? 0) > 5 ? " (prazo de 5 dias úteis vencido)" : ""}`
                              : s.etapa === "ATESTADA"
                                ? "Atestada, seguindo para liquidação"
                                : "Na contabilidade para liquidação"}
                    </span>
                  </div>
                </div>
                <div className="display tnum text-[17px] font-semibold text-ink sm:text-right">{fmtMoeda(n.valor)}</div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {outros.length > 0 && (
        <section className="panel mt-6 p-6">
          <h2 className="flex items-center gap-2 text-[16px] font-semibold text-ink">
            <ListOrdered size={17} className="text-brand-2" /> Outros pagamentos da empresa na fila
          </h2>
          <p className="mt-1 text-[14px] text-ink-2">Compras e serviços contratados sem contrato acompanhado aqui (por exemplo, dispensas pagas em parcela única).</p>
          <ul className="mt-3 divide-y divide-line">
            {outros.map((o) => (
              <li key={o.numero} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <span className="min-w-0">
                  <span className="tnum text-[13px] text-ink-3">
                    Processo {o.numero} · {o.municipio}
                  </span>
                  <span className="block font-medium text-ink">{o.assunto}</span>
                  <span className="text-[13px] text-ink-2">
                    {o.posicao}º de {o.total} na fila de {o.fonteNome} · {o.aFrente === 0 ? "é o próximo" : `${o.aFrente} à frente`}
                  </span>
                </span>
                <span className="display tnum font-semibold text-ink">{fmtMoeda(o.valor)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-6 max-w-3xl text-[14px] text-ink-3">
        “Pago” significa que a tesouraria registrou o pagamento com comprovante. Nesta demonstração o retorno bancário é simulado; na operação real, o estado só muda
        com a confirmação do banco.{" "}
        <Link href="/portal/contratos" className="inline-flex items-center gap-1 font-semibold text-brand-2 hover:underline">
          Meus contratos <ArrowRight size={13} />
        </Link>
      </p>
    </>
  );
}

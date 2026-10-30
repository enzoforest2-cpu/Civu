import Link from "next/link";
import { AlertTriangle, ArrowUpRight, Info } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { Cabecalho, Chip, Panel, Vazio } from "@/components/ui";
import { alertas, anoCorrente, caixa, execucao, fmtIso, indices, porFuncao, receita } from "@/modulos/financas/dados";
import { AbasFinancas, BarraExecucao, Kpi, LegendaExecucao, SemAcesso, podeVerFinancas } from "@/modulos/financas/ui";
import { MESES_LONGOS, fmtCompacto, fmtPct, nomeGrupoCurto } from "@/modulos/financas/classificacao";

export const dynamic = "force-dynamic";

export default async function FinancasPage() {
  const u = await requireUser();
  if (!podeVerFinancas(u)) return <SemAcesso />;
  const ano = anoCorrente();
  const [ex, rec, cx, idx, funcoes, avisos] = await Promise.all([
    execucao(u.municipioId, ano),
    receita(u.municipioId, ano),
    caixa(u.municipioId, ano),
    indices(u.municipioId, ano),
    porFuncao(u.municipioId, ano),
    alertas(u.municipioId, ano),
  ]);
  const t = ex.totais;
  if (ex.dotacoes.length === 0)
    return (
      <>
        <Cabecalho titulo={`Finanças de ${ano}`} />
        <Vazio>O orçamento de {ano} ainda não foi carregado. Quando a LOA for importada do sistema contábil, a execução aparece aqui.</Vazio>
      </>
    );
  const pctEmp = (t.empenhado / t.atualizado) * 100;
  const desemp = rec.totais.previstoAte > 0 ? (rec.totais.arrecadado / rec.totais.previstoAte) * 100 : 0;
  const mes = MESES_LONGOS[rec.mesesDecorridos - 1];
  const maxFuncao = Math.max(...funcoes.map((f) => f.atualizado));
  const riscos = avisos.filter((a) => a.nivel === "risco").length;

  return (
    <>
      <Cabecalho
        titulo={`Finanças de ${ano}`}
        sub={
          <>
            Orçamento, despesa, receita e caixa de {u.municipio.nome} até {fmtIso(rec.hoje)}. Os números vêm dos lançamentos de reserva, empenho, liquidação e pagamento, e
            são os mesmos em todas as telas.
          </>
        }
      />
      <AbasFinancas atual="/financas" />

      <section className="mb-8">
        <p className="display max-w-4xl text-[22px] leading-snug font-semibold text-ink sm:text-[26px]">
          Do orçamento de {fmtCompacto(t.atualizado)}, {fmtCompacto(t.empenhado)} já estão comprometidos ({fmtPct(pctEmp, 0)}) e {fmtCompacto(t.pago)} foram pagos. A receita
          está em {fmtPct(desemp, 0)} do previsto até {mes}
          {riscos > 0 ? <span className="text-bad">, com {riscos === 1 ? "um ponto de risco" : `${riscos} pontos de risco`} abaixo.</span> : "."}
        </p>
      </section>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi rotulo="Orçamento atualizado" valor={fmtCompacto(t.atualizado)} sub={`LOA ${fmtCompacto(t.inicial)} + créditos ${fmtCompacto(t.creditos - t.reducoes)}`} />
        <Kpi rotulo="Empenhado" valor={fmtCompacto(t.empenhado)} sub={`${fmtPct(pctEmp, 0)} do orçamento · ${fmtCompacto(t.disponivel)} livres`} />
        <Kpi rotulo="Liquidado / pago" valor={`${fmtCompacto(t.liquidado)}`} sub={`${fmtCompacto(t.pago)} pagos · ${fmtCompacto(t.liquidado - t.pago)} a pagar`} />
        <Kpi
          rotulo={`Receita até ${mes}`}
          valor={fmtCompacto(rec.totais.arrecadado)}
          sub={`${fmtPct(desemp, 0)} de ${fmtCompacto(rec.totais.previstoAte)} previstos`}
          tom={desemp < 95 ? "warn" : undefined}
        />
      </div>

      <Panel title="O que precisa de atenção" className="mb-6" action={<Chip tone={riscos ? "bad" : "neutral"}>{avisos.length} alertas</Chip>}>
        {avisos.length === 0 ? (
          <Vazio>Nenhum alerta. Índices dentro dos limites, caixa positivo em todas as fontes e nada vencido.</Vazio>
        ) : (
          <ul className="divide-y divide-line">
            {avisos.map((a, i) => (
              <li key={i}>
                <Link href={a.href} className="group flex items-start gap-3 py-3.5">
                  <span className={`mt-0.5 shrink-0 ${a.nivel === "risco" ? "text-bad" : "text-warn"}`}>
                    {a.nivel === "risco" ? <AlertTriangle size={18} /> : <Info size={18} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2 font-semibold text-ink">
                      {a.titulo}
                      <Chip tone={a.nivel === "risco" ? "bad" : "warn"}>{a.nivel === "risco" ? "Risco" : "Atenção"}</Chip>
                    </span>
                    <span className="mt-0.5 block text-[13.5px] leading-snug text-ink-2">{a.texto}</span>
                  </span>
                  <ArrowUpRight size={16} className="mt-1 shrink-0 text-ink-3 group-hover:text-brand" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr] [&>*]:min-w-0">
        <Panel title="Execução por área" action={<Link href="/financas/orcamento" className="text-[13px] font-semibold text-brand hover:underline">Ver dotações</Link>}>
          <ul className="space-y-3.5">
            {funcoes.map((f) => (
              <li key={f.funcao}>
                <div className="mb-1 flex items-baseline justify-between gap-3 text-[13.5px]">
                  <span className="truncate font-medium text-ink">{f.nome}</span>
                  <span className="tnum shrink-0 text-ink-2">
                    {fmtCompacto(f.pago)} <span className="text-ink-3">de {fmtCompacto(f.atualizado)}</span>
                  </span>
                </div>
                <div style={{ width: `${Math.max(12, (f.atualizado / maxFuncao) * 100)}%` }}>
                  <BarraExecucao autorizado={f.atualizado} empenhado={f.empenhado} liquidado={f.liquidado} pago={f.pago} />
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-5">
            <LegendaExecucao />
          </div>
        </Panel>

        <div className="space-y-6">
          <Panel title="Índices legais">
            <ul className="divide-y divide-line">
              {idx.lista.map((i) => (
                <li key={i.chave} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-medium text-ink">{i.titulo}</div>
                    <div className="text-[12.5px] text-ink-3">
                      {i.minimo != null ? `mínimo ${fmtPct(i.minimo, 0)}` : `limite ${fmtPct(i.maximo, 0)} · prudencial ${fmtPct(i.prudencial)}`}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="display tnum text-[18px] font-semibold text-ink">{fmtPct(i.realizado)}</div>
                    <Chip tone={i.situacao === "ok" ? "ok" : i.situacao === "risco" ? "bad" : "warn"}>proj. {fmtPct(i.projetado)}</Chip>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="Caixa por fonte" action={<Link href="/financas/caixa" className="text-[13px] font-semibold text-brand hover:underline">Projeção</Link>}>
            <ul className="divide-y divide-line">
              {cx.fontes.map((f) => (
                <li key={f.grupo} className="flex items-center justify-between gap-3 py-2.5 text-[14px]">
                  <span className="min-w-0 text-ink">{nomeGrupoCurto(f.grupo)}</span>
                  <span className="text-right">
                    <span className="tnum block font-semibold text-ink">{fmtCompacto(f.saldo)}</span>
                    <span className={`tnum block text-[12.5px] ${f.liquida < 0 ? "text-bad" : "text-ink-3"}`}>após compromissos: {fmtCompacto(f.liquida)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
      <p className="mt-6 max-w-3xl text-[13px] text-ink-3">
        Demonstração: saldos bancários e lançamentos são simulados. Em produção, os registros contábeis oficiais continuam no sistema contábil (SIAFIC) e chegam aqui por
        integração, com conciliação.
      </p>
    </>
  );
}

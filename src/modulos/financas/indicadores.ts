import "server-only";
// Provedor de indicadores e alertas de finanças para a Sala do prefeito (/gabinete), no formato de
// src/modulos/gestao/indicadores.ts. Registrado em EXTERNOS.
import type { Alerta, Indicador, ProvedorIndicadores } from "@/modulos/gestao/indicadores";
import { fmtMoeda } from "@/lib/dates";
import { alertas, anoCorrente, caixa, execucao, projecao } from "./dados";
import { fmtPct } from "./classificacao";

export const provedor: ProvedorIndicadores = {
  modulo: "Finanças",
  async carregar(municipioId) {
    const ano = anoCorrente();
    const agora = new Date();
    const [ex, cx, proj, al] = await Promise.all([execucao(municipioId, ano), caixa(municipioId, ano), projecao(municipioId, ano, "base"), alertas(municipioId, ano)]);
    const t = ex.totais;
    const minimo = proj.series.reduce<{ saldo: number; data: string } | null>((m, s) => (!m || s.min.saldo < m.saldo ? { saldo: s.min.saldo, data: s.min.data } : m), null);
    const finalProj = proj.series.reduce((s, x) => s + x.final, 0);
    const indicadores: Indicador[] = [
      {
        chave: "financas.execucao",
        rotulo: "Despesa liquidada no ano",
        valor: t.liquidado,
        formato: "moeda",
        melhorSe: "neutro",
        origem: { rotulo: "Orçamento", href: "/financas/orcamento" },
        responsavel: "Contabilidade (Secretaria da Fazenda)",
        atualizadoEm: agora,
        natureza: "realizado",
        nota: `${fmtPct(t.atualizado ? (t.liquidado / t.atualizado) * 100 : 0, 0)} da dotação atualizada de ${fmtMoeda(t.atualizado)}; ${fmtPct(t.atualizado ? (t.empenhado / t.atualizado) * 100 : 0, 0)} empenhado.`,
      },
      {
        chave: "financas.caixa",
        rotulo: "Caixa livre depois das despesas liquidadas",
        valor: cx.totais.aposLiquidadas,
        formato: "moeda",
        melhorSe: "maior",
        origem: { rotulo: "Caixa e projeção", href: "/financas/caixa" },
        responsavel: "Tesouraria",
        atualizadoEm: agora,
        natureza: "realizado",
        nota: `Saldo em conta ${fmtMoeda(cx.totais.saldo)} menos ${fmtMoeda(cx.totais.aPagar)} liquidados a pagar, somando todas as fontes.`,
      },
      {
        chave: "financas.projecao",
        rotulo: "Caixa projetado em 90 dias",
        valor: Math.round(finalProj * 100) / 100,
        formato: "moeda",
        melhorSe: "maior",
        origem: { rotulo: "Projeção de caixa", href: "/financas/caixa#projecao" },
        responsavel: "Tesouraria",
        atualizadoEm: agora,
        natureza: "projetado",
        nota: minimo ? `Cenário base. Menor saldo de uma fonte no período: ${fmtMoeda(minimo.saldo)}.` : "Cenário base.",
      },
    ];
    const alertasOut: Alerta[] = al.map((a, i) => ({
      chave: `financas.${i}`,
      gravidade: a.nivel === "risco" ? "ALTA" : "MEDIA",
      titulo: a.titulo,
      motivo: a.texto,
      responsavel: "Secretaria da Fazenda",
      acao: { rotulo: "Ver em finanças", href: a.href },
    }));
    return { indicadores, alertas: alertasOut };
  },
};

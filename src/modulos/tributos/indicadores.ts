import "server-only";
// Provedor de indicadores e alertas de tributos para a Sala do prefeito (/gabinete), no formato de
// src/modulos/gestao/indicadores.ts. Registrado em EXTERNOS.
import type { Alerta, Indicador, ProvedorIndicadores } from "@/modulos/gestao/indicadores";
import { fmtMoeda } from "@/lib/dates";
import { arrecadacao, inadimplencia, listarDividaAtiva } from "./dados";

const pct = (x: number) => `${(x * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

export const provedor: ProvedorIndicadores = {
  modulo: "Tributos",
  async carregar(municipioId) {
    const agora = new Date();
    const ano = Number(agora.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }).slice(0, 4));
    const [arr, inad, divida] = await Promise.all([arrecadacao(municipioId, ano), inadimplencia(municipioId, ano), listarDividaAtiva(municipioId, {})]);
    const previsto = arr.reduce((s, x) => s + x.previsto, 0);
    const arrecadado = arr.reduce((s, x) => s + x.arrecadado, 0);
    const vencido = inad.reduce((s, x) => s + x.vencido, 0);
    const aberto = inad.reduce((s, x) => s + x.aberto, 0);
    const taxa = vencido ? aberto / vencido : 0;
    const ativa = divida.filter((d) => d.situacao === "ATIVA" || d.situacao === "AJUIZADA");
    const valorDivida = ativa.reduce((s, d) => s + d.atual.total, 0);
    const responsavel = "Setor de Tributos (Secretaria da Fazenda)";
    const indicadores: Indicador[] = [
      {
        chave: "tributos.arrecadado",
        rotulo: "Arrecadação própria no ano",
        valor: arrecadado,
        formato: "moeda",
        melhorSe: "maior",
        origem: { rotulo: "Tributos", href: "/tributos" },
        responsavel,
        atualizadoEm: agora,
        natureza: "realizado",
        nota: previsto ? `${pct(arrecadado / previsto)} dos ${fmtMoeda(previsto)} previstos para o ano (IPTU, ITBI, ISS, taxas e parcelamentos).` : "Sem previsão cadastrada para o ano.",
      },
      {
        chave: "tributos.inadimplencia",
        rotulo: "Vencido e não pago no exercício",
        valor: aberto,
        formato: "moeda",
        melhorSe: "menor",
        origem: { rotulo: "Tributos", href: "/tributos" },
        responsavel,
        atualizadoEm: agora,
        natureza: "realizado",
        nota: `Inadimplência de ${pct(taxa)} sobre ${fmtMoeda(vencido)} já vencidos neste exercício.`,
      },
      {
        chave: "tributos.divida",
        rotulo: "Dívida ativa a receber",
        valor: Math.round(valorDivida * 100) / 100,
        formato: "moeda",
        melhorSe: "menor",
        origem: { rotulo: "Dívida ativa", href: "/tributos/divida-ativa" },
        responsavel,
        atualizadoEm: agora,
        natureza: "realizado",
        nota: `${ativa.length} ${ativa.length === 1 ? "inscrição ativa ou ajuizada" : "inscrições ativas ou ajuizadas"}, com juros e correção até hoje.`,
      },
    ];
    const alertas: Alerta[] = [];
    if (taxa > 0.15)
      alertas.push({
        chave: "tributos.inadimplencia",
        gravidade: taxa > 0.25 ? "ALTA" : "MEDIA",
        titulo: `Inadimplência de ${pct(taxa)} nos tributos do exercício`,
        motivo: `${fmtMoeda(aberto)} vencidos sem pagamento.`,
        impacto: "Receita própria abaixo do previsto reduz o caixa livre do município.",
        responsavel,
        acao: { rotulo: "Ver tributos", href: "/tributos" },
      });
    return { indicadores, alertas };
  },
};

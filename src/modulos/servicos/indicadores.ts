import "server-only";
// Provedor de indicadores e alertas de serviços urbanos para a Sala do prefeito (/gabinete), no formato de
// src/modulos/gestao/indicadores.ts. Registrado em EXTERNOS.
import type { Alerta, Indicador, ProvedorIndicadores } from "@/modulos/gestao/indicadores";
import { indicadores as calcular } from "./dados";

export const provedor: ProvedorIndicadores = {
  modulo: "Serviços urbanos",
  async carregar(municipioId) {
    const agora = new Date();
    const r = await calcular(municipioId, 30);
    const responsavel = "Secretaria de Infraestrutura (serviços urbanos)";
    const indicadores: Indicador[] = [
      {
        chave: "servicos.abertos",
        rotulo: "Chamados em aberto",
        valor: r.abertas,
        formato: "numero",
        melhorSe: "menor",
        origem: { rotulo: "Ocorrências urbanas", href: "/servicos?setor=todas&situacao=abertas" },
        responsavel,
        atualizadoEm: agora,
        natureza: "realizado",
        nota: `${r.triagem} aguardando triagem; ${r.atrasadas} fora do prazo.`,
      },
      {
        chave: "servicos.prazo",
        rotulo: "Chamados concluídos no prazo (30 dias)",
        valor: r.pctNoPrazo,
        formato: "percentual",
        melhorSe: "maior",
        origem: { rotulo: "Indicadores de serviços", href: "/servicos/indicadores" },
        responsavel,
        atualizadoEm: agora,
        natureza: "realizado",
        nota: r.pctNoPrazo == null ? "Nenhum chamado concluído nos últimos 30 dias." : `De ${r.concluidas} chamados concluídos nos últimos 30 dias.`,
      },
      {
        chave: "servicos.tempo",
        rotulo: "Tempo médio de atendimento",
        valor: r.tempoMedioDias == null ? null : Math.round(r.tempoMedioDias),
        formato: "dias",
        melhorSe: "menor",
        origem: { rotulo: "Indicadores de serviços", href: "/servicos/indicadores" },
        responsavel,
        atualizadoEm: agora,
        natureza: "realizado",
        nota: "Do registro à conclusão, nos chamados concluídos nos últimos 30 dias.",
      },
    ];
    const alertas: Alerta[] = [];
    if (r.atrasadas > 0)
      alertas.push({
        chave: "servicos.atrasadas",
        gravidade: r.atrasadas >= 10 ? "ALTA" : "MEDIA",
        titulo: `${r.atrasadas} ${r.atrasadas === 1 ? "chamado da população está" : "chamados da população estão"} fora do prazo`,
        motivo: "Buracos, iluminação, poda e outros pedidos passaram do prazo prometido ao cidadão.",
        responsavel,
        acao: { rotulo: "Ver chamados atrasados", href: "/servicos?setor=todas&situacao=abertas&atrasadas=1" },
      });
    return { indicadores, alertas };
  },
};

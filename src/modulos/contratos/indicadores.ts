import "server-only";
// Provedor de indicadores e alertas de contratos e obras para a Sala do prefeito (/gabinete), no formato de
// src/modulos/gestao/indicadores.ts. Registrado em EXTERNOS.
import type { Alerta, Indicador, ProvedorIndicadores } from "@/modulos/gestao/indicadores";
import { fmtMoeda } from "@/lib/dates";
import { alertasContratos, listarContratos } from "./dados";

const p0 = (x: number) => `${Math.round(x).toLocaleString("pt-BR")}%`;

export const provedor: ProvedorIndicadores = {
  modulo: "Contratos e obras",
  async carregar(municipioId) {
    const agora = new Date();
    const lista = await listarContratos(municipioId);
    const al = await alertasContratos(municipioId, lista);
    const ativos = lista.filter((c) => c.fin.ativo);
    const vencendo = ativos.filter((c) => c.fin.diasParaVencer <= 90);
    const obras = ativos.filter((c) => c.obra && c.obra.situacao !== "CONCLUIDA");
    const atrasadas = obras.filter((c) => c.obra!.situacao === "ATRASADA" || c.obra!.situacao === "PARALISADA");
    const pior = [...atrasadas].sort((a, b) => b.obra!.desvio - a.obra!.desvio)[0];
    const indicadores: Indicador[] = [
      {
        chave: "contratos.vencendo",
        rotulo: "Contratos que vencem em 90 dias",
        valor: vencendo.length,
        formato: "numero",
        melhorSe: "menor",
        origem: { rotulo: "Contratos a vencer", href: "/contratos?aba=vencer" },
        responsavel: "Compras e o gestor de cada contrato",
        atualizadoEm: agora,
        natureza: "realizado",
        nota: `${vencendo.filter((c) => c.fin.diasParaVencer <= 30).length} em até 30 dias. ${ativos.length} contratos em vigor, somando ${fmtMoeda(ativos.reduce((s, c) => s + c.fin.valorAtual, 0))}.`,
      },
      {
        chave: "contratos.obras_atraso",
        rotulo: "Obras atrasadas ou paralisadas",
        valor: atrasadas.length,
        formato: "numero",
        melhorSe: "menor",
        origem: { rotulo: "Obras", href: "/contratos/obras" },
        responsavel: "Fiscal e secretaria de cada obra",
        atualizadoEm: agora,
        natureza: "realizado",
        nota: pior
          ? `De ${obras.length} em andamento. Maior atraso: ${pior.objeto} — físico ${p0(pior.obra!.realizadoRef)} medido × ${p0(pior.obra!.previstoRef)} previsto; financeiro ${p0(pior.fin.pctExecutado)} pago.`
          : `${obras.length} ${obras.length === 1 ? "obra em andamento" : "obras em andamento"}, todas no cronograma.`,
      },
      {
        chave: "contratos.saldo",
        rotulo: "Saldo a executar nos contratos em vigor",
        valor: Math.round(ativos.reduce((s, c) => s + c.fin.saldo, 0) * 100) / 100,
        formato: "moeda",
        melhorSe: "neutro",
        origem: { rotulo: "Contratos", href: "/contratos" },
        responsavel: "Compras e o gestor de cada contrato",
        atualizadoEm: agora,
        natureza: "projetado",
        nota: "O que ainda deve ser entregue e pago até o fim da vigência de cada contrato.",
      },
    ];
    // Um alerta por tipo (com os casos no motivo), para não encher a sala de itens repetidos
    const ROTULO = { VIGENCIA: ["contrato vence", "contratos vencem", "em até 30 dias"], OBRA: ["obra atrasada ou paralisada", "obras atrasadas ou paralisadas", ""], ATESTO: ["nota sem atesto", "notas sem atesto", "há mais de 5 dias úteis"], ADITIVO: ["contrato com acréscimos acima do limite", "contratos com acréscimos acima do limite", "do art. 125"], SALDO: ["contrato com saldo abaixo de 5%", "contratos com saldo abaixo de 5%", ""] } as const;
    const HREF = { VIGENCIA: "/contratos?aba=vencer", OBRA: "/contratos/obras", ATESTO: "/contratos/atestos", ADITIVO: "/contratos?alertas=todos", SALDO: "/contratos?alertas=todos" } as const;
    const alertas: Alerta[] = [];
    for (const tipo of ["OBRA", "ADITIVO", "ATESTO", "VIGENCIA", "SALDO"] as const) {
      const xs = al.filter((a) => a.tipo === tipo && a.tone === "bad");
      if (!xs.length) continue;
      const [um, varios, sufixo] = ROTULO[tipo];
      alertas.push({
        chave: `contratos.${tipo.toLowerCase()}`,
        gravidade: tipo === "OBRA" || tipo === "ADITIVO" ? "ALTA" : "MEDIA",
        titulo: `${xs.length} ${xs.length === 1 ? um : varios}${sufixo ? " " + sufixo : ""}`,
        motivo: xs.slice(0, 2).map((a) => a.titulo).join("; "),
        responsavel: tipo === "OBRA" ? "Fiscal e secretaria de cada obra" : "Compras e o gestor de cada contrato",
        acao: { rotulo: "Ver contratos", href: HREF[tipo] },
      });
    }
    return { indicadores, alertas };
  },
};

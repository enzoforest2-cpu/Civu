import "server-only";
// Provedor de indicadores e alertas de repasses e obrigações da área para a sala do prefeito (/gabinete),
// no formato de src/modulos/gestao/indicadores.ts. Registrado em EXTERNOS.
import { fmtMoeda } from "@/lib/dates";
import type { Alerta, Indicador, ProvedorIndicadores } from "@/modulos/gestao/indicadores";
import { obrigacoesDoMunicipio, repassesDoMunicipio } from "./dados";
import { dataBr, percentualExecutado } from "./regras";

export const provedor: ProvedorIndicadores = {
  modulo: "Repasses e convênios",
  async carregar(municipioId) {
    const agora = new Date();
    const [reps, obs] = await Promise.all([repassesDoMunicipio(municipioId), obrigacoesDoMunicipio(municipioId)]);
    const ativos = reps.filter((r) => ["VIGENTE", "EM_EXECUCAO"].includes(r.situacao));
    const previsto = ativos.reduce((s, r) => s + r.valorPrevisto, 0);
    const pago = ativos.reduce((s, r) => s + r.execucao.pago, 0);
    const risco = reps.filter((r) => r.risco.emRisco);
    const valorRisco = risco.reduce((s, r) => s + r.risco.valorEmRisco, 0);
    const obVencidas = obs.filter((o) => o.alerta?.nivel === "vencido");
    const obSemana = obs.filter((o) => o.alerta && o.alerta.nivel !== "vencido" && o.alerta.dias <= 15);
    const responsavel = "Secretaria responsável por cada repasse";

    const indicadores: Indicador[] = [
      {
        chave: "repasses.execucao",
        rotulo: "Execução dos repasses vigentes",
        valor: pago,
        formato: "moeda",
        melhorSe: "maior",
        origem: { rotulo: "Repasses e convênios", href: "/repasses?situacao=ativos" },
        responsavel,
        atualizadoEm: agora,
        natureza: "realizado",
        nota: `${percentualExecutado(pago, previsto).toLocaleString("pt-BR")}% pagos de ${fmtMoeda(previsto)} previstos em ${ativos.length} ${ativos.length === 1 ? "repasse vigente" : "repasses vigentes"} (soma do que foi pago nos processos vinculados).`,
      },
      {
        chave: "repasses.risco",
        rotulo: "Valor de repasses em risco",
        valor: valorRisco,
        formato: "moeda",
        melhorSe: "menor",
        origem: { rotulo: "Repasses em risco", href: "/repasses?situacao=risco" },
        responsavel,
        atualizadoEm: agora,
        natureza: "projetado",
        nota: `${risco.length} ${risco.length === 1 ? "repasse" : "repasses"} com prazo em até 30 dias, vencido ou com pendência. Execução: o que falta pagar do previsto; prestação de contas: o valor recebido.`,
      },
      {
        chave: "repasses.obrigacoes_vencidas",
        rotulo: "Obrigações das áreas vencidas",
        valor: obVencidas.length,
        formato: "numero",
        melhorSe: "menor",
        origem: { rotulo: "Obrigações da área", href: "/obrigacoes-da-area?situacao=vencidas" },
        responsavel: "Secretaria responsável por cada obrigação",
        atualizadoEm: agora,
        natureza: "realizado",
      },
    ];

    const alertas: Alerta[] = [];
    for (const r of risco) {
      const p = r.prazoCritico;
      const vencido = r.situacao === "COM_PENDENCIA" || p?.alerta.nivel === "vencido";
      const urgente = vencido || p?.alerta.nivel === "5";
      if (!urgente && p?.alerta.nivel !== "15") continue; // até 30 dias fica na lista do módulo; aqui só o que pede decisão
      alertas.push({
        chave: `repasses.${r.id}`,
        gravidade: urgente ? "ALTA" : "MEDIA",
        titulo: `${r.rotulo} (${r.setor.sigla}): ${r.risco.motivo?.toLowerCase() ?? "com pendência"}`,
        motivo: `${r.objeto}. ${p ? `${p.rotulo} em ${dataBr(p.data)}. ` : ""}Pago ${fmtMoeda(r.execucao.pago)} de ${fmtMoeda(r.valorPrevisto)} (${r.execucao.percentual.toLocaleString("pt-BR")}%).`,
        impacto: r.risco.valorEmRisco > 0 ? `${fmtMoeda(r.risco.valorEmRisco)} em risco de devolução ou perda.` : undefined,
        responsavel: r.setor.nome,
        acao: { rotulo: "Abrir repasse", href: `/repasses/${r.id}` },
      });
    }
    if (obVencidas.length)
      alertas.push({
        chave: "repasses.obrigacoes_vencidas",
        gravidade: "ALTA",
        titulo: `${obVencidas.length} ${obVencidas.length === 1 ? "obrigação de entrega vencida" : "obrigações de entrega vencidas"}`,
        motivo: obVencidas
          .slice(0, 3)
          .map((o) => `${o.nome} (${o.setor.sigla})`)
          .join("; "),
        responsavel: "Secretarias responsáveis",
        acao: { rotulo: "Ver obrigações", href: "/obrigacoes-da-area?situacao=vencidas" },
      });
    if (obSemana.length)
      alertas.push({
        chave: "repasses.obrigacoes_15",
        gravidade: "MEDIA",
        titulo: `${obSemana.length} ${obSemana.length === 1 ? "obrigação de entrega vence" : "obrigações de entrega vencem"} em até 15 dias`,
        motivo: obSemana
          .slice(0, 3)
          .map((o) => `${o.nome} em ${dataBr(o.proximoVencimento)}`)
          .join("; "),
        responsavel: "Secretarias responsáveis",
        acao: { rotulo: "Ver obrigações", href: "/obrigacoes-da-area?situacao=vencer" },
      });
    return { indicadores, alertas };
  },
};

import "server-only";
/*
 * Indicadores e alertas do Painel do prefeito — mecanismo de extensão.
 *
 * O painel (/gabinete) não conhece as tabelas dos módulos. Cada módulo entrega um ProvedorIndicadores:
 *
 *   // src/modulos/<modulo>/indicadores.ts
 *   import "server-only";
 *   import type { ProvedorIndicadores } from "@/modulos/gestao/indicadores";
 *   export const provedor: ProvedorIndicadores = {
 *     modulo: "Serviços urbanos",
 *     async carregar(municipioId) {
 *       return {
 *         indicadores: [{ chave: "servicos.chamados_abertos", rotulo: "Chamados abertos", valor: 42, formato: "numero",
 *                         melhorSe: "menor", serie: [...8 semanas...], origem: { rotulo: "Chamados", href: "/servicos" },
 *                         responsavel: "Secretaria de Infraestrutura", atualizadoEm: new Date(), natureza: "realizado" }],
 *         alertas: [{ chave: "servicos.sla", gravidade: "ALTA", titulo: "...", motivo: "...", acao: { rotulo: "Ver", href: "/servicos" } }],
 *       };
 *     },
 *   };
 *
 * e se registra acrescentando UMA linha na lista EXTERNOS abaixo:
 *
 *   () => import("@/modulos/servicos/indicadores"),
 *
 * Regras: cada indicador leva à sua origem (href), diz quem responde por ele e se é realizado ou projetado.
 * Use `serie` (mais antigo → mais recente) para a tendência. Um provedor que falhar não derruba o painel:
 * o painel mostra "fonte indisponível" para aquele módulo. Não conte o mesmo benefício em dois provedores.
 */
import { and, eq, gte, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { gestaoChamadas, gestaoIntegracoes, processos } from "@/db/schema";
import { obrigacoes } from "@/lib/conformidade";
import { filaDePagamentos, historicoDePagamentos } from "@/lib/pagamentos";
import { fmtData, fmtMoeda } from "@/lib/dates";
import type { Gravidade } from "./avaliador";
import { alertasAbertos } from "./automacoes";

export type Ponto = { rotulo: string; valor: number };

export type Indicador = {
  chave: string;
  rotulo: string;
  valor: number | null;
  formato: "numero" | "moeda" | "dias";
  /** tendência, do mais antigo ao mais recente */
  serie?: Ponto[];
  melhorSe: "maior" | "menor" | "neutro";
  origem: { rotulo: string; href: string };
  responsavel?: string;
  atualizadoEm: Date;
  natureza: "realizado" | "projetado";
  nota?: string;
};

export type Alerta = {
  chave: string;
  gravidade: Gravidade;
  titulo: string;
  motivo: string;
  impacto?: string;
  responsavel?: string;
  acao?: { rotulo: string; href: string };
  quando?: Date;
};

export type ResultadoProvedor = { indicadores: Indicador[]; alertas: Alerta[] };

export type ProvedorIndicadores = {
  modulo: string;
  carregar(municipioId: string): Promise<ResultadoProvedor>;
};

// ---------------------------------------------------------------------------
// Provedores do núcleo
// ---------------------------------------------------------------------------
const SEMANAS = 8;
const DIA = 86400_000;

function rotuloSemana(fim: Date) {
  return fmtData(fim).slice(0, 5);
}

/** Atendimento e processos: estoque, entradas, conclusões, atraso e tempo de conclusão. */
export const provedorAtendimento: ProvedorIndicadores = {
  modulo: "Atendimento e processos",
  async carregar(municipioId) {
    const agora = new Date();
    const serie = await db.execute<{ i: number; estoque: number; abertos: number; concluidos: number; tempo: number | null }>(sql`
      with semanas as (select i, now() - (i * interval '7 days') as fim from generate_series(0, ${SEMANAS - 1}) as i)
      select s.i,
        (select count(*)::int from ${processos} p where p.municipio_id = ${municipioId} and p.aberto_em <= s.fim and (p.encerrado_em is null or p.encerrado_em > s.fim)) as estoque,
        (select count(*)::int from ${processos} p where p.municipio_id = ${municipioId} and p.aberto_em > s.fim - interval '7 days' and p.aberto_em <= s.fim) as abertos,
        (select count(*)::int from ${processos} p where p.municipio_id = ${municipioId} and p.encerrado_em > s.fim - interval '7 days' and p.encerrado_em <= s.fim) as concluidos,
        (select avg(extract(epoch from (p.encerrado_em - p.aberto_em)) / 86400)::float from ${processos} p
           where p.municipio_id = ${municipioId} and p.encerrado_em > s.fim - interval '90 days' and p.encerrado_em <= s.fim) as tempo
      from semanas s order by s.i desc`);
    const linhas = serie.rows.map((r) => ({ ...r, rotulo: rotuloSemana(new Date(agora.getTime() - r.i * 7 * DIA)) }));
    const [atual] = await db
      .select({
        atrasados: sql<number>`count(*) filter (where ${processos.prazoEtapaEm} < now())::int`,
        naoRecebidos: sql<number>`count(*) filter (where ${processos.recebidoEm} is null and ${processos.prazoEtapaEm} < now() + interval '1 day')::int`,
        exigencias: sql<number>`count(*) filter (where ${processos.metadados} ? 'exigencia')::int`,
        urgentesAtrasados: sql<number>`count(*) filter (where ${processos.urgencia} = 'URGENTE' and ${processos.prazoEtapaEm} < now())::int`,
      })
      .from(processos)
      .where(and(eq(processos.municipioId, municipioId), isNull(processos.encerradoEm)));
    const ult = linhas.at(-1);
    const indicadores: Indicador[] = [
      {
        chave: "nucleo.estoque",
        rotulo: "Processos em andamento",
        valor: ult?.estoque ?? 0,
        formato: "numero",
        serie: linhas.map((l) => ({ rotulo: l.rotulo, valor: l.estoque })),
        melhorSe: "menor",
        origem: { rotulo: "Processos", href: "/processos" },
        responsavel: "Todos os setores",
        atualizadoEm: agora,
        natureza: "realizado",
      },
      {
        chave: "nucleo.concluidos",
        rotulo: "Concluídos na semana",
        valor: ult?.concluidos ?? 0,
        formato: "numero",
        serie: linhas.map((l) => ({ rotulo: l.rotulo, valor: l.concluidos })),
        melhorSe: "maior",
        origem: { rotulo: "Processos concluídos", href: "/processos?situacao=encerrados" },
        responsavel: "Protocolo Geral",
        atualizadoEm: agora,
        natureza: "realizado",
      },
      {
        chave: "nucleo.abertos",
        rotulo: "Abertos na semana",
        valor: ult?.abertos ?? 0,
        formato: "numero",
        serie: linhas.map((l) => ({ rotulo: l.rotulo, valor: l.abertos })),
        melhorSe: "neutro",
        origem: { rotulo: "Processos", href: "/processos?situacao=todos" },
        responsavel: "Protocolo Geral",
        atualizadoEm: agora,
        natureza: "realizado",
      },
      {
        chave: "nucleo.tempo",
        rotulo: "Tempo médio até a conclusão",
        valor: ult?.tempo == null ? null : Math.round(ult.tempo),
        formato: "dias",
        serie: linhas.filter((l) => l.tempo != null).map((l) => ({ rotulo: l.rotulo, valor: Math.round(l.tempo!) })),
        melhorSe: "menor",
        origem: { rotulo: "Painel de processos", href: "/painel" },
        responsavel: "Todos os setores",
        atualizadoEm: agora,
        natureza: "realizado",
        nota: "Média dos processos concluídos nos 90 dias anteriores a cada semana.",
      },
      {
        chave: "nucleo.atrasados",
        rotulo: "Com prazo da etapa estourado",
        valor: atual.atrasados,
        formato: "numero",
        melhorSe: "menor",
        origem: { rotulo: "Processos atrasados", href: "/processos?situacao=atrasados" },
        responsavel: "Setor onde cada processo está",
        atualizadoEm: agora,
        natureza: "realizado",
      },
    ];
    const alertas: Alerta[] = [];
    if (atual.urgentesAtrasados > 0)
      alertas.push({
        chave: "nucleo.urgentes",
        gravidade: "ALTA",
        titulo: `${atual.urgentesAtrasados} ${atual.urgentesAtrasados === 1 ? "processo urgente está" : "processos urgentes estão"} com prazo estourado`,
        motivo: "Processos marcados como urgentes passaram do prazo da etapa atual.",
        impacto: "Risco de desabastecimento ou de serviço interrompido, conforme o objeto.",
        responsavel: "Setor onde cada processo está",
        acao: { rotulo: "Ver atrasados", href: "/processos?situacao=atrasados" },
      });
    if (atual.exigencias > 0)
      alertas.push({
        chave: "nucleo.exigencias",
        gravidade: "BAIXA",
        titulo: `${atual.exigencias} ${atual.exigencias === 1 ? "pedido aguarda" : "pedidos aguardam"} complemento do interessado`,
        motivo: "Exigências abertas ao cidadão ou à empresa; o prazo do setor fica dependente da resposta.",
        responsavel: "Protocolo Geral",
        acao: { rotulo: "Ver processos", href: "/processos" },
      });
    return { indicadores, alertas };
  },
};

/** Pagamentos: fila cronológica e quebras de ordem (Lei 14.133, art. 141). */
export const provedorPagamentos: ProvedorIndicadores = {
  modulo: "Pagamentos",
  async carregar(municipioId) {
    const agora = new Date();
    const [filas, hist] = await Promise.all([filaDePagamentos(municipioId), historicoDePagamentos(municipioId, 90)]);
    const naFila = filas.reduce((s, f) => s + f.fila.length, 0);
    const total = filas.reduce((s, f) => s + f.total, 0);
    const indicadores: Indicador[] = [
      {
        chave: "pagamentos.fila",
        rotulo: "Valor aguardando pagamento",
        valor: total,
        formato: "moeda",
        melhorSe: "neutro",
        origem: { rotulo: "Fila de pagamentos", href: "/fila-de-pagamentos" },
        responsavel: "Tesouraria",
        atualizadoEm: agora,
        natureza: "realizado",
        nota: `${naFila} ${naFila === 1 ? "pagamento liquidado" : "pagamentos liquidados"} na fila.`,
      },
      {
        chave: "pagamentos.tempo",
        rotulo: "Dias entre liquidação e pagamento",
        valor: hist.mediaDias,
        formato: "dias",
        melhorSe: "menor",
        origem: { rotulo: "Fila de pagamentos", href: "/fila-de-pagamentos" },
        responsavel: "Tesouraria",
        atualizadoEm: agora,
        natureza: "realizado",
        nota: "Média dos pagamentos dos últimos 90 dias.",
      },
    ];
    const alertas: Alerta[] = [];
    if (hist.quebras.length > 0)
      alertas.push({
        chave: "pagamentos.quebras",
        gravidade: "MEDIA",
        titulo: `${hist.quebras.length} ${hist.quebras.length === 1 ? "pagamento feito" : "pagamentos feitos"} fora da ordem cronológica em 90 dias`,
        motivo: "Cada quebra tem justificativa publicada; o Tribunal de Contas costuma examinar a recorrência.",
        responsavel: "Tesouraria e ordenador de despesa",
        acao: { rotulo: "Ver justificativas", href: "/fila-de-pagamentos" },
      });
    const velhos = filas.flatMap((f) => f.fila).filter((x) => agora.getTime() - x.liquidadoEm.getTime() > 30 * DIA);
    if (velhos.length)
      alertas.push({
        chave: "pagamentos.antigos",
        gravidade: "MEDIA",
        titulo: `${velhos.length} ${velhos.length === 1 ? "pagamento liquidado há" : "pagamentos liquidados há"} mais de 30 dias`,
        motivo: `Somam ${fmtMoeda(velhos.reduce((s, x) => s + (x.valor ?? 0), 0))} e seguem na fila.`,
        impacto: "Risco de juros, de interrupção do fornecimento e de questionamento pelo fornecedor.",
        responsavel: "Tesouraria",
        acao: { rotulo: "Ver fila", href: "/fila-de-pagamentos" },
      });
    return { indicadores, alertas };
  },
};

/** Obrigações legais: PNCP e Tribunal de Contas. */
export const provedorObrigacoes: ProvedorIndicadores = {
  modulo: "Obrigações legais",
  async carregar(municipioId) {
    const obs = await obrigacoes(municipioId);
    const vencidas = obs.filter((o) => o.situacao === "vencida");
    const vence = obs.filter((o) => o.situacao === "vence");
    const alertas: Alerta[] = [];
    if (vencidas.length)
      alertas.push({
        chave: "obrigacoes.vencidas",
        gravidade: "ALTA",
        titulo: `${vencidas.length} ${vencidas.length === 1 ? "obrigação legal vencida" : "obrigações legais vencidas"}`,
        motivo: vencidas
          .slice(0, 3)
          .map((o) => `${o.numero}: ${o.titulo.toLowerCase()}`)
          .join("; "),
        impacto: "Contrato sem publicação no PNCP não tem eficácia; remessa atrasada ao TCE gera apontamento.",
        responsavel: "Compras e controle interno",
        acao: { rotulo: "Ver obrigações", href: "/obrigacoes?situacao=vencida" },
      });
    if (vence.length)
      alertas.push({
        chave: "obrigacoes.vence",
        gravidade: "MEDIA",
        titulo: `${vence.length} ${vence.length === 1 ? "obrigação vence" : "obrigações vencem"} em até 3 dias`,
        motivo: vence.map((o) => o.numero).join(", "),
        responsavel: "Compras e controle interno",
        acao: { rotulo: "Ver obrigações", href: "/obrigacoes?situacao=vence" },
      });
    return {
      indicadores: [
        {
          chave: "obrigacoes.abertas",
          rotulo: "Obrigações legais em aberto",
          valor: obs.filter((o) => o.situacao !== "cumprida").length,
          formato: "numero",
          melhorSe: "menor",
          origem: { rotulo: "Obrigações legais", href: "/obrigacoes" },
          responsavel: "Compras e controle interno",
          atualizadoEm: new Date(),
          natureza: "realizado",
          nota: `${vencidas.length} com prazo vencido.`,
        },
      ],
      alertas,
    };
  },
};

/** Automações: alertas abertos gerados pelas regras do município. */
export const provedorAutomacoes: ProvedorIndicadores = {
  modulo: "Automações",
  async carregar(municipioId) {
    const abertos = await alertasAbertos(municipioId);
    return {
      indicadores: [],
      alertas: abertos.map((a) => ({
        chave: `automacao.${a.id}`,
        gravidade: a.gravidade as Gravidade,
        titulo: a.titulo,
        motivo: a.detalhe ?? "",
        responsavel: a.regra ? `Regra "${a.regra.nome}"` : "Automação",
        acao: a.processoId ? { rotulo: "Abrir processo", href: `/processos/${a.processoId}` } : { rotulo: "Ver automações", href: "/automacoes" },
        quando: a.criadoEm,
      })),
    };
  },
};

/** Integrações: falhas e rejeições nos últimos 7 dias. */
export const provedorIntegracoes: ProvedorIndicadores = {
  modulo: "Integrações",
  async carregar(municipioId) {
    const desde = new Date(Date.now() - 7 * DIA);
    const rows = await db
      .select({ chave: gestaoIntegracoes.chave, n: sql<number>`count(*)::int` })
      .from(gestaoChamadas)
      .innerJoin(gestaoIntegracoes, eq(gestaoChamadas.integracaoId, gestaoIntegracoes.id))
      .where(and(eq(gestaoChamadas.municipioId, municipioId), gte(gestaoChamadas.criadoEm, desde), sql`${gestaoChamadas.status} in ('FALHA', 'REJEITADA')`))
      .groupBy(gestaoIntegracoes.chave);
    const total = rows.reduce((s, r) => s + r.n, 0);
    return {
      indicadores: [],
      alertas: total
        ? [
            {
              chave: "integracoes.falhas",
              gravidade: "BAIXA",
              titulo: `${total} ${total === 1 ? "envio rejeitado ou com falha" : "envios rejeitados ou com falha"} em integrações (7 dias)`,
              motivo: "Ambiente de demonstração: os conectores são simulados. Em produção, cada falha entra na fila de reprocessamento.",
              responsavel: "Administração",
              acao: { rotulo: "Ver obrigações legais", href: "/obrigacoes" },
            },
          ]
        : [],
    };
  },
};

const NUCLEO: ProvedorIndicadores[] = [provedorAtendimento, provedorObrigacoes, provedorPagamentos, provedorAutomacoes, provedorIntegracoes];

// ---- módulos: cada um acrescenta UMA linha aqui (veja o comentário no topo) ----
const EXTERNOS: (() => Promise<{ provedor: ProvedorIndicadores }>)[] = [
  // () => import("@/modulos/servicos/indicadores"),
];

export type ResultadoPainel = {
  porModulo: { modulo: string; indicadores: Indicador[]; erro?: string }[];
  alertas: (Alerta & { modulo: string })[];
};

const ORDEM_GRAV: Record<Gravidade, number> = { ALTA: 0, MEDIA: 1, BAIXA: 2 };

/** Carrega todos os provedores em paralelo; um provedor com erro não derruba os outros. */
export async function carregarIndicadores(municipioId: string): Promise<ResultadoPainel> {
  const externos = await Promise.all(
    EXTERNOS.map((f) =>
      f()
        .then((m) => m.provedor)
        .catch(() => null),
    ),
  );
  const provedores = [...NUCLEO, ...externos.filter((p): p is ProvedorIndicadores => !!p)];
  const res = await Promise.all(
    provedores.map(async (p) => {
      try {
        return { modulo: p.modulo, ...(await p.carregar(municipioId)) };
      } catch (e) {
        console.error(`Provedor de indicadores "${p.modulo}" falhou:`, e);
        return { modulo: p.modulo, indicadores: [], alertas: [], erro: "Fonte indisponível no momento." };
      }
    }),
  );
  return {
    porModulo: res.map((r) => ({ modulo: r.modulo, indicadores: r.indicadores, erro: "erro" in r ? r.erro : undefined })),
    alertas: res.flatMap((r) => r.alertas.map((a) => ({ ...a, modulo: r.modulo }))).sort((a, b) => ORDEM_GRAV[a.gravidade] - ORDEM_GRAV[b.gravidade]),
  };
}

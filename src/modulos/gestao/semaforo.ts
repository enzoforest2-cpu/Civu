// Semáforo de cada secretaria no mapa da Sala do prefeito (especificação "Comando da prefeitura", Parte 4).
// Função pura: recebe os quatro sinais já apurados e devolve a cor, o nome da cor e o porquê de cada sinal.
// As mesmas regras aparecem na tela ("Como o semáforo é calculado"), a partir de REGRAS_SEMAFORO.
// Teste: npx tsx --test src/modulos/gestao/semaforo.test.ts

export type NivelSemaforo = "verde" | "amarelo" | "vermelho";

export type SinaisSecretaria = {
  /** processos em andamento abertos pela pasta */
  emAndamento: number;
  /** desses, com o prazo da etapa vencido (onde quer que estejam) */
  atrasados: number;
  /** dotação atualizada da pasta; null = sem órgão orçamentário próprio */
  dotacaoAtualizada: number | null;
  liquidado: number;
  /** fração do ano decorrida (0 a 1) */
  fracaoDoAno: number;
  /** repasses com prazo vencido ou com pendência, e obrigações da área vencidas */
  repassesVencidos: number;
  /** repasses com prazo crítico em até 30 dias (sem os vencidos) */
  repassesEmRisco: number;
  obrigacoesVencidas: number;
  /** aprovações e assinaturas que esperam o(a) secretário(a) */
  pendenciasAssinatura: number;
  /** dessas, com o prazo da etapa vencido */
  pendenciasVencidas: number;
};

export type SinalAvaliado = { chave: "atrasos" | "execucao" | "repasses" | "assinaturas"; rotulo: string; nivel: NivelSemaforo; texto: string };
export type Semaforo = { nivel: NivelSemaforo; rotulo: string; sinais: SinalAvaliado[]; porque: string };

/** Limites das regras (em um lugar só, para a tela explicar exatamente o que o código faz). */
export const LIMITES_SEMAFORO = {
  /** a partir de quantos processos atrasados o sinal fica vermelho */
  atrasadosVermelho: 3,
  /** pontos percentuais de folga da execução (liquidado) abaixo do ritmo do ano */
  folgaExecucaoAmarelo: 20,
  folgaExecucaoVermelho: 30,
} as const;

export const NOME_NIVEL: Record<NivelSemaforo, string> = { verde: "Em dia", amarelo: "Atenção", vermelho: "Crítico" };

/** Regras em linguagem simples, mostradas na tela. */
export const REGRAS_SEMAFORO: { sinal: string; amarelo: string; vermelho: string }[] = [
  {
    sinal: "Atrasos",
    amarelo: "1 ou 2 processos da pasta com o prazo da etapa vencido",
    vermelho: `${LIMITES_SEMAFORO.atrasadosVermelho} ou mais processos da pasta atrasados`,
  },
  {
    sinal: "Execução do orçamento",
    amarelo: `liquidado mais de ${LIMITES_SEMAFORO.folgaExecucaoAmarelo} pontos abaixo da parte do ano já decorrida`,
    vermelho: `mais de ${LIMITES_SEMAFORO.folgaExecucaoVermelho} pontos abaixo`,
  },
  {
    sinal: "Repasses e obrigações",
    amarelo: "repasse com prazo em até 30 dias",
    vermelho: "repasse com prazo vencido ou pendência, ou obrigação da área vencida",
  },
  {
    sinal: "Assinaturas do(a) secretário(a)",
    amarelo: "aprovação ou assinatura esperando o(a) secretário(a)",
    vermelho: "alguma delas com o prazo da etapa vencido",
  },
];

const ORDEM: Record<NivelSemaforo, number> = { verde: 0, amarelo: 1, vermelho: 2 };
const pior = (a: NivelSemaforo, b: NivelSemaforo) => (ORDEM[b] > ORDEM[a] ? b : a);
const pl = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const pct = (x: number) => `${Math.round(x).toLocaleString("pt-BR")}%`;

export function avaliarSemaforo(s: SinaisSecretaria): Semaforo {
  const sinais: SinalAvaliado[] = [];

  // 1. Atrasos
  sinais.push({
    chave: "atrasos",
    rotulo: "Atrasos",
    nivel: s.atrasados >= LIMITES_SEMAFORO.atrasadosVermelho ? "vermelho" : s.atrasados > 0 ? "amarelo" : "verde",
    texto:
      s.emAndamento === 0
        ? "Nenhum processo da pasta em andamento."
        : s.atrasados === 0
          ? `${pl(s.emAndamento, "processo em andamento", "processos em andamento")}, nenhum atrasado.`
          : `${pl(s.atrasados, "processo atrasado", "processos atrasados")} de ${s.emAndamento} em andamento.`,
  });

  // 2. Execução orçamentária: liquidado ÷ dotação atualizada contra a parte do ano decorrida
  if (s.dotacaoAtualizada == null || s.dotacaoAtualizada <= 0) {
    sinais.push({ chave: "execucao", rotulo: "Execução do orçamento", nivel: "verde", texto: "Sem orçamento próprio: não entra no semáforo." });
  } else {
    const exec = (s.liquidado / s.dotacaoAtualizada) * 100;
    const ritmo = Math.max(0, Math.min(1, s.fracaoDoAno)) * 100;
    const atraso = ritmo - exec;
    const nivel: NivelSemaforo = atraso > LIMITES_SEMAFORO.folgaExecucaoVermelho ? "vermelho" : atraso > LIMITES_SEMAFORO.folgaExecucaoAmarelo ? "amarelo" : "verde";
    sinais.push({
      chave: "execucao",
      rotulo: "Execução do orçamento",
      nivel,
      texto: `${pct(exec)} liquidado; ${pct(ritmo)} do ano já passou${atraso > 0 ? ` (${Math.round(atraso).toLocaleString("pt-BR")} pontos abaixo)` : ""}.`,
    });
  }

  // 3. Repasses e obrigações
  const vencidos = s.repassesVencidos + s.obrigacoesVencidas;
  const partes: string[] = [];
  if (s.repassesVencidos) partes.push(pl(s.repassesVencidos, "repasse vencido ou com pendência", "repasses vencidos ou com pendência"));
  if (s.repassesEmRisco) partes.push(pl(s.repassesEmRisco, "repasse com prazo em até 30 dias", "repasses com prazo em até 30 dias"));
  if (s.obrigacoesVencidas) partes.push(pl(s.obrigacoesVencidas, "obrigação vencida", "obrigações vencidas"));
  sinais.push({
    chave: "repasses",
    rotulo: "Repasses e obrigações",
    nivel: vencidos > 0 ? "vermelho" : s.repassesEmRisco > 0 ? "amarelo" : "verde",
    texto: partes.length ? partes.join("; ") + "." : "Nenhum repasse em risco nem obrigação vencida.",
  });

  // 4. Pendências de assinatura do(a) secretário(a)
  sinais.push({
    chave: "assinaturas",
    rotulo: "Assinaturas do(a) secretário(a)",
    nivel: s.pendenciasVencidas > 0 ? "vermelho" : s.pendenciasAssinatura > 0 ? "amarelo" : "verde",
    texto:
      s.pendenciasAssinatura === 0
        ? "Nada esperando o(a) secretário(a)."
        : `${pl(s.pendenciasAssinatura, "item espera", "itens esperam")} o(a) secretário(a)${s.pendenciasVencidas ? `, ${s.pendenciasVencidas} com prazo vencido` : ""}.`,
  });

  const nivel = sinais.reduce<NivelSemaforo>((n, x) => pior(n, x.nivel), "verde");
  const ruins = sinais.filter((x) => x.nivel === nivel && nivel !== "verde");
  const porque =
    nivel === "verde"
      ? "Os quatro sinais estão dentro do esperado."
      : `${NOME_NIVEL[nivel]} por ${ruins.map((x) => x.rotulo.toLowerCase()).join(", ").replace(/, ([^,]*)$/, " e $1")}: ${ruins.map((x) => x.texto.replace(/\.$/, "")).join("; ")}.`;
  return { nivel, rotulo: NOME_NIVEL[nivel], sinais, porque };
}

/** Fração do ano decorrida numa data (dia do ano ÷ dias do ano), no fuso de Brasília. */
export function fracaoDoAno(d = new Date()): number {
  const iso = d.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const [a, m, dia] = iso.split("-").map(Number);
  const inicio = Date.UTC(a, 0, 1);
  const hoje = Date.UTC(a, m - 1, dia);
  const total = Date.UTC(a + 1, 0, 1) - inicio;
  return (hoje - inicio + 86400_000) / total;
}

// Resumo semanal em linguagem natural, gerado por regras e modelos de frase (sem IA externa).
// Função pura: recebe os números já apurados e devolve parágrafos curtos.

export type DadosResumo = {
  municipio: string;
  inicio: Date;
  fim: Date;
  abertos: number;
  abertosAnterior: number;
  concluidos: number;
  concluidosAnterior: number;
  estoque: number;
  estoqueAnterior: number;
  atrasados: number;
  aguardandoGabinete: number;
  gabineteVencendo: number;
  obrigacoesVencidas: number;
  obrigacoesProximas: number;
  pagamentosNaFila: number;
  valorNaFila: number;
  quebrasOrdem: number;
  alertasAltos: number;
  alertasTotal: number;
  setorMaisCarregado: { nome: string; n: number; atrasados: number } | null;
};

const n = (x: number, um: string, varios: string) => `${x.toLocaleString("pt-BR")} ${x === 1 ? um : varios}`;
const dataCurta = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Fortaleza", day: "2-digit", month: "2-digit" });
const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function variacao(atual: number, anterior: number, palavras: { mais: string; menos: string; igual: string }) {
  if (atual === anterior) return palavras.igual;
  const d = Math.abs(atual - anterior);
  return atual > anterior ? `${d} ${palavras.mais}` : `${d} ${palavras.menos}`;
}

export function gerarResumoSemanal(d: DadosResumo): { titulo: string; paragrafos: string[] } {
  const p: string[] = [];

  p.push(
    `Entre ${dataCurta(d.inicio)} e ${dataCurta(d.fim)}, a prefeitura abriu ${n(d.abertos, "processo", "processos")} ` +
      `(${variacao(d.abertos, d.abertosAnterior, { mais: "a mais que na semana anterior", menos: "a menos que na semana anterior", igual: "o mesmo número da semana anterior" })}) ` +
      `e concluiu ${d.concluidos.toLocaleString("pt-BR")} (${d.concluidosAnterior.toLocaleString("pt-BR")} na semana anterior). ` +
      (d.estoque === d.estoqueAnterior
        ? `O total em andamento ficou estável em ${d.estoque}.`
        : d.estoque > d.estoqueAnterior
          ? `O total em andamento subiu de ${d.estoqueAnterior} para ${d.estoque}: entrou mais do que saiu.`
          : `O total em andamento caiu de ${d.estoqueAnterior} para ${d.estoque}.`),
  );

  const dec: string[] = [];
  if (d.aguardandoGabinete === 0) dec.push("Não há processos parados no gabinete.");
  else
    dec.push(
      `${n(d.aguardandoGabinete, "processo aguarda", "processos aguardam")} decisão do gabinete` +
        (d.gabineteVencendo ? `, ${d.gabineteVencendo === 1 ? "um deles" : `${d.gabineteVencendo} deles`} com prazo vencido ou vencendo até amanhã.` : "."),
    );
  if (d.atrasados) {
    dec.push(
      `${n(d.atrasados, "processo está", "processos estão")} com o prazo da etapa estourado` +
        (d.setorMaisCarregado && d.setorMaisCarregado.atrasados > 0
          ? `; o setor com mais atraso é ${d.setorMaisCarregado.nome} (${d.setorMaisCarregado.atrasados} de ${d.setorMaisCarregado.n}).`
          : "."),
    );
  }
  p.push(dec.join(" "));

  const legal: string[] = [];
  if (d.obrigacoesVencidas) legal.push(`${n(d.obrigacoesVencidas, "obrigação legal está vencida", "obrigações legais estão vencidas")} (PNCP ou Tribunal de Contas)`);
  if (d.obrigacoesProximas) legal.push(`${n(d.obrigacoesProximas, "vence", "vencem")} nos próximos 7 dias`);
  const pag =
    d.pagamentosNaFila > 0
      ? `A fila de pagamentos tem ${n(d.pagamentosNaFila, "item", "itens")}, somando ${moeda(d.valorNaFila)}` +
        (d.quebrasOrdem ? `, e houve ${n(d.quebrasOrdem, "pagamento", "pagamentos")} fora da ordem cronológica nos últimos 90 dias, todos com justificativa publicada.` : ", sem pagamentos fora da ordem nos últimos 90 dias.")
      : "Não há pagamentos aguardando na fila.";
  p.push((legal.length ? `Na conformidade, ${legal.join(" e ")}. ` : "PNCP e Tribunal de Contas estão em dia. ") + pag);

  if (d.alertasTotal)
    p.push(
      d.alertasAltos
        ? `Há ${n(d.alertasAltos, "alerta de gravidade alta", "alertas de gravidade alta")} entre ${n(d.alertasTotal, "alerta aberto", "alertas abertos")}. Comece por eles.`
        : `Há ${n(d.alertasTotal, "alerta aberto", "alertas abertos")}, nenhum de gravidade alta.`,
    );

  const titulo =
    d.alertasAltos || d.obrigacoesVencidas
      ? "Semana com pontos que pedem decisão"
      : d.atrasados > 0 || d.aguardandoGabinete > 0
        ? "Semana com pendências sob controle"
        : "Semana sem pendências relevantes";
  return { titulo, paragrafos: p };
}

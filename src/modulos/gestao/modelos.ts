// Assistente de redação por modelos com variáveis. Versão por regras: o texto sai de modelos aprovados,
// preenchidos com os dados do processo. A versão com IA (rascunho a partir do histórico, com fontes) vem depois.

export type Variavel = { chave: string; rotulo: string; exemplo: string; doProcesso?: boolean };

export type Modelo = {
  chave: string;
  titulo: string;
  finalidade: "Despacho" | "Resposta ao cidadão" | "Ofício" | "Autorização" | "Planejamento da contratação";
  /** tipo de documento ao juntar no processo */
  documentoTipo: string;
  corpo: string;
};

export const VARIAVEIS: Variavel[] = [
  { chave: "numero", rotulo: "Número do processo", exemplo: "2026/000019", doProcesso: true },
  { chave: "assunto", rotulo: "Assunto", exemplo: "Autorização para caçamba de entulho", doProcesso: true },
  { chave: "interessado", rotulo: "Interessado", exemplo: "Ana Beatriz Souza", doProcesso: true },
  { chave: "setor", rotulo: "Setor atual", exemplo: "Protocolo Geral", doProcesso: true },
  { chave: "data", rotulo: "Data de hoje", exemplo: "29/10/2026", doProcesso: true },
  { chave: "municipio", rotulo: "Município", exemplo: "Vale das Araucárias", doProcesso: true },
  { chave: "autor", rotulo: "Quem assina", exemplo: "Maria Albuquerque", doProcesso: true },
  { chave: "cargo", rotulo: "Cargo de quem assina", exemplo: "Prefeita", doProcesso: true },
  { chave: "setor_destino", rotulo: "Setor de destino", exemplo: "Secretaria de Infraestrutura" },
  { chave: "prazo", rotulo: "Prazo (dias úteis)", exemplo: "5" },
  { chave: "pendencia", rotulo: "O que falta", exemplo: "cópia do alvará da obra" },
  { chave: "decisao", rotulo: "Decisão ou providência", exemplo: "deferido o pedido" },
];

export const MODELOS: Modelo[] = [
  {
    chave: "autorizacao",
    titulo: "Autorização de despesa",
    finalidade: "Autorização",
    documentoTipo: "DESPACHO_AUTORIZACAO",
    corpo:
      "DESPACHO DE AUTORIZAÇÃO\n\nProcesso nº {{numero}} — {{assunto}}\n\nConsiderando a demanda formalizada e a manifestação da área requisitante, AUTORIZO o prosseguimento da contratação, devendo o setor de compras instruir o processo na forma da Lei nº 14.133/2021.\n\n{{municipio}}, {{data}}.\n\n{{autor}}\n{{cargo}}",
  },
  {
    chave: "etp",
    titulo: "Estudo técnico preliminar (ETP)",
    finalidade: "Planejamento da contratação",
    documentoTipo: "ETP",
    corpo:
      "ESTUDO TÉCNICO PRELIMINAR\n(Lei nº 14.133/2021, art. 18, §1º)\n\nProcesso nº {{numero}} — {{assunto}}\nÓrgão: {{setor}} — Prefeitura de {{municipio}}\n\nOs campos marcados com [a preencher] orientam o que informar em cada item. Os itens que não se aplicam à contratação devem ser mantidos com a justificativa da não aplicação (art. 18, §2º).\n\n" +
      "I — Descrição da necessidade da contratação\n[a preencher: o problema a ser resolvido, sob a perspectiva do interesse público]\n\n" +
      "II — Previsão no plano de contratações anual\n[a preencher: o item do plano de contratações anual em que a contratação consta, indicando o alinhamento com o planejamento da Administração; se não constar, a justificativa]\n\n" +
      "III — Requisitos da contratação\n[a preencher: requisitos técnicos, de qualidade, de entrega e de sustentabilidade que a solução precisa atender]\n\n" +
      "IV — Estimativas das quantidades\n[a preencher: quantidades, com as memórias de cálculo e os documentos que as sustentam, considerando a interdependência com outras contratações e a possibilidade de economia de escala]\n\n" +
      "V — Levantamento de mercado\n[a preencher: as alternativas analisadas e a justificativa técnica e econômica da escolha do tipo de solução]\n\n" +
      "VI — Estimativa do valor da contratação\n[a preencher: valor estimado, com os preços unitários referenciais, as memórias de cálculo e os documentos de suporte; a pesquisa de preços fica registrada na etapa de instrução]\n\n" +
      "VII — Descrição da solução como um todo\n[a preencher: a solução escolhida, incluindo as exigências de manutenção e de assistência técnica, quando houver]\n\n" +
      "VIII — Justificativas para o parcelamento ou não da solução\n[a preencher: se a contratação será parcelada e por quê]\n\n" +
      "IX — Resultados pretendidos\n[a preencher: o que se espera em economicidade e em melhor aproveitamento dos recursos humanos, materiais e financeiros disponíveis]\n\n" +
      "X — Providências prévias à celebração do contrato\n[a preencher: o que a Administração precisa fazer antes de contratar, inclusive a capacitação de servidores para a fiscalização e a gestão contratual]\n\n" +
      "XI — Contratações correlatas ou interdependentes\n[a preencher: contratações que dependem desta ou de que esta depende]\n\n" +
      "XII — Possíveis impactos ambientais e medidas mitigadoras\n[a preencher: os impactos, as medidas e, quando aplicável, os requisitos de baixo consumo de energia e de outros recursos e a logística reversa]\n\n" +
      "XIII — Posicionamento conclusivo\n[a preencher: se a contratação é adequada para atender a necessidade descrita no item I]\n\n" +
      "{{municipio}}, {{data}}.\n\n{{autor}}\n{{cargo}}",
  },
  {
    chave: "tr",
    titulo: "Termo de referência (TR)",
    finalidade: "Planejamento da contratação",
    documentoTipo: "TR",
    corpo:
      "TERMO DE REFERÊNCIA\n(Lei nº 14.133/2021, art. 6º, XXIII)\n\nProcesso nº {{numero}} — {{assunto}}\nÓrgão: {{setor}} — Prefeitura de {{municipio}}\n\nOs campos marcados com [a preencher] orientam o que informar em cada item.\n\n" +
      "a) Definição do objeto\n[a preencher: a natureza do objeto, os quantitativos, o prazo do contrato e a possibilidade de prorrogação, se houver]\n\n" +
      "b) Fundamentação da contratação\n[a preencher: a referência ao estudo técnico preliminar deste processo ou, se ele não puder ser divulgado, o extrato das partes sem informações sigilosas]\n\n" +
      "c) Descrição da solução como um todo\n[a preencher: a solução considerando todo o ciclo de vida do objeto]\n\n" +
      "d) Requisitos da contratação\n[a preencher: requisitos técnicos, de qualidade, de entrega e de sustentabilidade]\n\n" +
      "e) Modelo de execução do objeto\n[a preencher: como o contrato deve produzir os resultados pretendidos, do início ao encerramento: prazos, locais e condições de entrega ou de prestação]\n\n" +
      "f) Modelo de gestão do contrato\n[a preencher: como a execução será acompanhada e fiscalizada pelo órgão, com o fiscal e o gestor indicados]\n\n" +
      "g) Critérios de medição e de pagamento\n[a preencher: como o que foi entregue será medido e as condições para o pagamento]\n\n" +
      "h) Forma e critérios de seleção do fornecedor\n[a preencher: a modalidade, o critério de julgamento e as exigências de habilitação]\n\n" +
      "i) Estimativas do valor da contratação\n[a preencher: o valor estimado e a referência ao documento separado com os preços unitários, as memórias de cálculo e os parâmetros da pesquisa de preços]\n\n" +
      "j) Adequação orçamentária\n[a preencher: a dotação orçamentária prevista, que a contabilidade confirma na etapa de verificação orçamentária]\n\n" +
      "{{municipio}}, {{data}}.\n\n{{autor}}\n{{cargo}}",
  },
  {
    chave: "encaminhamento",
    titulo: "Despacho de encaminhamento",
    finalidade: "Despacho",
    documentoTipo: "DESPACHO",
    corpo:
      "Processo nº {{numero}} — {{assunto}}\n\nEncaminhe-se à {{setor_destino}} para análise e manifestação no prazo de {{prazo}} dias úteis.\n\n{{municipio}}, {{data}}.\n\n{{autor}}\n{{cargo}}",
  },
  {
    chave: "deferimento",
    titulo: "Decisão de deferimento",
    finalidade: "Despacho",
    documentoTipo: "DESPACHO",
    corpo:
      "Processo nº {{numero}} — {{assunto}}\nInteressado: {{interessado}}\n\nAnalisado o pedido e a manifestação técnica, fica {{decisao}}. Dê-se ciência ao interessado e, após, arquive-se.\n\n{{municipio}}, {{data}}.\n\n{{autor}}\n{{cargo}}",
  },
  {
    chave: "exigencia",
    titulo: "Pedido de complemento ao interessado",
    finalidade: "Resposta ao cidadão",
    documentoTipo: "DESPACHO",
    corpo:
      "Olá, {{interessado}}.\n\nRecebemos o seu pedido nº {{numero}} ({{assunto}}). Para continuar a análise, precisamos de {{pendencia}}. Envie pelo portal Civu Cidadão em até {{prazo}} dias úteis. Se tiver dúvida, responda por aqui.\n\n{{setor}} — Prefeitura de {{municipio}}",
  },
  {
    chave: "resposta_conclusao",
    titulo: "Resposta de conclusão ao cidadão",
    finalidade: "Resposta ao cidadão",
    documentoTipo: "DESPACHO",
    corpo:
      "Olá, {{interessado}}.\n\nO seu pedido nº {{numero}} ({{assunto}}) foi concluído em {{data}}: {{decisao}}. O documento está disponível no portal Civu Cidadão, em Meus pedidos.\n\nPrefeitura de {{municipio}}",
  },
  {
    chave: "oficio_camara",
    titulo: "Ofício de resposta à Câmara",
    finalidade: "Ofício",
    documentoTipo: "OFICIO",
    corpo:
      "Ofício referente ao processo nº {{numero}}\n\nSenhor Presidente,\n\nEm atenção ao pedido de informações ({{assunto}}), encaminhamos a manifestação da {{setor_destino}}, que segue anexa ao processo.\n\nColocamo-nos à disposição para esclarecimentos.\n\n{{municipio}}, {{data}}.\n\n{{autor}}\n{{cargo}}",
  },
];

/** Variáveis usadas por um modelo, na ordem em que aparecem. */
export function variaveisDo(corpo: string): string[] {
  const vistas = new Set<string>();
  for (const m of corpo.matchAll(/\{\{(\w+)\}\}/g)) vistas.add(m[1]);
  return [...vistas];
}

/** Preenche o modelo; variável sem valor fica marcada como [a preencher: rótulo]. */
export function preencher(corpo: string, valores: Record<string, string | undefined>): { texto: string; faltando: string[] } {
  const faltando: string[] = [];
  const texto = corpo.replace(/\{\{(\w+)\}\}/g, (_, k: string) => {
    const v = valores[k]?.trim();
    if (v) return v;
    if (!faltando.includes(k)) faltando.push(k);
    return `[a preencher: ${VARIAVEIS.find((x) => x.chave === k)?.rotulo.toLowerCase() ?? k}]`;
  });
  return { texto, faltando };
}

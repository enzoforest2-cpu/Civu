// Assistente de redação por modelos com variáveis. Versão por regras: o texto sai de modelos aprovados,
// preenchidos com os dados do processo. A versão com IA (rascunho a partir do histórico, com fontes) vem depois.

export type Variavel = { chave: string; rotulo: string; exemplo: string; doProcesso?: boolean };

export type Modelo = {
  chave: string;
  titulo: string;
  finalidade: "Despacho" | "Resposta ao cidadão" | "Ofício" | "Autorização";
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

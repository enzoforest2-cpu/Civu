// Motor de workflow: tipos e definições. O fluxo é dado (JSON no banco), não código.
// A execução (avançar, devolver, tramitar, gates) fica em src/lib/engine.ts.

export const PAPEIS = [
  "REQUISITANTE",
  "SECRETARIO",
  "ORDENADOR",
  "PROTOCOLO",
  "COMPRAS",
  "CONTABILIDADE",
  "CONTROLE_INTERNO",
  "JURIDICO",
  "TESOURARIA",
  "FISCAL",
  "ADMIN",
] as const;
export type Papel = (typeof PAPEIS)[number];

export const PAPEL_NOME: Record<Papel, string> = {
  REQUISITANTE: "Requisitante",
  SECRETARIO: "Secretário(a)",
  ORDENADOR: "Ordenador(a) de despesa",
  PROTOCOLO: "Protocolo",
  COMPRAS: "Compras e licitações",
  CONTABILIDADE: "Contabilidade e orçamento",
  CONTROLE_INTERNO: "Controle interno",
  JURIDICO: "Procuradoria",
  TESOURARIA: "Tesouraria",
  FISCAL: "Fiscal de contrato",
  ADMIN: "Administrador",
};

/** Tipos de documento que podem ser juntados ao processo. */
export const DOCUMENTO_TIPOS: Record<string, string> = {
  DFD: "Documento de Formalização de Demanda (DFD)",
  DESPACHO: "Despacho",
  DESPACHO_AUTORIZACAO: "Despacho de autorização do ordenador",
  ETP: "Estudo Técnico Preliminar (ETP)",
  TR: "Termo de Referência (TR)",
  PESQUISA_PRECOS: "Pesquisa de preços",
  MAPA_RISCOS: "Mapa de riscos",
  CERTIDAO_DOTACAO: "Certidão de dotação orçamentária",
  DECLARACAO_LRF: "Declaração do ordenador (LRF art. 16)",
  NOTA_RESERVA: "Nota de reserva (pré-empenho)",
  PEDIDO_ALTERACAO_ORCAMENTARIA: "Pedido de alteração orçamentária",
  DECRETO_CREDITO: "Decreto ou lei de crédito adicional",
  CHECKLIST_CI: "Checklist do controle interno",
  PARECER_JURIDICO: "Parecer jurídico",
  EDITAL: "Edital ou aviso de contratação",
  ATA_SESSAO: "Ata da sessão",
  TERMO_HOMOLOGACAO: "Termo de homologação",
  CONTRATO: "Contrato ou ordem de compra",
  PORTARIA_FISCAL: "Portaria de gestor e fiscal",
  PUBLICACAO_PNCP: "Comprovante de publicação no PNCP",
  NOTA_EMPENHO: "Nota de empenho",
  NOTA_FISCAL: "Nota fiscal",
  ATESTO: "Atesto do fiscal",
  CERTIDOES: "Certidões de regularidade",
  NOTA_LIQUIDACAO: "Nota de liquidação",
  ORDEM_PAGAMENTO: "Ordem de pagamento",
  COMPROVANTE_PAGAMENTO: "Comprovante de pagamento",
  MEMORANDO: "Memorando",
  OFICIO: "Ofício",
  REQUERIMENTO: "Requerimento",
  OUTRO: "Outro",
};

export type Gate =
  { tipo: "documento"; documentoTipo: string; assinadoPor?: Papel[]; assinadoPorQualquer?: Papel[]; descricao?: string } | { tipo: "campo"; campo: string; descricao?: string };

export type Transicao = { para: string; rotulo: string; motivoObrigatorio?: boolean };

export type EstadoDef = {
  chave: string;
  nome: string;
  descricao?: string;
  /** Sigla do setor responsável; null = setor do requisitante; "LIVRE" = qualquer setor (tramitação livre). */
  setor: string | null | "LIVRE";
  /** Papéis que podem agir (avançar/devolver) neste estado. */
  papeis: Papel[];
  slaDiasUteis: number;
  /** Condições para SAIR deste estado por um avanço. */
  gates: Gate[];
  avancos: Transicao[];
  devolucoes: Transicao[];
  final?: boolean;
};

export type WorkflowDef = {
  estadoInicial: string;
  estados: EstadoDef[];
  /** Campos extras exigidos na abertura (ex.: DFD). */
  camposAbertura?: { chave: string; rotulo: string; tipo: "texto" | "numero" | "data" | "longo" | "opcao"; opcoes?: string[]; obrigatorio?: boolean }[];
};

export function getEstado(def: WorkflowDef, chave: string): EstadoDef | undefined {
  return def.estados.find((e) => e.chave === chave);
}

// ---------------------------------------------------------------------------
// Workflow 1: COMPRA — do DFD ao pagamento (18 estados, 2 decisões, retornos)
// ---------------------------------------------------------------------------
const doc = (documentoTipo: string, assinadoPor?: Papel[], descricao?: string): Gate => ({
  tipo: "documento",
  documentoTipo,
  assinadoPor,
  descricao,
});

export const WORKFLOW_COMPRA: WorkflowDef = {
  estadoInicial: "DEMANDA",
  camposAbertura: [
    { chave: "objeto", rotulo: "Objeto (o que precisa ser contratado)", tipo: "texto", obrigatorio: true },
    { chave: "justificativa", rotulo: "Justificativa da necessidade", tipo: "longo", obrigatorio: true },
    { chave: "quantidade", rotulo: "Quantidade estimada", tipo: "texto", obrigatorio: true },
    { chave: "valorEstimado", rotulo: "Valor estimado (R$)", tipo: "numero", obrigatorio: true },
    { chave: "dataPretendida", rotulo: "Data em que precisa estar disponível", tipo: "data", obrigatorio: true },
    { chave: "prioridade", rotulo: "Grau de prioridade", tipo: "opcao", opcoes: ["BAIXA", "MEDIA", "ALTA"], obrigatorio: true },
    { chave: "noPCA", rotulo: "Consta no Plano de Contratações Anual?", tipo: "opcao", opcoes: ["SIM", "NAO", "NAO_SEI"], obrigatorio: true },
  ],
  estados: [
    {
      chave: "DEMANDA",
      nome: "1. Demanda aberta",
      descricao: "O requisitante formaliza a demanda (DFD) e assina.",
      setor: null,
      papeis: ["REQUISITANTE", "SECRETARIO"],
      slaDiasUteis: 3,
      gates: [{ tipo: "documento", documentoTipo: "DFD", assinadoPorQualquer: ["REQUISITANTE", "SECRETARIO"], descricao: "DFD juntado e assinado pelo responsável pela demanda" }],
      avancos: [{ para: "AUTORIZACAO", rotulo: "Enviar para autorização" }],
      devolucoes: [],
    },
    {
      chave: "AUTORIZACAO",
      nome: "3. Em autorização",
      descricao: "Secretário da pasta e ordenador de despesa autorizam o prosseguimento.",
      setor: "GAB",
      papeis: ["ORDENADOR", "SECRETARIO"],
      slaDiasUteis: 2,
      gates: [doc("DESPACHO_AUTORIZACAO", ["ORDENADOR"], "Despacho de autorização assinado pelo ordenador")],
      avancos: [{ para: "INSTRUCAO", rotulo: "Autorizar e enviar a compras" }],
      devolucoes: [{ para: "DEMANDA", rotulo: "Devolver ao requisitante", motivoObrigatorio: true }],
    },
    {
      chave: "INSTRUCAO",
      nome: "4. Em instrução (compras)",
      descricao: "Compras verifica o PCA, elabora ETP e TR e faz a pesquisa de preços.",
      setor: "COMPRAS",
      papeis: ["COMPRAS"],
      slaDiasUteis: 10,
      gates: [
        doc("ETP", undefined, "Estudo Técnico Preliminar"),
        doc("TR", undefined, "Termo de Referência"),
        doc("PESQUISA_PRECOS", undefined, "Pesquisa de preços com ao menos 3 fontes"),
      ],
      avancos: [{ para: "VERIFICACAO_ORCAMENTARIA", rotulo: "Enviar à contabilidade" }],
      devolucoes: [{ para: "DEMANDA", rotulo: "Devolver ao requisitante", motivoObrigatorio: true }],
    },
    {
      chave: "VERIFICACAO_ORCAMENTARIA",
      nome: "5. Verificação orçamentária",
      descricao: "Contabilidade informa dotação, saldo e impacto (LRF arts. 16–17).",
      setor: "CONTAB",
      papeis: ["CONTABILIDADE"],
      slaDiasUteis: 2,
      gates: [doc("CERTIDAO_DOTACAO", undefined, "Certidão de dotação com classificação completa e saldo")],
      avancos: [
        { para: "RESERVADO", rotulo: "Há dotação: reservar" },
        { para: "ALTERACAO_ORCAMENTARIA", rotulo: "Sem dotação: pedir crédito adicional" },
      ],
      devolucoes: [{ para: "INSTRUCAO", rotulo: "Devolver a compras", motivoObrigatorio: true }],
    },
    {
      chave: "ALTERACAO_ORCAMENTARIA",
      nome: "5b. Em alteração orçamentária",
      descricao: "Pedido de crédito adicional por decreto (dentro do limite da LOA) ou lei.",
      setor: "CONTAB",
      papeis: ["CONTABILIDADE", "ORDENADOR"],
      slaDiasUteis: 5,
      gates: [
        doc("PEDIDO_ALTERACAO_ORCAMENTARIA", undefined, "Pedido com fonte do recurso e demonstrativo das dotações"),
        doc("DECRETO_CREDITO", ["ORDENADOR"], "Decreto ou lei de crédito adicional assinado"),
      ],
      avancos: [{ para: "RESERVADO", rotulo: "Crédito aberto: reservar" }],
      devolucoes: [{ para: "AUTORIZACAO", rotulo: "Crédito negado: devolver ao ordenador", motivoObrigatorio: true }],
    },
    {
      chave: "RESERVADO",
      nome: "6. Reservado (pré-empenho)",
      descricao: "Nota de reserva emitida; o valor é abatido da dotação.",
      setor: "CONTAB",
      papeis: ["CONTABILIDADE"],
      slaDiasUteis: 1,
      gates: [doc("NOTA_RESERVA", undefined, "Nota de reserva orçamentária")],
      avancos: [{ para: "CONTROLE_INTERNO", rotulo: "Enviar ao controle interno" }],
      devolucoes: [],
    },
    {
      chave: "CONTROLE_INTERNO",
      nome: "7. Em controle interno",
      descricao: "Checklist de conformidade (ETP, TR, estimativa, dotação, segregação).",
      setor: "CGM",
      papeis: ["CONTROLE_INTERNO"],
      slaDiasUteis: 3,
      gates: [doc("CHECKLIST_CI", ["CONTROLE_INTERNO"], "Checklist marcado como conforme")],
      avancos: [{ para: "PARECER_JURIDICO", rotulo: "Conforme: enviar à procuradoria" }],
      devolucoes: [{ para: "INSTRUCAO", rotulo: "Saneamento: devolver a compras", motivoObrigatorio: true }],
    },
    {
      chave: "PARECER_JURIDICO",
      nome: "8. Em parecer jurídico",
      descricao: "Controle prévio de legalidade do edital, minuta ou dispensa (art. 53).",
      setor: "PGM",
      papeis: ["JURIDICO"],
      slaDiasUteis: 5,
      gates: [doc("PARECER_JURIDICO", ["JURIDICO"], "Parecer jurídico assinado")],
      avancos: [{ para: "CONTRATACAO", rotulo: "Favorável: iniciar contratação" }],
      devolucoes: [{ para: "INSTRUCAO", rotulo: "Desfavorável: devolver a compras", motivoObrigatorio: true }],
    },
    {
      chave: "CONTRATACAO",
      nome: "9. Em contratação",
      descricao: "Licitação ou contratação direta: aviso/edital, sessão, habilitação, adjudicação.",
      setor: "COMPRAS",
      papeis: ["COMPRAS"],
      slaDiasUteis: 20,
      gates: [doc("EDITAL", undefined, "Edital ou aviso publicado"), doc("ATA_SESSAO", undefined, "Ata da sessão com resultado")],
      avancos: [{ para: "HOMOLOGADO", rotulo: "Enviar para homologação" }],
      devolucoes: [{ para: "INSTRUCAO", rotulo: "Deserta ou fracassada: refazer", motivoObrigatorio: true }],
    },
    {
      chave: "HOMOLOGADO",
      nome: "10. Homologação",
      descricao: "Autoridade competente homologa; resultado publicado no PNCP.",
      setor: "GAB",
      papeis: ["ORDENADOR"],
      slaDiasUteis: 2,
      gates: [doc("TERMO_HOMOLOGACAO", ["ORDENADOR"], "Termo de homologação assinado")],
      avancos: [{ para: "CONTRATADO", rotulo: "Homologar e contratar" }],
      devolucoes: [{ para: "CONTRATACAO", rotulo: "Devolver à contratação", motivoObrigatorio: true }],
    },
    {
      chave: "CONTRATADO",
      nome: "11. Contratado",
      descricao: "Contrato assinado, gestor e fiscal nomeados por portaria, publicação no PNCP (condição de eficácia).",
      setor: "COMPRAS",
      papeis: ["COMPRAS"],
      slaDiasUteis: 5,
      gates: [
        doc("CONTRATO", ["ORDENADOR"], "Contrato ou ordem de compra assinado"),
        doc("PORTARIA_FISCAL", undefined, "Portaria nomeando gestor e fiscal com suplente"),
        doc("PUBLICACAO_PNCP", undefined, "Publicação no PNCP (20 dias úteis licitação / 10 direta)"),
      ],
      avancos: [{ para: "EMPENHADO", rotulo: "Enviar para empenho" }],
      devolucoes: [],
    },
    {
      chave: "EMPENHADO",
      nome: "12. Empenhado",
      descricao: "Nota de empenho assinada pelo contador e pelo ordenador (Lei 4.320, art. 60).",
      setor: "CONTAB",
      papeis: ["CONTABILIDADE"],
      slaDiasUteis: 2,
      gates: [doc("NOTA_EMPENHO", ["CONTABILIDADE", "ORDENADOR"], "Nota de empenho assinada por contador e ordenador")],
      avancos: [{ para: "EXECUCAO", rotulo: "Enviar ordem ao fornecedor e acompanhar" }],
      devolucoes: [{ para: "ALTERACAO_ORCAMENTARIA", rotulo: "Empenho maior que a reserva", motivoObrigatorio: true }],
    },
    {
      chave: "EXECUCAO",
      nome: "13. Em execução",
      descricao: "Fiscal recebe, mede e atesta a nota fiscal; almoxarifado confere; patrimônio tomba.",
      setor: "LIVRE",
      papeis: ["FISCAL", "REQUISITANTE"],
      slaDiasUteis: 5,
      gates: [
        doc("NOTA_FISCAL", undefined, "Nota fiscal do fornecedor"),
        doc("ATESTO", ["FISCAL"], "Atesto do fiscal do contrato"),
        doc("CERTIDOES", undefined, "Certidões de regularidade vigentes"),
      ],
      avancos: [{ para: "LIQUIDADO", rotulo: "Enviar para liquidação" }],
      devolucoes: [],
    },
    {
      chave: "LIQUIDADO",
      nome: "14. Liquidado",
      descricao: "Verificação do direito do credor (Lei 4.320, art. 63); data da liquidação define a ordem cronológica.",
      setor: "CONTAB",
      papeis: ["CONTABILIDADE"],
      slaDiasUteis: 10,
      gates: [doc("NOTA_LIQUIDACAO", ["ORDENADOR"], "Nota de liquidação assinada pelo ordenador")],
      avancos: [{ para: "FILA_PAGAMENTO", rotulo: "Enviar à tesouraria" }],
      devolucoes: [{ para: "EXECUCAO", rotulo: "Documento faltante: devolver ao fiscal", motivoObrigatorio: true }],
    },
    {
      chave: "FILA_PAGAMENTO",
      nome: "15. Na fila cronológica",
      descricao: "Posição por fonte de recurso e data de liquidação (Lei 14.133, art. 141).",
      setor: "TES",
      papeis: ["TESOURARIA"],
      slaDiasUteis: 20,
      gates: [doc("ORDEM_PAGAMENTO", ["ORDENADOR", "TESOURARIA"], "Ordem de pagamento assinada pelo ordenador e pela tesouraria")],
      avancos: [{ para: "PAGO", rotulo: "Registrar pagamento" }],
      devolucoes: [],
    },
    {
      chave: "PAGO",
      nome: "16. Pago",
      descricao: "Ordem bancária executada; comprovante juntado; fornecedor avisado.",
      setor: "TES",
      papeis: ["TESOURARIA"],
      slaDiasUteis: 2,
      gates: [doc("COMPROVANTE_PAGAMENTO", undefined, "Comprovante do pagamento")],
      avancos: [{ para: "ARQUIVADO", rotulo: "Publicar e arquivar" }],
      devolucoes: [],
    },
    {
      chave: "ARQUIVADO",
      nome: "18. Arquivado",
      descricao: "Processo encerrado; dados na transparência e na remessa ao TCE; indicadores consolidados.",
      setor: "PROT",
      papeis: ["PROTOCOLO", "ADMIN"],
      slaDiasUteis: 0,
      gates: [],
      avancos: [],
      devolucoes: [],
      final: true,
    },
  ],
};

// ---------------------------------------------------------------------------
// Workflow 2: REQUERIMENTO — processo de tramitação livre (ofícios, requerimentos, pedidos internos)
// ---------------------------------------------------------------------------
export const WORKFLOW_REQUERIMENTO: WorkflowDef = {
  estadoInicial: "PROTOCOLADO",
  camposAbertura: [{ chave: "interessado", rotulo: "Interessado (pessoa ou setor)", tipo: "texto", obrigatorio: true }],
  estados: [
    {
      chave: "PROTOCOLADO",
      nome: "Protocolado",
      descricao: "Recebido pelo protocolo e distribuído ao setor competente.",
      setor: "PROT",
      papeis: ["PROTOCOLO", "ADMIN"],
      slaDiasUteis: 1,
      gates: [],
      avancos: [{ para: "EM_ANALISE", rotulo: "Distribuir para análise" }],
      devolucoes: [],
    },
    {
      chave: "EM_ANALISE",
      nome: "Em análise",
      descricao: "Tramitação livre entre setores até a decisão (prazo da Lei 9.784: 30 dias).",
      setor: "LIVRE",
      papeis: ["REQUISITANTE", "SECRETARIO", "ORDENADOR", "COMPRAS", "CONTABILIDADE", "CONTROLE_INTERNO", "JURIDICO", "TESOURARIA", "PROTOCOLO", "ADMIN"],
      slaDiasUteis: 20,
      gates: [doc("DESPACHO", undefined, "Despacho com a decisão")],
      avancos: [{ para: "CONCLUIDO", rotulo: "Concluir" }],
      devolucoes: [{ para: "PROTOCOLADO", rotulo: "Devolver ao protocolo", motivoObrigatorio: true }],
    },
    {
      chave: "CONCLUIDO",
      nome: "Concluído",
      setor: "PROT",
      papeis: ["PROTOCOLO", "ADMIN"],
      slaDiasUteis: 0,
      gates: [],
      avancos: [],
      devolucoes: [],
      final: true,
    },
  ],
};

export const WORKFLOWS_PADRAO = [
  {
    chave: "COMPRA",
    nome: "Contratação (compra ou serviço)",
    descricao: "Do DFD ao pagamento, com dotação, controle interno, jurídico, licitação, empenho e liquidação.",
    definicao: WORKFLOW_COMPRA,
  },
  { chave: "REQUERIMENTO", nome: "Requerimento / ofício", descricao: "Processo de tramitação livre entre setores.", definicao: WORKFLOW_REQUERIMENTO },
];

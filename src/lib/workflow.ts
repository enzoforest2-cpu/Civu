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

/** Papel com artigo, para frases como "Falta a assinatura do requisitante ou do secretário". */
export const PAPEL_COM_ARTIGO: Record<Papel, string> = {
  REQUISITANTE: "do requisitante",
  SECRETARIO: "do secretário",
  ORDENADOR: "do ordenador de despesa",
  PROTOCOLO: "do protocolo",
  COMPRAS: "do setor de compras",
  CONTABILIDADE: "da contabilidade",
  CONTROLE_INTERNO: "do controle interno",
  JURIDICO: "da procuradoria",
  TESOURARIA: "da tesouraria",
  FISCAL: "do fiscal de contrato",
  ADMIN: "do administrador",
};

/** Lista de papéis em linguagem de tela: ["REQUISITANTE", "SECRETARIO"] → "do requisitante ou do secretário". */
export function papeisPorExtenso(papeis: readonly string[], conjuncao: "ou" | "e" = "ou"): string {
  const nomes = papeis.map((p) => PAPEL_COM_ARTIGO[p as Papel] ?? `de ${p.toLowerCase().replace(/_/g, " ")}`);
  return nomes.length <= 1 ? (nomes[0] ?? "") : `${nomes.slice(0, -1).join(", ")} ${conjuncao} ${nomes[nomes.length - 1]}`;
}

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
  TERMO_AUTUACAO: "Termo de autuação (capa e termo de abertura)",
  RESPOSTA_IMPUGNACAO: "Resposta a impugnação ou pedido de esclarecimento",
  DECISAO_RECURSO: "Decisão de recurso",
  AVISO_DISPENSA: "Aviso de contratação direta",
  ATO_AUTORIZACAO_DIRETA: "Ato de autorização da contratação direta",
  ORDEM_FORNECIMENTO: "Ordem de fornecimento ou de serviço",
  RETORNO_BANCARIO: "Retorno bancário",
  OUTRO: "Outro",
};

/** Regras de negócio avaliadas pelas funções puras de src/lib/regras-fluxo.ts (ver avaliarGates em engine.ts). */
export type RegraFluxo =
  | "MODALIDADE_DEFINIDA"
  | "PESQUISA_PRECOS"
  | "PRAZO_EDITAL"
  | "IMPUGNACOES"
  | "RESULTADO_SESSAO"
  | "RECURSOS"
  | "AVISO_DISPENSA"
  | "RETORNO_BANCARIO"
  | "CONTRATACAO_COMPLETA";

export type Gate =
  | { tipo: "documento"; documentoTipo: string; assinadoPor?: Papel[]; assinadoPorQualquer?: Papel[]; descricao?: string }
  | { tipo: "campo"; campo: string; descricao?: string }
  | { tipo: "regra"; regra: RegraFluxo; descricao: string };

export type Transicao = {
  para: string;
  rotulo: string;
  motivoObrigatorio?: boolean;
  /** Avanço condicional: só vale quando metadados[campo] é um dos valores (ex.: modalidade da contratação). */
  quando?: { campo: string; valores: string[] };
};

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
  /** Etapa de pagamento: sair dela fora da ordem cronológica da fonte exige justificativa (Lei 14.133, art. 141). */
  filaCronologica?: boolean;
  /** Etapa de um só caminho da contratação: licitação ou contratação direta. Sem ramo, vale para os dois. */
  ramo?: "LICITACAO" | "DIRETA";
  /** Desvio que só acontece em alguns processos (ex.: alteração orçamentária). */
  opcional?: boolean;
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

/** Avanços que valem para este processo: aplica as condições `quando` contra os metadados. */
export function avancosDisponiveis(def: WorkflowDef, estado: EstadoDef, metadados: Record<string, unknown> | null): Transicao[] {
  return estado.avancos.filter((t) => {
    if (!getEstado(def, t.para)) return false;
    if (!t.quando) return true;
    const v = metadados?.[t.quando.campo];
    return typeof v === "string" && t.quando.valores.includes(v);
  });
}

/** Ramo da contratação conforme a modalidade; null enquanto não está definida. */
export function ramoDaModalidade(modalidade: unknown): "LICITACAO" | "DIRETA" | null {
  if (modalidade === "LICITACAO") return "LICITACAO";
  if (modalidade === "DISPENSA_VALOR" || modalidade === "OUTRA_DIRETA") return "DIRETA";
  return null;
}

/** Etapas do fluxo que valem para este processo: sem a etapa do ramo que não é o da modalidade. Sem modalidade, mostra os dois. */
export function caminhoDoProcesso(def: WorkflowDef, metadados: Record<string, unknown> | null): EstadoDef[] {
  const ramo = ramoDaModalidade(metadados?.modalidade);
  if (!ramo) return def.estados;
  return def.estados.filter((e) => !e.ramo || e.ramo === ramo);
}

// ---------------------------------------------------------------------------
// Classificações usadas pelas regras de conformidade
// ---------------------------------------------------------------------------

/** Natureza do objeto: base para somar despesas de mesma natureza no exercício (Lei 14.133, art. 75, §1º). */
export const NATUREZAS: Record<string, { nome: string; engenharia?: boolean }> = {
  MATERIAL_EXPEDIENTE: { nome: "Material de expediente e escritório" },
  MATERIAL_LIMPEZA: { nome: "Material de limpeza e higiene" },
  GENEROS_ALIMENTICIOS: { nome: "Gêneros alimentícios" },
  MEDICAMENTOS: { nome: "Medicamentos e insumos de saúde" },
  COMBUSTIVEIS: { nome: "Combustíveis e lubrificantes" },
  EQUIPAMENTOS: { nome: "Equipamentos e mobiliário" },
  SERVICOS_TI: { nome: "Serviços e sistemas de TI" },
  TRANSPORTE: { nome: "Transporte e locação de veículos" },
  SERVICOS_GERAIS: { nome: "Outros serviços comuns" },
  SERVICO_ENGENHARIA: { nome: "Obras e serviços de engenharia", engenharia: true },
  OUTROS: { nome: "Outros bens" },
};

export const MODALIDADES: Record<string, string> = {
  DISPENSA_VALOR: "Dispensa por valor (art. 75, I ou II)",
  LICITACAO: "Licitação (pregão ou concorrência)",
  OUTRA_DIRETA: "Outra contratação direta (inexigibilidade, emergência, adesão a ata)",
  A_DEFINIR: "Ainda não sei (compras define)",
};

/** Fonte de recurso: a ordem cronológica de pagamentos é separada por fonte (art. 141). */
export const FONTES: Record<string, string> = {
  ORDINARIOS: "Recursos ordinários (livres)",
  SAUDE: "Saúde (vinculados)",
  EDUCACAO: "Educação e FUNDEB (vinculados)",
  ASSISTENCIA: "Assistência social (vinculados)",
  CONVENIOS: "Convênios e transferências",
  OUTRAS: "Outras vinculadas",
};

/** Limites de dispensa por valor em 2026 (Decreto 12.807/2025). */
export const LIMITES_DISPENSA = { comum: 65492.11, engenharia: 130984.2, ano: 2026 };

/** Rótulos legíveis para opções de campos. */
export const ROTULO_OPCAO: Record<string, string> = {
  BAIXA: "Baixa",
  MEDIA: "Média",
  ALTA: "Alta",
  SIM: "Sim",
  NAO: "Não",
  NAO_SEI: "Não sei",
  ...Object.fromEntries(Object.entries(NATUREZAS).map(([k, v]) => [k, v.nome])),
  ...MODALIDADES,
};

// ---------------------------------------------------------------------------
// Workflow 1: COMPRA — do DFD ao pagamento (25 estados: licitação ou contratação direta, desvios e retornos)
// Setores, papéis, prazos sugeridos, documentos e travas seguem o esboço docs/especificacoes/fluxo-protocolo.html.
// ---------------------------------------------------------------------------
const doc = (documentoTipo: string, assinadoPor?: Papel[], descricao?: string): Gate => ({
  tipo: "documento",
  documentoTipo,
  assinadoPor,
  descricao,
});
const regra = (r: RegraFluxo, descricao: string): Gate => ({ tipo: "regra", regra: r, descricao });

export const WORKFLOW_COMPRA: WorkflowDef = {
  estadoInicial: "DEMANDA",
  camposAbertura: [
    { chave: "objeto", rotulo: "Objeto (o que precisa ser contratado)", tipo: "texto", obrigatorio: true },
    { chave: "natureza", rotulo: "Natureza do objeto", tipo: "opcao", opcoes: Object.keys(NATUREZAS), obrigatorio: true },
    { chave: "modalidade", rotulo: "Forma de contratação prevista", tipo: "opcao", opcoes: Object.keys(MODALIDADES), obrigatorio: true },
    { chave: "justificativa", rotulo: "Justificativa da necessidade", tipo: "longo", obrigatorio: true },
    { chave: "quantidade", rotulo: "Quantidade estimada", tipo: "texto", obrigatorio: true },
    { chave: "valorEstimado", rotulo: "Valor estimado (R$)", tipo: "numero", obrigatorio: true },
    { chave: "dataPretendida", rotulo: "Data em que precisa estar disponível", tipo: "data", obrigatorio: true },
    { chave: "prioridade", rotulo: "Grau de prioridade", tipo: "opcao", opcoes: ["BAIXA", "MEDIA", "ALTA"], obrigatorio: true },
    { chave: "noPCA", rotulo: "Consta no Plano de Contratações Anual?", tipo: "opcao", opcoes: ["SIM", "NAO", "NAO_SEI"], obrigatorio: true },
  ],
  // Nomes sem número de ordem: com os dois ramos (licitação e direta) a posição muda conforme o processo.
  estados: [
    // ---- Pedido
    {
      chave: "DEMANDA",
      nome: "Demanda aberta",
      descricao: "O requisitante formaliza a demanda (DFD) e assina.",
      setor: null,
      papeis: ["REQUISITANTE", "SECRETARIO"],
      slaDiasUteis: 3,
      gates: [{ tipo: "documento", documentoTipo: "DFD", assinadoPorQualquer: ["REQUISITANTE", "SECRETARIO"], descricao: "DFD juntado e assinado pelo responsável pela demanda" }],
      avancos: [{ para: "APROVACAO_SECRETARIO", rotulo: "Enviar ao secretário" }],
      devolucoes: [],
    },
    {
      chave: "APROVACAO_SECRETARIO",
      nome: "Aprovação do secretário",
      descricao: "O secretário confirma que a demanda é da pasta e que faz sentido agora, e assina o DFD.",
      setor: null,
      papeis: ["SECRETARIO"],
      slaDiasUteis: 2,
      gates: [doc("DFD", ["SECRETARIO"], "DFD assinado pelo secretário da pasta")],
      avancos: [{ para: "AUTUACAO", rotulo: "Aprovar e enviar ao protocolo" }],
      devolucoes: [{ para: "DEMANDA", rotulo: "Devolver ao requisitante", motivoObrigatorio: true }],
    },
    {
      chave: "AUTUACAO",
      nome: "Autuação",
      descricao: "O protocolo confere o pedido, registra assunto, interessado e classificação e encaminha ao gabinete.",
      setor: "PROT",
      papeis: ["PROTOCOLO"],
      slaDiasUteis: 1,
      gates: [doc("TERMO_AUTUACAO", undefined, "Capa e termo de abertura do processo")],
      avancos: [{ para: "AUTORIZACAO", rotulo: "Autuar e enviar ao gabinete" }],
      devolucoes: [{ para: "DEMANDA", rotulo: "Pedido incompleto: devolver à secretaria", motivoObrigatorio: true }],
    },
    {
      chave: "AUTORIZACAO",
      nome: "Em autorização",
      descricao: "O ordenador de despesa decide se a prefeitura vai gastar com isso agora.",
      setor: "GAB",
      papeis: ["ORDENADOR"],
      slaDiasUteis: 3,
      gates: [doc("DESPACHO_AUTORIZACAO", ["ORDENADOR"], "Despacho de autorização assinado pelo ordenador")],
      avancos: [{ para: "INSTRUCAO", rotulo: "Autorizar e enviar a compras" }],
      devolucoes: [{ para: "DEMANDA", rotulo: "Indeferir: devolver à secretaria", motivoObrigatorio: true }],
    },
    // ---- Planejamento
    {
      chave: "INSTRUCAO",
      nome: "Em instrução (compras)",
      descricao: "Pesquisa de preços, estudo técnico, termo de referência e definição do caminho da contratação.",
      setor: "COMPRAS",
      papeis: ["COMPRAS"],
      slaDiasUteis: 10,
      gates: [
        doc("ETP", undefined, "Estudo Técnico Preliminar e mapa de riscos"),
        { tipo: "documento", documentoTipo: "TR", assinadoPorQualquer: ["REQUISITANTE", "SECRETARIO"], descricao: "Termo de referência assinado pela área técnica" },
        regra("PESQUISA_PRECOS", "Pesquisa de preços com ao menos 3 fontes ou justificativa (art. 23)"),
      ],
      avancos: [{ para: "VERIFICACAO_ORCAMENTARIA", rotulo: "Enviar à contabilidade" }],
      devolucoes: [{ para: "DEMANDA", rotulo: "Devolver ao requisitante", motivoObrigatorio: true }],
    },
    // ---- Orçamento
    {
      chave: "VERIFICACAO_ORCAMENTARIA",
      nome: "Verificação orçamentária",
      descricao: "Contabilidade indica a dotação (órgão, ação, natureza e fonte) e confirma o saldo.",
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
      nome: "Em alteração orçamentária",
      descricao: "Pedido de crédito adicional por decreto (dentro do limite da LOA) ou lei.",
      setor: "CONTAB",
      papeis: ["CONTABILIDADE", "ORDENADOR"],
      slaDiasUteis: 5,
      opcional: true,
      gates: [
        doc("PEDIDO_ALTERACAO_ORCAMENTARIA", undefined, "Pedido com fonte do recurso e demonstrativo das dotações"),
        doc("DECRETO_CREDITO", ["ORDENADOR"], "Decreto ou lei de crédito adicional assinado"),
      ],
      avancos: [{ para: "RESERVADO", rotulo: "Crédito aberto: reservar" }],
      devolucoes: [{ para: "AUTORIZACAO", rotulo: "Crédito negado: devolver ao ordenador", motivoObrigatorio: true }],
    },
    {
      chave: "RESERVADO",
      nome: "Reservado (pré-empenho)",
      descricao: "Nota de reserva emitida; o valor é bloqueado na dotação.",
      setor: "CONTAB",
      papeis: ["CONTABILIDADE"],
      slaDiasUteis: 1,
      gates: [doc("NOTA_RESERVA", undefined, "Nota de reserva orçamentária")],
      avancos: [{ para: "CONTROLE_INTERNO", rotulo: "Enviar ao controle interno" }],
      devolucoes: [],
    },
    // ---- Conformidade
    {
      chave: "CONTROLE_INTERNO",
      nome: "Em controle interno",
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
      nome: "Em parecer jurídico",
      descricao: "Controle prévio de legalidade do edital e da minuta, ou da contratação direta (art. 53).",
      setor: "PGM",
      papeis: ["JURIDICO"],
      slaDiasUteis: 5,
      gates: [
        doc("PARECER_JURIDICO", ["JURIDICO"], "Parecer jurídico assinado"),
        regra("MODALIDADE_DEFINIDA", "Modalidade da contratação definida por compras"),
      ],
      avancos: [
        { para: "PUBLICACAO_EDITAL", rotulo: "Favorável: publicar o edital", quando: { campo: "modalidade", valores: ["LICITACAO"] } },
        { para: "INSTRUCAO_DIRETA", rotulo: "Favorável: instruir a contratação direta", quando: { campo: "modalidade", valores: ["DISPENSA_VALOR", "OUTRA_DIRETA"] } },
      ],
      devolucoes: [{ para: "INSTRUCAO", rotulo: "Desfavorável: devolver a compras", motivoObrigatorio: true }],
    },
    // ---- Escolha do fornecedor: licitação
    {
      chave: "PUBLICACAO_EDITAL",
      nome: "Publicação do edital",
      descricao: "Edital no PNCP, no site e no diário oficial; o sistema confere o prazo mínimo até a abertura (art. 55).",
      setor: "COMPRAS",
      papeis: ["COMPRAS"],
      slaDiasUteis: 8,
      ramo: "LICITACAO",
      gates: [doc("EDITAL", undefined, "Edital e aviso de licitação"), regra("PRAZO_EDITAL", "Abertura respeita o prazo mínimo do art. 55, em dia útil")],
      avancos: [{ para: "IMPUGNACOES", rotulo: "Edital publicado: abrir prazo de impugnações" }],
      devolucoes: [],
    },
    {
      chave: "IMPUGNACOES",
      nome: "Impugnações e esclarecimentos",
      descricao: "Impugnações até 3 dias úteis antes da abertura; resposta em até 3 dias úteis, publicada (art. 164).",
      setor: "COMPRAS",
      papeis: ["COMPRAS"],
      slaDiasUteis: 3,
      ramo: "LICITACAO",
      gates: [regra("IMPUGNACOES", "Abertura alcançada e impugnações tempestivas respondidas")],
      avancos: [{ para: "SESSAO_DISPUTA", rotulo: "Abrir a sessão de disputa" }],
      devolucoes: [{ para: "PUBLICACAO_EDITAL", rotulo: "Republicar o edital", motivoObrigatorio: true }],
    },
    {
      chave: "SESSAO_DISPUTA",
      nome: "Disputa e habilitação",
      descricao: "Lances na plataforma eletrônica, julgamento e habilitação do primeiro colocado; o sistema registra o resultado.",
      setor: "COMPRAS",
      papeis: ["COMPRAS"],
      slaDiasUteis: 1,
      ramo: "LICITACAO",
      gates: [doc("ATA_SESSAO", undefined, "Ata da sessão"), regra("RESULTADO_SESSAO", "Resultado com vencedor, CNPJ e valor")],
      avancos: [{ para: "RECURSOS", rotulo: "Abrir prazo de recursos" }],
      devolucoes: [{ para: "INSTRUCAO", rotulo: "Deserta ou fracassada: refazer", motivoObrigatorio: true }],
    },
    {
      chave: "RECURSOS",
      nome: "Recursos",
      descricao: "Intenção na sessão, razões em 3 dias úteis e contrarrazões em mais 3 (art. 165).",
      setor: "COMPRAS",
      papeis: ["COMPRAS"],
      slaDiasUteis: 6,
      ramo: "LICITACAO",
      gates: [regra("RECURSOS", "Todos os recursos decididos")],
      avancos: [{ para: "HOMOLOGADO", rotulo: "Enviar para homologação" }],
      devolucoes: [{ para: "SESSAO_DISPUTA", rotulo: "Recurso provido: refazer o julgamento", motivoObrigatorio: true }],
    },
    {
      chave: "HOMOLOGADO",
      nome: "Adjudicação e homologação",
      descricao: "A autoridade confirma o resultado e o vencedor (art. 71).",
      setor: "GAB",
      papeis: ["ORDENADOR"],
      slaDiasUteis: 2,
      ramo: "LICITACAO",
      gates: [doc("TERMO_HOMOLOGACAO", ["ORDENADOR"], "Termo de adjudicação e homologação assinado")],
      avancos: [{ para: "EMPENHADO", rotulo: "Homologar e enviar para empenho" }],
      devolucoes: [{ para: "SESSAO_DISPUTA", rotulo: "Devolver à sessão", motivoObrigatorio: true }],
    },
    // ---- Escolha do fornecedor: contratação direta
    {
      chave: "INSTRUCAO_DIRETA",
      nome: "Instrução da contratação direta",
      descricao: "Justificativa do preço e da escolha do fornecedor e documentos de habilitação; na dispensa por valor, aviso de 3 dias úteis (art. 75, §3º).",
      setor: "COMPRAS",
      papeis: ["COMPRAS"],
      slaDiasUteis: 3,
      ramo: "DIRETA",
      gates: [regra("AVISO_DISPENSA", "Aviso de 3 dias úteis cumprido ou dispensa do aviso justificada")],
      avancos: [{ para: "AUTORIZACAO_DIRETA", rotulo: "Enviar para autorização do ordenador" }],
      devolucoes: [{ para: "INSTRUCAO", rotulo: "Rever o caminho da contratação", motivoObrigatorio: true }],
    },
    {
      chave: "AUTORIZACAO_DIRETA",
      nome: "Autorização da contratação direta",
      descricao: "O ordenador autoriza a contratação direta e o ato é publicado no site oficial (art. 72, parágrafo único).",
      setor: "GAB",
      papeis: ["ORDENADOR"],
      slaDiasUteis: 2,
      ramo: "DIRETA",
      gates: [
        doc("ATO_AUTORIZACAO_DIRETA", ["ORDENADOR"], "Ato de autorização assinado pelo ordenador"),
        // O empenho sai em nome do fornecedor: na contratação direta ele é registrado antes (na licitação vem da sessão)
        regra("CONTRATACAO_COMPLETA", "Fornecedor, CNPJ, valor contratado e fonte de recurso informados por compras"),
      ],
      avancos: [{ para: "EMPENHADO", rotulo: "Autorizar e enviar para empenho" }],
      devolucoes: [{ para: "INSTRUCAO_DIRETA", rotulo: "Devolver a compras", motivoObrigatorio: true }],
    },
    // ---- Contrato
    {
      chave: "EMPENHADO",
      nome: "Empenhado",
      descricao: "A reserva vira empenho em nome do fornecedor escolhido (Lei 4.320, arts. 58 a 61).",
      setor: "CONTAB",
      papeis: ["CONTABILIDADE"],
      slaDiasUteis: 2,
      gates: [doc("NOTA_EMPENHO", ["CONTABILIDADE", "ORDENADOR"], "Nota de empenho assinada por contador e ordenador")],
      avancos: [{ para: "CONTRATADO", rotulo: "Enviar para assinatura do contrato" }],
      devolucoes: [{ para: "ALTERACAO_ORCAMENTARIA", rotulo: "Empenho maior que a reserva", motivoObrigatorio: true }],
    },
    {
      chave: "CONTRATADO",
      nome: "Contratado",
      descricao: "Contrato assinado, gestor e fiscal designados por portaria, extrato no PNCP (condição de eficácia).",
      setor: "COMPRAS",
      papeis: ["COMPRAS"],
      slaDiasUteis: 5,
      gates: [
        doc("CONTRATO", ["ORDENADOR"], "Contrato ou ordem de compra assinado"),
        doc("PORTARIA_FISCAL", undefined, "Portaria nomeando gestor e fiscal com suplente"),
        doc("PUBLICACAO_PNCP", undefined, "Publicação no PNCP (20 dias úteis licitação / 10 direta)"),
        regra("CONTRATACAO_COMPLETA", "Fornecedor, CNPJ, valor contratado e fonte de recurso informados"),
      ],
      avancos: [{ para: "EXECUCAO", rotulo: "Contrato publicado: iniciar a execução" }],
      devolucoes: [],
    },
    // ---- Execução e pagamento
    {
      chave: "EXECUCAO",
      nome: "Em execução",
      descricao: "Ordem de fornecimento; o fiscal recebe, confere e atesta a nota fiscal.",
      setor: "LIVRE",
      papeis: ["FISCAL", "REQUISITANTE"],
      slaDiasUteis: 5,
      gates: [
        doc("ORDEM_FORNECIMENTO", undefined, "Ordem de fornecimento ou de serviço ao fornecedor"),
        doc("NOTA_FISCAL", undefined, "Nota fiscal do fornecedor"),
        doc("ATESTO", ["FISCAL"], "Atesto do fiscal do contrato"),
        doc("CERTIDOES", undefined, "Certidões de regularidade vigentes"),
      ],
      avancos: [{ para: "LIQUIDADO", rotulo: "Enviar para liquidação" }],
      devolucoes: [],
    },
    {
      chave: "LIQUIDADO",
      nome: "Liquidado",
      descricao: "Verificação do direito do credor (Lei 4.320, art. 63); a data da liquidação define a ordem cronológica.",
      setor: "CONTAB",
      papeis: ["CONTABILIDADE"],
      slaDiasUteis: 5,
      gates: [doc("NOTA_LIQUIDACAO", ["ORDENADOR"], "Nota de liquidação assinada pelo ordenador")],
      avancos: [{ para: "FILA_PAGAMENTO", rotulo: "Enviar à tesouraria" }],
      devolucoes: [{ para: "EXECUCAO", rotulo: "Documento faltante: devolver ao fiscal", motivoObrigatorio: true }],
    },
    {
      chave: "FILA_PAGAMENTO",
      nome: "Na fila cronológica",
      descricao: "Posição por fonte de recurso e data de liquidação; pular a fila exige justificativa publicada (Lei 14.133, art. 141).",
      setor: "TES",
      papeis: ["TESOURARIA"],
      slaDiasUteis: 20,
      filaCronologica: true,
      gates: [doc("ORDEM_PAGAMENTO", ["ORDENADOR", "TESOURARIA"], "Ordem de pagamento assinada pelo ordenador e pela tesouraria")],
      avancos: [{ para: "PAGAMENTO_ENVIADO", rotulo: "Enviar ao banco" }],
      devolucoes: [],
    },
    {
      chave: "PAGAMENTO_ENVIADO",
      nome: "Enviado ao banco",
      descricao: "Pagamento enviado; só vira pago quando o banco confirma.",
      setor: "TES",
      papeis: ["TESOURARIA"],
      slaDiasUteis: 2,
      gates: [regra("RETORNO_BANCARIO", "Retorno do banco confirmando o pagamento")],
      avancos: [{ para: "PAGO", rotulo: "Banco confirmou: registrar pagamento" }],
      devolucoes: [{ para: "FILA_PAGAMENTO", rotulo: "Banco recusou", motivoObrigatorio: true }],
    },
    {
      chave: "PAGO",
      nome: "Pago",
      descricao: "Pagamento confirmado pelo banco; comprovante juntado; fornecedor avisado.",
      setor: "TES",
      papeis: ["TESOURARIA"],
      slaDiasUteis: 2,
      gates: [doc("COMPROVANTE_PAGAMENTO", undefined, "Comprovante do pagamento")],
      avancos: [{ para: "ARQUIVADO", rotulo: "Publicar e arquivar" }],
      devolucoes: [],
    },
    {
      chave: "ARQUIVADO",
      nome: "Arquivado",
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

/** Nome da etapa para exibição, sem o número de ordem interno ("4. Em instrução" → "Em instrução"). */
export function nomeEtapa(nome: string): string {
  return nome.replace(/^\d+[a-z]?\.\s*/i, "");
}

/** Etapas que saíram dos fluxos: nome para a tela quando um processo antigo ainda está (ou esteve) nelas. */
export const ETAPAS_ANTIGAS: Record<string, string> = {
  CONTRATACAO: "Contratação (etapa antiga)",
};
/** Nome do tipo de documento e do papel para a tela, sem o código cru quando o tipo não é conhecido. */
export const nomeDocumento = (tipo: string | null | undefined) => (tipo && DOCUMENTO_TIPOS[tipo]) || "Documento";
export const nomePapel = (papel: string | null | undefined) => (papel && PAPEL_NOME[papel as Papel]) || "Responsável";
export const ETAPA_FORA_DO_FLUXO = "Etapa antiga (fora do fluxo atual)";

/** Nome da etapa para mostrar ao usuário: nunca a chave interna. Etapa que saiu do fluxo vira "Etapa antiga". */
export function nomeDaEtapa(def: WorkflowDef | null | undefined, chave: string | null | undefined): string {
  if (!chave) return "";
  const e = def ? getEstado(def, chave) : undefined;
  if (e) return nomeEtapa(e.nome);
  return ETAPAS_ANTIGAS[chave] ?? ETAPA_FORA_DO_FLUXO;
}

/** Caminho principal do fluxo: segue sempre o primeiro avanço a partir do estado inicial. Estados fora dele são desvios opcionais. */
export function caminhoPrincipal(def: WorkflowDef): string[] {
  const out: string[] = [];
  let atual: string | undefined = def.estadoInicial;
  while (atual && !out.includes(atual)) {
    out.push(atual);
    atual = getEstado(def, atual)?.avancos[0]?.para;
  }
  return out;
}

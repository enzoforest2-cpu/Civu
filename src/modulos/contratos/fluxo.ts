// Fluxo de pagamento de nota de contrato: começa na liquidação (a nota já foi atestada no módulo de contratos)
// e usa a mesma fila cronológica por fonte das compras (estado com filaCronologica).
import type { WorkflowDef } from "@/lib/workflow";

export const CHAVE_PAGAMENTO_CONTRATO = "PAGAMENTO_CONTRATO";

export const WORKFLOW_PAGAMENTO_CONTRATO: WorkflowDef = {
  estadoInicial: "LIQUIDACAO",
  estados: [
    {
      chave: "LIQUIDACAO",
      nome: "1. Em liquidação",
      descricao: "Contabilidade confere nota, atesto, certidões e retenções e emite a nota de liquidação (Lei 4.320, art. 63).",
      setor: "CONTAB",
      papeis: ["CONTABILIDADE"],
      slaDiasUteis: 5,
      gates: [
        { tipo: "documento", documentoTipo: "NOTA_FISCAL", descricao: "Nota fiscal do fornecedor" },
        { tipo: "documento", documentoTipo: "ATESTO", descricao: "Atesto do fiscal do contrato" },
        { tipo: "documento", documentoTipo: "NOTA_LIQUIDACAO", assinadoPor: ["ORDENADOR"], descricao: "Nota de liquidação assinada pelo ordenador" },
      ],
      avancos: [{ para: "FILA_PAGAMENTO", rotulo: "Enviar à tesouraria" }],
      devolucoes: [],
    },
    {
      chave: "FILA_PAGAMENTO",
      nome: "2. Na fila cronológica",
      descricao: "Posição por fonte de recurso e data de liquidação (Lei 14.133, art. 141).",
      setor: "TES",
      papeis: ["TESOURARIA"],
      slaDiasUteis: 20,
      filaCronologica: true,
      gates: [{ tipo: "documento", documentoTipo: "ORDEM_PAGAMENTO", assinadoPor: ["ORDENADOR", "TESOURARIA"], descricao: "Ordem de pagamento assinada pelo ordenador e pela tesouraria" }],
      avancos: [{ para: "PAGO", rotulo: "Registrar pagamento" }],
      devolucoes: [],
    },
    {
      chave: "PAGO",
      nome: "3. Pago",
      descricao: "Ordem bancária executada e comprovante juntado.",
      setor: "TES",
      papeis: ["TESOURARIA"],
      slaDiasUteis: 2,
      gates: [{ tipo: "documento", documentoTipo: "COMPROVANTE_PAGAMENTO", descricao: "Comprovante do pagamento" }],
      avancos: [{ para: "ARQUIVADO", rotulo: "Arquivar" }],
      devolucoes: [],
    },
    {
      chave: "ARQUIVADO",
      nome: "4. Arquivado",
      setor: "CONTAB",
      papeis: ["CONTABILIDADE", "TESOURARIA", "ADMIN"],
      slaDiasUteis: 0,
      gates: [],
      avancos: [],
      devolucoes: [],
      final: true,
    },
  ],
};

export const TIPO_PAGAMENTO_CONTRATO = {
  chave: CHAVE_PAGAMENTO_CONTRATO,
  nome: "Pagamento de contrato (nota atestada)",
  descricao: "Liquidação e pagamento de nota fiscal atestada pelo fiscal do contrato, na ordem cronológica da fonte.",
  definicao: WORKFLOW_PAGAMENTO_CONTRATO,
};

/** Estados do processo de pagamento que contam como "pago" para o fornecedor. */
export const ESTADOS_PAGO = ["PAGO", "ARQUIVADO"];

// Fluxo do pedido de alvará feito pelo portal. É dado (inserido em tipos_processo pela demonstração), não código do núcleo.
// Papéis: o núcleo ainda não tem um papel próprio de tributação; a análise fica com quem está no setor TRIB
// e tem papel de Tesouraria (fazenda) ou é administrador.
import type { WorkflowDef } from "@/lib/workflow";

export const CHAVE_FLUXO_ALVARA = "ALVARA";
export const SIGLA_SETOR_TRIBUTOS = "TRIB";

export const WORKFLOW_ALVARA: WorkflowDef = {
  estadoInicial: "EM_ANALISE",
  estados: [
    {
      chave: "EM_ANALISE",
      nome: "Em análise",
      descricao: "A tributação confere inscrição, atividades, endereço, débitos e, se preciso, agenda vistoria.",
      setor: SIGLA_SETOR_TRIBUTOS,
      papeis: ["TESOURARIA", "ADMIN"],
      slaDiasUteis: 5,
      gates: [{ tipo: "documento", documentoTipo: "DESPACHO", descricao: "Despacho com a decisão" }],
      avancos: [
        { para: "DEFERIDO", rotulo: "Deferir e emitir alvará" },
        { para: "INDEFERIDO", rotulo: "Indeferir", motivoObrigatorio: true },
      ],
      devolucoes: [],
    },
    {
      chave: "DEFERIDO",
      nome: "Alvará emitido",
      descricao: "Alvará emitido e disponível no portal, com verificação pública.",
      setor: SIGLA_SETOR_TRIBUTOS,
      papeis: ["TESOURARIA", "ADMIN"],
      slaDiasUteis: 0,
      gates: [],
      avancos: [],
      devolucoes: [],
      final: true,
    },
    {
      chave: "INDEFERIDO",
      nome: "Indeferido",
      setor: SIGLA_SETOR_TRIBUTOS,
      papeis: ["TESOURARIA", "ADMIN"],
      slaDiasUteis: 0,
      gates: [],
      avancos: [],
      devolucoes: [],
      final: true,
    },
  ],
};

// Quem pode o quê no módulo Gestão, e a matriz de permissões exibida em Governança.
// A checagem vale no servidor (páginas e server actions); o menu só esconde o que a pessoa não usa.
import type { Papel } from "@/lib/workflow";
import { podeVerRota, type UsuarioComArea } from "@/lib/areas";

type ComPapeis = UsuarioComArea & { papeis: readonly Papel[] | readonly string[] };

// O administrador administra (regras, integrações, usuários) e vê todas as áreas, mas não decide nem age em
// processo só por ser administrador: por isso "ADMIN" aparece só onde a ação é de administração ou consulta.
const tem = (u: ComPapeis, ...p: Papel[]) => p.some((x) => u.papeis.includes(x));
const adm = (u: ComPapeis) => u.papeis.includes("ADMIN");

export const pode = {
  /** Sala do prefeito: gabinete, controle interno e administrador (regra de área em src/lib/areas.ts). */
  verGabinete: (u: ComPapeis) => podeVerRota(u, "/gabinete"),
  /** Decidir em lote (autorizar/despachar): ordenador de despesa. */
  decidirEmLote: (u: ComPapeis) => tem(u, "ORDENADOR"),
  verAutomacoes: (u: ComPapeis) => adm(u) || tem(u, "ORDENADOR", "SECRETARIO", "CONTROLE_INTERNO", "PROTOCOLO"),
  /** Criar, alterar e suspender regras: só administrador (política aprovada pela prefeitura). */
  configurarAutomacoes: (u: ComPapeis) => adm(u),
  /** Rodar regras agora: administrador, protocolo e controle interno. */
  rodarAutomacoes: (u: ComPapeis) => adm(u) || tem(u, "PROTOCOLO", "CONTROLE_INTERNO"),
  /** Resolver ou descartar alertas: quem trabalha nos processos (não o administrador por ser administrador). */
  tratarAlertas: (u: ComPapeis) => tem(u, "ORDENADOR", "PROTOCOLO", "CONTROLE_INTERNO", "SECRETARIO"),
  verIntegracoes: (u: ComPapeis) => adm(u) || tem(u, "CONTROLE_INTERNO", "CONTABILIDADE", "COMPRAS", "TESOURARIA"),
  configurarIntegracoes: (u: ComPapeis) => adm(u),
  verGovernanca: (u: ComPapeis) => adm(u) || tem(u, "CONTROLE_INTERNO"),
  administrarUsuarios: (u: ComPapeis) => adm(u),
  /** Área de cada setor e órgão orçamentário ligado (em /configuracoes). */
  configurarSetores: (u: ComPapeis) => adm(u),
  verificarIntegridade: (u: ComPapeis) => adm(u) || tem(u, "CONTROLE_INTERNO"),
};

/** Ações administrativas e de decisão da plataforma, para a matriz papéis × ações. */
export const ACOES_MATRIZ: { grupo: string; acao: string; papeis: Papel[] | "TODOS"; limite?: string }[] = [
  { grupo: "Atendimento", acao: "Abrir processo e juntar documentos", papeis: "TODOS" },
  { grupo: "Atendimento", acao: "Tramitar fora do fluxo e abrir exigência ao interessado", papeis: ["PROTOCOLO"], limite: "Só no próprio setor, salvo protocolo" },
  { grupo: "Atendimento", acao: "Reencaminhar processo parado numa etapa que saiu do fluxo", papeis: ["ADMIN"], limite: "Só tramitar; não avança, não assina" },
  { grupo: "Decisão", acao: "Autorizar despesa e homologar (gabinete)", papeis: ["ORDENADOR"], limite: "Com assinatura e registro na trilha" },
  { grupo: "Decisão", acao: "Decidir em lote no painel do prefeito", papeis: ["ORDENADOR"], limite: "Exige confirmação de senha" },
  { grupo: "Orçamento", acao: "Certificar dotação, reservar, empenhar e liquidar", papeis: ["CONTABILIDADE"], limite: "Empenho também assinado pelo ordenador" },
  { grupo: "Pagamento", acao: "Programar e registrar pagamento", papeis: ["TESOURARIA"], limite: "Fora da ordem só com justificativa pública" },
  { grupo: "Contratos", acao: "Atestar entrega", papeis: ["FISCAL"], limite: "Sem confirmar pagamento bancário" },
  { grupo: "Controle", acao: "Consultar trilha de auditoria e verificar integridade", papeis: ["CONTROLE_INTERNO", "ADMIN"], limite: "Sem reescrever histórico" },
  { grupo: "Automação", acao: "Rodar automações agora", papeis: ["PROTOCOLO", "CONTROLE_INTERNO", "ADMIN"] },
  { grupo: "Automação", acao: "Criar, alterar e suspender regras", papeis: ["ADMIN"], limite: "Cada alteração gera nova versão auditada" },
  { grupo: "Administração", acao: "Ativar, desativar e trocar setor e papéis de usuários", papeis: ["ADMIN"], limite: "Não apaga trilhas; não altera a si mesmo" },
  { grupo: "Administração", acao: "Configurar integrações", papeis: ["ADMIN"] },
  { grupo: "Administração", acao: "Definir a área de cada setor e o órgão orçamentário ligado", papeis: ["ADMIN"], limite: "Cada alteração fica na trilha administrativa" },
];

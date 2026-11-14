// Áreas temáticas do município: cada setor pertence a uma área (coluna `area` em `setores`), e cada tela da
// gestão pertence a uma ou mais áreas. Quem vê o quê é decidido aqui, numa função só (`podeVerArea`), usada
// pelo menu, pelas páginas e pelas server actions. Este arquivo é puro (sem banco, sem Next) para poder ser
// testado com `npx tsx --test src/lib/areas.test.ts`.
//
// Regras (especificação "Comando da prefeitura", Parte 1):
// - Gabinete, Controle Interno e o papel ADMIN veem a prefeitura inteira (todas as áreas). Ver não é agir:
//   o ADMIN administra, mas não passa nas checagens de ação em processo (`podeAgir`).
// - Os demais veem a própria área e as telas comuns (Minha caixa, Processos, Ajuda...).
// - Secretarias com pasta orçamentária (Administração, Fazenda, Saúde, Educação, Assistência Social,
//   Infraestrutura e o Gabinete) também abrem as telas "da pasta": contratos, notas a atestar, orçamento e a
//   cabine da secretaria. O recorte dos dados pela pasta é feito em cada tela (Parte 2).
import type { Papel } from "./workflow";

export const AREAS = [
  { chave: "GABINETE", nome: "Gabinete", descricao: "Prefeito(a), chefia de gabinete e assessoria.", pasta: true, visaoTotal: true },
  { chave: "ADMINISTRACAO", nome: "Administração", descricao: "Pessoal, patrimônio, frota e serviços administrativos.", pasta: true, visaoTotal: false },
  { chave: "FAZENDA", nome: "Fazenda", descricao: "Finanças, contabilidade, tesouraria e tributos.", pasta: true, visaoTotal: false },
  { chave: "COMPRAS", nome: "Compras", descricao: "Compras, licitações e contratos.", pasta: false, visaoTotal: false },
  { chave: "SAUDE", nome: "Saúde", descricao: "Secretaria e fundo municipal de saúde.", pasta: true, visaoTotal: false },
  { chave: "EDUCACAO", nome: "Educação", descricao: "Secretaria de educação e escolas.", pasta: true, visaoTotal: false },
  { chave: "ASSISTENCIA_SOCIAL", nome: "Assistência Social", descricao: "Secretaria e fundo municipal de assistência social.", pasta: true, visaoTotal: false },
  { chave: "INFRAESTRUTURA", nome: "Infraestrutura e Obras", descricao: "Obras, vias, serviços urbanos e meio ambiente.", pasta: true, visaoTotal: false },
  { chave: "CONTROLE_INTERNO", nome: "Controle Interno", descricao: "Controladoria: auditoria, integridade e conformidade.", pasta: false, visaoTotal: true },
  { chave: "PROCURADORIA", nome: "Procuradoria", descricao: "Pareceres e representação jurídica do município.", pasta: false, visaoTotal: false },
  { chave: "PROTOCOLO", nome: "Protocolo", descricao: "Recebimento, abertura e distribuição de processos.", pasta: false, visaoTotal: false },
] as const;

export type Area = (typeof AREAS)[number]["chave"];
export const AREA_CHAVES = AREAS.map((a) => a.chave) as readonly Area[];
export const AREA_NOME = Object.fromEntries(AREAS.map((a) => [a.chave, a.nome])) as Record<Area, string>;

export function ehArea(x: unknown): x is Area {
  return typeof x === "string" && (AREA_CHAVES as readonly string[]).includes(x);
}

export const nomeDaArea = (a: string | null | undefined) => (ehArea(a) ? AREA_NOME[a] : "Sem área definida");

/**
 * Área sugerida para um setor pela sigla (usada na demonstração e para preencher setores antigos na migração).
 * Setores novos escolhem a área em /configuracoes.
 */
export const AREA_DA_SIGLA: Record<string, Area> = {
  GAB: "GABINETE",
  SEMAD: "ADMINISTRACAO",
  SEFAZ: "FAZENDA",
  CONTAB: "FAZENDA",
  TES: "FAZENDA",
  TRIB: "FAZENDA",
  COMPRAS: "COMPRAS",
  SESAU: "SAUDE",
  SEDUC: "EDUCACAO",
  SEMAS: "ASSISTENCIA_SOCIAL",
  SEINFRA: "INFRAESTRUTURA",
  SMSU: "INFRAESTRUTURA",
  SMMA: "INFRAESTRUTURA",
  CGM: "CONTROLE_INTERNO",
  PGM: "PROCURADORIA",
  PROT: "PROTOCOLO",
};
export const areaPadraoDaSigla = (sigla: string): Area | null => AREA_DA_SIGLA[sigla] ?? null;

/** O mínimo de um usuário para decidir acesso: papéis e a área do setor (SessaoUsuario satisfaz). */
export type UsuarioComArea = { papeis: readonly string[]; setor: { area?: string | null } | null };

export function areaDoUsuario(u: UsuarioComArea): Area | null {
  const a = u.setor?.area;
  return ehArea(a) ? a : null;
}

/** Gabinete, Controle Interno e administrador veem todas as áreas (ver não é agir). */
export function veTudo(u: UsuarioComArea): boolean {
  if (u.papeis.includes("ADMIN")) return true;
  const a = areaDoUsuario(u);
  return a !== null && AREAS.some((x) => x.chave === a && x.visaoTotal);
}

/** A pessoa é de uma secretaria com pasta orçamentária própria (abre contratos, orçamento e cabine da pasta). */
export function temPasta(u: UsuarioComArea): boolean {
  const a = areaDoUsuario(u);
  return a !== null && AREAS.some((x) => x.chave === a && x.pasta);
}

/** Função única de visibilidade: a pessoa pode ver o conteúdo desta área? */
export function podeVerArea(u: UsuarioComArea, area: Area): boolean {
  if (veTudo(u)) return true;
  return areaDoUsuario(u) === area;
}

// ---------------------------------------------------------------------------
// Telas da gestão por área
// ---------------------------------------------------------------------------

/**
 * Regra de acesso de uma rota da gestão. `areas` vazia = tela comum (todos os servidores).
 * `pasta: true` = também abre para quem é de secretaria com pasta (o recorte dos dados fica na tela).
 */
export type RegraRota = { prefixo: string; areas: Area[]; pasta?: boolean };

export const ROTAS_DE_AREA: RegraRota[] = [
  { prefixo: "/gabinete", areas: ["GABINETE"] },
  { prefixo: "/secretaria", areas: [], pasta: true },
  // Fazenda: finanças e tributos. Orçamento é também da pasta de cada secretaria.
  { prefixo: "/financas", areas: ["FAZENDA"] },
  { prefixo: "/financas/orcamento", areas: ["FAZENDA"], pasta: true },
  { prefixo: "/tributos", areas: ["FAZENDA"] },
  // Infraestrutura: serviços urbanos, execução em campo e obras
  { prefixo: "/servicos", areas: ["INFRAESTRUTURA"] },
  { prefixo: "/campo", areas: ["INFRAESTRUTURA"] },
  { prefixo: "/contratos/obras", areas: ["INFRAESTRUTURA", "COMPRAS"] },
  // Compras: contratações e contratos. Contratos e notas a atestar também são da pasta de cada secretaria.
  { prefixo: "/contratos", areas: ["COMPRAS"], pasta: true },
  { prefixo: "/contratos/novo", areas: ["COMPRAS"] },
  { prefixo: "/obrigacoes", areas: ["COMPRAS"] },
  // Repasses, emendas, convênios e obrigações de entrega: de cada secretaria com pasta (o recorte pela área fica na tela)
  { prefixo: "/repasses", areas: ["GABINETE"], pasta: true },
  { prefixo: "/obrigacoes-da-area", areas: ["GABINETE"], pasta: true },
  // Controle e administração
  { prefixo: "/governanca", areas: ["CONTROLE_INTERNO"] },
  { prefixo: "/integracoes", areas: ["FAZENDA", "COMPRAS"] },
  { prefixo: "/configuracoes", areas: ["ADMINISTRACAO"] },
  { prefixo: "/automacoes", areas: ["PROTOCOLO"], pasta: true },
  // assistente de redação: usado a partir de qualquer processo
  { prefixo: "/automacoes/redacao", areas: [] },
];

const casa = (caminho: string, prefixo: string) => caminho === prefixo || caminho.startsWith(prefixo + "/") || caminho.startsWith(prefixo + "?");

/** Regra mais específica (prefixo mais longo) que vale para o caminho; null = tela comum. */
export function regraDaRota(caminho: string): RegraRota | null {
  let melhor: RegraRota | null = null;
  for (const r of ROTAS_DE_AREA) if (casa(caminho, r.prefixo) && (!melhor || r.prefixo.length > melhor.prefixo.length)) melhor = r;
  return melhor;
}

/** A pessoa pode abrir esta tela da gestão? (o menu e as páginas usam a mesma regra) */
export function podeVerRota(u: UsuarioComArea, caminho: string): boolean {
  const r = regraDaRota(caminho);
  if (!r || (r.areas.length === 0 && !r.pasta)) return true;
  if (veTudo(u)) return true;
  if (r.areas.some((a) => podeVerArea(u, a))) return true;
  return Boolean(r.pasta && temPasta(u));
}

/** Nome da área dona da tela, para a página "Sem acesso a esta área". */
export function areaDaRota(caminho: string): Area | null {
  return regraDaRota(caminho)?.areas[0] ?? null;
}

/** Página inicial depois do login: gabinete → Sala do prefeito; secretário(a) → Minha secretaria; demais → Seu trabalho. */
export function paginaInicial(u: UsuarioComArea): "/gabinete" | "/secretaria" | "/painel" {
  const a = areaDoUsuario(u);
  if (a === "GABINETE") return "/gabinete";
  if (u.papeis.includes("SECRETARIO" satisfies Papel) && temPasta(u)) return "/secretaria";
  return "/painel";
}

/** Endereço da página "Sem acesso a esta área" para uma tela bloqueada. */
export function urlSemAcesso(caminho: string): string {
  const area = areaDaRota(caminho);
  const q = new URLSearchParams({ de: caminho });
  if (area) q.set("area", area);
  return `/sem-acesso?${q.toString()}`;
}

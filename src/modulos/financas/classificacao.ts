// Classificações orçamentárias usadas pelo módulo de finanças (sem acesso ao banco: pode ir para o cliente).
// Padrão da despesa pública brasileira: órgão/unidade, função/subfunção, programa, ação, natureza e fonte.
import { FONTES } from "@/lib/workflow";

/** Grupo de fonte = chave de FONTES (a mesma da fila cronológica de pagamentos). */
export type GrupoFonte = keyof typeof FONTES;

/**
 * Fontes detalhadas no padrão STN (fonte.código de acompanhamento), resumidas para a demonstração.
 * `grupo` liga a fonte ao caixa e à fila cronológica, que são separados por grupo.
 */
export const FONTES_DETALHE: Record<string, { nome: string; grupo: GrupoFonte }> = {
  "1500.0000": { nome: "Recursos livres (impostos e transferências não vinculados)", grupo: "ORDINARIOS" },
  "1500.1001": { nome: "Impostos aplicados em educação (MDE, mínimo de 25%)", grupo: "ORDINARIOS" },
  "1500.1002": { nome: "Impostos aplicados em saúde (ASPS, mínimo de 15%)", grupo: "ORDINARIOS" },
  "1540.0000": { nome: "FUNDEB — impostos e transferências", grupo: "EDUCACAO" },
  "1550.0000": { nome: "Salário-educação", grupo: "EDUCACAO" },
  "1552.0000": { nome: "Alimentação escolar (PNAE)", grupo: "EDUCACAO" },
  "1600.0000": { nome: "SUS — transferências da União (manutenção)", grupo: "SAUDE" },
  "1621.0000": { nome: "SUS — transferências do Estado", grupo: "SAUDE" },
  "1660.0000": { nome: "Assistência social — FNAS", grupo: "ASSISTENCIA" },
  "1700.0000": { nome: "Convênios com a União", grupo: "CONVENIOS" },
  "1701.0000": { nome: "Convênios com o Estado", grupo: "CONVENIOS" },
};

export const grupoDaFonte = (f: string): GrupoFonte => FONTES_DETALHE[f]?.grupo ?? "OUTRAS";
export const nomeFonteDetalhe = (f: string) => FONTES_DETALHE[f]?.nome ?? f;
export const nomeGrupo = (g: string) => FONTES[g] ?? "Fonte não informada";
export const nomeGrupoCurto = (g: string) =>
  ({ ORDINARIOS: "Recursos livres", SAUDE: "Saúde (vinculados)", EDUCACAO: "Educação e FUNDEB", ASSISTENCIA: "Assistência social", CONVENIOS: "Convênios", OUTRAS: "Outras vinculadas" })[g] ?? g;
export const GRUPOS_FONTE = Object.keys(FONTES) as GrupoFonte[];

/** Funções de governo (Portaria MOG 42/1999). */
export const FUNCOES: Record<string, { nome: string; simples: string }> = {
  "01": { nome: "Legislativa", simples: "Câmara de Vereadores" },
  "04": { nome: "Administração", simples: "Administração e serviços internos" },
  "06": { nome: "Segurança Pública", simples: "Segurança e defesa civil" },
  "08": { nome: "Assistência Social", simples: "Assistência social" },
  "10": { nome: "Saúde", simples: "Saúde" },
  "12": { nome: "Educação", simples: "Educação" },
  "13": { nome: "Cultura", simples: "Cultura" },
  "15": { nome: "Urbanismo", simples: "Ruas, praças e iluminação" },
  "17": { nome: "Saneamento", simples: "Água e esgoto" },
  "18": { nome: "Gestão Ambiental", simples: "Meio ambiente" },
  "20": { nome: "Agricultura", simples: "Agricultura" },
  "26": { nome: "Transporte", simples: "Estradas e transporte" },
  "27": { nome: "Desporto e Lazer", simples: "Esporte e lazer" },
  "28": { nome: "Encargos Especiais", simples: "Dívidas e encargos" },
};

export const SUBFUNCOES: Record<string, string> = {
  "122": "Administração geral",
  "123": "Administração financeira",
  "181": "Policiamento",
  "182": "Defesa civil",
  "244": "Assistência comunitária",
  "243": "Assistência à criança e ao adolescente",
  "301": "Atenção básica",
  "302": "Assistência hospitalar e ambulatorial",
  "303": "Suporte profilático e terapêutico",
  "305": "Vigilância epidemiológica",
  "361": "Ensino fundamental",
  "365": "Educação infantil",
  "306": "Alimentação e nutrição",
  "392": "Difusão cultural",
  "451": "Infraestrutura urbana",
  "452": "Serviços urbanos",
  "512": "Saneamento básico urbano",
  "541": "Preservação e conservação ambiental",
  "606": "Extensão rural",
  "782": "Transporte rodoviário",
  "812": "Desporto comunitário",
  "843": "Serviço da dívida interna",
};

/** Naturezas de despesa (categoria.grupo.modalidade.elemento). */
export const NATUREZAS_DESPESA: Record<string, string> = {
  "3.1.90.11": "Vencimentos e vantagens fixas — pessoal civil",
  "3.1.90.13": "Obrigações patronais",
  "3.1.91.13": "Obrigações patronais — intraorçamentárias (RPPS)",
  "3.3.90.30": "Material de consumo",
  "3.3.90.32": "Material de distribuição gratuita",
  "3.3.90.36": "Serviços de terceiros — pessoa física",
  "3.3.90.39": "Serviços de terceiros — pessoa jurídica",
  "3.3.90.40": "Serviços de tecnologia da informação",
  "3.3.90.46": "Auxílio-alimentação",
  "3.3.50.43": "Subvenções sociais",
  "3.2.90.21": "Juros da dívida contratual",
  "4.4.90.51": "Obras e instalações",
  "4.4.90.52": "Equipamentos e material permanente",
  "4.6.90.71": "Principal da dívida contratual",
};

export const ehPessoal = (natureza: string) => natureza.startsWith("3.1.");
export const grupoNatureza = (n: string) =>
  n.startsWith("3.1.") ? "Pessoal" : n.startsWith("3.2.") ? "Juros" : n.startsWith("3.3.") ? "Custeio" : n.startsWith("4.6.") ? "Amortização" : "Investimento";

/** Natureza do objeto de compra (workflow) → elemento de despesa sugerido. */
export const ELEMENTO_DO_OBJETO: Record<string, string> = {
  MATERIAL_EXPEDIENTE: "3.3.90.30",
  MATERIAL_LIMPEZA: "3.3.90.30",
  GENEROS_ALIMENTICIOS: "3.3.90.30",
  MEDICAMENTOS: "3.3.90.30",
  COMBUSTIVEIS: "3.3.90.30",
  EQUIPAMENTOS: "4.4.90.52",
  SERVICOS_TI: "3.3.90.40",
  TRANSPORTE: "3.3.90.39",
  SERVICOS_GERAIS: "3.3.90.39",
  SERVICO_ENGENHARIA: "4.4.90.51",
  OUTROS: "3.3.90.30",
};

export const TIPOS_EMPENHO: Record<string, { nome: string; explica: string }> = {
  ORDINARIO: { nome: "Ordinário", explica: "Valor exato, pago de uma vez." },
  ESTIMATIVO: { nome: "Estimativo", explica: "Valor estimado (folha, energia, combustível)." },
  GLOBAL: { nome: "Global", explica: "Valor certo pago em parcelas (contratos)." },
};

export const TIPOS_CREDITO: Record<string, string> = {
  SUPLEMENTAR: "Suplementar",
  ESPECIAL: "Especial",
  EXTRAORDINARIO: "Extraordinário",
  REDUCAO: "Anulação de dotação (fonte do crédito)",
};

// ---------------------------------------------------------------------------
// Receita
// ---------------------------------------------------------------------------
export type CategoriaReceita = {
  nome: string;
  simples: string;
  /** compõe a base dos mínimos de saúde e educação (impostos e transferências de impostos) */
  impostos: boolean;
  /** sofre a dedução de 20% para formação do FUNDEB */
  deducaoFundeb: boolean;
  /** receita corrente (entra na RCL) */
  corrente: boolean;
  /** grupo de fonte que recebe o dinheiro */
  grupo: GrupoFonte;
  origem: "Própria" | "Transferência";
};

export const CATEGORIAS_RECEITA: Record<string, CategoriaReceita> = {
  IPTU: { nome: "IPTU", simples: "Imposto sobre imóveis urbanos", impostos: true, deducaoFundeb: false, corrente: true, grupo: "ORDINARIOS", origem: "Própria" },
  ISS: { nome: "ISS", simples: "Imposto sobre serviços", impostos: true, deducaoFundeb: false, corrente: true, grupo: "ORDINARIOS", origem: "Própria" },
  ITBI: { nome: "ITBI", simples: "Imposto sobre venda de imóveis", impostos: true, deducaoFundeb: false, corrente: true, grupo: "ORDINARIOS", origem: "Própria" },
  IRRF: { nome: "IRRF", simples: "Imposto de renda retido dos servidores", impostos: true, deducaoFundeb: false, corrente: true, grupo: "ORDINARIOS", origem: "Própria" },
  TAXAS: { nome: "Taxas", simples: "Taxas (alvarás, coleta de lixo, licenças)", impostos: false, deducaoFundeb: false, corrente: true, grupo: "ORDINARIOS", origem: "Própria" },
  OUTRAS_PROPRIAS: { nome: "Outras receitas próprias", simples: "Iluminação pública, serviços e rendimentos", impostos: false, deducaoFundeb: false, corrente: true, grupo: "ORDINARIOS", origem: "Própria" },
  FPM: { nome: "FPM", simples: "Fundo de Participação dos Municípios (União)", impostos: true, deducaoFundeb: true, corrente: true, grupo: "ORDINARIOS", origem: "Transferência" },
  ICMS: { nome: "ICMS", simples: "Cota-parte do ICMS (Estado)", impostos: true, deducaoFundeb: true, corrente: true, grupo: "ORDINARIOS", origem: "Transferência" },
  IPVA: { nome: "IPVA", simples: "Cota-parte do IPVA (Estado)", impostos: true, deducaoFundeb: true, corrente: true, grupo: "ORDINARIOS", origem: "Transferência" },
  ITR: { nome: "ITR", simples: "Cota-parte do ITR (União)", impostos: true, deducaoFundeb: true, corrente: true, grupo: "ORDINARIOS", origem: "Transferência" },
  SUS: { nome: "SUS", simples: "Repasses do SUS (União e Estado)", impostos: false, deducaoFundeb: false, corrente: true, grupo: "SAUDE", origem: "Transferência" },
  FUNDEB: { nome: "FUNDEB", simples: "Fundo da educação básica", impostos: false, deducaoFundeb: false, corrente: true, grupo: "EDUCACAO", origem: "Transferência" },
  FNDE: { nome: "FNDE", simples: "Merenda, transporte escolar e salário-educação", impostos: false, deducaoFundeb: false, corrente: true, grupo: "EDUCACAO", origem: "Transferência" },
  FNAS: { nome: "FNAS", simples: "Repasses da assistência social", impostos: false, deducaoFundeb: false, corrente: true, grupo: "ASSISTENCIA", origem: "Transferência" },
  CONVENIOS: { nome: "Convênios", simples: "Convênios para obras e equipamentos", impostos: false, deducaoFundeb: false, corrente: false, grupo: "CONVENIOS", origem: "Transferência" },
};

export const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const MESES_LONGOS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** Limites legais usados nos índices. */
export const LIMITES = {
  saude: 15, // LC 141/2012, art. 7º
  mde: 25, // CF, art. 212
  fundeb70: 70, // Lei 14.113/2020, art. 26
  pessoalMax: 54, // LRF, art. 20, III, b (Executivo municipal)
  pessoalPrudencial: 51.3, // LRF, art. 22, parágrafo único (95%)
  pessoalAlerta: 48.6, // LRF, art. 59, §1º, II (90%)
};

export const fmtPct = (v: number | null | undefined, casas = 1) =>
  v == null || !Number.isFinite(v) ? "—" : `${v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;

/** Valor compacto para gráficos e cartões: R$ 1,2 mi, R$ 830 mil. */
export function fmtCompacto(v: number): string {
  const a = Math.abs(v);
  const s = v < 0 ? "−" : "";
  if (a >= 1e6) return `${s}R$ ${(a / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: a >= 1e8 ? 0 : 1 })} mi`;
  if (a >= 1e3) return `${s}R$ ${Math.round(a / 1e3).toLocaleString("pt-BR")} mil`;
  return `${s}R$ ${Math.round(a).toLocaleString("pt-BR")}`;
}

/** Converte "1.234,56" ou "1234.56" em número. */
export function parseValor(v: string): number {
  const s = v.trim().replace(/[R$\s]/g, "");
  if (!s) return NaN;
  if (s.includes(",")) return Number(s.replace(/\./g, "").replace(",", "."));
  return Number(s);
}

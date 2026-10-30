// Regras de cálculo do módulo de tributos: funções puras, sem banco, usadas pelas telas, pelas ações e pela demonstração.
// Os parâmetros numéricos de cada exercício (planta, alíquotas) ficam no banco; aqui ficam os métodos e as tabelas
// de demonstração que a carga inicial grava. Índices de correção, juros e multa são de DEMONSTRAÇÃO.
import { createHash } from "crypto";

export const TRIBUTO_NOME: Record<string, string> = {
  IPTU: "IPTU",
  ITBI: "ITBI",
  ISS: "ISS",
  TLF: "Taxa de licença e fiscalização",
  PARCELAMENTO: "Parcelamento de dívida ativa",
  DIVIDA_ATIVA: "Dívida ativa (recebimentos)",
};

export const USO_NOME: Record<string, string> = { RESIDENCIAL: "Residencial", COMERCIAL: "Comercial", INDUSTRIAL: "Industrial", TERRENO: "Terreno sem construção" };
export const PADRAO_NOME: Record<string, string> = { BAIXO: "Baixo", MEDIO: "Médio", ALTO: "Alto" };
export const REGIME_NOME: Record<string, string> = { MEI: "MEI", SIMPLES: "Simples Nacional", NORMAL: "Regime normal" };
export const LICENCA_NOME: Record<string, string> = {
  LOCALIZACAO_FUNCIONAMENTO: "Alvará de localização e funcionamento",
  SANITARIA: "Licença sanitária",
  AMBIENTAL: "Licença ambiental",
  PUBLICIDADE: "Licença de publicidade",
};
export const NATUREZA_ITBI: Record<string, string> = { COMPRA_VENDA: "Compra e venda", PERMUTA: "Permuta", DACAO: "Dação em pagamento", ARREMATACAO: "Arrematação" };
export const SITUACAO_ITBI: Record<string, string> = {
  EM_AVALIACAO: "Em avaliação",
  AVALIADO: "Avaliado — guia disponível",
  PAGO: "Quitado",
  CONTESTADO: "Contestado",
  CANCELADO: "Cancelado",
};
export const CERTIDAO_NOME: Record<string, string> = {
  NEGATIVA: "Certidão negativa de débitos",
  POSITIVA: "Certidão positiva de débitos",
  POSITIVA_EFEITO_NEGATIVA: "Certidão positiva com efeitos de negativa",
};

export const FATOR_PADRAO: Record<string, number> = { BAIXO: 0.75, MEDIO: 1, ALTO: 1.35 };

/** Bairros da cidade de demonstração: planta (defasada, como costuma ser) e o m² de mercado que gera as transações fictícias. */
export const BAIRROS_DEMO: { nome: string; m2Terreno: number; m2Construcao: number; m2Mercado: number; peso: number; ruas: string[] }[] = [
  { nome: "Centro", m2Terreno: 520, m2Construcao: 2100, m2Mercado: 5300, peso: 16, ruas: ["Rua das Hortênsias", "Rua Júlio de Castilhos", "Rua Borges de Medeiros", "Rua do Comércio", "Av. Getúlio Vargas"] },
  { nome: "Petrópolis", m2Terreno: 430, m2Construcao: 1900, m2Mercado: 5000, peso: 13, ruas: ["Av. Moreira Paz", "Rua dos Plátanos", "Rua Santos Dumont", "Rua Visconde de Mauá"] },
  { nome: "Jardim América", m2Terreno: 380, m2Construcao: 1800, m2Mercado: 5200, peso: 10, ruas: ["Rua das Azaleias", "Rua dos Ipês", "Rua Carlos Gomes"] },
  { nome: "Glória", m2Terreno: 300, m2Construcao: 1600, m2Mercado: 4400, peso: 12, ruas: ["Rua Ramiro Barcelos", "Rua Tiradentes", "Rua Pinheiro Machado"] },
  { nome: "Bela Vista", m2Terreno: 340, m2Construcao: 1700, m2Mercado: 4900, peso: 5, ruas: ["Rua do Mirante", "Rua das Bromélias"] },
  { nome: "Planalto", m2Terreno: 260, m2Construcao: 1450, m2Mercado: 3800, peso: 11, ruas: ["Rua Bento Gonçalves", "Rua das Acácias", "Rua Osvaldo Aranha"] },
  { nome: "São Cristóvão", m2Terreno: 230, m2Construcao: 1350, m2Mercado: 3500, peso: 10, ruas: ["Rua Dom Pedro II", "Rua Silveira Martins"] },
  { nome: "Vila Nova", m2Terreno: 210, m2Construcao: 1300, m2Mercado: 3200, peso: 12, ruas: ["Rua das Araucárias", "Rua Farroupilha", "Rua Garibaldi"] },
  { nome: "Distrito Industrial", m2Terreno: 140, m2Construcao: 1100, m2Mercado: 2600, peso: 4, ruas: ["Rodovia RS-122", "Rua Industrial A"] },
];

export type MemoriaValorVenal = {
  exercicio: number;
  bairro: string;
  areaTerreno: number;
  m2Terreno: number;
  valorTerreno: number;
  areaConstruida: number;
  m2Construcao: number;
  fatorPadrao: number;
  fatorIdade: number;
  valorConstrucao: number;
  valorVenal: number;
};

export function fatorIdade(anoConstrucao: number | null | undefined, exercicio: number) {
  if (!anoConstrucao) return 1;
  const idade = exercicio - anoConstrucao;
  return idade > 30 ? 0.8 : idade > 15 ? 0.9 : 1;
}

/** Valor venal pela planta genérica simplificada: terreno + construção × padrão × obsolescência. */
export function calcularValorVenal(
  im: { bairro: string; areaTerreno: number; areaConstruida: number; padrao: string; anoConstrucao?: number | null; uso: string },
  planta: { valorM2Terreno: number; valorM2Construcao: number },
  exercicio: number,
): MemoriaValorVenal {
  const valorTerreno = r2(im.areaTerreno * planta.valorM2Terreno);
  const fp = FATOR_PADRAO[im.padrao] ?? 1;
  const fi = fatorIdade(im.anoConstrucao, exercicio);
  const construida = im.uso === "TERRENO" ? 0 : im.areaConstruida;
  const valorConstrucao = r2(construida * planta.valorM2Construcao * fp * fi);
  return {
    exercicio,
    bairro: im.bairro,
    areaTerreno: im.areaTerreno,
    m2Terreno: planta.valorM2Terreno,
    valorTerreno,
    areaConstruida: construida,
    m2Construcao: planta.valorM2Construcao,
    fatorPadrao: fp,
    fatorIdade: fi,
    valorConstrucao,
    valorVenal: r2(valorTerreno + valorConstrucao),
  };
}

/** Alíquotas de demonstração do IPTU (lei municipal fictícia). Terreno sem construção tem alíquota maior (função social). */
export const ALIQUOTAS_IPTU_DEMO: Record<string, number> = { RESIDENCIAL: 0.0035, COMERCIAL: 0.008, INDUSTRIAL: 0.008, TERRENO: 0.015 };
export const IPTU_PARCELAS = 10;
export const IPTU_DESCONTO_COTA_UNICA = 0.1;
export const ITBI_ALIQUOTA = 0.02;
export const ITBI_ALIQUOTA_SFH = 0.005;
export const FUNDAMENTO_DEMO = "Código Tributário Municipal (lei fictícia de demonstração)";

/** Vencimentos do IPTU: cota única em 10/03 e 10 parcelas mensais de março a dezembro. */
export function vencimentosIptu(exercicio: number) {
  const unica = `${exercicio}-03-10`;
  const parcelas = Array.from({ length: IPTU_PARCELAS }, (_, i) => `${exercicio}-${String(3 + i).padStart(2, "0")}-10`);
  return { unica, parcelas };
}

/** Divide um valor em n parcelas com centavos ajustados na primeira. */
export function dividir(valor: number, n: number): number[] {
  const base = Math.floor((valor / n) * 100) / 100;
  const resto = r2(valor - base * n);
  return Array.from({ length: n }, (_, i) => (i === 0 ? r2(base + resto) : base));
}

export function r2(n: number) {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// ITBI: base de cálculo = maior entre o valor declarado e a referência fiscal
// ---------------------------------------------------------------------------
export const AMOSTRA_MINIMA = 5;

export type MemoriaItbi = {
  metodo: "MEDIANA_BAIRRO" | "VALOR_VENAL";
  bairro: string;
  amostra: number;
  medianaM2: number | null;
  area: number;
  valorVenal: number;
  valorReferencia: number;
  valorDeclarado: number;
  baseCalculo: number;
  parteFinanciadaSfh: number;
  aliquota: number;
  aliquotaSfh: number;
  valorImposto: number;
  confianca: "ADEQUADA" | "BAIXA";
  observacao: string;
};

export function mediana(xs: number[]) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Referência fiscal: mediana do m² das transações quitadas no bairro (24 meses) × área; amostra pequena cai no valor venal. */
export function avaliarItbi(input: {
  bairro: string;
  uso: string;
  areaConstruida: number;
  areaTerreno: number;
  valorVenal: number;
  valorDeclarado: number;
  valorFinanciadoSfh?: number | null;
  m2Comparaveis: number[];
}): MemoriaItbi {
  const area = input.uso === "TERRENO" ? input.areaTerreno : input.areaConstruida;
  const med = mediana(input.m2Comparaveis);
  const suficiente = input.uso !== "TERRENO" && med !== null && input.m2Comparaveis.length >= AMOSTRA_MINIMA;
  const valorReferencia = suficiente ? r2(med! * area) : input.valorVenal;
  const baseCalculo = Math.max(input.valorDeclarado, valorReferencia);
  const sfh = Math.min(Math.max(0, input.valorFinanciadoSfh ?? 0), baseCalculo);
  const valorImposto = r2(sfh * ITBI_ALIQUOTA_SFH + (baseCalculo - sfh) * ITBI_ALIQUOTA);
  return {
    metodo: suficiente ? "MEDIANA_BAIRRO" : "VALOR_VENAL",
    bairro: input.bairro,
    amostra: input.m2Comparaveis.length,
    medianaM2: med === null ? null : r2(med),
    area,
    valorVenal: input.valorVenal,
    valorReferencia,
    valorDeclarado: input.valorDeclarado,
    baseCalculo,
    parteFinanciadaSfh: sfh,
    aliquota: ITBI_ALIQUOTA,
    aliquotaSfh: ITBI_ALIQUOTA_SFH,
    valorImposto,
    confianca: suficiente ? "ADEQUADA" : "BAIXA",
    observacao: suficiente
      ? `Referência pela mediana de ${input.m2Comparaveis.length} transações quitadas no bairro nos últimos 24 meses.`
      : input.uso === "TERRENO"
        ? "Terrenos não têm comparáveis por m² construído: a referência mínima é o valor venal. Avaliação individual recomendada."
        : `Só ${input.m2Comparaveis.length} transações comparáveis no bairro (mínimo ${AMOSTRA_MINIMA}): a referência mínima é o valor venal e a avaliação deve ser individual.`,
  };
}

// ---------------------------------------------------------------------------
// Atraso: multa, juros e correção (índices de DEMONSTRAÇÃO)
// ---------------------------------------------------------------------------
export const MULTA_DIA = 0.0033;
export const MULTA_MAX = 0.1;
export const JUROS_MES = 0.01;
export const CORRECAO_MES = 0.004;

export function mesesEntre(de: Date, ate: Date) {
  return Math.max(0, (ate.getFullYear() - de.getFullYear()) * 12 + (ate.getMonth() - de.getMonth()) + (ate.getDate() >= de.getDate() ? 0 : -1));
}

export function diaISO(d: Date) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

/** Acréscimos de uma parcela vencida: correção + multa de mora (0,33% ao dia até 10%) + juros de 1% ao mês. */
export function atualizar(valor: number, vencimento: string | Date, hoje = new Date()) {
  const venc = typeof vencimento === "string" ? new Date(vencimento + "T23:59:59") : vencimento;
  if (hoje <= venc) return { correcao: 0, multa: 0, juros: 0, total: valor, diasAtraso: 0, meses: 0 };
  const dias = Math.floor((hoje.getTime() - venc.getTime()) / 86400000) + 1;
  const meses = mesesEntre(venc, hoje);
  const correcao = r2(valor * CORRECAO_MES * meses);
  const corrigido = valor + correcao;
  const multa = r2(corrigido * Math.min(MULTA_MAX, MULTA_DIA * dias));
  const juros = r2(corrigido * JUROS_MES * Math.max(1, meses));
  return { correcao, multa, juros, total: r2(corrigido + multa + juros), diasAtraso: dias, meses };
}

// ---------------------------------------------------------------------------
// Parcelamento de dívida ativa (regra de demonstração)
// ---------------------------------------------------------------------------
export const FAIXAS_PARCELAMENTO = [
  { ate: 1, descontoAcrescimos: 0.5, rotulo: "À vista" },
  { ate: 6, descontoAcrescimos: 0.3, rotulo: "Até 6 parcelas" },
  { ate: 12, descontoAcrescimos: 0.15, rotulo: "De 7 a 12 parcelas" },
  { ate: 24, descontoAcrescimos: 0, rotulo: "De 13 a 24 parcelas" },
];
export const PARCELA_MINIMA = { PESSOA: 50, EMPRESA: 150 };

export function simularParcelamento(debitos: { principal: number; acrescimos: number }[], parcelas: number, tipo: "PESSOA" | "EMPRESA") {
  const principal = r2(debitos.reduce((s, d) => s + d.principal, 0));
  const acrescimos = r2(debitos.reduce((s, d) => s + d.acrescimos, 0));
  const faixa = FAIXAS_PARCELAMENTO.find((f) => parcelas <= f.ate) ?? FAIXAS_PARCELAMENTO[FAIXAS_PARCELAMENTO.length - 1];
  const desconto = r2(acrescimos * faixa.descontoAcrescimos);
  const total = r2(principal + acrescimos - desconto);
  const minima = PARCELA_MINIMA[tipo];
  const maxParcelas = Math.max(1, Math.min(24, Math.floor(total / minima)));
  const valores = dividir(total, parcelas);
  return { principal, acrescimos, desconto, total, faixa, valores, parcelaMinima: minima, maxParcelas, valido: parcelas >= 1 && parcelas <= maxParcelas };
}

// ---------------------------------------------------------------------------
// Certidão: situação a partir das pendências
// ---------------------------------------------------------------------------
export type Pendencia = { tipo: "PARCELA_VENCIDA" | "DIVIDA_ATIVA" | "DIVIDA_PARCELADA"; descricao: string; valor: number };

/** CTN art. 205 e 206: sem pendência → negativa; só débitos com exigibilidade suspensa (parcelamento em dia) → positiva com efeitos de negativa. */
export function tipoCertidao(p: Pendencia[]): "NEGATIVA" | "POSITIVA" | "POSITIVA_EFEITO_NEGATIVA" {
  if (p.some((x) => x.tipo !== "DIVIDA_PARCELADA")) return "POSITIVA";
  if (p.length) return "POSITIVA_EFEITO_NEGATIVA";
  return "NEGATIVA";
}

// ---------------------------------------------------------------------------
// Documentos: máscaras, códigos de verificação e guia fictícia
// ---------------------------------------------------------------------------
export function mascararDocumento(doc: string) {
  const d = doc.replace(/\D/g, "");
  if (d.length === 11) return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.***/****-${d.slice(12)}`;
  return "***";
}

export function fmtDocumento(doc: string) {
  const d = doc.replace(/\D/g, "");
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return doc;
}

const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
/** Código de verificação legível (sem 0/O, 1/I), derivado de uma semente: XXXX-XXXX-XXXX. */
export function codigoVerificacao(semente: string) {
  const h = createHash("sha256").update(semente).digest();
  let s = "";
  for (let i = 0; i < 12; i++) s += ALFABETO[h[i] % ALFABETO.length];
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
}

function digitos(semente: string, n: number) {
  const h = createHash("sha256").update(semente).digest("hex");
  let out = "";
  for (let i = 0; out.length < n; i++) out += (parseInt(h[i % h.length], 16) % 10).toString();
  return out;
}

/** Linha digitável FICTÍCIA no formato de arrecadação (48 dígitos, começa com 8). Não é pagável. */
export function linhaDigitavelFicticia(semente: string, valor: number) {
  const v = String(Math.round(valor * 100)).padStart(11, "0");
  const corpo = ("8160" + v + digitos(semente, 33)).slice(0, 44);
  const blocos = [corpo.slice(0, 11), corpo.slice(11, 22), corpo.slice(22, 33), corpo.slice(33, 44)];
  return blocos.map((b, i) => `${b}-${digitos(semente + i, 1)}`).join(" ");
}

export function pixFicticio(semente: string, valor: number) {
  return `00020101021226580014BR.GOV.BCB.PIX0136CIVU-DEMONSTRACAO-SEM-VALOR-${digitos(semente, 8)}5204000053039865406${valor.toFixed(2)}5802BR5925PREFEITURA DEMONSTRACAO6009DEMO6304${digitos(semente + "crc", 4)}`;
}

/** Gerador pseudoaleatório determinístico (mulberry32) para a demonstração. */
export function aleatorio(semente: number) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

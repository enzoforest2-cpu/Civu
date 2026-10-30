// Regras puras das etapas do fluxo de contratação (Lei 14.133/2021).
// Sem banco e sem Next: recebem dados e devolvem { ok, motivo }.
// Datas são strings ISO (AAAA-MM-DD). Prazos em dias úteis não contam o dia de partida.
import { addDays } from "date-fns";
import { addDiasUteis, isDiaUtil } from "./dates";

export type TipoObjetoEdital =
  | "BENS_MENOR_PRECO"
  | "BENS_OUTROS"
  | "SERVICOS_COMUNS"
  | "SERVICOS_ESPECIAIS"
  | "OBRA_SEMI_INTEGRADA"
  | "TECNICA_E_PRECO"
  | "OBRA_INTEGRADA";

/** Prazo mínimo, em dias úteis, entre a publicação do edital e a abertura (art. 55). */
export const PRAZO_MINIMO_EDITAL: Record<TipoObjetoEdital, number> = {
  BENS_MENOR_PRECO: 8,
  BENS_OUTROS: 15,
  SERVICOS_COMUNS: 10,
  SERVICOS_ESPECIAIS: 25,
  OBRA_SEMI_INTEGRADA: 35,
  TECNICA_E_PRECO: 35,
  OBRA_INTEGRADA: 60,
};

export const ROTULO_TIPO: Record<TipoObjetoEdital, string> = {
  BENS_MENOR_PRECO: "compra de bens por menor preço",
  BENS_OUTROS: "compra de bens (demais critérios)",
  SERVICOS_COMUNS: "serviços e obras comuns",
  SERVICOS_ESPECIAIS: "serviços e obras especiais",
  OBRA_SEMI_INTEGRADA: "contratação semi-integrada",
  TECNICA_E_PRECO: "técnica e preço",
  OBRA_INTEGRADA: "contratação integrada",
};

export type FontePreco = { fonte: string; data: string; valor: number };
export type PesquisaPrecos = { fontes: FontePreco[]; justificativa?: string };
export type Edital = { numero: string; tipoObjeto: TipoObjetoEdital; publicadoEm: string; aberturaEm: string; plataforma: string };
export type Impugnacao = {
  id: string; autor: string; texto: string; recebidaEm: string; tempestiva: boolean;
  resposta?: string; acolhida?: boolean; alteraPropostas?: boolean; respondidaEm?: string;
};
export type ResultadoSessao = {
  situacao: "VENCEDOR" | "DESERTA" | "FRACASSADA";
  fornecedor?: string; cnpj?: string; valor?: number; ataEm: string;
};
export type Recurso = {
  id: string; recorrente: string; intencaoEm: string; razoesAte: string; contrarrazoesAte: string;
  decisao?: string; provido?: boolean; decididoEm?: string;
};
export type AvisoDispensa = { publicadoEm?: string; justificativaSemAviso?: string };
export type RetornoBancario = { aceito: boolean; autenticacao?: string; motivo?: string; em: string };
export type ResultadoRegra = { ok: boolean; motivo: string };

/** Tamanho mínimo de justificativa aceito (pesquisa de preços e dispensa sem aviso). */
export const MIN_JUSTIFICATIVA = 30;

const ok = (motivo: string): ResultadoRegra => ({ ok: true, motivo });
const falha = (motivo: string): ResultadoRegra => ({ ok: false, motivo });

// --- datas ---------------------------------------------------------------

function paraData(iso: string): Date {
  return new Date(iso + "T12:00:00"); // meio-dia local evita cair no dia anterior por fuso
}

/** Formata pelo calendário local (toISOString devolveria o dia seguinte para 23h59 em fuso negativo). */
function paraIso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function br(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

function somaUteis(iso: string, dias: number, feriados: Set<string>): string {
  return paraIso(addDiasUteis(paraData(iso), dias, feriados));
}

export function diaUtil(iso: string, feriados: Set<string>): boolean {
  return isDiaUtil(paraData(iso), feriados);
}

// --- regras --------------------------------------------------------------

export function regraPesquisaPrecos(p: PesquisaPrecos | undefined): ResultadoRegra {
  const n = p?.fontes?.length ?? 0;
  if (n >= 3) return ok(`Pesquisa de preços com ${n} fontes.`);
  if ((p?.justificativa ?? "").trim().length >= MIN_JUSTIFICATIVA) {
    return ok(`Pesquisa com ${n} fonte(s) e justificativa registrada.`);
  }
  return falha(`A pesquisa de preços tem ${n} fonte(s). Registre ao menos 3 fontes ou justifique por que não há mais fornecedores (justificativa com no mínimo ${MIN_JUSTIFICATIVA} caracteres).`);
}

/** Tipo de objeto previsto no art. 55 (só as chaves próprias da tabela: "toString" e afins não valem). */
export function tipoObjetoValido(t: unknown): t is TipoObjetoEdital {
  return typeof t === "string" && Object.hasOwn(PRAZO_MINIMO_EDITAL, t);
}

/** Mediana dos valores, arredondada a centavos; null sem valores. É o valor estimado da pesquisa de preços. */
export function mediana(valores: number[]): number | null {
  if (!valores.length) return null;
  const v = [...valores].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return Math.round((v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2) * 100) / 100;
}

/** Último dia para propostas no aviso de contratação direta: 3 dias úteis após a publicação (art. 75, §3º). */
export function fimAvisoDispensa(publicadoEm: string, feriados: Set<string>): string {
  return somaUteis(publicadoEm, 3, feriados);
}

export function aberturaMinima(publicadoEm: string, tipo: TipoObjetoEdital, feriados: Set<string>): string {
  return somaUteis(publicadoEm, PRAZO_MINIMO_EDITAL[tipo], feriados);
}

export function regraPrazoEdital(e: Edital | undefined, feriados: Set<string>): ResultadoRegra {
  if (!e) return falha("Registre o edital com data de publicação e de abertura.");
  if (!e.publicadoEm || !e.aberturaEm) return falha("Informe a data de publicação e a data de abertura do edital.");
  if (!tipoObjetoValido(e.tipoObjeto)) {
    return falha(`Tipo de objeto do edital inválido: "${String(e.tipoObjeto)}". Escolha um dos tipos previstos no art. 55.`);
  }
  if (!diaUtil(e.aberturaEm, feriados)) {
    return falha(`A abertura em ${br(e.aberturaEm)} não é dia útil. Escolha um dia útil.`);
  }
  const minima = aberturaMinima(e.publicadoEm, e.tipoObjeto, feriados);
  if (e.aberturaEm < minima) {
    return falha(
      `A abertura precisa ser em ${br(minima)} ou depois: ${PRAZO_MINIMO_EDITAL[e.tipoObjeto]} dias úteis para ${ROTULO_TIPO[e.tipoObjeto]} (art. 55).`,
    );
  }
  return ok(`Prazo do edital respeitado (abertura mínima em ${br(minima)}).`);
}

/** Tempestiva quando recebida até o 3º dia útil antes da abertura (art. 164). */
export function impugnacaoTempestiva(recebidaEm: string, aberturaEm: string, feriados: Set<string>): boolean {
  let d = paraData(aberturaEm);
  let restantes = 3;
  while (restantes > 0) {
    d = addDays(d, -1);
    if (isDiaUtil(d, feriados)) restantes -= 1;
  }
  return recebidaEm <= paraIso(d);
}

export function regraImpugnacoes(e: Edital | undefined, imps: Impugnacao[], hoje: string): ResultadoRegra {
  if (!e) return falha("Registre o edital antes de tratar as impugnações.");
  if (hoje < e.aberturaEm) {
    return falha(`Aguarde a abertura em ${br(e.aberturaEm)}: ainda podem chegar impugnações.`);
  }
  const pendentes = imps.filter((i) => i.tempestiva && !i.resposta?.trim());
  if (pendentes.length > 0) {
    return falha(`Responda ${pendentes.length} impugnação(ões) tempestiva(s) antes de seguir.`);
  }
  return ok("Impugnações tempestivas respondidas.");
}

/** Razões em 3 dias úteis a partir da intenção; contrarrazões em mais 3 (art. 165). */
export function prazosRecurso(intencaoEm: string, feriados: Set<string>): { razoesAte: string; contrarrazoesAte: string } {
  const razoesAte = somaUteis(intencaoEm, 3, feriados);
  return { razoesAte, contrarrazoesAte: somaUteis(razoesAte, 3, feriados) };
}

export function regraRecursos(rs: Recurso[]): ResultadoRegra {
  const abertos = rs.filter((r) => !r.decididoEm);
  if (abertos.length > 0) return falha(`Decida ${abertos.length} recurso(s) pendente(s) antes de seguir.`);
  return ok(rs.length === 0 ? "Sem recursos." : "Todos os recursos foram decididos.");
}

export function regraResultado(r: ResultadoSessao | undefined): ResultadoRegra {
  if (!r) return falha("Registre o resultado da sessão.");
  if (r.situacao === "DESERTA") return falha("Licitação deserta: republique o edital ou mude a modalidade.");
  if (r.situacao === "FRACASSADA") return falha("Licitação fracassada: republique o edital ou mude a modalidade.");
  if (!r.fornecedor?.trim() || !r.cnpj?.trim() || !r.valor || r.valor <= 0) {
    return falha("Informe fornecedor, CNPJ e valor do vencedor.");
  }
  return ok(`Vencedor: ${r.fornecedor}.`);
}

export function regraAvisoDispensa(
  modalidade: string | undefined,
  a: AvisoDispensa | undefined,
  hoje: string,
  feriados: Set<string>,
): ResultadoRegra {
  if (modalidade !== "DISPENSA_VALOR") return ok("Aviso de contratação direta não se aplica a esta modalidade.");
  if ((a?.justificativaSemAviso ?? "").trim().length >= MIN_JUSTIFICATIVA) return ok("Dispensa sem aviso, com justificativa registrada.");
  if (!a?.publicadoEm) {
    return falha(`Publique o aviso de contratação direta (3 dias úteis) ou registre justificativa de ao menos ${MIN_JUSTIFICATIVA} caracteres.`);
  }
  const fim = fimAvisoDispensa(a.publicadoEm, feriados);
  if (hoje <= fim) {
    return falha(`O aviso fica aberto até ${br(fim)}. Siga a partir do próximo dia.`);
  }
  return ok(`Aviso de contratação direta cumprido (até ${br(fim)}).`);
}

export function regraRetornoBancario(r: RetornoBancario | undefined): ResultadoRegra {
  if (!r) return falha("Aguarde o retorno do banco.");
  if (!r.aceito) return falha(`O banco recusou o pagamento${r.motivo ? `: ${r.motivo}` : ""}. Corrija os dados e reenvie.`);
  return ok("Pagamento aceito pelo banco.");
}

/** Dados da contratação como ficam em `metadados.contratacao` (o valor é texto com duas casas, ex.: "8500.00"). */
export type DadosContratacao = { fornecedor?: string; cnpj?: string; valor?: string | number; fonte?: string };

/**
 * Contrato só segue com fornecedor, CNPJ, valor e fonte de recurso válida: a fonte define a fila cronológica de pagamento (art. 141).
 * `fontes` é a tabela de fontes válidas (FONTES de workflow.ts), recebida aqui para a regra continuar pura.
 */
export function regraContratacao(c: DadosContratacao | undefined, fontes: Record<string, string>): ResultadoRegra {
  const faltam: string[] = [];
  if (!c?.fornecedor?.trim()) faltam.push("fornecedor");
  if (String(c?.cnpj ?? "").replace(/\D/g, "").length !== 14) faltam.push("CNPJ");
  const valor = Number(c?.valor);
  if (!Number.isFinite(valor) || valor <= 0) faltam.push("valor contratado");
  if (typeof c?.fonte !== "string" || !Object.hasOwn(fontes, c.fonte)) faltam.push("fonte de recurso");
  if (faltam.length) return falha(`Informe nos dados da contratação: ${faltam.join(", ")}.`);
  return ok(`Contratação com ${c!.fornecedor}, fonte ${fontes[c!.fonte!]}.`);
}

export function regraModalidadeDefinida(modalidade: string | undefined): ResultadoRegra {
  if (!modalidade || modalidade === "A_DEFINIR") return falha("Defina a modalidade da contratação.");
  return ok(`Modalidade: ${modalidade}.`);
}

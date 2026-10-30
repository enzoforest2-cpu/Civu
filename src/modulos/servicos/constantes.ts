// Rótulos e regras simples do módulo de serviços urbanos (usados no servidor e no cliente).
import type { Tone } from "@/components/ui";

export type StatusOcorrencia = "ABERTA" | "ACEITA" | "PROGRAMADA" | "EM_EXECUCAO" | "CONCLUIDA" | "RECUSADA" | "DUPLICADA";
export type StatusOrdem = "PROGRAMADA" | "EM_EXECUCAO" | "CONCLUIDA" | "CANCELADA";

/** Como a gestão lê cada situação. */
export const STATUS_GESTAO: Record<StatusOcorrencia, { rotulo: string; tone: Tone }> = {
  ABERTA: { rotulo: "Aguardando triagem", tone: "warn" },
  ACEITA: { rotulo: "Aceita, sem OS", tone: "brand" },
  PROGRAMADA: { rotulo: "Programada", tone: "brand" },
  EM_EXECUCAO: { rotulo: "Em execução", tone: "brand" },
  CONCLUIDA: { rotulo: "Concluída", tone: "ok" },
  RECUSADA: { rotulo: "Recusada", tone: "neutral" },
  DUPLICADA: { rotulo: "Duplicada", tone: "neutral" },
};

/** Como o cidadão lê cada situação. */
export const STATUS_CIDADAO: Record<StatusOcorrencia, { rotulo: string; tone: Tone }> = {
  ABERTA: { rotulo: "Recebido", tone: "neutral" },
  ACEITA: { rotulo: "Aceito, aguardando programação", tone: "brand" },
  PROGRAMADA: { rotulo: "Programado", tone: "brand" },
  EM_EXECUCAO: { rotulo: "Equipe trabalhando no local", tone: "brand" },
  CONCLUIDA: { rotulo: "Concluído", tone: "ok" },
  RECUSADA: { rotulo: "Não atendido", tone: "bad" },
  DUPLICADA: { rotulo: "Unido a outro pedido", tone: "neutral" },
};

export const STATUS_ORDEM: Record<StatusOrdem, { rotulo: string; tone: Tone }> = {
  PROGRAMADA: { rotulo: "Programada", tone: "brand" },
  EM_EXECUCAO: { rotulo: "Em execução", tone: "warn" },
  CONCLUIDA: { rotulo: "Concluída", tone: "ok" },
  CANCELADA: { rotulo: "Cancelada", tone: "neutral" },
};

/** Situações em que a ocorrência ainda depende da prefeitura. */
export const EM_ABERTO: StatusOcorrencia[] = ["ABERTA", "ACEITA", "PROGRAMADA", "EM_EXECUCAO"];
export const ENCERRADAS: StatusOcorrencia[] = ["CONCLUIDA", "RECUSADA", "DUPLICADA"];

export const CATEGORIAS: Record<string, string> = {
  VIAS: "Ruas e calçadas",
  ILUMINACAO: "Iluminação pública",
  ARBORIZACAO: "Árvores e áreas verdes",
  LIMPEZA: "Limpeza urbana",
  DRENAGEM: "Drenagem e esgoto pluvial",
  SINALIZACAO: "Sinalização de trânsito",
  ZOONOSES: "Animais na via",
};

export const CANAIS: Record<string, string> = {
  PORTAL: "Civu Cidadão",
  WHATSAPP: "WhatsApp",
  TELEFONE: "Telefone 156",
  PRESENCIAL: "Atendimento presencial",
};

export const BAIRROS_SUGERIDOS = [
  "Centro",
  "Petrópolis",
  "Glória",
  "São Cristóvão",
  "Industrial",
  "Medianeira",
  "Vila Nova",
  "Santa Catarina",
  "Jardim dos Pinheiros",
  "Interior (zona rural)",
];

/** Data "aaaa-mm-dd" (coluna date) em dd/mm/aaaa sem passar por fuso horário. */
export function fmtDia(d: string | null | undefined): string {
  if (!d) return "—";
  const [a, m, dia] = String(d).slice(0, 10).split("-");
  return `${dia}/${m}/${a}`;
}

/** Hoje (aaaa-mm-dd) no fuso usado pelo sistema. */
export function hojeIso(desloc = 0): string {
  const d = new Date(Date.now() + desloc * 86400_000);
  return d.toLocaleDateString("en-CA", { timeZone: "America/Fortaleza" });
}

export function enderecoCurto(o: { logradouro: string; numero: string | null; bairro: string }) {
  return `${o.logradouro}${o.numero ? ", " + o.numero : ""} · ${o.bairro}`;
}

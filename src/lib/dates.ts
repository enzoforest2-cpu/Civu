// Dias úteis, prazos e formatação (fuso America/Fortaleza por padrão)
import { addDays, differenceInCalendarDays, isSaturday, isSunday, startOfDay } from "date-fns";

export function isDiaUtil(d: Date, feriados: Set<string>): boolean {
  if (isSaturday(d) || isSunday(d)) return false;
  return !feriados.has(isoDate(d));
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Soma N dias úteis a partir de `inicio` (o próprio dia não conta). Devolve o fim do dia (23h59) do prazo. */
export function addDiasUteis(inicio: Date, dias: number, feriados: Set<string>): Date {
  let d = startOfDay(inicio);
  let restantes = dias;
  while (restantes > 0) {
    d = addDays(d, 1);
    if (isDiaUtil(d, feriados)) restantes -= 1;
  }
  const fim = new Date(d);
  fim.setHours(23, 59, 59, 999);
  return fim;
}

/** Dias úteis entre duas datas (exclusivo no início, inclusivo no fim). */
export function diasUteisEntre(a: Date, b: Date, feriados: Set<string>): number {
  let d = startOfDay(a);
  const fim = startOfDay(b);
  let n = 0;
  while (d < fim) {
    d = addDays(d, 1);
    if (isDiaUtil(d, feriados)) n += 1;
  }
  return n;
}

export function diasCorridos(a: Date, b: Date = new Date()): number {
  return differenceInCalendarDays(b, a);
}

export function fmtData(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const x = typeof d === "string" ? new Date(d) : d;
  return x.toLocaleDateString("pt-BR", { timeZone: "America/Fortaleza" });
}

export function fmtDataHora(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const x = typeof d === "string" ? new Date(d) : d;
  return x.toLocaleString("pt-BR", { timeZone: "America/Fortaleza", dateStyle: "short", timeStyle: "short" });
}

export function fmtMoeda(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = typeof v === "string" ? Number(v) : v;
  if (Number.isNaN(n)) return String(v);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** "há 3 dias", "em 2 dias", "hoje" */
export function relativo(d: Date | string | null | undefined): string {
  if (!d) return "";
  const x = typeof d === "string" ? new Date(d) : d;
  const diff = differenceInCalendarDays(x, new Date());
  if (diff === 0) return "hoje";
  if (diff === 1) return "amanhã";
  if (diff === -1) return "ontem";
  if (diff < 0) return `há ${-diff} dias`;
  return `em ${diff} dias`;
}

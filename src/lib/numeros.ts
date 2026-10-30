/**
 * Número digitado por servidor brasileiro: "1.500" (milhar), "1.500,25", "8,5", "1500", "1500.5", "R$ 1.500,00".
 * Com vírgula, ela é o decimal e os pontos são milhar. Sem vírgula, pontos em grupos de 3 (1.500, 1.234.567) são milhar;
 * fora disso o ponto é decimal. Devolve NaN quando não é número.
 */
export function numeroBr(v: string | null | undefined): number {
  const s = String(v ?? "").replace(/R\$|\s/g, "");
  if (!s) return NaN;
  let normal: string;
  if (s.includes(",")) normal = s.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) normal = s.replace(/\./g, "");
  else normal = s;
  if (!/^-?\d+(\.\d+)?$/.test(normal)) return NaN;
  return Number(normal);
}

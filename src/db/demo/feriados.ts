// Feriados do município de demonstração (Vale das Araucárias/RS): nacionais, a Sexta-feira Santa e a data estadual do RS.
// A carga cadastra o ano anterior, o corrente e o seguinte: os processos da demonstração começam até 160 dias antes da
// carga (no começo do ano, parte do histórico cai no ano anterior) e os prazos de dezembro passam para janeiro.

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher), AAAA-MM-DD. */
function pascoa(ano: number): string {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

const somaDias = (iso: string, n: number) => new Date(Date.parse(iso + "T12:00:00Z") + n * 86400_000).toISOString().slice(0, 10);

/** Feriados de um ano. */
export function feriadosDoAno(ano: number): { data: string; nome: string }[] {
  return [
    { data: `${ano}-01-01`, nome: "Confraternização Universal" },
    { data: somaDias(pascoa(ano), -2), nome: "Sexta-feira Santa" },
    { data: `${ano}-04-21`, nome: "Tiradentes" },
    { data: `${ano}-05-01`, nome: "Dia do Trabalho" },
    { data: `${ano}-09-07`, nome: "Independência do Brasil" },
    { data: `${ano}-09-20`, nome: "Revolução Farroupilha" },
    { data: `${ano}-10-12`, nome: "Nossa Senhora Aparecida" },
    { data: `${ano}-11-02`, nome: "Finados" },
    { data: `${ano}-11-15`, nome: "Proclamação da República" },
    { data: `${ano}-11-20`, nome: "Consciência Negra" },
    { data: `${ano}-12-25`, nome: "Natal" },
  ];
}

/** Feriados que a carga cadastra: ano anterior, corrente e seguinte. */
export function feriadosDemo(ano: number): { data: string; nome: string }[] {
  return [...feriadosDoAno(ano - 1), ...feriadosDoAno(ano), ...feriadosDoAno(ano + 1)];
}

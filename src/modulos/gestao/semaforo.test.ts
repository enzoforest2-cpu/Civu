import { test } from "node:test";
import assert from "node:assert/strict";
import { avaliarSemaforo, fracaoDoAno, LIMITES_SEMAFORO, type SinaisSecretaria } from "./semaforo";

const base: SinaisSecretaria = {
  emAndamento: 10,
  atrasados: 0,
  dotacaoAtualizada: 1_000_000,
  liquidado: 700_000,
  fracaoDoAno: 0.8,
  repassesVencidos: 0,
  repassesEmRisco: 0,
  obrigacoesVencidas: 0,
  pendenciasAssinatura: 0,
  pendenciasVencidas: 0,
};
const sinal = (s: ReturnType<typeof avaliarSemaforo>, chave: string) => s.sinais.find((x) => x.chave === chave)!;

test("semáforo: tudo em dia fica verde e explica", () => {
  const s = avaliarSemaforo(base);
  assert.equal(s.nivel, "verde");
  assert.equal(s.rotulo, "Em dia");
  assert.equal(s.sinais.length, 4);
  assert.match(s.porque, /dentro do esperado/);
});

test("semáforo: atrasos — 1 a 2 amarelo, 3 ou mais vermelho", () => {
  assert.equal(sinal(avaliarSemaforo({ ...base, atrasados: 1 }), "atrasos").nivel, "amarelo");
  assert.equal(sinal(avaliarSemaforo({ ...base, atrasados: 2 }), "atrasos").nivel, "amarelo");
  const v = avaliarSemaforo({ ...base, atrasados: LIMITES_SEMAFORO.atrasadosVermelho });
  assert.equal(v.nivel, "vermelho");
  assert.match(v.porque, /^Crítico\. Atrasos: 3 processos atrasados de 10 em andamento\.$/);
});

test("semáforo: execução contra o ritmo do ano", () => {
  // 80% do ano: 60% liquidado = 20 pontos abaixo (no limite, ainda verde); 59% = amarelo; 49% = vermelho
  assert.equal(sinal(avaliarSemaforo({ ...base, liquidado: 600_000 }), "execucao").nivel, "verde");
  assert.equal(sinal(avaliarSemaforo({ ...base, liquidado: 590_000 }), "execucao").nivel, "amarelo");
  assert.equal(sinal(avaliarSemaforo({ ...base, liquidado: 490_000 }), "execucao").nivel, "vermelho");
  // executar acima do ritmo não é problema
  assert.equal(sinal(avaliarSemaforo({ ...base, liquidado: 950_000 }), "execucao").nivel, "verde");
  // sem órgão próprio, o sinal não pesa
  const sem = sinal(avaliarSemaforo({ ...base, dotacaoAtualizada: null, liquidado: 0 }), "execucao");
  assert.equal(sem.nivel, "verde");
  assert.match(sem.texto, /Sem orçamento próprio/);
});

test("semáforo: repasses e obrigações", () => {
  assert.equal(sinal(avaliarSemaforo({ ...base, repassesEmRisco: 2 }), "repasses").nivel, "amarelo");
  assert.equal(sinal(avaliarSemaforo({ ...base, repassesVencidos: 1 }), "repasses").nivel, "vermelho");
  const ob = avaliarSemaforo({ ...base, obrigacoesVencidas: 1, repassesEmRisco: 1 });
  assert.equal(ob.nivel, "vermelho");
  assert.match(sinal(ob, "repasses").texto, /1 repasse com prazo em até 30 dias; 1 obrigação vencida/);
});

test("semáforo: pendências de assinatura do(a) secretário(a)", () => {
  assert.equal(sinal(avaliarSemaforo({ ...base, pendenciasAssinatura: 2 }), "assinaturas").nivel, "amarelo");
  assert.equal(sinal(avaliarSemaforo({ ...base, pendenciasAssinatura: 2, pendenciasVencidas: 1 }), "assinaturas").nivel, "vermelho");
});

test("semáforo: a cor é a do pior sinal e o porquê cita só os sinais dessa cor", () => {
  const s = avaliarSemaforo({ ...base, atrasados: 1, pendenciasAssinatura: 1 });
  assert.equal(s.nivel, "amarelo");
  assert.equal(s.rotulo, "Atenção");
  assert.match(s.porque, /^Atenção\. Atrasos: 1 processo atrasado de 10 em andamento\. Assinaturas do\(a\) secretário\(a\): 1 item espera o\(a\) secretário\(a\)\.$/);
  assert.doesNotMatch(s.porque, /execução/);
});

test("fração do ano decorrida", () => {
  assert.ok(Math.abs(fracaoDoAno(new Date("2026-01-01T15:00:00Z")) - 1 / 365) < 1e-9);
  assert.ok(Math.abs(fracaoDoAno(new Date("2026-12-31T15:00:00Z")) - 1) < 1e-9);
  assert.ok(Math.abs(fracaoDoAno(new Date("2026-07-02T15:00:00Z")) - 183 / 365) < 1e-9);
});

test("resumo da sala cita o mapa das secretarias, repasses e obrigações (regras, sem IA)", async () => {
  const { gerarResumoSemanal } = await import("./resumo");
  const base = {
    municipio: "Vale", inicio: new Date("2026-11-07T12:00:00Z"), fim: new Date("2026-11-14T12:00:00Z"), abertos: 3, abertosAnterior: 2, concluidos: 1, concluidosAnterior: 1,
    estoque: 10, estoqueAnterior: 9, atrasados: 0, aguardandoGabinete: 0, gabineteVencendo: 0, obrigacoesVencidas: 0, obrigacoesProximas: 0,
    pagamentosNaFila: 0, valorNaFila: 0, quebrasOrdem: 0, alertasAltos: 0, alertasTotal: 0, setorMaisCarregado: null,
  };
  const r = gerarResumoSemanal({
    ...base,
    secretarias: [
      { nome: "Secretaria de Saúde", nivel: "vermelho" },
      { nome: "Secretaria da Fazenda", nivel: "amarelo" },
      { nome: "Secretaria de Educação", nivel: "amarelo" },
      { nome: "Secretaria de Assistência Social", nivel: "verde" },
    ],
    repassesEmRisco: 2,
    valorRepassesEmRisco: 150000,
    repassesVencidos: 1,
    obrigacoesAreaVencidas: 1,
    pendenciasSecretarios: 3,
  });
  const texto = r.paragrafos.join(" ");
  assert.match(texto, /uma está em situação crítica \(Saúde\) e 2 pedem atenção \(Fazenda e Educação\); a outra está em dia\./);
  assert.match(texto, /2 repasses estão em risco, somando R\$\s150\.000, um deles com prazo vencido ou pendência\./);
  assert.match(texto, /1 obrigação de entrega das secretarias está vencida\./);
  assert.match(texto, /3 aprovações e assinaturas esperam os\(as\) secretários\(as\)\./);
  assert.equal(r.titulo, "Semana com pontos que pedem decisão");
  // sem os campos novos, o resumo continua como antes
  assert.doesNotMatch(gerarResumoSemanal(base).paragrafos.join(" "), /mapa das secretarias/);
});

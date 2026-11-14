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
  assert.match(v.porque, /^Crítico por atrasos: 3 processos atrasados de 10/);
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
  assert.match(s.porque, /^Atenção por atrasos e assinaturas do\(a\) secretário\(a\): /);
  assert.doesNotMatch(s.porque, /execução/);
});

test("fração do ano decorrida", () => {
  assert.ok(Math.abs(fracaoDoAno(new Date("2026-01-01T15:00:00Z")) - 1 / 365) < 1e-9);
  assert.ok(Math.abs(fracaoDoAno(new Date("2026-12-31T15:00:00Z")) - 1) < 1e-9);
  assert.ok(Math.abs(fracaoDoAno(new Date("2026-07-02T15:00:00Z")) - 183 / 365) < 1e-9);
});

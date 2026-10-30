// src/lib/regras-fluxo.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import * as R from "./regras-fluxo";
const fer = new Set(["2026-11-02", "2026-11-15", "2026-11-20"]);

test("pesquisa de preços: 3 fontes passa, 2 sem justificativa falha, 2 com justificativa passa", () => {
  const f = (n: number) => Array.from({ length: n }, (_, i) => ({ fonte: `F${i}`, data: "2026-10-01", valor: 10 }));
  assert.equal(R.regraPesquisaPrecos({ fontes: f(3) }).ok, true);
  assert.equal(R.regraPesquisaPrecos({ fontes: f(2) }).ok, false);
  assert.equal(R.regraPesquisaPrecos({ fontes: f(2), justificativa: "Só dois fornecedores atendem a região." }).ok, true);
  assert.equal(R.regraPesquisaPrecos(undefined).ok, false);
});

test("abertura mínima conta dias úteis e pula feriados", () => {
  // publicado sexta 30/10/2026; 8 dias úteis sem contar o dia da publicação, com Finados em 02/11 → quinta 12/11
  assert.equal(R.aberturaMinima("2026-10-30", "BENS_MENOR_PRECO", fer), "2026-11-12");
  assert.equal(R.regraPrazoEdital({ numero: "1/2026", tipoObjeto: "BENS_MENOR_PRECO", publicadoEm: "2026-10-30", aberturaEm: "2026-11-11", plataforma: "BLL" }, fer).ok, false);
  assert.equal(R.regraPrazoEdital({ numero: "1/2026", tipoObjeto: "BENS_MENOR_PRECO", publicadoEm: "2026-10-30", aberturaEm: "2026-11-12", plataforma: "BLL" }, fer).ok, true);
});

test("abertura num dia não útil é recusada", () => {
  const r = R.regraPrazoEdital({ numero: "1/2026", tipoObjeto: "BENS_MENOR_PRECO", publicadoEm: "2026-10-30", aberturaEm: "2026-11-15", plataforma: "BLL" }, fer);
  assert.equal(r.ok, false);
  assert.match(r.motivo, /dia útil/);
});

test("impugnação até 3 dias úteis antes da abertura é tempestiva", () => {
  // abertura 12/11: o último dia é 09/11 (12 → 11, 10, 09)
  assert.equal(R.impugnacaoTempestiva("2026-11-09", "2026-11-12", fer), true);
  assert.equal(R.impugnacaoTempestiva("2026-11-10", "2026-11-12", fer), false);
});

test("impugnação intempestiva não bloqueia; tempestiva sem resposta bloqueia", () => {
  const e = { numero: "1/2026", tipoObjeto: "BENS_MENOR_PRECO" as const, publicadoEm: "2026-10-30", aberturaEm: "2026-11-12", plataforma: "BLL" };
  const intemp = { id: "a", autor: "X", texto: "t", recebidaEm: "2026-11-10", tempestiva: false };
  const temp = { id: "b", autor: "Y", texto: "t", recebidaEm: "2026-11-03", tempestiva: true };
  assert.equal(R.regraImpugnacoes(e, [intemp], "2026-11-12").ok, true);
  assert.equal(R.regraImpugnacoes(e, [temp], "2026-11-12").ok, false);
  assert.equal(R.regraImpugnacoes(e, [{ ...temp, resposta: "Mantido", acolhida: false, respondidaEm: "2026-11-05" }], "2026-11-12").ok, true);
  assert.equal(R.regraImpugnacoes(e, [], "2026-11-11").ok, false); // antes da abertura
});

test("prazos de recurso: 3 + 3 dias úteis", () => {
  // intenção 12/11: razões até 17/11; contrarrazões pulam o feriado de 20/11 → 23/11
  assert.deepEqual(R.prazosRecurso("2026-11-12", fer), { razoesAte: "2026-11-17", contrarrazoesAte: "2026-11-23" });
});

test("recursos, resultado, aviso de dispensa, retorno bancário e modalidade", () => {
  assert.equal(R.regraRecursos([]).ok, true);
  assert.equal(R.regraRecursos([{ id: "r", recorrente: "Z", intencaoEm: "2026-11-11", razoesAte: "2026-11-16", contrarrazoesAte: "2026-11-19" }]).ok, false);
  assert.equal(R.regraResultado({ situacao: "DESERTA", ataEm: "2026-11-11" }).ok, false);
  assert.equal(R.regraResultado({ situacao: "VENCEDOR", fornecedor: "A", cnpj: "45871230000164", valor: 1000, ataEm: "2026-11-11" }).ok, true);
  assert.equal(R.regraAvisoDispensa("LICITACAO", undefined, "2026-11-03", fer).ok, true);
  // aviso de 30/10 corre em 03, 04 e 05/11; segue a partir de 06/11
  assert.equal(R.regraAvisoDispensa("DISPENSA_VALOR", { publicadoEm: "2026-10-30" }, "2026-11-05", fer).ok, false);
  assert.equal(R.regraAvisoDispensa("DISPENSA_VALOR", { publicadoEm: "2026-10-30" }, "2026-11-06", fer).ok, true);
  assert.equal(R.regraRetornoBancario({ aceito: false, motivo: "Conta encerrada", em: "2026-11-05" }).ok, false);
  assert.equal(R.regraModalidadeDefinida("A_DEFINIR").ok, false);
});

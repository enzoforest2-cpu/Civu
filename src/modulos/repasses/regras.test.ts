// src/modulos/repasses/regras.test.ts — alertas de prazo, execução pelos processos vinculados, risco e quem edita
// (npx tsx --test src/modulos/repasses/regras.test.ts)
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Area, UsuarioComArea } from "../../lib/areas";
import {
  alertaDePrazo,
  areaTemPasta,
  dataBr,
  diasCorridosEntre,
  ehDataIso,
  percentualExecutado,
  podeEditarNaArea,
  podeVerNaArea,
  prazoCritico,
  prazosDoRepasse,
  riscoDoRepasse,
  somarExecucao,
  somarMeses,
  vencimentoSeguinte,
} from "./regras";

const HOJE = "2026-11-13";

test("alerta de prazo em dias corridos: 30, 15, 5 dias e vencido", () => {
  const nivel = (d: string) => alertaDePrazo(d, HOJE).nivel;
  assert.equal(nivel("2026-11-12"), "vencido");
  assert.equal(alertaDePrazo("2026-11-12", HOJE).texto, "Venceu ontem");
  assert.equal(alertaDePrazo("2026-11-03", HOJE).texto, "Vencido há 10 dias");
  assert.equal(nivel("2026-11-13"), "5");
  assert.equal(alertaDePrazo("2026-11-13", HOJE).texto, "Vence hoje");
  assert.equal(nivel("2026-11-18"), "5"); // 5 dias
  assert.equal(nivel("2026-11-19"), "15"); // 6 dias
  assert.equal(nivel("2026-11-28"), "15"); // 15 dias
  assert.equal(nivel("2026-11-29"), "30"); // 16 dias
  assert.equal(nivel("2026-12-13"), "30"); // 30 dias
  assert.equal(nivel("2026-12-14"), "ok"); // 31 dias
  // dias corridos atravessam fim de semana e feriado sem descontar nada (15/11 é domingo e feriado nacional)
  assert.equal(diasCorridosEntre("2026-11-13", "2026-11-16"), 3);
  assert.equal(diasCorridosEntre("2026-12-31", "2027-01-01"), 1);
  assert.equal(alertaDePrazo("2026-11-14", HOJE).texto, "Vence amanhã");
});

test("prazos que valem dependem da situação do repasse", () => {
  const base = { prazoExecucao: "2026-11-20", vigenciaFim: "2027-03-01", prazoPrestacaoContas: "2027-05-01" };
  const exec = prazosDoRepasse({ ...base, situacao: "EM_EXECUCAO" }, HOJE);
  assert.deepEqual(exec.map((p) => p.chave), ["execucao", "vigencia", "prestacao"]);
  assert.equal(exec[0].alerta.nivel, "15");
  assert.deepEqual(prazosDoRepasse({ ...base, situacao: "PRESTACAO_PENDENTE" }, HOJE).map((p) => p.chave), ["prestacao"]);
  assert.deepEqual(prazosDoRepasse({ ...base, situacao: "EM_CAPTACAO" }, HOJE), []);
  assert.deepEqual(prazosDoRepasse({ ...base, situacao: "PRESTADO" }, HOJE), []);
  // o mais grave vem primeiro, mesmo que a data seja posterior a outra sem alerta
  const c = prazoCritico({ situacao: "VIGENTE", prazoExecucao: "2027-02-01", vigenciaFim: "2026-11-10", prazoPrestacaoContas: null }, HOJE);
  assert.equal(c?.chave, "vigencia");
  assert.equal(c?.alerta.nivel, "vencido");
  assert.equal(prazoCritico({ situacao: "VIGENTE", prazoExecucao: null, vigenciaFim: null, prazoPrestacaoContas: null }, HOJE), null);
});

test("repasse soma a execução dos processos vinculados: contratado ⊇ liquidado ⊇ pago", () => {
  const e = somarExecucao([
    { valor: 8700, liquidado: true, pago: true, cancelado: false }, // pago
    { valor: 1250.5, liquidado: true, pago: false, cancelado: false }, // na fila
    { valor: 298400, liquidado: false, pago: false, cancelado: false }, // em execução
    { valor: null, liquidado: false, pago: false, cancelado: false }, // sem contratação registrada
    { valor: 5000, liquidado: false, pago: false, cancelado: true }, // encerrado sem pagamento
    { valor: 300, liquidado: true, pago: true, cancelado: true }, // pago e arquivado continua contando
  ]);
  assert.deepEqual(e, { contratado: 308650.5, liquidado: 10250.5, pago: 9000 });
  assert.deepEqual(somarExecucao([]), { contratado: 0, liquidado: 0, pago: 0 });
  // compra e pagamento do contrato que saiu dela no mesmo repasse: contratado da compra; liquidado e pago dos pagamentos
  const compra = { id: "c1", valor: 298400, liquidado: false, pago: false, cancelado: false };
  const pag1 = { id: "p1", valor: 48620, liquidado: true, pago: true, cancelado: false, origemId: "c1" };
  const pag2 = { id: "p2", valor: 1000, liquidado: true, pago: false, cancelado: false, origemId: "c1" };
  assert.deepEqual(somarExecucao([compra, pag1]), { contratado: 298400, liquidado: 48620, pago: 48620 });
  assert.deepEqual(somarExecucao([pag2, compra, pag1]), { contratado: 298400, liquidado: 49620, pago: 48620 });
  // sem pagamento do contrato no repasse, vale o fluxo da própria compra
  assert.deepEqual(somarExecucao([{ ...compra, liquidado: true, pago: true }]), { contratado: 298400, liquidado: 298400, pago: 298400 });
  // pagamento cuja compra de origem não está no repasse conta sozinho
  assert.deepEqual(somarExecucao([pag1]), { contratado: 48620, liquidado: 48620, pago: 48620 });
  assert.equal(percentualExecutado(9000, 60000), 15);
  assert.equal(percentualExecutado(1, 3), 33.3);
  assert.equal(percentualExecutado(500, 0), 0);
});

test("risco do repasse: prazo em até 30 dias, vencido ou pendência; valor em risco conforme o prazo", () => {
  const r = { situacao: "EM_EXECUCAO", prazoExecucao: "2026-11-25", vigenciaFim: null, prazoPrestacaoContas: null, valorPrevisto: 100000, valorRecebido: 100000 };
  const x = riscoDoRepasse(r, 40000, HOJE);
  assert.equal(x.emRisco, true);
  assert.equal(x.valorEmRisco, 60000);
  assert.match(x.motivo ?? "", /^Prazo de execução: vence em 12 dias$/);
  assert.equal(riscoDoRepasse({ ...r, prazoExecucao: "2027-06-01" }, 40000, HOJE).emRisco, false);
  const p = riscoDoRepasse({ ...r, situacao: "PRESTACAO_PENDENTE", prazoPrestacaoContas: "2026-11-10", valorRecebido: 80000 }, 0, HOJE);
  assert.deepEqual([p.emRisco, p.valorEmRisco], [true, 80000]);
  const pend = riscoDoRepasse({ ...r, situacao: "COM_PENDENCIA", prazoPrestacaoContas: null, valorRecebido: 30000 }, 0, HOJE);
  assert.deepEqual([pend.emRisco, pend.valorEmRisco], [true, 30000]);
});

test("obrigação: próximo vencimento pela periodicidade; entrega única encerra", () => {
  assert.equal(vencimentoSeguinte("MENSAL", "2026-01-31"), "2026-02-28");
  assert.equal(vencimentoSeguinte("BIMESTRAL", "2026-11-30"), "2027-01-30");
  assert.equal(vencimentoSeguinte("QUADRIMESTRAL", "2026-05-31"), "2026-09-30");
  assert.equal(vencimentoSeguinte("ANUAL", "2028-02-29"), "2029-02-28");
  assert.equal(vencimentoSeguinte("UNICA", "2026-12-01"), null);
  assert.equal(somarMeses("2026-12-15", 1), "2027-01-15");
  assert.equal(dataBr("2026-03-07"), "07/03/2026");
  assert.equal(ehDataIso("2026-02-30"), false);
  assert.equal(ehDataIso("2026-02-28"), true);
});

test("autorização por área: só a área responsável e o Gabinete editam; controle e ADMIN só veem", () => {
  const p = (papeis: string[], area: Area | null): UsuarioComArea => ({ papeis, setor: area === null ? null : { area } });
  const prefeita = p(["ORDENADOR", "ADMIN"], "GABINETE");
  const saude = p(["SECRETARIO"], "SAUDE");
  const requisitanteSaude = p(["REQUISITANTE"], "SAUDE");
  const educacao = p(["SECRETARIO"], "EDUCACAO");
  const controle = p(["CONTROLE_INTERNO"], "CONTROLE_INTERNO");
  const adminTi = p(["ADMIN"], "ADMINISTRACAO");
  const adminSemSetor = p(["ADMIN"], null);
  const compras = p(["COMPRAS"], "COMPRAS");

  // edição
  assert.equal(podeEditarNaArea(prefeita, "SAUDE"), true);
  assert.equal(podeEditarNaArea(prefeita, null), true);
  assert.equal(podeEditarNaArea(saude, "SAUDE"), true);
  assert.equal(podeEditarNaArea(requisitanteSaude, "SAUDE"), true);
  assert.equal(podeEditarNaArea(saude, "EDUCACAO"), false);
  assert.equal(podeEditarNaArea(educacao, "SAUDE"), false);
  assert.equal(podeEditarNaArea(controle, "SAUDE"), false);
  assert.equal(podeEditarNaArea(adminTi, "SAUDE"), false); // o papel ADMIN não dá edição
  assert.equal(podeEditarNaArea(adminTi, "ADMINISTRACAO"), true); // mas a área do setor dele, sim
  assert.equal(podeEditarNaArea(adminSemSetor, "SAUDE"), false);
  assert.equal(podeEditarNaArea(compras, "SAUDE"), false);
  assert.equal(podeEditarNaArea(saude, null), false);

  // leitura
  assert.equal(podeVerNaArea(saude, "SAUDE"), true);
  assert.equal(podeVerNaArea(saude, "EDUCACAO"), false);
  assert.equal(podeVerNaArea(controle, "EDUCACAO"), true);
  assert.equal(podeVerNaArea(adminSemSetor, "EDUCACAO"), true);
  assert.equal(podeVerNaArea(prefeita, null), true);
  assert.equal(podeVerNaArea(saude, null), false);

  // só secretaria com pasta responde por repasse: controle interno e compras não cadastram nem no próprio setor
  assert.equal(areaTemPasta("SAUDE"), true);
  assert.equal(areaTemPasta("GABINETE"), true);
  assert.equal(areaTemPasta("CONTROLE_INTERNO"), false);
  assert.equal(areaTemPasta("COMPRAS"), false);
  assert.equal(areaTemPasta(null), false);
});

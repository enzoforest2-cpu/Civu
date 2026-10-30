# Fluxo da contratação: etapas novas da licitação e ajustes — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Levar o fluxo COMPRA do sistema ao desenho do esboço: 4 etapas novas da licitação (edital, impugnações, disputa, recursos), o caminho da contratação direta e 7 ajustes (secretário, autuação pelo protocolo, pesquisa de preços estruturada, modelos de ETP/TR, empenho antes do contrato, ordem de fornecimento, pagamento confirmado pelo banco).

**Architecture:** O fluxo continua sendo dados (`WorkflowDef` em `src/lib/workflow.ts`) interpretados pelo motor (`src/lib/engine.ts`). Três extensões pequenas no formato: um novo tipo de trava `{ tipo: "regra" }` avaliada por funções puras em `src/lib/regras-fluxo.ts`; avanços condicionais (`quando`) para o desvio licitação × contratação direta; e `ramo`/`opcional` nos estados para o trilho mostrar só o caminho do processo. Os dados de cada etapa nova (edital, impugnações, resultado, recursos, aviso de dispensa, retorno bancário) ficam em `processos.metadados` e cada ação grava um evento na cadeia.

**Tech Stack:** Next.js 16 (server actions), React 19, Drizzle + Postgres, TypeScript, `tsx` para testes (`node:test` + `node:assert/strict`).

**Spec:** `docs/especificacoes/fluxo-protocolo.html` (o esboço publicado; os dados das 27 etapas estão no array `P` do script).

## Global Constraints

- Português do Brasil em toda a interface, mensagens de erro e eventos. Sem emojis.
- Processos só mudam pelo motor; nunca escrever direto em `eventos`. Toda ação nova grava um evento com `registrarEvento`.
- Prazos em dias úteis com os feriados do município (`addDiasUteis`, `feriadosDo` já existentes).
- Prazos mínimos do edital (Lei 14.133, art. 55), em dias úteis: `BENS_MENOR_PRECO` 8, `BENS_OUTROS` 15, `SERVICOS_COMUNS` 10, `SERVICOS_ESPECIAIS` 25, `OBRA_SEMI_INTEGRADA` 35, `TECNICA_E_PRECO` 35, `OBRA_INTEGRADA` 60.
- Impugnação: até 3 dias úteis antes da abertura; resposta em até 3 dias úteis (art. 164). Recurso: razões em 3 dias úteis após a intenção, contrarrazões em mais 3 (art. 165). Aviso de dispensa por valor: 3 dias úteis (art. 75, §3º).
- Pesquisa de preços: pelo menos 3 fontes, ou justificativa com pelo menos 30 caracteres (art. 23).
- Pagamento: "enviado ao banco" não é "pago"; o processo só chega a `PAGO` com retorno bancário aceito. Retorno rejeitado devolve à fila sem perder a posição (a posição é a data da liquidação).
- Não alterar o fluxo `PAGAMENTO_CONTRATO` do módulo de contratos nem o fluxo `REQUERIMENTO`.
- Não gerar migração: nada muda no schema; o fluxo novo entra pelo seed (`DEMO_VERSAO` sobe de 10 para 11).
- `npx tsc --noEmit -p .`, `npx eslint` nos arquivos tocados e `npx next build` passam ao fim de cada tarefa.

## Review Focus

- Processo antigo cujo estado atual não existe mais no fluxo novo (`CONTRATACAO`): a página não pode quebrar; `carregarProcesso` deve cair num estado de reserva legível. Teste na Tarefa 2.
- Data de abertura do edital num feriado municipal ou fim de semana: o prazo mínimo conta só dias úteis e a abertura num dia não útil é recusada com mensagem clara. Teste na Tarefa 1.
- Modalidade `A_DEFINIR` chegando ao parecer jurídico: nenhum avanço aparece e a tela diz que compras precisa definir a modalidade. Teste na Tarefa 2.
- Impugnação recebida fora do prazo: é registrada como intempestiva (não some), não bloqueia a sessão. Teste na Tarefa 1.
- Dois retornos bancários para o mesmo pagamento (clique duplo): o segundo é recusado. Teste na Tarefa 4.

---

## Estrutura de arquivos

- Create `src/lib/regras-fluxo.ts` — funções puras das travas novas (prazo do edital, impugnações, recursos, aviso de dispensa, pesquisa de preços, retorno bancário) e os tipos dos dados guardados em `metadados`.
- Create `src/lib/regras-fluxo.test.ts` — testes unitários (`node:test`).
- Modify `src/lib/workflow.ts` — tipos (`Gate` com `regra`, `Transicao.quando`, `EstadoDef.ramo/opcional`), novos `DOCUMENTO_TIPOS`, `TIPOS_OBJETO_EDITAL`, e o `WORKFLOW_COMPRA` refeito; helpers `avancosDisponiveis` e `caminhoDoProcesso`.
- Modify `src/lib/engine.ts` — `avaliarGates` com regras, `avancar` respeitando `quando`, e as ações novas (`definirModalidade`, `registrarPesquisaPrecos`, `publicarEdital`, `registrarImpugnacao`, `responderImpugnacao`, `registrarResultadoSessao`, `registrarRecurso`, `decidirRecurso`, `publicarAvisoDispensa`, `registrarRetornoBancario`).
- Create `src/db/test-fluxo.ts` — teste de ponta a ponta dos dois caminhos (licitação e direta) contra o banco de demonstração.
- Modify `src/db/test-engine.ts` — passa pelas etapas novas do começo (secretário, autuação).
- Modify `src/lib/pagamentos.ts` — `pago` passa a ser o estado final `PAGO`; `PAGAMENTO_ENVIADO` aparece como "enviado, aguardando banco".
- Create `src/app/(app)/processos/[id]/etapas/` — um painel por etapa nova (`pesquisa-precos.tsx`, `edital.tsx`, `impugnacoes.tsx`, `sessao.tsx`, `recursos.tsx`, `aviso-dispensa.tsx`, `retorno-bancario.tsx`, `modalidade.tsx`) e `acoes.ts` com as server actions.
- Modify `src/app/(app)/processos/[id]/page.tsx` — usa `avancosDisponiveis`, `caminhoDoProcesso` e mostra o painel da etapa atual.
- Modify `src/modulos/gestao/gabinete.ts`, `src/modulos/gestao/automacoes.ts` — trocam `estado.avancos[0]` por `avancosDisponiveis(p)[0]`.
- Modify `src/modulos/gestao/modelos.ts` — modelos de ETP e TR.
- Modify `src/db/seed.ts`, `src/db/valor.ts`, `src/db/demo/index.ts` — caminhos com os estados novos, `CONTRATACAO` → `SESSAO_DISPUTA`, `DEMO_VERSAO = 11`, e um processo de exemplo parado em cada etapa nova.
- Modify `package.json` — script `"test:regras": "tsx --test src/lib/regras-fluxo.test.ts"` e `"test:fluxo": "tsx src/db/test-fluxo.ts"`.

---

### Task 1: Regras puras das etapas novas

**Files:**
- Create: `src/lib/regras-fluxo.ts`
- Create: `src/lib/regras-fluxo.test.ts`
- Modify: `package.json` (script `test:regras`)

**Interfaces:**
- Consumes: `addDiasUteis(data: Date, dias: number, feriados: Set<string>): Date` de `src/lib/dates.ts`.
- Produces:
  - `type TipoObjetoEdital = "BENS_MENOR_PRECO" | "BENS_OUTROS" | "SERVICOS_COMUNS" | "SERVICOS_ESPECIAIS" | "OBRA_SEMI_INTEGRADA" | "TECNICA_E_PRECO" | "OBRA_INTEGRADA"`
  - `const PRAZO_MINIMO_EDITAL: Record<TipoObjetoEdital, number>` (valores das Global Constraints)
  - `type FontePreco = { fonte: string; data: string; valor: number }`
  - `type PesquisaPrecos = { fontes: FontePreco[]; justificativa?: string }`
  - `type Edital = { numero: string; tipoObjeto: TipoObjetoEdital; publicadoEm: string; aberturaEm: string; plataforma: string }` (datas ISO `AAAA-MM-DD`)
  - `type Impugnacao = { id: string; autor: string; texto: string; recebidaEm: string; tempestiva: boolean; resposta?: string; acolhida?: boolean; alteraPropostas?: boolean; respondidaEm?: string }`
  - `type ResultadoSessao = { situacao: "VENCEDOR" | "DESERTA" | "FRACASSADA"; fornecedor?: string; cnpj?: string; valor?: number; ataEm: string }`
  - `type Recurso = { id: string; recorrente: string; intencaoEm: string; razoesAte: string; contrarrazoesAte: string; decisao?: string; provido?: boolean; decididoEm?: string }`
  - `type AvisoDispensa = { publicadoEm?: string; justificativaSemAviso?: string }`
  - `type RetornoBancario = { aceito: boolean; autenticacao?: string; motivo?: string; em: string }`
  - `type ResultadoRegra = { ok: boolean; motivo: string }`
  - `function regraPesquisaPrecos(p: PesquisaPrecos | undefined): ResultadoRegra`
  - `function aberturaMinima(publicadoEm: string, tipo: TipoObjetoEdital, feriados: Set<string>): string` — o dia da publicação não conta
  - `function regraPrazoEdital(e: Edital | undefined, feriados: Set<string>): ResultadoRegra`
  - `function impugnacaoTempestiva(recebidaEm: string, aberturaEm: string, feriados: Set<string>): boolean` — tempestiva quando recebida até o 3º dia útil antes da abertura
  - `function regraImpugnacoes(e: Edital | undefined, imps: Impugnacao[], hoje: string): ResultadoRegra` — ok quando todas as tempestivas têm resposta e `hoje >= aberturaEm`
  - `function prazosRecurso(intencaoEm: string, feriados: Set<string>): { razoesAte: string; contrarrazoesAte: string }`
  - `function regraRecursos(rs: Recurso[]): ResultadoRegra` — ok quando não há recurso ou todos têm `decididoEm`
  - `function regraResultado(r: ResultadoSessao | undefined): ResultadoRegra` — ok só com `VENCEDOR` e fornecedor, CNPJ e valor
  - `function regraAvisoDispensa(modalidade: string | undefined, a: AvisoDispensa | undefined, hoje: string, feriados: Set<string>): ResultadoRegra` — fora de `DISPENSA_VALOR` sempre ok; senão ok depois de terminados os 3 dias úteis do aviso (sem contar o dia da publicação) ou com justificativa ≥ 30 caracteres
  - `function regraRetornoBancario(r: RetornoBancario | undefined): ResultadoRegra` — ok só com `aceito === true`
  - `function regraModalidadeDefinida(modalidade: string | undefined): ResultadoRegra` — falha em `undefined` ou `"A_DEFINIR"`
  - `function diaUtil(iso: string, feriados: Set<string>): boolean`

- [ ] **Step 1: Escrever os testes que falham**

```ts
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
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx tsx --test src/lib/regras-fluxo.test.ts`
Expected: FAIL (módulo `./regras-fluxo` não existe)

- [ ] **Step 3: Implementar `src/lib/regras-fluxo.ts`** com as assinaturas do bloco Interfaces. Datas são strings ISO; converter com `new Date(iso + "T12:00:00")` para não cair no dia anterior por fuso. `motivo` sempre em português e dizendo o que fazer ("A abertura precisa ser em 12/11/2026 ou depois: 8 dias úteis para compra por menor preço (art. 55)").

- [ ] **Step 4: Rodar e ver passar**

Run: `npx tsx --test src/lib/regras-fluxo.test.ts`
Expected: PASS (7 testes)

- [ ] **Step 5: Commit** — `git commit -m "Regras puras das etapas novas da contratação (prazos da Lei 14.133)"` com `package.json` e os dois arquivos.

---

### Task 2: Formato do fluxo e o fluxo COMPRA novo

**Files:**
- Modify: `src/lib/workflow.ts`
- Modify: `src/lib/engine.ts` (`avaliarGates`, `avancar`, `carregarProcesso`)
- Test: `src/db/test-fluxo.ts` (criado aqui com o primeiro caso)

**Interfaces:**
- Consumes: as funções `regra*` da Task 1.
- Produces:
  - `type Gate = ... | { tipo: "regra"; regra: RegraFluxo; descricao: string }` com `type RegraFluxo = "MODALIDADE_DEFINIDA" | "PESQUISA_PRECOS" | "PRAZO_EDITAL" | "IMPUGNACOES" | "RESULTADO_SESSAO" | "RECURSOS" | "AVISO_DISPENSA" | "RETORNO_BANCARIO"`
  - `type Transicao = { para; rotulo; motivoObrigatorio?; quando?: { campo: string; valores: string[] } }`
  - `EstadoDef` ganha `ramo?: "LICITACAO" | "DIRETA"` e `opcional?: boolean`
  - `function avancosDisponiveis(def: WorkflowDef, estado: EstadoDef, metadados: Record<string, unknown> | null): Transicao[]`
  - `function caminhoDoProcesso(def: WorkflowDef, metadados: Record<string, unknown> | null): EstadoDef[]` — tira o ramo que não é o da modalidade (`LICITACAO` → ramo LICITACAO; `DISPENSA_VALOR`/`OUTRA_DIRETA` → DIRETA; sem modalidade definida mostra os dois)
  - `avaliarGates(p)` passa a avaliar `regra` com `feriados` (assinatura vira `avaliarGates(p: ProcessoCompleto, feriados: Set<string>, hoje?: string)`; todos os chamadores atualizados)
  - Estados do `WORKFLOW_COMPRA`, nesta ordem: `DEMANDA`, `APROVACAO_SECRETARIO`, `AUTUACAO`, `AUTORIZACAO`, `INSTRUCAO`, `VERIFICACAO_ORCAMENTARIA`, `ALTERACAO_ORCAMENTARIA` (opcional), `RESERVADO`, `CONTROLE_INTERNO`, `PARECER_JURIDICO`, `PUBLICACAO_EDITAL`*, `IMPUGNACOES`*, `SESSAO_DISPUTA`*, `RECURSOS`*, `HOMOLOGADO`*, `INSTRUCAO_DIRETA`†, `AUTORIZACAO_DIRETA`†, `EMPENHADO`, `CONTRATADO`, `EXECUCAO`, `LIQUIDADO`, `FILA_PAGAMENTO`, `PAGAMENTO_ENVIADO`, `PAGO`, `ARQUIVADO` (* ramo LICITACAO, † ramo DIRETA). Setores, papéis, prazos sugeridos, documentos e travas de cada um vêm da ficha correspondente no array `P` do spec.
  - `DOCUMENTO_TIPOS` ganha `TERMO_AUTUACAO`, `RESPOSTA_IMPUGNACAO`, `DECISAO_RECURSO`, `AVISO_DISPENSA`, `ATO_AUTORIZACAO_DIRETA`, `ORDEM_FORNECIMENTO`, `RETORNO_BANCARIO`.
  - `carregarProcesso` devolve `estado` de reserva (`{ chave: estadoAtual, nome: "Etapa antiga: " + estadoAtual, papeis: ["ADMIN"], avancos: [], devolucoes: [], gates: [], setor: "LIVRE", slaDiasUteis: 0 }`) quando o estado não existe mais no fluxo.

- [ ] **Step 1: Escrever o teste que falha** em `src/db/test-fluxo.ts` (mesmo shim de módulos de `src/db/test-engine.ts`, linhas 4-11): abrir uma compra com `modalidade: "A_DEFINIR"`, levar até `PARECER_JURIDICO` e afirmar `avancosDisponiveis(...)` vazio; definir `modalidade: "LICITACAO"` via `db.update(processos)` e afirmar que o único avanço é `PUBLICACAO_EDITAL`; com `DISPENSA_VALOR`, o único avanço é `INSTRUCAO_DIRETA`. Afirmar `caminhoDoProcesso` sem `INSTRUCAO_DIRETA` quando a modalidade é `LICITACAO`. Afirmar que um processo com `estadoAtual = "CONTRATACAO"` carrega sem erro e com nome começando por "Etapa antiga".

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run db:reset && npx tsx src/db/test-fluxo.ts`
Expected: FAIL (`avancosDisponiveis` não exportado)

- [ ] **Step 3: Implementar** os tipos, os helpers, o `WORKFLOW_COMPRA` novo e as mudanças no motor. Em `avancar`, a transição pedida precisa estar em `avancosDisponiveis`; a checagem de ordem cronológica continua valendo na saída de `FILA_PAGAMENTO` para `PAGAMENTO_ENVIADO`.

- [ ] **Step 4: Atualizar `src/db/test-engine.ts`** para passar por `APROVACAO_SECRETARIO` (assinatura do DFD pelo secretário 88888888888) e `AUTUACAO` (protocolo 22222222222) antes de `AUTORIZACAO`.

- [ ] **Step 5: Rodar e ver passar**

Run: `npm run db:reset && npx tsx src/db/test-fluxo.ts && npm run test:engine`
Expected: as duas suítes terminam com "Todos os testes passaram."

- [ ] **Step 6: Commit** — `git commit -m "Fluxo de compra com licitação, contratação direta, secretário, autuação e pagamento confirmado"`

---

### Task 3: Ações das etapas novas no motor

**Files:**
- Modify: `src/lib/engine.ts`
- Test: `src/db/test-fluxo.ts` (casos dos dois caminhos completos)

**Interfaces:**
- Consumes: tipos e regras da Task 1; `avancosDisponiveis` da Task 2.
- Produces (todas exigem `podeAgir`, gravam em `metadados` dentro de transação e registram evento com o tipo indicado):
  - `definirModalidade(u, processoId, modalidade: string, justificativa: string)` — evento `MODALIDADE`; só em `INSTRUCAO`
  - `registrarPesquisaPrecos(u, processoId, p: PesquisaPrecos)` — evento `PESQUISA_PRECOS`; recalcula `valorEstimado` como mediana das fontes
  - `publicarEdital(u, processoId, e: Edital)` — evento `EDITAL`; recusa com o motivo de `regraPrazoEdital` quando não passa
  - `registrarImpugnacao(u, processoId, i: { autor: string; texto: string; recebidaEm: string })` — evento `IMPUGNACAO`; calcula `tempestiva`
  - `responderImpugnacao(u, processoId, id: string, r: { resposta: string; acolhida: boolean; alteraPropostas: boolean })` — evento `RESPOSTA_IMPUGNACAO`; se `acolhida && alteraPropostas`, devolve o processo a `PUBLICACAO_EDITAL` com motivo "Impugnação acolhida: republicar o edital com prazo novo"
  - `registrarResultadoSessao(u, processoId, r: ResultadoSessao)` — evento `RESULTADO_SESSAO`; com `VENCEDOR`, preenche `metadados.contratacao.fornecedor/cnpj/valor`
  - `registrarRecurso(u, processoId, r: { recorrente: string; intencaoEm: string })` — evento `RECURSO`; usa `prazosRecurso`
  - `decidirRecurso(u, processoId, id: string, d: { decisao: string; provido: boolean })` — evento `DECISAO_RECURSO`
  - `publicarAvisoDispensa(u, processoId, a: AvisoDispensa)` — evento `AVISO_DISPENSA`
  - `registrarRetornoBancario(u, processoId, r: { aceito: boolean; autenticacao?: string; motivo?: string })` — evento `RETORNO_BANCARIO`; só em `PAGAMENTO_ENVIADO`; aceito avança a `PAGO`; rejeitado devolve a `FILA_PAGAMENTO` com o motivo; recusa um segundo retorno quando o processo já saiu de `PAGAMENTO_ENVIADO`

- [ ] **Step 1: Escrever os testes que falham** em `src/db/test-fluxo.ts`:
  - caminho licitação de ponta a ponta: pesquisa com 2 fontes bloqueia `INSTRUCAO`, com 3 passa; edital com abertura curta é recusado; impugnação tempestiva sem resposta bloqueia `IMPUGNACOES`; resposta acolhida que altera propostas leva de volta a `PUBLICACAO_EDITAL`; resultado `DESERTA` não deixa avançar; `VENCEDOR` preenche `metadados.contratacao`; recurso não decidido bloqueia `RECURSOS`; chega a `EMPENHADO` depois de `HOMOLOGADO`.
  - caminho direto: dispensa por valor com aviso de 1 dia útil bloqueia `INSTRUCAO_DIRETA`; com justificativa de 30+ caracteres passa; `AUTORIZACAO_DIRETA` exige `ATO_AUTORIZACAO_DIRETA` assinado por ORDENADOR; chega a `EMPENHADO`.
  - pagamento: de `FILA_PAGAMENTO` para `PAGAMENTO_ENVIADO`; retorno rejeitado volta à fila; retorno aceito vai a `PAGO`; segundo retorno é recusado; `verificarCadeia` íntegra no fim.

- [ ] **Step 2: Rodar e ver falhar** — `npm run db:reset && npx tsx src/db/test-fluxo.ts` → FAIL (`publicarEdital` não existe)
- [ ] **Step 3: Implementar** as ações com as assinaturas acima.
- [ ] **Step 4: Rodar e ver passar** — mesmo comando → "Todos os testes passaram."
- [ ] **Step 5: Commit** — `git commit -m "Ações do motor para edital, impugnações, sessão, recursos, aviso de dispensa e retorno bancário"`

---

### Task 4: Fila de pagamentos com "enviado" e "pago"

**Files:**
- Modify: `src/lib/pagamentos.ts`
- Modify: `src/app/fila-de-pagamentos/page.tsx`
- Test: `src/db/test-fluxo.ts`

**Interfaces:**
- Consumes: estados `PAGAMENTO_ENVIADO` e `PAGO` da Task 2.
- Produces: o mapa de estados passa a `{ fila: string; enviado?: string; pago: string }`; `historicoDePagamentos` conta como pago só a entrada em `PAGO` e mede os dias da liquidação ao `PAGO`; nova `enviadosAoBanco(municipioId): Promise<{ processoId; numero; fornecedor; valor; enviadoEm: Date }[]>`.

- [ ] **Step 1: Teste que falha** — em `test-fluxo.ts`, depois do envio ao banco e antes do retorno, `historicoDePagamentos` não lista o processo e `enviadosAoBanco` lista; depois do retorno aceito, o inverso.
- [ ] **Step 2: Ver falhar**, **Step 3: implementar**, **Step 4: ver passar** (mesmo comando da Task 3).
- [ ] **Step 5:** na página pública, uma linha "Enviados ao banco, aguardando confirmação" acima de "Pagos recentemente". Commit.

---

### Task 5: Telas das etapas novas

**Files:**
- Create: `src/app/(app)/processos/[id]/etapas/acoes.ts` (server actions que chamam as funções da Task 3 e fazem `revalidatePath`)
- Create: `src/app/(app)/processos/[id]/etapas/{modalidade,pesquisa-precos,edital,impugnacoes,sessao,recursos,aviso-dispensa,retorno-bancario}.tsx`
- Create: `src/app/(app)/processos/[id]/etapas/index.tsx` — `PainelDaEtapa({ p, pode, feriados })` escolhe o painel pela `p.estadoAtual`
- Modify: `src/app/(app)/processos/[id]/page.tsx`
- Modify: `src/modulos/gestao/gabinete.ts`, `src/modulos/gestao/automacoes.ts`

**Interfaces:**
- Consumes: ações da Task 3; `avancosDisponiveis`, `caminhoDoProcesso` da Task 2; `ActionForm` e `SubmitButton` de `src/components/action-form.tsx`; `Panel`, `Chip`, `Vazio` de `src/components/ui.tsx`.
- Produces: um painel por etapa nova, mostrado acima dos documentos quando o processo está naquela etapa.

Conteúdo de cada painel (texto da interface exatamente assim):
- Modalidade (`INSTRUCAO`, quando `A_DEFINIR`): select com `MODALIDADES` sem `A_DEFINIR`, justificativa, botão "Definir modalidade".
- Pesquisa de preços (`INSTRUCAO`): tabela fonte / data / valor com "Adicionar fonte"; contador "N de 3 fontes"; campo "Justificativa (se houver menos de 3 fontes)"; mediana calculada; botão "Salvar pesquisa".
- Edital (`PUBLICACAO_EDITAL`): número, tipo de objeto (select com os 7 tipos e o prazo de cada um), publicado em, abertura em, plataforma; abaixo do campo de abertura a frase "Abertura a partir de {data}: {n} dias úteis (art. 55)" recalculada no servidor ao enviar; botão "Publicar edital".
- Impugnações (`IMPUGNACOES`): lista com chip "No prazo" ou "Fora do prazo", formulário de registro e de resposta (acolhida? altera propostas?); linha "Sessão marcada para {data}".
- Sessão (`SESSAO_DISPUTA`): situação (vencedor, deserta, fracassada), fornecedor, CNPJ, valor, data da ata; botão "Registrar resultado"; nota "A disputa acontece na plataforma; aqui fica o resultado."
- Recursos (`RECURSOS`): lista com "razões até" e "contrarrazões até"; registrar intenção; decidir; quando vazio, "Nenhuma intenção de recurso registrada na sessão."
- Aviso de dispensa (`INSTRUCAO_DIRETA`, só em `DISPENSA_VALOR`): data de publicação, "Propostas até {data}", ou justificativa sem aviso.
- Retorno bancário (`PAGAMENTO_ENVIADO`): "Banco confirmou" com autenticação, ou "Banco recusou" com motivo; chip "Enviado em {data}, aguardando o banco".

- [ ] **Step 1:** página do processo usa `avancosDisponiveis` para os botões e `caminhoDoProcesso` para o trilho; quando `PARECER_JURIDICO` não tem avanço disponível, mostra "Compras ainda não definiu a modalidade. Devolva a compras para definir." Gabinete e automações usam `avancosDisponiveis(p.def, p.estado, p.metadados)[0]`.
- [ ] **Step 2:** criar os painéis e as ações.
- [ ] **Step 3:** `npx tsc --noEmit -p . && npx next build` passam.
- [ ] **Step 4:** Playwright: abrir como compras (33333333333) um processo em cada etapa nova da demonstração, preencher e enviar cada formulário, e conferir que a etapa avança ou que a mensagem de bloqueio aparece; screenshots a 1280 e 390 de largura, sem rolagem horizontal.
- [ ] **Step 5: Commit** — `git commit -m "Telas das etapas novas: modalidade, pesquisa de preços, edital, impugnações, sessão, recursos, aviso de dispensa e retorno bancário"`

---

### Task 6: Modelos de ETP e TR, demonstração e publicação

**Files:**
- Modify: `src/modulos/gestao/modelos.ts` (modelos `ETP` e `TR` com as seções do art. 18, §1º e art. 6º, XXIII)
- Modify: `src/db/seed.ts`, `src/db/valor.ts`, `src/db/demo/index.ts`

**Interfaces:**
- Consumes: tudo acima.
- Produces: `DEMO_VERSAO = 11`; um processo de exemplo parado em cada etapa nova (`APROVACAO_SECRETARIO`, `AUTUACAO`, `PUBLICACAO_EDITAL`, `IMPUGNACOES` com uma impugnação sem resposta, `SESSAO_DISPUTA`, `RECURSOS` com um recurso no prazo, `INSTRUCAO_DIRETA` com aviso publicado ontem, `PAGAMENTO_ENVIADO`); nenhum processo com estado atual `CONTRATACAO`.

- [ ] **Step 1:** trocar `CONTRATACAO` por `SESSAO_DISPUTA` nos caminhos de `seed.ts` e `valor.ts`, inserir `APROVACAO_SECRETARIO` e `AUTUACAO` depois de `DEMANDA`, `EMPENHADO` antes de `CONTRATADO`, `PAGAMENTO_ENVIADO` antes de `PAGO`.
- [ ] **Step 2:** criar os processos de exemplo das etapas novas (pelo motor, como `src/db/demo/portal.ts` faz).
- [ ] **Step 3:** `npm run db:reset && npm run test:regras && npm run test:engine && npx tsx src/db/test-fluxo.ts` → tudo passa.
- [ ] **Step 4:** `npx next build` passa; smoke de todas as rotas do escopo (script `/tmp/claude-0/smoke2.cjs`) sem erro.
- [ ] **Step 5: Commit e push** — `git commit -m "Demonstração com as etapas novas e modelos de ETP e TR"`; `git push origin main`.

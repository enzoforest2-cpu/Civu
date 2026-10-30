// Teste de ponta a ponta do fluxo COMPRA (licitação e contratação direta), fora do Next.
// Executar: npm run db:reset && npx tsx src/db/test-fluxo.ts
import "dotenv/config";
import Module from "module";
// `server-only` lança erro fora do React Server; neutraliza para o teste (mesmo shim de test-engine.ts).
const origLoad = (Module as unknown as { _load: (req: string, ...a: unknown[]) => unknown })._load;
(Module as unknown as { _load: (req: string, ...a: unknown[]) => unknown })._load = function (req: string, ...a: unknown[]) {
  if (req === "server-only") return {};
  if (req === "next/headers") return { cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) };
  if (req === "next/navigation") return { redirect: () => { throw new Error("REDIRECT"); } };
  return origLoad.call(this, req, ...a);
};

async function main() {
  const { db } = await import("./index");
  const { usuarios, unidadesGestoras, tiposProcesso, processos } = await import("./schema");
  const { eq, and } = await import("drizzle-orm");
  const engine = await import("../lib/engine");
  const { avancosDisponiveis, caminhoDoProcesso } = await import("../lib/workflow");

  async function sessao(cpf: string) {
    const u = await db.query.usuarios.findFirst({ where: eq(usuarios.cpf, cpf), with: { setor: true, municipio: true } });
    if (!u) throw new Error("usuário não encontrado " + cpf);
    return {
      id: u.id, nome: u.nome, cpf: u.cpf, email: u.email, cargo: u.cargo, papeis: u.papeis as never, setorId: u.setorId,
      setor: u.setor ? { id: u.setor.id, sigla: u.setor.sigla, nome: u.setor.nome } : null,
      municipioId: u.municipioId, municipio: { id: u.municipio.id, nome: u.municipio.nome, uf: u.municipio.uf, slug: u.municipio.slug },
    };
  }
  const requisitante = await sessao("99999999999");
  const secretario = await sessao("88888888888");
  const protocolo = await sessao("22222222222");
  const prefeita = await sessao("11111111111");
  const compras = await sessao("33333333333");
  const contador = await sessao("44444444444");
  const controladora = await sessao("55555555555");
  const procurador = await sessao("66666666666");

  const tipo = await db.query.tiposProcesso.findFirst({ where: and(eq(tiposProcesso.municipioId, requisitante.municipioId), eq(tiposProcesso.chave, "COMPRA")) });
  const ug = await db.query.unidadesGestoras.findFirst({ where: eq(unidadesGestoras.municipioId, requisitante.municipioId) });
  if (!tipo || !ug) throw new Error("seed ausente");

  const ok = (m: string) => console.log("✓", m);
  const falha = (m: string): never => { throw new Error(m); };
  const esperaErro = async (m: string, fn: () => Promise<unknown>) => {
    try { await fn(); } catch (e) { if (e instanceof engine.ErroFluxo) { ok(`${m} → bloqueado: "${e.message.slice(0, 80)}"`); return; } throw e; }
    falha("deveria falhar: " + m);
  };
  const carregar = async (id: string) => (await engine.carregarProcesso(requisitante.municipioId, id)) ?? falha("processo sumiu");
  const meta = (p: { metadados: unknown }) => (p.metadados ?? {}) as Record<string, unknown>;
  const disponiveis = (p: Awaited<ReturnType<typeof carregar>>) => avancosDisponiveis(p.def, p.estado, meta(p)).map((t) => t.para);
  const definirModalidade = async (id: string, modalidade: string) => {
    const p = await carregar(id);
    await db.update(processos).set({ metadados: { ...meta(p), modalidade } }).where(eq(processos.id, id));
  };

  // ---- abrir com modalidade a definir e levar até o parecer jurídico pelo motor
  const p = await engine.abrirProcesso(requisitante, {
    tipoId: tipo.id, unidadeGestoraId: ug.id, assunto: "TESTE FLUXO — aquisição de mesas", urgencia: "NORMAL",
    metadados: { objeto: "10 mesas", natureza: "EQUIPAMENTOS", modalidade: "A_DEFINIR", justificativa: "teste", quantidade: "10", valorEstimado: "9000", dataPretendida: "2026-12-01", prioridade: "BAIXA", noPCA: "SIM" },
  });
  const dfd = await engine.juntarDocumento(requisitante, p.id, "DFD", "DFD mesas", "Objeto: 10 mesas.");
  await engine.assinarDocumento(requisitante, dfd.id, "REQUISITANTE");
  await engine.avancar(requisitante, p.id, "APROVACAO_SECRETARIO");
  await esperaErro("secretário avança sem assinar o DFD", () => engine.avancar(secretario, p.id, "AUTUACAO"));
  await engine.assinarDocumento(secretario, dfd.id, "SECRETARIO");
  await engine.avancar(secretario, p.id, "AUTUACAO");
  await engine.receber(protocolo, p.id);
  await esperaErro("protocolo avança sem termo de autuação", () => engine.avancar(protocolo, p.id, "AUTORIZACAO"));
  await engine.juntarDocumento(protocolo, p.id, "TERMO_AUTUACAO", "Termo de autuação", "Autuado sob o número do processo.");
  await engine.avancar(protocolo, p.id, "AUTORIZACAO");
  await engine.receber(prefeita, p.id);
  const desp = await engine.juntarDocumento(prefeita, p.id, "DESPACHO_AUTORIZACAO", "Autorizo", "Autorizo a instrução.");
  await engine.assinarDocumento(prefeita, desp.id, "ORDENADOR");
  await engine.avancar(prefeita, p.id, "INSTRUCAO");
  await engine.receber(compras, p.id);
  await engine.juntarDocumento(compras, p.id, "ETP", "ETP", "...");
  const tr = await engine.juntarDocumento(compras, p.id, "TR", "TR", "...");
  await engine.assinarDocumento(requisitante, tr.id, "REQUISITANTE");
  await esperaErro("instrução sem pesquisa de preços estruturada", () => engine.avancar(compras, p.id, "VERIFICACAO_ORCAMENTARIA"));
  {
    const c = await carregar(p.id);
    const pesquisaPrecos = { fontes: [{ fonte: "PNCP", data: "2026-10-01", valor: 900 }, { fonte: "Cotação A", data: "2026-10-02", valor: 950 }, { fonte: "Cotação B", data: "2026-10-03", valor: 880 }] };
    await db.update(processos).set({ metadados: { ...meta(c), pesquisaPrecos } }).where(eq(processos.id, p.id));
  }
  await engine.avancar(compras, p.id, "VERIFICACAO_ORCAMENTARIA");
  await engine.receber(contador, p.id);
  await engine.juntarDocumento(contador, p.id, "CERTIDAO_DOTACAO", "Certidão", "Saldo suficiente.");
  await engine.avancar(contador, p.id, "RESERVADO");
  await engine.juntarDocumento(contador, p.id, "NOTA_RESERVA", "Reserva", "Reservado.");
  await engine.avancar(contador, p.id, "CONTROLE_INTERNO");
  await engine.receber(controladora, p.id);
  const ck = await engine.juntarDocumento(controladora, p.id, "CHECKLIST_CI", "Checklist", "Conforme.");
  await engine.assinarDocumento(controladora, ck.id, "CONTROLE_INTERNO");
  await engine.avancar(controladora, p.id, "PARECER_JURIDICO");
  await engine.receber(procurador, p.id);
  const par = await engine.juntarDocumento(procurador, p.id, "PARECER_JURIDICO", "Parecer", "Favorável.");
  await engine.assinarDocumento(procurador, par.id, "JURIDICO");
  let c = await carregar(p.id);
  if (c.estadoAtual !== "PARECER_JURIDICO") falha("esperava PARECER_JURIDICO, veio " + c.estadoAtual);
  ok("compra chegou ao parecer jurídico passando por secretário e autuação");

  // ---- modalidade a definir: nenhum avanço
  if (disponiveis(c).length !== 0) falha("A_DEFINIR não deveria ter avanço: " + disponiveis(c).join(","));
  const fer = new Set<string>();
  const gateMod = engine.avaliarGates(c, fer).find((g) => g.gate.tipo === "regra" && g.gate.regra === "MODALIDADE_DEFINIDA");
  if (!gateMod || gateMod.ok) falha("trava de modalidade deveria falhar com A_DEFINIR");
  await esperaErro("avançar ao edital sem modalidade", () => engine.avancar(procurador, p.id, "PUBLICACAO_EDITAL"));
  ok("A_DEFINIR no parecer: nenhum avanço disponível");
  const caminhoAberto = caminhoDoProcesso(c.def, meta(c)).map((e) => e.chave);
  if (!caminhoAberto.includes("PUBLICACAO_EDITAL") || !caminhoAberto.includes("INSTRUCAO_DIRETA")) falha("sem modalidade o caminho mostra os dois ramos");
  ok("sem modalidade o caminho mostra os dois ramos");

  // ---- licitação
  await definirModalidade(p.id, "LICITACAO");
  c = await carregar(p.id);
  if (disponiveis(c).join(",") !== "PUBLICACAO_EDITAL") falha("LICITACAO deveria levar só a PUBLICACAO_EDITAL: " + disponiveis(c).join(","));
  const caminhoLic = caminhoDoProcesso(c.def, meta(c)).map((e) => e.chave);
  if (caminhoLic.includes("INSTRUCAO_DIRETA") || caminhoLic.includes("AUTORIZACAO_DIRETA")) falha("caminho da licitação não pode ter o ramo direto");
  if (!caminhoLic.includes("SESSAO_DISPUTA")) falha("caminho da licitação precisa da sessão");
  ok("LICITACAO: único avanço é PUBLICACAO_EDITAL; caminho sem o ramo direto");

  // ---- dispensa por valor
  await definirModalidade(p.id, "DISPENSA_VALOR");
  c = await carregar(p.id);
  if (disponiveis(c).join(",") !== "INSTRUCAO_DIRETA") falha("DISPENSA_VALOR deveria levar só a INSTRUCAO_DIRETA: " + disponiveis(c).join(","));
  const caminhoDir = caminhoDoProcesso(c.def, meta(c)).map((e) => e.chave);
  if (caminhoDir.includes("PUBLICACAO_EDITAL")) falha("caminho da dispensa não pode ter o edital");
  await esperaErro("avançar ao edital numa dispensa", () => engine.avancar(procurador, p.id, "PUBLICACAO_EDITAL"));
  ok("DISPENSA_VALOR: único avanço é INSTRUCAO_DIRETA");

  // ---- de volta à licitação, avança de fato
  await definirModalidade(p.id, "LICITACAO");
  await engine.avancar(procurador, p.id, "PUBLICACAO_EDITAL");
  c = await carregar(p.id);
  if (c.estadoAtual !== "PUBLICACAO_EDITAL") falha("deveria estar em PUBLICACAO_EDITAL");
  const gEdital = engine.avaliarGates(c, fer).find((g) => g.gate.tipo === "regra" && g.gate.regra === "PRAZO_EDITAL");
  if (!gEdital || gEdital.ok) return falha("sem edital registrado a trava de prazo deveria falhar");
  ok(`avançou ao edital; trava de prazo pendente ("${gEdital.motivo}")`);

  // ---- processo com etapa que não existe mais
  const velho = await engine.abrirProcesso(requisitante, {
    tipoId: tipo.id, unidadeGestoraId: ug.id, assunto: "TESTE FLUXO — etapa antiga",
    metadados: { objeto: "x", natureza: "OUTROS", modalidade: "LICITACAO", justificativa: "teste", quantidade: "1", valorEstimado: "100", dataPretendida: "2026-12-01", prioridade: "BAIXA", noPCA: "SIM" },
  });
  await db.update(processos).set({ estadoAtual: "CONTRATACAO" }).where(eq(processos.id, velho.id));
  const cv = await carregar(velho.id);
  if (!cv.estado.nome.startsWith("Etapa antiga")) falha("estado de reserva esperado, veio " + cv.estado.nome);
  if (engine.avaliarGates(cv, fer).length !== 0 || disponiveis(cv).length !== 0) falha("estado de reserva não tem travas nem avanços");
  ok(`processo em CONTRATACAO carrega como "${cv.estado.nome}"`);

  console.log("\nTodos os testes passaram.");
  process.exit(0);
}
main().catch((e) => { console.error("✗", e); process.exit(1); });

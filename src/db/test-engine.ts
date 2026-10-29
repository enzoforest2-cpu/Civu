// Teste de ponta a ponta do motor de workflow, fora do Next. Executar: npm run test:engine
import "dotenv/config";
import Module from "module";
// `server-only` lança erro fora do React Server; neutraliza para o teste.
const origLoad = (Module as unknown as { _load: (req: string, ...a: unknown[]) => unknown })._load;
(Module as unknown as { _load: (req: string, ...a: unknown[]) => unknown })._load = function (req: string, ...a: unknown[]) {
  if (req === "server-only") return {};
  if (req === "next/headers") return { cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) };
  if (req === "next/navigation") return { redirect: () => { throw new Error("REDIRECT"); } };
  return origLoad.call(this, req, ...a);
};

async function main() {
  const { db } = await import("./index");
  const { usuarios, unidadesGestoras, tiposProcesso, eventos } = await import("./schema");
  const { eq, and } = await import("drizzle-orm");
  const engine = await import("../lib/engine");
  const { getSessionUser: _g } = await import("../lib/auth");
  void _g;

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
  const prefeita = await sessao("11111111111");
  const compras = await sessao("33333333333");
  const contador = await sessao("44444444444");

  const tipo = await db.query.tiposProcesso.findFirst({ where: and(eq(tiposProcesso.municipioId, requisitante.municipioId), eq(tiposProcesso.chave, "COMPRA")) });
  const ug = await db.query.unidadesGestoras.findFirst({ where: eq(unidadesGestoras.municipioId, requisitante.municipioId) });
  if (!tipo || !ug) throw new Error("seed ausente");

  const ok = (m: string) => console.log("✓", m);
  const esperaErro = async (m: string, fn: () => Promise<unknown>) => {
    try { await fn(); throw new Error("deveria falhar: " + m); } catch (e) { if (e instanceof engine.ErroFluxo) ok(`${m} → bloqueado: "${e.message.slice(0, 70)}"`); else throw e; }
  };

  // 1. abrir
  await esperaErro("abrir sem campo obrigatório", () => engine.abrirProcesso(requisitante, { tipoId: tipo.id, unidadeGestoraId: ug.id, assunto: "Teste", metadados: {} }));
  const p = await engine.abrirProcesso(requisitante, {
    tipoId: tipo.id, unidadeGestoraId: ug.id, assunto: "TESTE — aquisição de cadeiras", urgencia: "NORMAL",
    metadados: { objeto: "20 cadeiras", justificativa: "teste", quantidade: "20", valorEstimado: "6000", dataPretendida: "2026-12-01", prioridade: "BAIXA", noPCA: "SIM" },
  });
  ok(`processo aberto ${p.numero} no estado ${p.estadoAtual}`);

  // 2. avançar sem DFD → bloqueado
  await esperaErro("avançar sem DFD", () => engine.avancar(requisitante, p.id, "AUTORIZACAO"));
  const dfd = await engine.juntarDocumento(requisitante, p.id, "DFD", "DFD cadeiras", "Objeto: 20 cadeiras...");
  await esperaErro("avançar com DFD sem assinatura", () => engine.avancar(requisitante, p.id, "AUTORIZACAO"));
  await engine.assinarDocumento(requisitante, dfd.id, "REQUISITANTE");
  await esperaErro("compras tentando agir na etapa do requisitante", () => engine.avancar(compras, p.id, "AUTORIZACAO"));
  await engine.avancar(requisitante, p.id, "AUTORIZACAO", "Segue para autorização.");
  let c = await engine.carregarProcesso(p.municipioId, p.id);
  ok(`avançou para ${c!.estadoAtual}, setor ${c!.setorAtual?.sigla}, recebido=${c!.recebidoEm ? "sim" : "não"}, prazo ${c!.prazoEtapaEm?.toISOString().slice(0, 10)}`);

  // 3. ordenadora precisa receber antes de agir
  await esperaErro("avançar sem confirmar recebimento", () => engine.avancar(prefeita, p.id, "INSTRUCAO"));
  await engine.receber(prefeita, p.id);
  await esperaErro("avançar sem despacho de autorização", () => engine.avancar(prefeita, p.id, "INSTRUCAO"));
  const desp = await engine.juntarDocumento(prefeita, p.id, "DESPACHO_AUTORIZACAO", "Autorizo", "Autorizo a instrução.");
  await engine.assinarDocumento(prefeita, desp.id, "ORDENADOR");
  await engine.avancar(prefeita, p.id, "INSTRUCAO");
  c = await engine.carregarProcesso(p.municipioId, p.id);
  ok(`autorizado → ${c!.estadoAtual} (${c!.setorAtual?.sigla})`);

  // 4. compras devolve com motivo
  await engine.receber(compras, p.id);
  await esperaErro("devolver sem motivo", () => engine.devolver(compras, p.id, "DEMANDA", ""));
  await engine.devolver(compras, p.id, "DEMANDA", "Especificação incompleta: faltam dimensões.");
  c = await engine.carregarProcesso(p.municipioId, p.id);
  ok(`devolvido → ${c!.estadoAtual} (${c!.setorAtual?.sigla}), ${c!.eventos.length} eventos`);

  // 5. requisitante reenvia (DFD já assinado continua válido) e vai até contabilidade
  await engine.receber(requisitante, p.id);
  await engine.avancar(requisitante, p.id, "AUTORIZACAO");
  await engine.receber(prefeita, p.id);
  await engine.avancar(prefeita, p.id, "INSTRUCAO");
  await engine.receber(compras, p.id);
  for (const [t, ti] of [["ETP", "ETP"], ["TR", "TR"], ["PESQUISA_PRECOS", "3 cotações"]]) await engine.juntarDocumento(compras, p.id, t, ti, "...");
  await engine.avancar(compras, p.id, "VERIFICACAO_ORCAMENTARIA");
  await engine.receber(contador, p.id);
  await engine.juntarDocumento(contador, p.id, "CERTIDAO_DOTACAO", "Certidão", "04.122.0002.2010 — 4.4.90.52 — fonte 1500 — saldo R$ 50.000");
  await engine.avancar(contador, p.id, "RESERVADO");
  c = await engine.carregarProcesso(p.municipioId, p.id);
  ok(`contabilidade → ${c!.estadoAtual}; ${c!.documentos.length} documentos`);

  // 6. integridade da cadeia
  const cadeia = engine.verificarCadeia(c!.eventos);
  if (!cadeia.ok) throw new Error("cadeia quebrada no evento " + cadeia.seq);
  ok(`cadeia de ${cadeia.seq} eventos íntegra`);
  // adultera um evento e confere que a verificação detecta
  const alvo = c!.eventos[3];
  await db.update(eventos).set({ dados: { adulterado: true } }).where(eq(eventos.id, alvo.id));
  const c2 = await engine.carregarProcesso(p.municipioId, p.id);
  const cad2 = engine.verificarCadeia(c2!.eventos);
  if (cad2.ok) throw new Error("adulteração não detectada");
  ok(`adulteração detectada no evento #${cad2.seq}`);
  await db.update(eventos).set({ dados: alvo.dados as object }).where(eq(eventos.id, alvo.id));

  // seeds: conferir cadeia dos processos de exemplo
  const todos = await db.query.processos.findMany();
  let n = 0;
  for (const x of todos) { const cx = await engine.carregarProcesso(x.municipioId, x.id); if (!engine.verificarCadeia(cx!.eventos).ok) throw new Error("seed com cadeia inválida: " + x.numero); n++; }
  ok(`${n} processos com cadeia válida`);
  console.log("\nTodos os testes passaram.");
  process.exit(0);
}
main().catch((e) => { console.error("✗", e); process.exit(1); });

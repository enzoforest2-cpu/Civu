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
  const { isDiaUtil } = await import("../lib/dates");
  const { impugnacaoTempestiva } = await import("../lib/regras-fluxo");
  const { filaDePagamentos, aFrenteNaFila, enviadosAoBanco, historicoDePagamentos } = await import("../lib/pagamentos");

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
  const tesouraria = await sessao("77777777777");

  const tipo = await db.query.tiposProcesso.findFirst({ where: and(eq(tiposProcesso.municipioId, requisitante.municipioId), eq(tiposProcesso.chave, "COMPRA")) });
  const ug = await db.query.unidadesGestoras.findFirst({ where: eq(unidadesGestoras.municipioId, requisitante.municipioId) });
  if (!tipo || !ug) throw new Error("seed ausente");

  const ok = (m: string) => console.log("✓", m);
  const falha = (m: string): never => { throw new Error(m); };
  const esperaErro = async (m: string, fn: () => Promise<unknown>) => {
    try { await fn(); } catch (e) { if (e instanceof engine.ErroFluxo) { ok(`${m} → bloqueado: "${e.message}"`); return; } throw e; }
    falha("deveria falhar: " + m);
  };
  const carregar = async (id: string) => (await engine.carregarProcesso(requisitante.municipioId, id)) ?? falha("processo sumiu");
  const meta = (p: { metadados: unknown }) => (p.metadados ?? {}) as Record<string, unknown>;
  const disponiveis = (p: Awaited<ReturnType<typeof carregar>>) => avancosDisponiveis(p.def, p.estado, meta(p)).map((t) => t.para);
  // Troca direta da modalidade, só para exercitar travas (as ações do motor são testadas mais abaixo)
  const forcarModalidade = async (id: string, modalidade: string) => {
    const p = await carregar(id);
    await db.update(processos).set({ metadados: { ...meta(p), modalidade } }).where(eq(processos.id, id));
  };
  const estaEm = async (id: string, estado: string) => {
    const c = await carregar(id);
    if (c.estadoAtual !== estado) falha(`esperava ${estado}, veio ${c.estadoAtual}`);
    return c;
  };
  const CNPJ = "11222333000181";
  const fer = await engine.feriadosDo(requisitante.municipioId); // feriados do município, como o motor usa
  // datas do teste: abertura = último dia útil até hoje, para a sessão já poder acontecer
  const hoje = engine.hojeIso();
  const doDia = (iso: string, dias: number) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + dias); return d.toISOString().slice(0, 10); };
  let abertura = hoje;
  while (!isDiaUtil(new Date(abertura + "T12:00:00"), fer)) abertura = doDia(abertura, -1);
  const publicado = doDia(abertura, -40);
  const assunto = (t: string) => `TESTE FLUXO — ${t}`;
  const dadosCompra = { objeto: "10 mesas", natureza: "EQUIPAMENTOS", modalidade: "A_DEFINIR", justificativa: "teste", quantidade: "10", valorEstimado: "9000", dataPretendida: "2026-12-01", prioridade: "BAIXA", noPCA: "SIM" };
  // Demonstração (valor.ts): a quebra de ordem fica no envio ao banco e cada processo segue o caminho da sua modalidade
  const historicoDemo = await historicoDePagamentos(requisitante.municipioId);
  if (historicoDemo.quebras.length === 0) falha("a demonstração deveria ter ao menos uma quebra de ordem no histórico de pagamentos");
  const estadosDemo = async (assuntoDemo: string) => {
    const pd = await db.query.processos.findFirst({ where: and(eq(processos.municipioId, requisitante.municipioId), eq(processos.assunto, assuntoDemo)), with: { eventos: true } });
    if (!pd) return falha("processo de demonstração ausente: " + assuntoDemo);
    return pd.eventos.map((e) => e.paraEstado).filter(Boolean) as string[];
  };
  const evDispensa = await estadosDemo("Conserto emergencial da ambulância do Distrito de Lagoa Seca");
  if (!evDispensa.includes("INSTRUCAO_DIRETA") || !evDispensa.includes("AUTORIZACAO_DIRETA") || evDispensa.includes("SESSAO_DISPUTA") || evDispensa.includes("HOMOLOGADO"))
    falha("dispensa da demonstração deveria passar pela instrução e autorização diretas: " + evDispensa.join(","));
  const evLicit = await estadosDemo("Combustível para a frota da Saúde");
  for (const e of ["PUBLICACAO_EDITAL", "IMPUGNACOES", "SESSAO_DISPUTA", "RECURSOS", "HOMOLOGADO"]) if (!evLicit.includes(e)) falha(`licitação da demonstração sem ${e}: ` + evLicit.join(","));
  if (evLicit.includes("INSTRUCAO_DIRETA")) falha("licitação da demonstração não passa pela instrução direta");
  ok(`demonstração: ${historicoDemo.quebras.length} quebra(s) de ordem no histórico; dispensa e licitação seguem cada uma o seu caminho`);

  const fontes3 = [{ fonte: "PNCP", data: "2026-10-01", valor: 900 }, { fonte: "Cotação A", data: "2026-10-02", valor: 950 }, { fonte: "Cotação B", data: "2026-10-03", valor: 880 }];

  /** Da demanda até estar em INSTRUCAO com ETP e TR prontos; verifica as travas do começo do fluxo. */
  async function ateInstrucao(titulo: string) {
    const p = await engine.abrirProcesso(requisitante, { tipoId: tipo!.id, unidadeGestoraId: ug!.id, assunto: assunto(titulo), urgencia: "NORMAL", metadados: { ...dadosCompra } });
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
    return p;
  }
  /** De INSTRUCAO (pesquisa já registrada) até estar assinado o parecer jurídico. */
  async function instrucaoAteParecer(id: string) {
    await engine.avancar(compras, id, "VERIFICACAO_ORCAMENTARIA");
    await engine.receber(contador, id);
    await engine.juntarDocumento(contador, id, "CERTIDAO_DOTACAO", "Certidão", "Saldo suficiente.");
    await engine.avancar(contador, id, "RESERVADO");
    await engine.juntarDocumento(contador, id, "NOTA_RESERVA", "Reserva", "Reservado.");
    await engine.avancar(contador, id, "CONTROLE_INTERNO");
    await engine.receber(controladora, id);
    const ck = await engine.juntarDocumento(controladora, id, "CHECKLIST_CI", "Checklist", "Conforme.");
    await engine.assinarDocumento(controladora, ck.id, "CONTROLE_INTERNO");
    await engine.avancar(controladora, id, "PARECER_JURIDICO");
    await engine.receber(procurador, id);
    const par = await engine.juntarDocumento(procurador, id, "PARECER_JURIDICO", "Parecer", "Favorável.");
    await engine.assinarDocumento(procurador, par.id, "JURIDICO");
  }

  // =========================================================================
  // A) Modalidade a definir: nenhum avanço; ações fora da etapa são recusadas
  // =========================================================================
  const a = await ateInstrucao("modalidade a definir");
  await esperaErro("instrução sem pesquisa de preços estruturada", () => engine.avancar(compras, a.id, "VERIFICACAO_ORCAMENTARIA"));
  await engine.registrarPesquisaPrecos(compras, a.id, { fontes: fontes3 });
  await instrucaoAteParecer(a.id);
  let c = await estaEm(a.id, "PARECER_JURIDICO");
  ok("compra chegou ao parecer jurídico passando por secretário e autuação");
  if (disponiveis(c).length !== 0) falha("A_DEFINIR não deveria ter avanço: " + disponiveis(c).join(","));
  const gateMod = engine.avaliarGates(c, fer).find((g) => g.gate.tipo === "regra" && g.gate.regra === "MODALIDADE_DEFINIDA");
  if (!gateMod || gateMod.ok) falha("trava de modalidade deveria falhar com A_DEFINIR");
  await esperaErro("avançar ao edital sem modalidade", () => engine.avancar(procurador, a.id, "PUBLICACAO_EDITAL"));
  const caminhoAberto = caminhoDoProcesso(c.def, meta(c)).map((e) => e.chave);
  if (!caminhoAberto.includes("PUBLICACAO_EDITAL") || !caminhoAberto.includes("INSTRUCAO_DIRETA")) falha("sem modalidade o caminho mostra os dois ramos");
  ok("A_DEFINIR no parecer: nenhum avanço e caminho com os dois ramos");
  await esperaErro("definir modalidade fora da instrução", () => engine.definirModalidade(procurador, a.id, "LICITACAO", "Justificativa com mais de trinta caracteres."));
  await esperaErro("publicar edital fora da etapa", () => engine.publicarEdital(procurador, a.id, { numero: "1/2026", tipoObjeto: "BENS_MENOR_PRECO", publicadoEm: publicado, aberturaEm: abertura, plataforma: "PNCP" }));
  await esperaErro("retorno bancário fora do pagamento", () => engine.registrarRetornoBancario(tesouraria, a.id, { aceito: true }));
  await forcarModalidade(a.id, "LICITACAO");
  c = await carregar(a.id);
  if (disponiveis(c).join(",") !== "PUBLICACAO_EDITAL") falha("LICITACAO deveria levar só a PUBLICACAO_EDITAL: " + disponiveis(c).join(","));
  const caminhoLic = caminhoDoProcesso(c.def, meta(c)).map((e) => e.chave);
  if (caminhoLic.includes("INSTRUCAO_DIRETA") || !caminhoLic.includes("SESSAO_DISPUTA")) falha("caminho da licitação errado");
  await forcarModalidade(a.id, "DISPENSA_VALOR");
  c = await carregar(a.id);
  if (disponiveis(c).join(",") !== "INSTRUCAO_DIRETA") falha("DISPENSA_VALOR deveria levar só a INSTRUCAO_DIRETA: " + disponiveis(c).join(","));
  if (caminhoDoProcesso(c.def, meta(c)).map((e) => e.chave).includes("PUBLICACAO_EDITAL")) falha("caminho da dispensa não pode ter o edital");
  await esperaErro("avançar ao edital numa dispensa", () => engine.avancar(procurador, a.id, "PUBLICACAO_EDITAL"));
  ok("LICITACAO e DISPENSA_VALOR: cada modalidade abre só o seu ramo");
  await forcarModalidade(a.id, "LICITACAO");
  await engine.avancar(procurador, a.id, "PUBLICACAO_EDITAL");
  c = await estaEm(a.id, "PUBLICACAO_EDITAL");
  const gEdital = engine.avaliarGates(c, fer).find((g) => g.gate.tipo === "regra" && g.gate.regra === "PRAZO_EDITAL");
  if (!gEdital || gEdital.ok) return falha("sem edital registrado a trava de prazo deveria falhar");
  ok(`avançou ao edital; trava de prazo pendente ("${gEdital.motivo}")`);

  // =========================================================================
  // B) Licitação de ponta a ponta até o pagamento
  // =========================================================================
  const p = await ateInstrucao("licitação completa");
  await esperaErro("modalidade com justificativa curta", () => engine.definirModalidade(compras, p.id, "LICITACAO", "curta"));
  await esperaErro("modalidade inválida", () => engine.definirModalidade(compras, p.id, "A_DEFINIR", "Justificativa com mais de trinta caracteres."));
  await esperaErro("definir modalidade sem o papel de compras", () => engine.definirModalidade(contador, p.id, "LICITACAO", "Justificativa com mais de trinta caracteres."));
  await engine.definirModalidade(compras, p.id, "LICITACAO", "Objeto comum de mercado, disputa por menor preço atende ao interesse público.");
  c = await carregar(p.id);
  if (meta(c).modalidade !== "LICITACAO") falha("modalidade não gravada");
  if (!c.eventos.some((e) => e.tipo === "MODALIDADE")) falha("evento MODALIDADE ausente");
  ok("modalidade definida na instrução com justificativa (evento MODALIDADE)");

  await engine.registrarPesquisaPrecos(compras, p.id, { fontes: fontes3.slice(0, 2) });
  c = await carregar(p.id);
  if (meta(c).valorEstimado !== "925.00") falha("mediana de 2 fontes esperada 925.00, veio " + meta(c).valorEstimado);
  await esperaErro("pesquisa com 2 fontes bloqueia a instrução", () => engine.avancar(compras, p.id, "VERIFICACAO_ORCAMENTARIA"));
  await esperaErro("fonte com valor zero", () => engine.registrarPesquisaPrecos(compras, p.id, { fontes: [{ fonte: "X", data: "2026-10-01", valor: 0 }] }));
  await engine.registrarPesquisaPrecos(compras, p.id, { fontes: fontes3 });
  c = await carregar(p.id);
  if (meta(c).valorEstimado !== "900.00") falha("mediana de 3 fontes esperada 900.00, veio " + meta(c).valorEstimado);
  ok("pesquisa com 2 fontes bloqueia; com 3 passa e o valor estimado vira a mediana (900.00)");
  await instrucaoAteParecer(p.id);
  await engine.avancar(procurador, p.id, "PUBLICACAO_EDITAL");
  await engine.receber(compras, p.id);

  // edital
  const edital = { numero: "PE 1/2026", tipoObjeto: "BENS_MENOR_PRECO" as const, publicadoEm: publicado, aberturaEm: abertura, plataforma: "PNCP" };
  await esperaErro("edital com abertura antes do prazo mínimo", () => engine.publicarEdital(compras, p.id, { ...edital, publicadoEm: doDia(abertura, -2) }));
  await esperaErro("edital com data inválida", () => engine.publicarEdital(compras, p.id, { ...edital, aberturaEm: "31/12/2026" }));
  await esperaErro("edital por quem não é de compras", () => engine.publicarEdital(contador, p.id, edital));
  await engine.publicarEdital(compras, p.id, edital);
  await engine.juntarDocumento(compras, p.id, "EDITAL", "Edital PE 1/2026", "Texto do edital.");
  c = await carregar(p.id);
  if ((meta(c).edital as { numero: string }).numero !== "PE 1/2026") falha("edital não gravado");
  ok("edital com abertura curta é recusado; o correto é publicado");

  // impugnações: A (tempestiva, será acolhida), B (fora do prazo), C (tempestiva), D (no limite exato do prazo)
  const limite = (ab: string) => { let d = ab; while (!impugnacaoTempestiva(d, ab, fer)) d = doDia(d, -1); return d; };
  let abertura2 = doDia(abertura, -1);
  while (!isDiaUtil(new Date(abertura2 + "T12:00:00"), fer)) abertura2 = doDia(abertura2, -1);
  if (!(limite(abertura2) < limite(abertura))) falha("premissa do teste: o limite da abertura anterior deveria ser menor");
  await esperaErro("impugnação sem texto", () => engine.registrarImpugnacao(compras, p.id, { autor: "Empresa X", texto: " ", recebidaEm: doDia(publicado, 1) }));
  await engine.registrarImpugnacao(compras, p.id, { autor: "Empresa X", texto: "Especificação direciona a marca.", recebidaEm: doDia(publicado, 1) });
  await engine.registrarImpugnacao(compras, p.id, { autor: "Empresa Y", texto: "Pedido fora do prazo.", recebidaEm: abertura });
  await engine.registrarImpugnacao(compras, p.id, { autor: "Empresa C", texto: "Exigência de atestado excessiva.", recebidaEm: doDia(publicado, 2) });
  await engine.registrarImpugnacao(compras, p.id, { autor: "Empresa D", texto: "Critério de julgamento obscuro.", recebidaEm: limite(abertura) });
  c = await carregar(p.id);
  let imps = meta(c).impugnacoes as { id: string; autor: string; tempestiva: boolean }[];
  if (imps.map((i) => i.tempestiva).join() !== "true,false,true,true") falha("tempestividade errada: " + JSON.stringify(imps));
  if (new Set(imps.map((i) => i.id)).size !== 4 || !imps[0].id) falha("ids das impugnações devem ser únicos");
  await engine.avancar(compras, p.id, "IMPUGNACOES");
  await esperaErro("impugnação tempestiva sem resposta bloqueia", () => engine.avancar(compras, p.id, "SESSAO_DISPUTA"));
  await esperaErro("resultado da sessão fora da etapa", () => engine.registrarResultadoSessao(compras, p.id, { situacao: "DESERTA", ataEm: hoje }));
  await esperaErro("responder impugnação inexistente", () => engine.responderImpugnacao(compras, p.id, "nao-existe", { resposta: "x", acolhida: false, alteraPropostas: false }));
  await engine.responderImpugnacao(compras, p.id, imps[0].id, { resposta: "Procede: a especificação será ajustada.", acolhida: true, alteraPropostas: true });
  c = await estaEm(p.id, "PUBLICACAO_EDITAL");
  const m1 = meta(c);
  const levadas = (m1.impugnacoes as { autor: string }[] | undefined) ?? [];
  if (m1.edital || levadas.map((i) => i.autor).join() !== "Empresa C,Empresa D") falha("só o edital deveria sair; as tempestivas sem resposta seguem: " + JSON.stringify(levadas));
  const hed = m1.historicoEditais as { impugnacoes: unknown[] }[];
  if (hed.length !== 1 || hed[0].impugnacoes.length !== 4) falha("histórico de editais esperado com o edital e as 4 impugnações");
  const dev = c.eventos.filter((e) => e.tipo === "DEVOLUCAO").at(-1);
  if (!(dev?.dados as { motivo: string }).motivo.startsWith("Impugnação acolhida: republicar o edital com prazo novo")) falha("motivo da devolução errado");
  await esperaErro("responder impugnação já arquivada", () => engine.responderImpugnacao(compras, p.id, imps[0].id, { resposta: "x", acolhida: false, alteraPropostas: false }));
  await esperaErro("avançar com o edital a republicar", () => engine.avancar(compras, p.id, "IMPUGNACOES"));
  await esperaErro("registrar impugnação sem edital publicado", () => engine.registrarImpugnacao(compras, p.id, { autor: "W", texto: "x", recebidaEm: publicado }));
  await esperaErro("republicar com a mesma data de publicação", () => engine.publicarEdital(compras, p.id, { ...edital, aberturaEm: abertura2 }));
  ok("impugnação acolhida devolve a PUBLICACAO_EDITAL, leva as tempestivas sem resposta e exige edital com prazo novo");

  await engine.publicarEdital(compras, p.id, { ...edital, numero: "PE 1/2026 (republicado)", publicadoEm: doDia(publicado, 3), aberturaEm: abertura2 });
  c = await carregar(p.id);
  imps = meta(c).impugnacoes as typeof imps;
  if (imps.map((i) => i.tempestiva).join() !== "true,false") falha("a nova abertura deveria recalcular a tempestividade: " + JSON.stringify(imps));
  await engine.registrarImpugnacao(compras, p.id, { autor: "Empresa Z", texto: "Prazo de entrega exíguo.", recebidaEm: doDia(publicado, 4) });
  await engine.avancar(compras, p.id, "IMPUGNACOES");
  c = await carregar(p.id);
  imps = meta(c).impugnacoes as typeof imps;
  await esperaErro("a impugnação carregada continua bloqueando", () => engine.avancar(compras, p.id, "SESSAO_DISPUTA"));
  await engine.responderImpugnacao(compras, p.id, imps[0].id, { resposta: "Improcede: o atestado é compatível.", acolhida: false, alteraPropostas: false });
  await esperaErro("responder impugnação já respondida", () => engine.responderImpugnacao(compras, p.id, imps[0].id, { resposta: "outra", acolhida: true, alteraPropostas: true }));
  await esperaErro("ainda falta responder uma", () => engine.avancar(compras, p.id, "SESSAO_DISPUTA"));
  await engine.responderImpugnacao(compras, p.id, imps[2].id, { resposta: "Improcede: o prazo é compatível.", acolhida: false, alteraPropostas: false });
  await estaEm(p.id, "IMPUGNACOES");
  await engine.avancar(compras, p.id, "SESSAO_DISPUTA");

  // sessão: vencedor, depois deserta (limpa o vencedor), e a deserta volta à instrução
  await engine.juntarDocumento(compras, p.id, "ATA_SESSAO", "Ata da sessão", "Sessão realizada.");
  await esperaErro("vencedor com CNPJ inválido", () => engine.registrarResultadoSessao(compras, p.id, { situacao: "VENCEDOR", fornecedor: "Móveis Ltda", cnpj: "11111111111111", valor: 8500, ataEm: hoje }));
  await engine.registrarResultadoSessao(compras, p.id, { situacao: "VENCEDOR", fornecedor: "Móveis Ltda", cnpj: CNPJ, valor: 8500, ataEm: hoje });
  c = await carregar(p.id);
  if ((meta(c).contratacao as Record<string, string>).fornecedor !== "Móveis Ltda") falha("vencedor não gravado em contratacao");
  await engine.registrarResultadoSessao(compras, p.id, { situacao: "DESERTA", ataEm: hoje });
  c = await carregar(p.id);
  if (meta(c).contratacao) falha("resultado sem vencedor deveria limpar contratacao: " + JSON.stringify(meta(c).contratacao));
  await esperaErro("sessão deserta não avança", () => engine.avancar(compras, p.id, "RECURSOS"));
  await engine.devolver(compras, p.id, "INSTRUCAO", "Licitação deserta: refazer a instrução e o edital");
  c = await estaEm(p.id, "INSTRUCAO");
  if (meta(c).edital || meta(c).impugnacoes || meta(c).resultadoSessao || meta(c).contratacao) falha("a deserta deveria arquivar edital, impugnações, resultado e vencedor");
  if ((meta(c).historicoEditais as unknown[]).length !== 2 || (meta(c).historicoSessoes as unknown[]).length !== 1) falha("históricos esperados após a deserta");
  await instrucaoAteParecer(p.id);
  await engine.avancar(procurador, p.id, "PUBLICACAO_EDITAL");
  await engine.receber(compras, p.id);
  c = await carregar(p.id);
  const gNovo = engine.avaliarGates(c, fer).find((g) => g.gate.tipo === "regra" && g.gate.regra === "PRAZO_EDITAL");
  if (!gNovo || gNovo.ok) falha("depois da deserta a trava exige edital novo");
  await esperaErro("avançar sem o edital novo", () => engine.avancar(compras, p.id, "IMPUGNACOES"));
  await esperaErro("edital novo com publicação não posterior", () => engine.publicarEdital(compras, p.id, { ...edital, publicadoEm: doDia(publicado, 3), aberturaEm: abertura2 }));
  await engine.publicarEdital(compras, p.id, { ...edital, numero: "PE 2/2026", publicadoEm: doDia(publicado, 6), aberturaEm: abertura2 });
  await engine.avancar(compras, p.id, "IMPUGNACOES");
  await engine.avancar(compras, p.id, "SESSAO_DISPUTA");
  ok("deserta volta à instrução, arquiva tudo e exige edital novo; resultado sem vencedor limpa a contratação");

  await engine.registrarResultadoSessao(compras, p.id, { situacao: "VENCEDOR", fornecedor: "Móveis Ltda", cnpj: CNPJ, valor: 8500, ataEm: hoje });
  c = await carregar(p.id);
  const ct = meta(c).contratacao as Record<string, string>;
  if (ct.fornecedor !== "Móveis Ltda" || ct.cnpj !== CNPJ || ct.valor !== "8500.00") falha("contratacao não preenchida: " + JSON.stringify(ct));
  ok("VENCEDOR preenche metadados.contratacao");
  await engine.avancar(compras, p.id, "RECURSOS");

  // recursos
  await esperaErro("recurso sem nome", () => engine.registrarRecurso(compras, p.id, { recorrente: "", intencaoEm: hoje }));
  await engine.registrarRecurso(compras, p.id, { recorrente: "Concorrente A", intencaoEm: hoje });
  c = await carregar(p.id);
  let recs = meta(c).recursos as { id: string; razoesAte: string; contrarrazoesAte: string }[];
  if (!recs[0].id || !(recs[0].razoesAte > hoje) || !(recs[0].contrarrazoesAte > recs[0].razoesAte)) falha("prazos do recurso errados: " + JSON.stringify(recs));
  await esperaErro("recurso não decidido bloqueia", () => engine.avancar(compras, p.id, "HOMOLOGADO"));
  // Art. 165: a decisão só vem depois do prazo das contrarrazões
  const [ac, mc, dc] = recs[0].contrarrazoesAte.split("-");
  try {
    await engine.decidirRecurso(compras, p.id, recs[0].id, { decisao: "Decisão antecipada.", provido: false });
    falha("decidir recurso antes do fim das contrarrazões deveria falhar");
  } catch (e) {
    if (!(e instanceof engine.ErroFluxo) || !e.message.includes(`${dc}/${mc}/${ac}`)) throw e;
    ok(`decidir antes do fim das contrarrazões → bloqueado: "${e.message}"`);
  }
  // Intenção registrada há 20 dias: o prazo das contrarrazões já passou
  const intencaoAntiga = doDia(hoje, -20);
  await engine.registrarRecurso(compras, p.id, { recorrente: "Concorrente A2", intencaoEm: intencaoAntiga });
  c = await carregar(p.id);
  recs = meta(c).recursos as typeof recs;
  await engine.decidirRecurso(compras, p.id, recs[1].id, { decisao: "Provido: proposta vencedora desclassificada.", provido: true });
  c = await estaEm(p.id, "SESSAO_DISPUTA");
  if (!c.eventos.some((e) => e.tipo === "DEVOLUCAO" && (e.dados as { motivo?: string }).motivo === "Recurso provido: refazer o julgamento")) falha("devolução automática sem o motivo esperado");
  if (meta(c).resultadoSessao || meta(c).recursos || meta(c).contratacao) falha("resultado, recursos e vencedor da rodada anterior deveriam ir para o histórico");
  const hs = meta(c).historicoSessoes as { contratacao: { fornecedor?: string } | null }[];
  if (hs.length !== 2 || hs[1].contratacao?.fornecedor !== "Móveis Ltda") falha("histórico de sessões esperado com 2 itens, o último com o vencedor");
  await esperaErro("sessão devolvida sem resultado novo", () => engine.avancar(compras, p.id, "RECURSOS"));
  await engine.registrarResultadoSessao(compras, p.id, { situacao: "VENCEDOR", fornecedor: "Mesas e Cia Ltda", cnpj: CNPJ, valor: 8700, ataEm: hoje });
  await engine.avancar(compras, p.id, "RECURSOS");
  await engine.registrarRecurso(compras, p.id, { recorrente: "Concorrente B", intencaoEm: intencaoAntiga });
  c = await carregar(p.id);
  recs = meta(c).recursos as typeof recs;
  await engine.decidirRecurso(compras, p.id, recs[0].id, { decisao: "Improvido.", provido: false });
  await esperaErro("decidir o mesmo recurso duas vezes", () => engine.decidirRecurso(compras, p.id, recs[0].id, { decisao: "x", provido: false }));
  await estaEm(p.id, "RECURSOS");
  await engine.avancar(compras, p.id, "HOMOLOGADO");
  ok("recurso não decidido bloqueia; provido devolve sozinho à sessão e arquiva a rodada; improvido segue para HOMOLOGADO");

  // homologação até a execução
  await engine.receber(prefeita, p.id);
  await esperaErro("homologação sem termo assinado", () => engine.avancar(prefeita, p.id, "EMPENHADO"));
  const termo = await engine.juntarDocumento(prefeita, p.id, "TERMO_HOMOLOGACAO", "Homologação", "Homologo.");
  await engine.assinarDocumento(prefeita, termo.id, "ORDENADOR");
  await engine.avancar(prefeita, p.id, "EMPENHADO");
  await estaEm(p.id, "EMPENHADO");
  ok("licitação chegou a EMPENHADO depois de HOMOLOGADO");
  await engine.receber(contador, p.id);
  const emp = await engine.juntarDocumento(contador, p.id, "NOTA_EMPENHO", "Empenho", "Empenhado.");
  await engine.assinarDocumento(contador, emp.id, "CONTABILIDADE");
  await engine.assinarDocumento(prefeita, emp.id, "ORDENADOR");
  await esperaErro("dados da contratação antes da etapa do contrato", () => engine.registrarContratacao(compras, p.id, { fornecedor: "Mesas e Cia Ltda", cnpj: CNPJ, valor: "8700", fonte: "ORDINARIOS" }));
  await engine.avancar(contador, p.id, "CONTRATADO");
  await engine.receber(compras, p.id);
  const contrato = await engine.juntarDocumento(compras, p.id, "CONTRATO", "Contrato", "Contrato assinado.");
  await engine.assinarDocumento(prefeita, contrato.id, "ORDENADOR");
  await engine.juntarDocumento(compras, p.id, "PORTARIA_FISCAL", "Portaria", "Fiscal designado.");
  await engine.juntarDocumento(compras, p.id, "PUBLICACAO_PNCP", "PNCP", "Publicado.");
  // O vencedor preenche fornecedor, CNPJ e valor, mas não a fonte: a trava CONTRATACAO_COMPLETA segura o contrato
  c = await carregar(p.id);
  if ((meta(c).contratacao as Record<string, unknown>).fonte) falha("premissa: o vencedor não traz a fonte de recurso");
  const gCt = engine.avaliarGates(c, fer).find((g) => g.gate.tipo === "regra" && g.gate.regra === "CONTRATACAO_COMPLETA");
  if (!gCt || gCt.ok || !gCt.motivo.includes("fonte de recurso")) falha("trava de contratação deveria pedir a fonte de recurso: " + JSON.stringify(gCt));
  await esperaErro("licitação vencedora sem fonte de recurso não sai de CONTRATADO", () => engine.avancar(compras, p.id, "EXECUCAO"));
  await esperaErro("CNPJ diferente do vencedor da sessão", () => engine.registrarContratacao(compras, p.id, { fornecedor: "Outra Empresa Ltda", cnpj: "11444777000161", valor: "8700", fonte: "ORDINARIOS" }));
  await engine.registrarContratacao(compras, p.id, { fornecedor: "Mesas e Cia Ltda", cnpj: CNPJ, valor: "8700", fonte: "ORDINARIOS" });
  await engine.avancar(compras, p.id, "EXECUCAO");
  await esperaErro("dados da contratação depois da etapa do contrato", () => engine.registrarContratacao(compras, p.id, { fornecedor: "Mesas e Cia Ltda", cnpj: CNPJ, valor: "8700", fonte: "SAUDE" }));
  ok("contratação: só na etapa do contrato, CNPJ do vencedor obrigatório, sem fonte não segue; com fonte segue para a execução");
  await engine.juntarDocumento(secretario, p.id, "ORDEM_FORNECIMENTO", "Ordem", "Fornecer.");
  await engine.juntarDocumento(secretario, p.id, "NOTA_FISCAL", "NF", "NF 1.");
  const atesto = await engine.juntarDocumento(secretario, p.id, "ATESTO", "Atesto", "Recebido.");
  await engine.assinarDocumento(secretario, atesto.id, "FISCAL");
  await engine.juntarDocumento(secretario, p.id, "CERTIDOES", "Certidões", "Regular.");
  await engine.avancar(secretario, p.id, "LIQUIDADO");
  await engine.receber(contador, p.id);
  const liq = await engine.juntarDocumento(contador, p.id, "NOTA_LIQUIDACAO", "Liquidação", "Liquidado.");
  await engine.assinarDocumento(prefeita, liq.id, "ORDENADOR");
  await engine.avancar(contador, p.id, "FILA_PAGAMENTO");
  await engine.receber(tesouraria, p.id);
  const op = await engine.juntarDocumento(tesouraria, p.id, "ORDEM_PAGAMENTO", "OP", "Pague-se.");
  await engine.assinarDocumento(prefeita, op.id, "ORDENADOR");
  await engine.assinarDocumento(tesouraria, op.id, "TESOURARIA");

  // pagamento
  const posicaoDe = async () => {
    for (const f of await filaDePagamentos(requisitante.municipioId)) {
      const it = f.fila.find((x) => x.processoId === p.id);
      if (it) return { posicao: it.posicao, liquidadoEm: it.liquidadoEm.getTime() };
    }
    return falha("processo fora da fila");
  };
  const antes = await posicaoDe();
  const justificativaFila = "Pagamento fora da ordem apenas para o teste automatizado.";
  const emHistorico = async () => (await historicoDePagamentos(requisitante.municipioId, 365)).pagos.some((x) => x.processoId === p.id);
  const emEnviados = async () => (await enviadosAoBanco(requisitante.municipioId)).find((x) => x.processoId === p.id);
  // Ordem cronológica (art. 141) vale também na saída da fila para o envio ao banco
  const naFrente = await aFrenteNaFila(requisitante.municipioId, p.id);
  if (!naFrente || naFrente.aFrente.length === 0) falha("o teste precisa de pelo menos um pagamento liquidado antes na mesma fonte");
  await esperaErro("enviar ao banco fora da ordem, sem justificativa", () => engine.avancar(tesouraria, p.id, "PAGAMENTO_ENVIADO"));
  await esperaErro("enviar ao banco fora da ordem, justificativa curta", () => engine.avancar(tesouraria, p.id, "PAGAMENTO_ENVIADO", "Urgente."));
  await estaEm(p.id, "FILA_PAGAMENTO");
  if ((await emEnviados()) || (await emHistorico())) falha("processo na fila não pode aparecer como enviado nem pago");
  await engine.avancar(tesouraria, p.id, "PAGAMENTO_ENVIADO", justificativaFila);
  await estaEm(p.id, "PAGAMENTO_ENVIADO");
  const evEnvio = (await carregar(p.id)).eventos.filter((e) => e.paraEstado === "PAGAMENTO_ENVIADO").at(-1);
  if ((evEnvio?.dados as { quebraOrdem?: { justificativa: string } } | null)?.quebraOrdem?.justificativa !== justificativaFila) falha("justificativa pública deveria ficar no evento de envio");
  ok("ordem cronológica vale na saída da fila para o banco: sem justificativa recusa, com justificativa passa e fica pública");
  const env1 = await emEnviados();
  if (!env1 || env1.numero !== p.numero || env1.valor !== 8700 || env1.fornecedor !== "Mesas e Cia Ltda") falha("enviadosAoBanco deveria listar o processo enviado: " + JSON.stringify(env1));
  if (await emHistorico()) falha("enviado ao banco ainda não é pago: não pode entrar em historicoDePagamentos");
  if (await posicaoDe().then(() => true, () => false)) falha("enviado ao banco não pode continuar na fila de espera");
  ok("enviado ao banco aparece em enviadosAoBanco e não em historicoDePagamentos nem na fila");
  await esperaErro("PAGO sem retorno do banco", () => engine.avancar(tesouraria, p.id, "PAGO"));
  await esperaErro("retorno rejeitado sem motivo", () => engine.registrarRetornoBancario(tesouraria, p.id, { aceito: false }));
  await esperaErro("retorno por quem não é da tesouraria", () => engine.registrarRetornoBancario(compras, p.id, { aceito: true }));
  await engine.registrarRetornoBancario(tesouraria, p.id, { aceito: false, motivo: "Conta do favorecido encerrada" });
  c = await estaEm(p.id, "FILA_PAGAMENTO");
  if (meta(c).retornoBancario) falha("retorno rejeitado deveria sair de metadados.retornoBancario");
  if ((meta(c).historicoRetornos as unknown[]).length !== 1) falha("rejeição deveria ficar em historicoRetornos");
  const evRet = c.eventos.filter((e) => e.tipo === "RETORNO_BANCARIO");
  if (evRet.length !== 1 || (evRet[0].dados as { aceito: boolean }).aceito !== false) falha("rejeição deveria ficar no histórico de eventos");
  if (await emEnviados()) falha("devolvido pelo banco não pode ficar em enviadosAoBanco");
  const depois = await posicaoDe();
  if (depois.posicao !== antes.posicao || depois.liquidadoEm !== antes.liquidadoEm) falha(`posição na fila mudou: ${JSON.stringify(antes)} -> ${JSON.stringify(depois)}`);
  ok("retorno rejeitado volta à fila, limpa metadados.retornoBancario e mantém a posição (data da liquidação)");
  await engine.avancar(tesouraria, p.id, "PAGAMENTO_ENVIADO", justificativaFila);
  await esperaErro("reenvio começa limpo: PAGO sem novo retorno", () => engine.avancar(tesouraria, p.id, "PAGO"));
  await engine.registrarRetornoBancario(tesouraria, p.id, { aceito: true, autenticacao: "AUT-123456" });
  c = await estaEm(p.id, "PAGO");
  if (await emEnviados()) falha("pago não pode continuar em enviadosAoBanco");
  const hist = (await historicoDePagamentos(requisitante.municipioId, 365)).pagos.find((x) => x.processoId === p.id);
  if (!hist) falha("pago deveria entrar em historicoDePagamentos");
  else {
    if (hist.diasNaFila > 1) falha(`dias na fila deveria medir da liquidação ao PAGO (teste roda em minutos), veio ${hist.diasNaFila}`);
    if (hist.quebra?.justificativa !== justificativaFila) falha("quebra de ordem deveria vir do evento de envio ao banco: " + JSON.stringify(hist.quebra));
  }
  ok("retorno aceito: sai de enviadosAoBanco, entra em historicoDePagamentos com a quebra de ordem justificada");
  await esperaErro("segundo retorno depois de pago", () => engine.registrarRetornoBancario(tesouraria, p.id, { aceito: true }));
  await engine.juntarDocumento(tesouraria, p.id, "COMPROVANTE_PAGAMENTO", "Comprovante", "Comprovante do banco.");
  await engine.avancar(tesouraria, p.id, "ARQUIVADO");
  c = await estaEm(p.id, "ARQUIVADO");
  if (!engine.verificarCadeia(c.eventos).ok) falha("cadeia de eventos da licitação rompida");
  ok("pagamento: fila, envio, rejeição, reenvio, aceite, segundo retorno recusado; cadeia íntegra");

  // =========================================================================
  // C) Contratação direta por dispensa de valor até o empenho
  // =========================================================================
  const d = await ateInstrucao("dispensa por valor");
  await engine.definirModalidade(compras, d.id, "DISPENSA_VALOR", "Valor abaixo do limite do art. 75, II, sem fracionamento aparente.");
  await engine.registrarPesquisaPrecos(compras, d.id, { fontes: [], justificativa: "Mercado local com um único fornecedor da marca exigida pelo equipamento." });
  c = await carregar(d.id);
  const fr = meta(c).fracionamento as { situacao: string; total: number; limite: number; comprometido: number } | undefined;
  if (!fr || !fr.limite || fr.total < 9000) falha("fracionamento deveria ser refeito ao definir DISPENSA_VALOR: " + JSON.stringify(fr));
  if (meta(c).valorEstimado !== "9000") falha("sem fontes o valor estimado não muda");
  if (Math.round(fr!.total - fr!.comprometido) !== 9000) falha("fracionamento deveria usar o valor estimado de 9000");
  await engine.registrarPesquisaPrecos(compras, d.id, { fontes: fontes3 });
  c = await carregar(d.id);
  const fr2 = meta(c).fracionamento as { total: number; comprometido: number };
  if (meta(c).valorEstimado !== "900.00" || Math.round(fr2.total - fr2.comprometido) !== 900) falha("a pesquisa deveria refazer o fracionamento com 900: " + JSON.stringify(fr2));
  ok("pesquisa de preços numa dispensa por valor refaz o fracionamento com o novo valor estimado");
  await instrucaoAteParecer(d.id);
  await engine.avancar(procurador, d.id, "INSTRUCAO_DIRETA");
  await engine.receber(compras, d.id);
  await esperaErro("dispensa sem aviso nem justificativa", () => engine.avancar(compras, d.id, "AUTORIZACAO_DIRETA"));
  await esperaErro("justificativa curta demais", () => engine.publicarAvisoDispensa(compras, d.id, { justificativaSemAviso: "urgente" }));
  await esperaErro("aviso sem nada", () => engine.publicarAvisoDispensa(compras, d.id, {}));
  let ontemUtil = doDia(hoje, -1);
  while (!isDiaUtil(new Date(ontemUtil + "T12:00:00"), fer)) ontemUtil = doDia(ontemUtil, -1);
  await engine.publicarAvisoDispensa(compras, d.id, { publicadoEm: ontemUtil });
  await esperaErro("aviso publicado há menos de 3 dias úteis", () => engine.avancar(compras, d.id, "AUTORIZACAO_DIRETA"));
  await engine.publicarAvisoDispensa(compras, d.id, { justificativaSemAviso: "Entrega urgente para inaugurar a unidade na próxima semana." });
  await engine.avancar(compras, d.id, "AUTORIZACAO_DIRETA");
  ok("aviso de 1 dia útil bloqueia; justificativa de 30+ caracteres libera a INSTRUCAO_DIRETA");
  await engine.receber(prefeita, d.id);
  await esperaErro("autorização direta sem ato", () => engine.avancar(prefeita, d.id, "EMPENHADO"));
  const ato = await engine.juntarDocumento(prefeita, d.id, "ATO_AUTORIZACAO_DIRETA", "Ato", "Autorizo a contratação direta.");
  await esperaErro("autorização direta com ato sem assinatura", () => engine.avancar(prefeita, d.id, "EMPENHADO"));
  await engine.assinarDocumento(prefeita, ato.id, "ORDENADOR");
  await engine.avancar(prefeita, d.id, "EMPENHADO");
  c = await estaEm(d.id, "EMPENHADO");
  if (!engine.verificarCadeia(c.eventos).ok) falha("cadeia de eventos da dispensa rompida");
  ok("contratação direta chegou a EMPENHADO com o ato assinado pelo ordenador");

  // =========================================================================
  // D) Troca de modalidade na instrução: o aviso da dispensa não vale para a nova rodada
  // =========================================================================
  const t = await ateInstrucao("troca de modalidade");
  await engine.definirModalidade(compras, t.id, "DISPENSA_VALOR", "Valor abaixo do limite do art. 75, II, sem fracionamento aparente.");
  await engine.registrarPesquisaPrecos(compras, t.id, { fontes: fontes3 });
  await instrucaoAteParecer(t.id);
  await engine.avancar(procurador, t.id, "INSTRUCAO_DIRETA");
  await engine.receber(compras, t.id);
  await engine.publicarAvisoDispensa(compras, t.id, { justificativaSemAviso: "Entrega urgente para inaugurar a unidade na próxima semana." });
  await engine.devolver(compras, t.id, "INSTRUCAO", "Rever o caminho: o mercado tem mais fornecedores do que o previsto.");
  await estaEm(t.id, "INSTRUCAO");
  await engine.definirModalidade(compras, t.id, "LICITACAO", "Há vários fornecedores: a disputa por pregão amplia a competição.");
  c = await carregar(t.id);
  if (meta(c).avisoDispensa) falha("ao trocar para licitação o aviso da dispensa deveria sair dos metadados");
  const hav = meta(c).historicoAvisos as { justificativaSemAviso?: string; arquivadoEm?: string }[] | undefined;
  if (hav?.length !== 1 || !hav[0].arquivadoEm || !hav[0].justificativaSemAviso) falha("aviso deveria ir para historicoAvisos: " + JSON.stringify(hav));
  const evMod = c.eventos.filter((e) => e.tipo === "MODALIDADE").at(-1)?.dados as { arquivados?: string[] } | undefined;
  if (!evMod?.arquivados?.includes("avisoDispensa")) falha("evento MODALIDADE deveria dizer o que foi arquivado: " + JSON.stringify(evMod));
  await engine.definirModalidade(compras, t.id, "DISPENSA_VALOR", "Pregão inviável no prazo: volta à dispensa por valor com aviso.");
  await instrucaoAteParecer(t.id);
  await engine.avancar(procurador, t.id, "INSTRUCAO_DIRETA");
  await engine.receber(compras, t.id);
  await esperaErro("de volta à dispensa, o aviso antigo não vale", () => engine.avancar(compras, t.id, "AUTORIZACAO_DIRETA"));
  await engine.publicarAvisoDispensa(compras, t.id, { justificativaSemAviso: "Nova justificativa: entrega urgente para a inauguração." });
  await engine.avancar(compras, t.id, "AUTORIZACAO_DIRETA");
  ok("dispensa → licitação → dispensa: o aviso antigo vai para o histórico e a dispensa exige aviso novo");

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

  await esperaErro("tramitar etapa antiga sem ser administrador", () => engine.tramitar(compras, velho.id, compras.setorId!, "tentativa"));
  await engine.tramitar(prefeita, velho.id, compras.setorId!, "Administrador reencaminha a etapa antiga.");
  ok("etapa antiga só é tramitada pelo administrador");

  console.log("\nTodos os testes passaram.");
  process.exit(0);
}
main().catch((e) => { console.error("✗", e); process.exit(1); });

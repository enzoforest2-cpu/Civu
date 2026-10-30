import type { SessaoUsuario } from "../../lib/auth";
import type { Papel } from "../../lib/workflow";
import type { ModuloDemo } from "./contexto";

/**
 * Processos de exemplo parados em cada etapa nova do fluxo da contratação, criados pelo motor.
 * As datas partem de "hoje" na hora da carga (a demonstração recarrega a cada deploy em que DEMO_VERSAO muda) e usam
 * os feriados do município: "aviso publicado ontem" é o dia útil anterior, e o recurso fica dentro do prazo no dia da carga.
 */
export const contratacaoDemo: ModuloDemo = {
  nome: "Contratação (etapas do fluxo de compra)",
  async aplicar(ctx) {
    const engine = await import("../../lib/engine");
    const { eq } = await import("drizzle-orm");
    const s = await import("../schema");
    const { addDiasUteis, isDiaUtil } = await import("../../lib/dates");
    const { aberturaMinima, PRAZO_MINIMO_EDITAL } = await import("../../lib/regras-fluxo");
    const { cnpj } = await import("../valor");
    const db = ctx.db;

    async function sessao(cpf: string): Promise<SessaoUsuario> {
      const u = await db.query.usuarios.findFirst({ where: eq(s.usuarios.id, ctx.usuarios[cpf]), with: { setor: true, municipio: true } });
      if (!u) throw new Error(`Usuário ${cpf} não encontrado`);
      return {
        id: u.id, nome: u.nome, cpf: u.cpf, email: u.email, cargo: u.cargo, papeis: u.papeis as Papel[], setorId: u.setorId,
        setor: u.setor ? { id: u.setor.id, sigla: u.setor.sigla, nome: u.setor.nome } : null,
        municipioId: u.municipioId, municipio: { id: u.municipio.id, nome: u.municipio.nome, uf: u.municipio.uf, slug: u.municipio.slug },
      };
    }
    const fernanda = await sessao("99999999999");
    const marcos = await sessao("88888888888");
    const paulo = await sessao("10101010101");
    const protocolo = await sessao("22222222222");
    const prefeita = await sessao("11111111111");
    const compras = await sessao("33333333333");
    const contador = await sessao("44444444444");
    const controladora = await sessao("55555555555");
    const procurador = await sessao("66666666666");
    const tesouraria = await sessao("77777777777");

    // ---- datas relativas a hoje, em dias úteis do município
    const fer = await engine.feriadosDo(ctx.municipioId);
    const hoje = engine.hojeIso();
    // meio-dia local e formatação pelo calendário local: o prazo em dias úteis termina às 23h59 e toISOString viraria o dia seguinte
    const data = (iso: string) => new Date(iso + "T12:00:00");
    const isoLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const deslocar = (iso: string, dias: number) => isoLocal(new Date(data(iso).getTime() + dias * 86400_000));
    const util = (iso: string) => isDiaUtil(data(iso), fer);
    /** Dia útil mais recente que não passa de `iso` (inclusive). */
    const ateUtil = (iso: string) => {
      let d = iso;
      while (!util(d)) d = deslocar(d, -1);
      return d;
    };
    const ontemUtil = ateUtil(deslocar(hoje, -1));
    const hojeUtil = ateUtil(hoje);
    const maisUteis = (iso: string, n: number) => isoLocal(addDiasUteis(data(iso), n, fer));
    const pretendida = deslocar(hoje, 75);

    const meta = (objeto: string, valor: number, natureza: string, modalidade: string, justificativa: string, quantidade: string) => ({
      objeto, natureza, modalidade, justificativa, quantidade,
      valorEstimado: String(valor), dataPretendida: pretendida, prioridade: "MEDIA", noPCA: "SIM",
    });
    const fontes = (base: number) => [
      { fonte: "Painel de preços do governo federal", data: deslocar(hoje, -12), valor: base },
      { fonte: "Contratação similar de município vizinho", data: deslocar(hoje, -11), valor: Math.round(base * 1.06) },
      { fonte: "Cotação direta com fornecedor local", data: deslocar(hoje, -9), valor: Math.round(base * 0.97) },
    ];

    type Pedido = { assunto: string; req: SessaoUsuario; sec: SessaoUsuario; ug: "01" | "02"; papelReq: Papel; dados: ReturnType<typeof meta>; urgencia?: string };

    async function abrir(p: Pedido) {
      const proc = await engine.abrirProcesso(p.req, {
        tipoId: ctx.tipos.COMPRA, unidadeGestoraId: ctx.ugs[p.ug], assunto: p.assunto, descricao: p.dados.justificativa, urgencia: p.urgencia ?? "NORMAL", metadados: p.dados,
      });
      const dfd = await engine.juntarDocumento(
        p.req, proc.id, "DFD", `DFD — ${p.dados.objeto}`,
        `DOCUMENTO DE FORMALIZAÇÃO DE DEMANDA\n\nObjeto: ${p.dados.objeto}\nJustificativa: ${p.dados.justificativa}\nQuantidade: ${p.dados.quantidade}\nValor estimado: R$ ${Number(p.dados.valorEstimado).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
      );
      await engine.assinarDocumento(p.req, dfd.id, p.papelReq);
      return { id: proc.id, numero: proc.numero, dfdId: dfd.id };
    }
    async function ateAprovacao(p: Pedido) {
      const r = await abrir(p);
      await engine.avancar(p.req, r.id, "APROVACAO_SECRETARIO", "Encaminho ao secretário da pasta.");
      return r;
    }
    async function ateAutuacao(p: Pedido) {
      const r = await ateAprovacao(p);
      if (p.sec.id !== p.req.id) await engine.assinarDocumento(p.sec, r.dfdId, "SECRETARIO");
      await engine.avancar(p.sec, r.id, "AUTUACAO", "Aprovado. Ao protocolo para autuação.");
      return r;
    }
    async function ateInstrucao(p: Pedido) {
      const r = await ateAutuacao(p);
      await engine.receber(protocolo, r.id);
      await engine.juntarDocumento(protocolo, r.id, "TERMO_AUTUACAO", `Termo de autuação — ${r.numero}`, `TERMO DE AUTUAÇÃO\n\nProcesso ${r.numero}\nAssunto: ${p.assunto}\nDFD conferido e assinado.`);
      await engine.avancar(protocolo, r.id, "AUTORIZACAO", "Autuado. Encaminho para autorização do gabinete.");
      await engine.receber(prefeita, r.id);
      const desp = await engine.juntarDocumento(prefeita, r.id, "DESPACHO_AUTORIZACAO", "Autorizo o prosseguimento", "Autorizo a instrução do processo.");
      await engine.assinarDocumento(prefeita, desp.id, "ORDENADOR");
      await engine.avancar(prefeita, r.id, "INSTRUCAO", "Autorizado. À instrução.");
      await engine.receber(compras, r.id);
      await engine.juntarDocumento(compras, r.id, "ETP", `ETP — ${p.dados.objeto}`, `ESTUDO TÉCNICO PRELIMINAR\n\nObjeto: ${p.dados.objeto}\nNecessidade: ${p.dados.justificativa}`);
      const tr = await engine.juntarDocumento(compras, r.id, "TR", `TR — ${p.dados.objeto}`, `TERMO DE REFERÊNCIA\n\nObjeto: ${p.dados.objeto}\nQuantidade: ${p.dados.quantidade}`);
      await engine.assinarDocumento(p.sec, tr.id, p.sec.papeis.includes("SECRETARIO") ? "SECRETARIO" : "REQUISITANTE");
      return r;
    }
    /** Da instrução até o parecer jurídico assinado, com a modalidade escolhida. */
    async function ateParecer(p: Pedido, id: string, modalidade: string, base: number) {
      await engine.definirModalidade(compras, id, modalidade, `Escolha da modalidade registrada para o processo de exemplo: ${modalidade === "LICITACAO" ? "disputa aberta entre os fornecedores" : "contratação direta pelo valor e pela natureza do objeto"}.`);
      await engine.registrarPesquisaPrecos(compras, id, { fontes: fontes(base) });
      await engine.avancar(compras, id, "VERIFICACAO_ORCAMENTARIA");
      await engine.receber(contador, id);
      await engine.juntarDocumento(contador, id, "CERTIDAO_DOTACAO", "Certidão de dotação", "Dotação indicada com saldo suficiente para a despesa.");
      await engine.avancar(contador, id, "RESERVADO");
      await engine.juntarDocumento(contador, id, "NOTA_RESERVA", "Nota de reserva", "Valor reservado na dotação.");
      await engine.avancar(contador, id, "CONTROLE_INTERNO");
      await engine.receber(controladora, id);
      const ck = await engine.juntarDocumento(controladora, id, "CHECKLIST_CI", "Checklist do controle interno", "Itens conferidos: conforme.");
      await engine.assinarDocumento(controladora, ck.id, "CONTROLE_INTERNO");
      await engine.avancar(controladora, id, "PARECER_JURIDICO");
      await engine.receber(procurador, id);
      const par = await engine.juntarDocumento(procurador, id, "PARECER_JURIDICO", "Parecer jurídico", "Parecer favorável.");
      await engine.assinarDocumento(procurador, par.id, "JURIDICO");
      void p;
    }
    async function ateEdital(p: Pedido, base: number) {
      const r = await ateInstrucao(p);
      await ateParecer(p, r.id, "LICITACAO", base);
      await engine.avancar(procurador, r.id, "PUBLICACAO_EDITAL");
      await engine.receber(compras, r.id);
      await engine.juntarDocumento(compras, r.id, "EDITAL", `Edital — ${p.dados.objeto}`, `EDITAL DE LICITAÇÃO\n\nObjeto: ${p.dados.objeto}`);
      return r;
    }

    // 1. APROVACAO_SECRETARIO: DFD assinado pelo requisitante, esperando o secretário
    const aprov: Pedido = {
      assunto: "Aquisição de 2 refrigeradores para vacinas da UBS Centro", req: fernanda, sec: marcos, ug: "02", papelReq: "REQUISITANTE",
      dados: meta("2 refrigeradores para imunobiológicos, 280 litros", 16400, "EQUIPAMENTOS", "DISPENSA_VALOR", "Os refrigeradores atuais da sala de vacina não mantêm a temperatura exigida para as vacinas.", "2 unidades"),
    };
    await ateAprovacao(aprov);

    // 2. AUTUACAO: secretário aprovou, protocolo ainda não autuou
    await ateAutuacao({
      assunto: "Aquisição de material pedagógico para a educação infantil", req: paulo, sec: paulo, ug: "01", papelReq: "SECRETARIO",
      dados: meta("Jogos pedagógicos, livros infantis e material de artes para 6 turmas", 38200, "MATERIAL_EXPEDIENTE", "DISPENSA_VALOR", "Reposição do acervo das turmas de educação infantil para o ano letivo.", "kits para 6 turmas"),
    });

    // 3. PUBLICACAO_EDITAL: edital juntado, ainda sem a publicação e a abertura registradas
    const edital: Pedido = {
      assunto: "Aquisição de uniformes escolares para a rede municipal", req: paulo, sec: paulo, ug: "01", papelReq: "SECRETARIO",
      dados: meta("Camisetas, bermudas e agasalhos para a rede municipal", 118000, "EQUIPAMENTOS", "LICITACAO", "Uniformes do próximo ano letivo para os alunos da rede municipal.", "kits por aluno matriculado"),
    };
    await ateEdital(edital, 118000);

    // 4. IMPUGNACOES: edital publicado no dia útil anterior, uma impugnação no prazo ainda sem resposta
    const imp: Pedido = {
      assunto: "Registro de preços de material de limpeza para as escolas", req: paulo, sec: paulo, ug: "01", papelReq: "SECRETARIO",
      dados: meta("Material de limpeza e higiene para 9 escolas", 64000, "MATERIAL_EXPEDIENTE", "LICITACAO", "Reposição trimestral de limpeza e higiene das escolas.", "conforme termo de referência"),
    };
    const rImp = await ateEdital(imp, 64000);
    const pubImp = ontemUtil;
    const aberturaImp = maisUteis(aberturaMinima(pubImp, "BENS_MENOR_PRECO", fer), 2);
    await engine.publicarEdital(compras, rImp.id, { numero: "Pregão Eletrônico 41/" + hoje.slice(0, 4), tipoObjeto: "BENS_MENOR_PRECO", publicadoEm: pubImp, aberturaEm: aberturaImp, plataforma: "Portal Nacional de Contratações Públicas" });
    await engine.avancar(compras, rImp.id, "IMPUGNACOES");
    await engine.registrarImpugnacao(compras, rImp.id, {
      autor: "Distribuidora Serra Limpa Ltda",
      texto: "Pedimos esclarecimento sobre o item 14 do termo de referência: a marca de referência indicada não consta no catálogo de fornecedores da região. Solicitamos aceitar produto equivalente.",
      recebidaEm: hojeUtil,
    });

    // Edital já aberto: a sessão é hoje (ou no último dia útil), com o prazo mínimo cumprido
    const aberturaSessao = hojeUtil;
    const publicadoSessao = deslocar(aberturaSessao, -Math.ceil(PRAZO_MINIMO_EDITAL.BENS_MENOR_PRECO * 7 / 5) - 7);
    async function ateSessao(p: Pedido, base: number, numeroEdital: string) {
      const r = await ateEdital(p, base);
      await engine.publicarEdital(compras, r.id, { numero: numeroEdital, tipoObjeto: "BENS_MENOR_PRECO", publicadoEm: publicadoSessao, aberturaEm: aberturaSessao, plataforma: "Portal Nacional de Contratações Públicas" });
      await engine.avancar(compras, r.id, "IMPUGNACOES");
      return r;
    }

    // 5. SESSAO_DISPUTA: sessão aberta, com uma impugnação já respondida e mantido o edital
    const sess: Pedido = {
      assunto: "Aquisição de cadeiras e mesas para a Escola Municipal Linha Bonita", req: paulo, sec: paulo, ug: "01", papelReq: "SECRETARIO",
      dados: meta("Cadeiras e mesas para 5 salas de aula", 52000, "EQUIPAMENTOS", "LICITACAO", "Móveis das salas em fim de vida útil, com risco para os alunos.", "5 conjuntos de sala"),
    };
    const rSess = await ateSessao(sess, 52000, "Pregão Eletrônico 38/" + hoje.slice(0, 4));
    await engine.registrarImpugnacao(compras, rSess.id, {
      autor: "Móveis do Vale Ltda", texto: "Pedimos a revisão do prazo de entrega de 15 dias, por considerá-lo incompatível com a fabricação sob medida.", recebidaEm: deslocar(aberturaSessao, -9),
    });
    const impId = ((await engine.carregarProcesso(ctx.municipioId, rSess.id))!.metadados as { impugnacoes: { id: string }[] }).impugnacoes[0].id;
    await engine.responderImpugnacao(compras, rSess.id, impId, {
      resposta: "O prazo de 15 dias corridos está compatível com a pesquisa de mercado feita para o termo de referência. Impugnação não acolhida; o edital permanece como publicado.",
      acolhida: false, alteraPropostas: false,
    });
    await engine.avancar(compras, rSess.id, "SESSAO_DISPUTA");

    // 6. RECURSOS: sessão concluída com vencedor, um recurso dentro do prazo de razões
    const rec: Pedido = {
      assunto: "Aquisição de computadores para o laboratório de informática", req: paulo, sec: paulo, ug: "01", papelReq: "SECRETARIO",
      dados: meta("15 computadores e 15 estabilizadores para o laboratório", 89000, "EQUIPAMENTOS", "LICITACAO", "O laboratório de informática da escola sede tem equipamentos sem suporte.", "15 estações"),
    };
    const rRec = await ateSessao(rec, 89000, "Pregão Eletrônico 39/" + hoje.slice(0, 4));
    await engine.avancar(compras, rRec.id, "SESSAO_DISPUTA");
    await engine.juntarDocumento(compras, rRec.id, "ATA_SESSAO", "Ata da sessão pública", "Sessão realizada na plataforma eletrônica. Proposta melhor classificada habilitada.");
    await engine.registrarResultadoSessao(compras, rRec.id, { situacao: "VENCEDOR", fornecedor: "Informática Araucária Ltda", cnpj: cnpj("501234560001"), valor: 84500, ataEm: hojeUtil });
    await engine.avancar(compras, rRec.id, "RECURSOS");
    await engine.registrarRecurso(compras, rRec.id, { recorrente: "TecnoSul Comércio de Equipamentos Ltda", intencaoEm: hojeUtil });

    // 7. INSTRUCAO_DIRETA: dispensa por valor com aviso publicado no dia útil anterior (ainda dentro dos 3 dias úteis)
    const dir: Pedido = {
      assunto: "Manutenção do sistema de climatização do Centro Administrativo", req: fernanda, sec: marcos, ug: "01", papelReq: "REQUISITANTE",
      dados: meta("Revisão e troca de peças de 6 aparelhos de ar-condicionado", 24800, "SERVICOS_GERAIS", "DISPENSA_VALOR", "Os aparelhos das salas de atendimento ao público estão parados.", "6 aparelhos"),
    };
    const rDir = await ateInstrucao(dir);
    await ateParecer(dir, rDir.id, "DISPENSA_VALOR", 24800);
    await engine.avancar(procurador, rDir.id, "INSTRUCAO_DIRETA");
    await engine.receber(compras, rDir.id);
    await engine.publicarAvisoDispensa(compras, rDir.id, { publicadoEm: ontemUtil });

    // 8. PAGAMENTO_ENVIADO: contratação direta executada, liquidada e enviada ao banco, aguardando o retorno
    const pag: Pedido = {
      assunto: "Serviço de impressão de material do programa de assistência social", req: fernanda, sec: marcos, ug: "01", papelReq: "REQUISITANTE",
      dados: meta("Impressão de cartilhas e folhetos do programa de assistência social", 9800, "SERVICOS_GERAIS", "OUTRA_DIRETA", "Material de orientação às famílias atendidas pelo programa.", "3 mil cartilhas"),
    };
    const rPag = await ateInstrucao(pag);
    await ateParecer(pag, rPag.id, "OUTRA_DIRETA", 9800);
    await engine.avancar(procurador, rPag.id, "INSTRUCAO_DIRETA");
    await engine.receber(compras, rPag.id);
    await engine.avancar(compras, rPag.id, "AUTORIZACAO_DIRETA");
    await engine.receber(prefeita, rPag.id);
    const ato = await engine.juntarDocumento(prefeita, rPag.id, "ATO_AUTORIZACAO_DIRETA", "Ato de autorização da contratação direta", "Autorizo a contratação direta, nos termos do parecer jurídico.");
    await engine.assinarDocumento(prefeita, ato.id, "ORDENADOR");
    await engine.avancar(prefeita, rPag.id, "EMPENHADO");
    await engine.receber(contador, rPag.id);
    const emp = await engine.juntarDocumento(contador, rPag.id, "NOTA_EMPENHO", "Nota de empenho", "Empenho emitido em nome do fornecedor escolhido.");
    await engine.assinarDocumento(contador, emp.id, "CONTABILIDADE");
    await engine.assinarDocumento(prefeita, emp.id, "ORDENADOR");
    await engine.avancar(contador, rPag.id, "CONTRATADO");
    await engine.receber(compras, rPag.id);
    await engine.registrarContratacao(compras, rPag.id, { fornecedor: "Gráfica Ipê Roxo Ltda", cnpj: cnpj("688001230001"), valor: "9.640,00", fonte: "ASSISTENCIA" });
    const contrato = await engine.juntarDocumento(compras, rPag.id, "CONTRATO", "Contrato", "Contrato de prestação de serviço de impressão.");
    await engine.assinarDocumento(prefeita, contrato.id, "ORDENADOR");
    await engine.juntarDocumento(compras, rPag.id, "PORTARIA_FISCAL", "Portaria de fiscalização", "Designa gestor e fiscal do contrato, com suplente.");
    await engine.juntarDocumento(compras, rPag.id, "PUBLICACAO_PNCP", "Publicação no PNCP", "Contrato publicado no PNCP (simulado).");
    await engine.avancar(compras, rPag.id, "EXECUCAO");
    await engine.juntarDocumento(marcos, rPag.id, "ORDEM_FORNECIMENTO", "Ordem de serviço", "Execute-se o serviço nos termos do contrato.");
    await engine.juntarDocumento(marcos, rPag.id, "NOTA_FISCAL", "Nota fiscal", "Nota fiscal de serviço apresentada pelo fornecedor.");
    const atesto = await engine.juntarDocumento(marcos, rPag.id, "ATESTO", "Atesto do fiscal", "Serviço recebido e conferido.");
    await engine.assinarDocumento(marcos, atesto.id, "FISCAL");
    await engine.juntarDocumento(marcos, rPag.id, "CERTIDOES", "Certidões de regularidade", "Certidões vigentes.");
    await engine.avancar(marcos, rPag.id, "LIQUIDADO");
    await engine.receber(contador, rPag.id);
    const liq = await engine.juntarDocumento(contador, rPag.id, "NOTA_LIQUIDACAO", "Nota de liquidação", "Direito do credor verificado.");
    await engine.assinarDocumento(prefeita, liq.id, "ORDENADOR");
    await engine.avancar(contador, rPag.id, "FILA_PAGAMENTO");
    await engine.receber(tesouraria, rPag.id);
    const op = await engine.juntarDocumento(tesouraria, rPag.id, "ORDEM_PAGAMENTO", "Ordem de pagamento", "Pague-se ao credor.");
    await engine.assinarDocumento(prefeita, op.id, "ORDENADOR");
    await engine.assinarDocumento(tesouraria, op.id, "TESOURARIA");
    await engine.avancar(tesouraria, rPag.id, "PAGAMENTO_ENVIADO");
  },
};

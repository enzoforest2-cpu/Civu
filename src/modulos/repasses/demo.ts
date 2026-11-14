// Demonstração do módulo de repasses e obrigações da área. Roda depois das compras e dos contratos, porque vincula
// processos que já existem (pelo motor, como na tela). Valores, números de instrumento e parlamentares são fictícios.
// As obrigações são EXEMPLOS: ficam marcadas como exemplo e não afirmam prazo legal ("confirme o prazo oficial").
import { and, eq, like } from "drizzle-orm";
import type { SessaoUsuario } from "../../lib/auth";
import type { Papel } from "../../lib/workflow";
import type { ModuloDemo } from "../../db/demo/contexto";

export const OBSERVACAO_EXEMPLO = "Exemplo da demonstração, sem valor de prazo legal: confirme o prazo oficial com o órgão destinatário antes de usar.";

export const repassesDemo: ModuloDemo = {
  nome: "Repasses, emendas e obrigações da área",
  async aplicar(ctx) {
    const s = await import("../../db/schema");
    const ops = await import("./operacoes");
    const { hojeLocal, somarMeses } = await import("./regras");
    const db = ctx.db;

    async function sessao(cpf: string): Promise<SessaoUsuario> {
      const u = await db.query.usuarios.findFirst({ where: and(eq(s.usuarios.cpf, cpf), eq(s.usuarios.municipioId, ctx.municipioId)), with: { setor: true, municipio: true } });
      if (!u) throw new Error(`Usuário ${cpf} não encontrado`);
      return {
        id: u.id, nome: u.nome, cpf: u.cpf, email: u.email, cargo: u.cargo, papeis: u.papeis as Papel[], setorId: u.setorId,
        setor: u.setor ? { id: u.setor.id, sigla: u.setor.sigla, nome: u.setor.nome, area: u.setor.area } : null,
        municipioId: u.municipioId, municipio: { id: u.municipio.id, nome: u.municipio.nome, uf: u.municipio.uf, slug: u.municipio.slug },
      };
    }
    const saude = await sessao("88888888888");
    const educacao = await sessao("10101010101");
    const infra = await sessao("16161616161");
    const assistencia = await sessao("17171717171");
    const administracao = await sessao("12121212121");
    const fazenda = await sessao("19191919191");

    const hoje = hojeLocal();
    /** data ISO a n dias de hoje (negativo = passado) */
    const em = (n: number) => new Date(Date.parse(hoje + "T12:00:00Z") + n * 86400_000).toISOString().slice(0, 10);
    const S = ctx.setores;

    async function processo(padrao: string) {
      const p = await db.query.processos.findFirst({ where: and(eq(s.processos.municipioId, ctx.municipioId), like(s.processos.assunto, padrao)), columns: { id: true } });
      return p?.id ?? null;
    }
    async function cadastrar(u: SessaoUsuario, e: Parameters<typeof ops.criarRepasse>[1], diasAtras: number, processos: string[] = []) {
      const { id } = await ops.criarRepasse(u, e);
      const quando = ctx.dia(diasAtras);
      await db.update(s.repasses).set({ criadoEm: quando, atualizadoEm: quando }).where(eq(s.repasses.id, id));
      await db.update(s.repasseHistorico).set({ criadoEm: quando }).where(eq(s.repasseHistorico.repasseId, id));
      for (const padrao of processos) {
        const pid = await processo(padrao);
        if (pid) await ops.vincularProcesso(u, id, pid);
      }
      return id;
    }

    // ---- Saúde
    await cadastrar(
      saude,
      {
        setorId: S.SESAU, tipo: "CONVENIO", identificacao: "917554/2025", concedente: "Ministério da Saúde (Fundo Nacional de Saúde)",
        objeto: "Construção da Unidade Básica de Saúde do Bairro Medianeira", valorPrevisto: 2150000, valorRecebido: 1290000,
        assinadoEm: em(-260), vigenciaFim: em(300), prazoExecucao: em(150), prazoPrestacaoContas: em(360), situacao: "EM_EXECUCAO",
        observacao: "Contrapartida municipal de 5% já empenhada. Parcelas liberadas conforme as medições da obra.",
      },
      250,
      ["Pagamento da NF 1177 %"],
    );
    await cadastrar(
      saude,
      {
        setorId: S.SESAU, tipo: "EMENDA_INDIVIDUAL", identificacao: "2026.0417.0003", concedente: "Deputada federal Lúcia Prado (nome fictício)",
        objeto: "Custeio da atenção primária: medicamentos e climatização das UBS", valorPrevisto: 350000, valorRecebido: 350000,
        assinadoEm: em(-90), vigenciaFim: em(40), prazoExecucao: em(12), prazoPrestacaoContas: em(100), situacao: "EM_EXECUCAO",
      },
      85,
      ["Aquisição de medicamentos básicos para as UBS", "Aquisição de 2 ar-condicionados para a UBS Centro", "Pagamento da NF 20744 %"],
    );
    await cadastrar(
      saude,
      {
        setorId: S.SESAU, tipo: "FUNDO_A_FUNDO", identificacao: "FES 0388/2025", concedente: "Fundo Estadual de Saúde",
        objeto: "Equipamentos para a farmácia básica municipal", valorPrevisto: 120000, valorRecebido: 120000,
        assinadoEm: em(-400), vigenciaFim: em(-30), prazoExecucao: em(-30), prazoPrestacaoContas: em(4), situacao: "PRESTACAO_PENDENTE",
        observacao: "Equipamentos entregues; falta anexar as notas e o termo de recebimento ao relatório para o concedente.",
      },
      390,
    );

    // ---- Educação
    await cadastrar(
      educacao,
      {
        setorId: S.SEDUC, tipo: "PROGRAMA", identificacao: "PNAE 2026", concedente: "FNDE (Programa Nacional de Alimentação Escolar)",
        objeto: "Alimentação escolar da rede municipal em 2026", valorPrevisto: 420000, valorRecebido: 315000,
        assinadoEm: em(-300), vigenciaFim: em(48), prazoExecucao: em(48), prazoPrestacaoContas: em(120), situacao: "EM_EXECUCAO",
      },
      290,
      ["Aquisição de gêneros alimentícios — merenda escolar", "Pagamento da NF 412 %"],
    );
    await cadastrar(
      educacao,
      {
        setorId: S.SEDUC, tipo: "CONVENIO", identificacao: "SEDUC 1123/2024", concedente: "Secretaria Estadual de Educação",
        objeto: "Transporte escolar rural: apoio ao exercício de 2025", valorPrevisto: 180000, valorRecebido: 180000,
        assinadoEm: em(-520), vigenciaFim: em(-70), prazoPrestacaoContas: em(-10), situacao: "COM_PENDENCIA",
        observacao: "O concedente pediu complemento dos comprovantes de quilometragem de cada rota.",
      },
      500,
    );

    // ---- Infraestrutura
    await cadastrar(
      infra,
      {
        setorId: S.SEINFRA, tipo: "CONVENIO", identificacao: "912345/2025", concedente: "Ministério das Cidades, por meio da Caixa",
        objeto: "Pavimentação asfáltica da Rua Ernesto Alves e travessas, Bairro São Cristóvão", valorPrevisto: 2400000, valorRecebido: 1380000,
        assinadoEm: em(-330), vigenciaFim: em(180), prazoExecucao: em(25), prazoPrestacaoContas: em(240), situacao: "EM_EXECUCAO",
        observacao: "Prazo de execução do plano de trabalho: pedir prorrogação ao concedente se a medição final não sair a tempo.",
      },
      320,
      ["Pagamento da NF 241 %"],
    );
    await cadastrar(
      infra,
      {
        setorId: S.SEINFRA, tipo: "EMENDA_BANCADA", identificacao: "2026.0042", concedente: "Bancada federal do estado (fictícia)",
        objeto: "Abastecimento de água no interior: poços e conjuntos motobomba", valorPrevisto: 90000, valorRecebido: 90000,
        assinadoEm: em(-200), vigenciaFim: em(160), prazoExecucao: em(70), prazoPrestacaoContas: em(220), situacao: "EM_EXECUCAO",
      },
      190,
      ["Pagamento da NF 3112 %", "Pagamento da NF 3140 %"],
    );

    // ---- Assistência Social
    await cadastrar(
      assistencia,
      {
        setorId: S.SEMAS, tipo: "EMENDA_INDIVIDUAL", identificacao: "2026.0417.0111", concedente: "Deputado estadual Ivo Brandt (nome fictício)",
        objeto: "Fortalecimento do CRAS: material de orientação e oficinas com as famílias", valorPrevisto: 60000, valorRecebido: 60000,
        assinadoEm: em(-120), vigenciaFim: em(35), prazoExecucao: em(5), prazoPrestacaoContas: em(95), situacao: "EM_EXECUCAO",
      },
      115,
      ["Serviço de impressão de material do programa de assistência social"],
    );

    // ---- Administração e Fazenda
    await cadastrar(
      administracao,
      {
        setorId: S.SEMAD, tipo: "TRANSFERENCIA_ESPECIAL", concedente: "Parlamentar a confirmar",
        objeto: "Modernização do atendimento ao cidadão: equipamentos e mobiliário", valorPrevisto: 250000, situacao: "EM_CAPTACAO",
        observacao: "Proposta enviada ao gabinete do parlamentar; aguarda indicação no orçamento do próximo ano.",
      },
      20,
    );
    await cadastrar(
      fazenda,
      {
        setorId: S.SEFAZ, tipo: "PROGRAMA", identificacao: "Modernização fiscal 2024", concedente: "Programa estadual de modernização da gestão fiscal (fictício)",
        objeto: "Recadastramento imobiliário e atualização da planta de valores", valorPrevisto: 80000, valorRecebido: 80000,
        assinadoEm: em(-700), vigenciaFim: em(-200), prazoPrestacaoContas: em(-150), situacao: "PRESTADO",
      },
      690,
    );

    // ---- Obrigações da área (exemplos)
    async function obrigacao(u: SessaoUsuario, setorId: string, nome: string, destinatario: string, periodicidade: string, vencimento: string, situacao = "PENDENTE") {
      const { id } = await ops.criarObrigacao(u, { setorId, nome, destinatario, periodicidade, proximoVencimento: vencimento, responsavelId: u.id, situacao });
      await db.update(s.obrigacoesArea).set({ exemplo: true, observacao: OBSERVACAO_EXEMPLO }).where(eq(s.obrigacoesArea.id, id));
      return id;
    }
    await obrigacao(saude, S.SESAU, "Relatório quadrimestral da saúde", "Conselho Municipal de Saúde e Câmara Municipal", "QUADRIMESTRAL", em(-3), "EM_PREPARACAO");
    await obrigacao(saude, S.SESAU, "Envio dos dados do orçamento da saúde ao sistema federal", "Ministério da Saúde (sistema de informações)", "BIMESTRAL", em(18));
    await obrigacao(educacao, S.SEDUC, "Censo escolar: conferência das matrículas", "Ministério da Educação", "ANUAL", em(9), "EM_PREPARACAO");
    await obrigacao(educacao, S.SEDUC, "Prestação de contas da alimentação escolar", "Conselho de Alimentação Escolar e FNDE", "ANUAL", em(45));
    await obrigacao(assistencia, S.SEMAS, "Relatório de gestão do fundo de assistência social", "Conselho Municipal de Assistência Social", "ANUAL", em(27));
    await obrigacao(administracao, S.SEMAD, "Informações de pessoal ao Tribunal de Contas", "Tribunal de Contas do Estado", "MENSAL", em(13));
    await obrigacao(infra, S.SEINFRA, "Relatório de acompanhamento do convênio de pavimentação", "Caixa (mandatária do concedente)", "MENSAL", em(2));
    await obrigacao(fazenda, S.SEFAZ, "Relatório de gestão fiscal", "Tribunal de Contas e portal da transparência", "QUADRIMESTRAL", em(60));
    // uma com entrega anterior registrada: o vencimento seguinte cai daqui a 4 dias
    const rreo = await obrigacao(fazenda, S.SEFAZ, "Relatório resumido da execução orçamentária", "Tribunal de Contas e portal da transparência", "BIMESTRAL", somarMeses(em(4), -2));
    await ops.registrarEntrega(fazenda, rreo, { entregueEm: somarMeses(em(2), -2), comprovante: "Recibo de envio 2026-RREO-0517 (exemplo)" });
  },
};

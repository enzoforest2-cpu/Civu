// Dados de demonstração do módulo Gestão: processos chegando ao gabinete (pelo motor), regras de automação
// com execuções reais e históricas, alertas, integrações simuladas com histórico de chamadas e auditoria administrativa.
import { createHash } from "crypto";
import type { DemoCtx, ModuloDemo } from "@/db/demo/contexto";
import type { SessaoUsuario } from "@/lib/auth";
import type { Papel } from "@/lib/workflow";

const DIA = 86400_000;

export const gestaoDemo: ModuloDemo = {
  nome: "Gestão (gabinete, automações, integrações, governança)",
  async aplicar(ctx: DemoCtx) {
    const engine = await import("@/lib/engine");
    const { eq } = await import("drizzle-orm");
    const s = await import("@/db/schema");
    const { verificarIntegridade, registrarAuditoria } = await import("./auditoria");
    const { executarRegra } = await import("./automacoes");
    const { decidirEmLote } = await import("./gabinete");
    const { CATALOGO } = await import("./integracoes");
    const db = ctx.db;
    const M = ctx.municipioId;
    const U = ctx.usuarios;
    const dia = ctx.dia;

    async function sessao(cpf: string): Promise<SessaoUsuario> {
      const u = await db.query.usuarios.findFirst({ where: eq(s.usuarios.id, U[cpf]), with: { setor: true, municipio: true } });
      if (!u) throw new Error(`Usuário ${cpf} não encontrado`);
      return {
        id: u.id,
        nome: u.nome,
        cpf: u.cpf,
        email: u.email,
        cargo: u.cargo,
        papeis: u.papeis as Papel[],
        setorId: u.setorId,
        setor: u.setor ? { id: u.setor.id, sigla: u.setor.sigla, nome: u.setor.nome } : null,
        municipioId: u.municipioId,
        municipio: { id: u.municipio.id, nome: u.municipio.nome, uf: u.municipio.uf, slug: u.municipio.slug },
      };
    }
    const prefeita = await sessao("11111111111");
    const protocolo = await sessao("22222222222");
    const controladora = await sessao("55555555555");
    const fernanda = await sessao("99999999999");
    const marcos = await sessao("88888888888");
    const paulo = await sessao("10101010101");
    const sandra = await sessao("12121212121");

    // ---- 0. verificação de integridade feita pela controladoria na semana passada (antes dos novos processos)
    const integ = await verificarIntegridade(M);
    await registrarAuditoria({
      municipioId: M,
      autorId: U["55555555555"],
      acao: "INTEGRIDADE_VERIFICADA",
      objetoTipo: "TRILHA",
      objetoRotulo: `${integ.processos} processos, ${integ.eventos} eventos`,
      depois: { ...integ, verificadoEm: dia(6).toISOString() },
      criadoEm: dia(6),
    });

    // ---- 1. compras que chegam ao gabinete para autorização (pelo motor: abrir, DFD, assinar, avançar)
    const ano = new Date().getFullYear();
    async function compraAteGabinete(
      u: SessaoUsuario,
      papel: Papel,
      assunto: string,
      meta: { objeto: string; natureza: string; modalidade: string; justificativa: string; quantidade: string; valorEstimado: number; prioridade: string; noPCA: string; dataPretendida: string },
      urgencia = "NORMAL",
    ) {
      const p = await engine.abrirProcesso(u, {
        tipoId: ctx.tipos.COMPRA,
        unidadeGestoraId: ctx.ugs[meta.natureza === "MEDICAMENTOS" ? "02" : "01"],
        assunto,
        descricao: meta.justificativa,
        urgencia,
        metadados: { ...meta, valorEstimado: String(meta.valorEstimado) },
      });
      const dfd = await engine.juntarDocumento(
        u,
        p.id,
        "DFD",
        `DFD — ${meta.objeto}`,
        `DOCUMENTO DE FORMALIZAÇÃO DE DEMANDA\n\nObjeto: ${meta.objeto}\nJustificativa: ${meta.justificativa}\nQuantidade: ${meta.quantidade}\nValor estimado: R$ ${meta.valorEstimado.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}\nPrioridade: ${meta.prioridade}`,
      );
      await engine.assinarDocumento(u, dfd.id, papel);
      // secretário da pasta aprova (assina o DFD, se quem abriu não foi ele) e o protocolo autua antes do gabinete
      await engine.avancar(u, p.id, "APROVACAO_SECRETARIO", "Encaminho ao secretário da pasta.");
      // secretário da secretaria de quem pediu (cada pasta do seed tem o seu); sem ele na lista, Marcos (Saúde)
      const secretarioDaPasta: Record<string, SessaoUsuario> = { SESAU: marcos, SEDUC: paulo, SEMAD: sandra };
      const secretario = papel === "SECRETARIO" ? u : (secretarioDaPasta[u.setor?.sigla ?? ""] ?? marcos);
      if (papel !== "SECRETARIO") await engine.assinarDocumento(secretario, dfd.id, "SECRETARIO");
      await engine.avancar(secretario, p.id, "AUTUACAO", "Aprovado. Ao protocolo para autuação.");
      await engine.receber(protocolo, p.id);
      await engine.juntarDocumento(protocolo, p.id, "TERMO_AUTUACAO", `Termo de autuação — ${p.numero}`, `TERMO DE AUTUAÇÃO\n\nProcesso ${p.numero}\nAssunto: ${assunto}\nInteressado: secretaria requisitante.\nDFD conferido e assinado.`);
      await engine.avancar(protocolo, p.id, "AUTORIZACAO", "Autuado. Encaminho para autorização do gabinete.");
      return p;
    }

    const cadeiras = await compraAteGabinete(marcos, "SECRETARIO", "Aquisição de 6 cadeiras de rodas para empréstimo na Secretaria de Saúde", {
      objeto: "6 cadeiras de rodas dobráveis, adulto, aço carbono",
      natureza: "EQUIPAMENTOS",
      modalidade: "DISPENSA_VALOR",
      justificativa: "Fila de 11 pedidos de empréstimo no banco de equipamentos da Saúde; 4 cadeiras atuais estão sem condição de uso.",
      quantidade: "6 unidades",
      valorEstimado: 7140,
      prioridade: "ALTA",
      noPCA: "SIM",
      dataPretendida: `${ano}-12-10`,
    }, "PRIORITARIO");
    await compraAteGabinete(fernanda, "REQUISITANTE", "Aquisição de insumos de curativo para as UBS", {
      objeto: "Gaze, ataduras, soro fisiológico 250 ml e coberturas para curativo",
      natureza: "MEDICAMENTOS",
      modalidade: "DISPENSA_VALOR",
      justificativa: "Estoque de curativos das 4 UBS cobre menos de 20 dias; aumento de atendimentos de pacientes diabéticos.",
      quantidade: "conforme planilha anexa ao DFD",
      valorEstimado: 18920.5,
      prioridade: "ALTA",
      noPCA: "SIM",
      dataPretendida: `${ano}-11-20`,
    }, "URGENTE");
    const onibus = await compraAteGabinete(paulo, "SECRETARIO", "Locação de 2 micro-ônibus para o transporte escolar de Linha Bonita", {
      objeto: "Locação de 2 micro-ônibus com motorista, 180 dias letivos",
      natureza: "TRANSPORTE",
      modalidade: "LICITACAO",
      justificativa: "Encerramento do contrato atual em fevereiro; 64 alunos da Linha Bonita e da Linha Araçá dependem do transporte.",
      quantidade: "2 veículos, 180 dias",
      valorEstimado: 286400,
      prioridade: "ALTA",
      noPCA: "SIM",
      dataPretendida: `${ano + 1}-02-16`,
    });
    await compraAteGabinete(sandra, "SECRETARIO", "Manutenção preventiva dos elevadores do Centro Administrativo", {
      objeto: "Manutenção preventiva e corretiva de 2 elevadores por 12 meses",
      natureza: "SERVICOS_GERAIS",
      modalidade: "DISPENSA_VALOR",
      justificativa: "Contrato anterior encerrado; laudo do Corpo de Bombeiros exige manutenção mensal documentada.",
      quantidade: "12 meses",
      valorEstimado: 31200,
      prioridade: "MEDIA",
      noPCA: "SIM",
      dataPretendida: `${ano}-12-01`,
    });
    // prazo da etapa já correndo: o ônibus chegou ao gabinete há dias e o prazo venceu ontem
    await db.update(s.processos).set({ prazoEtapaEm: new Date(Date.now() - 1 * DIA) }).where(eq(s.processos.id, onibus.id));

    // ---- 2. requerimentos que chegam ao gabinete
    const ginasio = await engine.abrirProcessoExterno(
      M,
      { pessoaId: ctx.pessoas.ana, empresaId: null, nomeExibicao: "Ana Beatriz Souza" },
      {
        tipoChave: "REQUERIMENTO",
        assunto: "Cessão do Ginásio Municipal para festival beneficente da APAE",
        descricao: "Pedimos a cessão do Ginásio Municipal no sábado, 28 de novembro, das 14h às 22h, para o festival beneficente da APAE. A entrada será um quilo de alimento.",
      },
    );
    await engine.avancar(protocolo, ginasio.id, "EM_ANALISE", "Distribuído ao gabinete: cessão de próprio municipal depende de autorização da prefeita.");
    await engine.tramitar(protocolo, ginasio.id, ctx.setores.GAB, "Ao Gabinete para decisão sobre a cessão do ginásio.");

    const amserra = await engine.abrirProcesso(protocolo, {
      tipoId: ctx.tipos.REQUERIMENTO,
      unidadeGestoraId: ctx.ugs["01"],
      assunto: "Convite da associação regional de municípios para assembleia sobre consórcio de saúde",
      descricao: "Ofício circular convidando o município para a assembleia que discutirá a adesão ao consórcio intermunicipal de saúde da Serra.",
      metadados: { interessado: "Associação dos Municípios da Serra" },
    });
    await engine.avancar(protocolo, amserra.id, "EM_ANALISE", "Ao Gabinete para ciência e definição de representante.");
    await engine.tramitar(protocolo, amserra.id, ctx.setores.GAB, "Ao Gabinete.");

    // ---- 3. uma decisão em lote já tomada pela prefeita (pelo motor, com senha): autorizou as cadeiras de rodas
    await decidirEmLote(prefeita, { ids: [cadeiras.id], modo: "AVANCAR", texto: "Autorizo. Priorizar a entrega antes do fim do ano.", senha: "123456" });

    // ---- 4. pedidos do portal para as automações
    const buraco = await engine.abrirProcessoExterno(
      M,
      { pessoaId: ctx.pessoas.ana, empresaId: null, nomeExibicao: "Ana Beatriz Souza" },
      {
        tipoChave: "REQUERIMENTO",
        assunto: "Buraco na Rua das Hortênsias, em frente ao nº 212",
        descricao: "Há um buraco grande no asfalto que já danificou dois carros. Fica perto da escola e enche de água quando chove.",
      },
    );
    void buraco;
    // exigência vencida e sem resposta (empresa fornecedora)
    const cadastro = await engine.abrirProcessoExterno(
      M,
      { pessoaId: ctx.pessoas.marta, empresaId: ctx.empresas.cariri, nomeExibicao: "Distribuidora Médica Cariri Ltda" },
      {
        tipoChave: "REQUERIMENTO",
        assunto: "Atualização do cadastro de fornecedor",
        descricao: "Solicitamos a atualização do cadastro de fornecedor com o novo endereço da filial de Caxias do Sul.",
      },
    );
    await engine.abrirExigencia(protocolo, cadastro.id, "Envie a certidão de regularidade do FGTS e o comprovante do novo endereço da filial.", 3);
    {
      const p = await db.query.processos.findFirst({ where: eq(s.processos.id, cadastro.id) });
      const meta = { ...((p?.metadados ?? {}) as Record<string, unknown>) };
      const ex = meta.exigencia as Record<string, unknown>;
      meta.exigencia = { ...ex, abertaEm: dia(9).toISOString(), prazo: dia(4).toISOString() };
      await db.update(s.processos).set({ metadados: meta }).where(eq(s.processos.id, cadastro.id));
    }

    // ---- 5. regras de automação
    const regraDef = [
      {
        k: "parado7",
        nome: "Processo parado há 7 dias em qualquer setor",
        gatilho: "PROCESSO_PARADO",
        parametros: { dias: 7, setorSigla: null },
        acao: "ALERTA",
        acaoParametros: { gravidade: "MEDIA" },
        nivel: "INFORMAR",
        criado: 58,
      },
      {
        k: "contab",
        nome: "Contabilidade: processo parado há 5 dias",
        gatilho: "PROCESSO_PARADO",
        parametros: { dias: 5, setorSigla: "CONTAB" },
        acao: "ALERTA",
        acaoParametros: { gravidade: "ALTA" },
        nivel: "INFORMAR",
        criado: 41,
      },
      {
        k: "pavim",
        nome: "Buracos e pavimentação vão para a Infraestrutura",
        gatilho: "PALAVRA_CHAVE",
        parametros: { palavras: ["buraco", "asfalto", "pavimentação", "calçamento", "tapa-buraco"], somenteNovos: true },
        acao: "ENCAMINHAR",
        acaoParametros: { setorSigla: "SEINFRA", despacho: "À Secretaria de Infraestrutura para vistoria e programação do reparo." },
        nivel: "EXECUTAR",
        criado: 33,
      },
      {
        k: "luz",
        nome: "Iluminação pública: sugerir Infraestrutura",
        gatilho: "PALAVRA_CHAVE",
        parametros: { palavras: ["iluminação", "lâmpada", "poste"], somenteNovos: true },
        acao: "ENCAMINHAR",
        acaoParametros: { setorSigla: "SEINFRA" },
        nivel: "SUGERIR",
        criado: 33,
      },
      {
        k: "exig",
        nome: "Exigência sem resposta no prazo",
        gatilho: "EXIGENCIA_SEM_RESPOSTA",
        parametros: { diasTolerancia: 0 },
        acao: "ALERTA",
        acaoParametros: { gravidade: "MEDIA" },
        nivel: "INFORMAR",
        criado: 27,
      },
      {
        k: "saude3",
        nome: "Saúde: processo parado há 3 dias",
        gatilho: "PROCESSO_PARADO",
        parametros: { dias: 3, setorSigla: "SESAU" },
        acao: "ALERTA",
        acaoParametros: { gravidade: "BAIXA" },
        nivel: "INFORMAR",
        criado: 45,
      },
    ] as const;
    const regras: Record<string, string> = {};
    for (const r of regraDef) {
      const [x] = await db
        .insert(s.gestaoRegras)
        .values({
          municipioId: M,
          nome: r.nome,
          gatilho: r.gatilho,
          parametros: r.parametros,
          acao: r.acao,
          acaoParametros: r.acaoParametros,
          nivel: r.nivel,
          criadoPorId: U["11111111111"],
          criadoEm: dia(r.criado),
          atualizadoEm: dia(r.criado),
        })
        .returning();
      regras[r.k] = x.id;
      await registrarAuditoria({
        municipioId: M,
        autorId: U["11111111111"],
        acao: "REGRA_CRIADA",
        objetoTipo: "REGRA",
        objetoId: x.id,
        objetoRotulo: r.nome,
        depois: { gatilho: r.gatilho, parametros: r.parametros, acao: r.acao, acaoParametros: r.acaoParametros, nivel: r.nivel },
        criadoEm: dia(r.criado),
      });
    }
    // regra de saúde suspensa depois de gerar alertas demais
    await db.update(s.gestaoRegras).set({ ativa: false, versao: 2, atualizadoEm: dia(20) }).where(eq(s.gestaoRegras.id, regras.saude3));
    await registrarAuditoria({
      municipioId: M,
      autorId: U["11111111111"],
      acao: "REGRA_SUSPENSA",
      objetoTipo: "REGRA",
      objetoId: regras.saude3,
      objetoRotulo: "Saúde: processo parado há 3 dias",
      antes: { ativa: true, versão: 1 },
      depois: { ativa: false, versão: 2 },
      justificativa: "Prazo de 3 dias gera alerta para toda compra em instrução. Rever com a Secretaria de Saúde.",
      criadoEm: dia(20),
    });

    // execuções históricas (registros de rodadas anteriores) e alertas já tratados
    const procs = await db.query.processos.findMany({ where: eq(s.processos.municipioId, M), columns: { id: true, numero: true, assunto: true } });
    const porAssunto = (a: string) => procs.find((p) => p.assunto.startsWith(a))!;
    const transporte = porAssunto("Contratação de serviço de transporte escolar");
    const reforma = porAssunto("Reforma da cobertura");
    const merenda = porAssunto("Aquisição de gêneros alimentícios");
    const medic = porAssunto("Aquisição de medicamentos básicos");
    const hist = [
      { regra: "saude3", v: 1, d: 24, quem: "55555555555", av: 4, itens: [{ p: medic, r: "ALERTA_CRIADO", m: "Sem movimentação há 4 dias em Secretaria de Saúde (limite da regra: 3)." }] },
      { regra: "parado7", v: 1, d: 14, quem: "55555555555", av: 17, itens: [{ p: merenda, r: "ALERTA_CRIADO", m: "Sem movimentação há 36 dias em Secretaria de Educação (limite da regra: 7)." }] },
      { regra: "pavim", v: 1, d: 12, quem: "22222222222", av: 3, itens: [] },
      { regra: "contab", v: 1, d: 8, quem: "55555555555", av: 3, itens: [] },
      {
        regra: "parado7",
        v: 1,
        d: 7,
        quem: "55555555555",
        av: 16,
        itens: [
          { p: merenda, r: "JA_ALERTADO", m: "Sem movimentação há 43 dias em Secretaria de Educação (limite da regra: 7)." },
          { p: transporte, r: "ALERTA_CRIADO", m: "Sem movimentação há 13 dias em Setor de Compras e Licitações (limite da regra: 7)." },
        ],
      },
      { regra: "exig", v: 1, d: 3, quem: "22222222222", av: 1, itens: [] },
    ];
    for (const h of hist) {
      const [ex] = await db
        .insert(s.gestaoExecucoes)
        .values({
          municipioId: M,
          regraId: regras[h.regra],
          regraVersao: h.v,
          usuarioId: U[h.quem],
          origem: "MANUAL",
          avaliados: h.av,
          disparos: h.itens.length,
          itens: h.itens.map((i) => ({ processoId: i.p.id, numero: i.p.numero, motivo: i.m, resultado: i.r })),
          criadoEm: dia(h.d),
        })
        .returning();
      await registrarAuditoria({
        municipioId: M,
        autorId: U[h.quem],
        acao: "REGRA_EXECUTADA",
        objetoTipo: "REGRA",
        objetoId: regras[h.regra],
        objetoRotulo: regraDef.find((r) => r.k === h.regra)!.nome,
        depois: { avaliados: h.av, disparos: h.itens.length, versao: h.v },
        origem: "AUTOMACAO",
        criadoEm: dia(h.d),
      });
      for (const i of h.itens.filter((x) => x.r === "ALERTA_CRIADO")) {
        const tratado = h.d >= 14;
        await db.insert(s.gestaoAlertas).values({
          municipioId: M,
          regraId: regras[h.regra],
          execucaoId: ex.id,
          processoId: i.p.id,
          gravidade: h.regra === "saude3" ? "BAIXA" : "MEDIA",
          titulo: `${i.p.numero} parado há ${i.m.match(/há (\d+) dias/)?.[1] ?? "vários"} dias`,
          detalhe: i.m,
          situacao: tratado ? (h.regra === "saude3" ? "DESCARTADO" : "RESOLVIDO") : "ABERTO",
          criadoEm: dia(h.d),
          encerradoEm: tratado ? dia(h.d - 2) : null,
          encerradoPorId: tratado ? U["55555555555"] : null,
        });
        if (tratado)
          await registrarAuditoria({
            municipioId: M,
            autorId: U["55555555555"],
            acao: h.regra === "saude3" ? "ALERTA_DESCARTADO" : "ALERTA_RESOLVIDO",
            objetoTipo: "ALERTA",
            objetoRotulo: `${i.p.numero} parado`,
            justificativa: h.regra === "saude3" ? "Prazo da regra curto demais; regra será revista." : "Secretaria informou aguardar entrega do fornecedor; acompanhamento semanal.",
            criadoEm: dia(h.d - 2),
          });
      }
    }
    void reforma;

    // execuções reais de hoje: o protocolo roda a regra de pavimentação (encaminha o buraco pelo motor),
    // a controladoria roda as de prazo e de exigência
    await executarRegra(protocolo, regras.pavim);
    await executarRegra(controladora, regras.parado7);
    await executarRegra(controladora, regras.contab);
    await executarRegra(controladora, regras.exig);

    // pedidos que chegaram depois da última rodada (para "rodar agora" na demonstração)
    await engine.abrirProcessoExterno(
      M,
      { pessoaId: ctx.pessoas.juliana, empresaId: null, nomeExibicao: "Juliana Rocha" },
      {
        tipoChave: "REQUERIMENTO",
        assunto: "Poste com lâmpada queimada na Rua Júlio de Castilhos",
        descricao: "O poste em frente ao nº 88 está com a lâmpada queimada há duas semanas; a rua fica escura perto da parada de ônibus.",
      },
    );
    await engine.abrirProcessoExterno(
      M,
      { pessoaId: ctx.pessoas.roberto, empresaId: null, nomeExibicao: "Roberto Lima" },
      {
        tipoChave: "REQUERIMENTO",
        assunto: "Pedido de tapa-buraco na Estrada Geral da Linha Araçá",
        descricao: "A estrada tem vários buracos no trecho do km 3, onde passa o transporte escolar.",
      },
    );

    // ---- 6. integrações simuladas com histórico
    const estados: Record<string, { status: string; resp?: string; pend?: string }> = {
      GOVBR: { status: "SIMULADA", resp: "11111111111", pend: "Adesão ao Login Único em análise; portal usa login simulado." },
      PNCP: { status: "SIMULADA", resp: "33333333333", pend: "Credenciamento do ente pendente; publicação registrada manualmente no processo." },
      LICITACON: { status: "SIMULADA", resp: "55555555555", pend: "Mapeamento do leiaute 2026 em conferência com o controle interno." },
      SICONFI: { status: "SIMULADA", resp: "44444444444" },
      RECEITA_CNPJ: { status: "SIMULADA", resp: "33333333333", pend: "Contrato de acesso a dados ainda não firmado." },
      PIX_BOLETO: { status: "SIMULADA", resp: "77777777777", pend: "Convênio com o banco arrecadador em negociação." },
      NFSE: { status: "NAO_CONFIGURADA" },
      ESUS: { status: "NAO_CONFIGURADA" },
      WHATSAPP: { status: "SIMULADA", resp: "22222222222", pend: "Número oficial e provedor de soluções ainda não contratados." },
    };
    const intIds: Record<string, string> = {};
    for (const c of CATALOGO) {
      const e = estados[c.chave];
      const [r] = await db
        .insert(s.gestaoIntegracoes)
        .values({
          municipioId: M,
          chave: c.chave,
          status: e.status,
          ambiente: "DEMONSTRACAO",
          responsavelId: e.resp ? U[e.resp] : null,
          pendencias: e.pend ?? null,
          ultimoSincronismo: e.status === "SIMULADA" ? new Date(Date.now() - (c.chave.length % 5) * 3600_000 - 40 * 60_000) : null,
          atualizadoEm: dia(30),
        })
        .returning();
      intIds[c.chave] = r.id;
      if (e.status === "SIMULADA")
        await registrarAuditoria({
          municipioId: M,
          autorId: U["11111111111"],
          acao: "INTEGRACAO_CONFIGURADA",
          objetoTipo: "INTEGRACAO",
          objetoId: r.id,
          objetoRotulo: c.nome,
          antes: { situação: "Não configurada" },
          depois: { situação: "Simulada" },
          criadoEm: dia(30),
        });
    }
    const contratados = procs.filter((p) => ["Serviço de dedetização", "Aquisição de mobiliário"].some((a) => p.assunto.startsWith(a)));
    const chamadas: (typeof s.gestaoChamadas.$inferInsert)[] = [];
    let n = 0;
    const h = (x: string) => parseInt(createHash("md5").update(x).digest("hex").slice(0, 6), 16);
    for (const c of CATALOGO) {
      if (estados[c.chave].status !== "SIMULADA") continue;
      for (let d = 13; d >= 0; d -= 1 + (h(c.chave + d) % 3)) {
        c.operacoes.forEach((op, i) => {
          const sorte = h(`${c.chave}:${d}:${i}`) % 100;
          const falha = !!op.resumoFalha && sorte < 18;
          const quando = new Date(Date.now() - d * DIA - (h(c.chave + i + d) % 600) * 60_000);
          n += 1;
          chamadas.push({
            municipioId: M,
            integracaoId: intIds[c.chave],
            operacao: op.operacao,
            direcao: op.direcao,
            status: falha ? (op.direcao === "ENVIO" ? "REJEITADA" : "FALHA") : "SUCESSO",
            idOperacao: `SIM-${c.chave}-${String(n).padStart(5, "0")}`,
            codigo: falha ? (op.direcao === "ENVIO" ? "422" : "503") : "200",
            duracaoMs: 140 + (sorte * 13) % 900,
            resumo: falha ? op.resumoFalha! : op.resumoOk,
            simulada: true,
            processoId: c.chave === "PNCP" && op.direcao === "ENVIO" ? contratados[d % contratados.length]?.id ?? null : null,
            usuarioId: estados[c.chave].resp ? U[estados[c.chave].resp!] : null,
            criadoEm: quando,
          });
        });
      }
    }
    await db.insert(s.gestaoChamadas).values(chamadas);

    // ---- 7. auditoria de acessos: servidora desligada e ajustes de papéis
    const [claudia] = await db
      .insert(s.usuarios)
      .values({
        municipioId: M,
        cpf: "13131313131",
        nome: "Cláudia Ferraz",
        email: "claudia.ferraz@valedasaraucarias.rs.gov.br",
        cargo: "Agente de contratação (exonerada)",
        papeis: ["COMPRAS"],
        senhaHash: (await db.query.usuarios.findFirst({ where: eq(s.usuarios.id, U["11111111111"]) }))!.senhaHash,
        setorId: ctx.setores.COMPRAS,
        ativo: false,
        criadoEm: dia(400),
      })
      .returning();
    const acessos = [
      {
        acao: "USUARIO_DESATIVADO",
        alvo: claudia,
        antes: { ativo: true },
        depois: { ativo: false },
        just: "Exoneração a pedido — Portaria 98/2026. Histórico assinado preservado.",
        d: 35,
      },
      {
        acao: "USUARIO_PAPEIS",
        alvo: { id: U["88888888888"], nome: "Dr. Marcos Secretário" },
        antes: { papéis: ["SECRETARIO", "REQUISITANTE"] },
        depois: { papéis: ["SECRETARIO", "REQUISITANTE", "FISCAL"] },
        just: "Portaria 104/2026 — designação como fiscal do contrato de oxigênio medicinal.",
        d: 31,
      },
      {
        acao: "USUARIO_PAPEIS",
        alvo: { id: U["12121212121"], nome: "Sandra Administração" },
        antes: { papéis: ["SECRETARIO", "REQUISITANTE"] },
        depois: { papéis: ["SECRETARIO", "REQUISITANTE", "ORDENADOR"] },
        just: "Decreto 2.311/2026 — delegação de ordenação de despesa da Secretaria de Administração.",
        d: 26,
      },
      {
        acao: "USUARIO_SETOR",
        alvo: { id: U["99999999999"], nome: "Fernanda Requisitante" },
        antes: { setor: "Secretaria de Administração" },
        depois: { setor: "Secretaria de Saúde" },
        just: "Lotação na coordenação das UBS — Portaria 101/2026.",
        d: 29,
      },
    ];
    for (const a of acessos)
      await registrarAuditoria({
        municipioId: M,
        autorId: U["11111111111"],
        acao: a.acao,
        objetoTipo: "USUARIO",
        objetoId: a.alvo.id,
        objetoRotulo: a.alvo.nome,
        antes: a.antes,
        depois: a.depois,
        justificativa: a.just,
        criadoEm: dia(a.d),
      });
  },
};

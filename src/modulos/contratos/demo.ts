// Demonstração do módulo de contratos: 12 contratos de um município da Serra gaúcha, com aditivos, apostilamentos,
// notas em todos os estágios (atesto, glosa, liquidação, fila cronológica, pago) e três obras com cronograma e medições.
// Datas relativas a hoje, para os alertas (vigência, atesto, desvio da obra) continuarem verdadeiros a cada nova carga.
import { and, eq } from "drizzle-orm";
import type { DemoCtx, ModuloDemo } from "@/db/demo/contexto";
import * as schema from "@/db/schema";
import type { SessaoUsuario } from "@/lib/auth";
import type { Papel } from "@/lib/workflow";
import { valorMedicao } from "./regras";
import { TIPO_PAGAMENTO_CONTRATO } from "./fluxo";

/** CNPJ fictício com dígitos verificadores válidos (mesma regra de cnpjValido). */
function cnpj(base12: string) {
  const calc = (b: string) => {
    const pesos = b.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const r = b.split("").reduce((a, n, i) => a + Number(n) * pesos[i], 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = calc(base12);
  return base12 + d1 + calc(base12 + d1);
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/** data a n dias de hoje (negativo = passado), AAAA-MM-DD */
const d = (n: number) => iso(new Date(Date.now() + n * 86400_000));
/** competência a k meses do mês atual */
const m = (k: number) => {
  const h = new Date();
  const t = h.getFullYear() * 12 + h.getMonth() + k;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
};
/** dia útil aproximado do mês seguinte à competência (emissão da nota) */
const emissao = (comp: string, dia = 5) => {
  const [a, mm] = comp.split("-").map(Number);
  const x = new Date(a, mm, dia);
  return iso(x > new Date() ? new Date(Date.now() - 86400_000) : x);
};
const reais = (v: number) => (Math.round(v * 100) / 100).toFixed(2);

export const contratosDemo: ModuloDemo = {
  nome: "Contratos, obras e portal do fornecedor",
  async aplicar(ctx: DemoCtx) {
    const db = ctx.db;
    const ops = await import("./operacoes");
    const engine = await import("@/lib/engine");

    // ---- tipo de processo de pagamento de contrato (liquidação → fila cronológica → pago) ----
    const ja = await db.query.tiposProcesso.findFirst({
      where: and(eq(schema.tiposProcesso.municipioId, ctx.municipioId), eq(schema.tiposProcesso.chave, TIPO_PAGAMENTO_CONTRATO.chave)),
    });
    if (!ja)
      await db.insert(schema.tiposProcesso).values({
        municipioId: ctx.municipioId,
        chave: TIPO_PAGAMENTO_CONTRATO.chave,
        nome: TIPO_PAGAMENTO_CONTRATO.nome,
        descricao: TIPO_PAGAMENTO_CONTRATO.descricao,
        definicao: TIPO_PAGAMENTO_CONTRATO.definicao,
      });

    // ---- servidores da infraestrutura (fiscal de obras e secretário) ----
    const senha = (await db.query.usuarios.findFirst({ where: eq(schema.usuarios.id, ctx.usuarios["11111111111"]) }))!.senhaHash;
    const novosUsuarios: [string, string, string, string, Papel[]][] = [
      ["15151515151", "Ricardo Bortolini", "obras@valedasaraucarias.rs.gov.br", "Engenheiro civil, fiscal de obras", ["FISCAL", "REQUISITANTE"]],
      ["16161616161", "Valdir Zanella", "infraestrutura@valedasaraucarias.rs.gov.br", "Secretário de Infraestrutura", ["SECRETARIO", "REQUISITANTE", "FISCAL"]],
    ];
    for (const [cpf, nome, email, cargo, papeis] of novosUsuarios) {
      await db
        .insert(schema.usuarios)
        .values({ municipioId: ctx.municipioId, cpf, nome, email, cargo, papeis, senhaHash: senha, setorId: ctx.setores.SEINFRA })
        .onConflictDoNothing();
      const u = await db.query.usuarios.findFirst({ where: and(eq(schema.usuarios.municipioId, ctx.municipioId), eq(schema.usuarios.cpf, cpf)) });
      ctx.usuarios[cpf] = u!.id;
    }
    const U = ctx.usuarios;
    const RICARDO = U["15151515151"];
    const VALDIR = U["16161616161"];

    async function sessao(cpf: string): Promise<SessaoUsuario> {
      const u = (await db.query.usuarios.findFirst({ where: eq(schema.usuarios.id, U[cpf]), with: { setor: true, municipio: true } }))!;
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

    // ---- empresas contratadas que ainda não existem no cadastro ----
    const end = (logradouro: string, numero: string, bairro: string, cidade = "Vale das Araucárias") => ({ logradouro, numero, bairro, cidade, uf: "RS", cep: "95200-000" });
    const novasEmpresas: [string, string, string, string, string, string[], ReturnType<typeof end>][] = [
      ["serrano", cnpj("318204560001"), "Transportes Serrano Ltda", "Transportes Serrano", "EPP", ["4924-8/00"], end("Rua Os Dezoito do Forte", "1220", "São Pelegrino")],
      ["ecoserra", cnpj("274519830001"), "Ecoserra Coleta e Transporte de Resíduos Ltda", "Ecoserra", "DEMAIS", ["3811-4/00"], end("RS-122, km 64", "s/n", "Distrito Industrial")],
      ["cooperativa", cnpj("234561780001"), "Cooperativa Agricultura Familiar do Vale Ltda", "Coopervale", "DEMAIS", ["4623-1/99"], end("Estrada Linha Bonita", "km 3", "Interior")],
      ["dedetizadora", cnpj("663399880001"), "Dedetizadora Limpa Mais Ltda", "Limpa Mais", "ME", ["8122-2/00"], end("Rua Garibaldi", "315", "Centro")],
      ["limpaserra", cnpj("195730460001"), "Limpa Serra Serviços Ltda", "Limpa Serra", "EPP", ["8121-4/00"], end("Rua Tiradentes", "88", "Centro")],
      ["climatiza", cnpj("382641970001"), "Climatiza Sul Refrigeração Ltda", "Climatiza Sul", "ME", ["4322-3/02"], end("Av. Rio Branco", "2100", "Rio Branco", "Caxias do Sul")],
      ["serraalta", cnpj("126948350001"), "Construtora Serra Alta Ltda", "Serra Alta", "DEMAIS", ["4211-1/01"], end("Rua Sinimbu", "1870", "Centro", "Caxias do Sul")],
      ["ampliar", cnpj("409173620001"), "Ampliar Engenharia e Construções Ltda", "Ampliar Engenharia", "EPP", ["4120-4/00"], end("Rua Coberta", "45", "Centro", "Bento Gonçalves")],
      ["pilarsul", cnpj("357280140001"), "Pilar Sul Construções Ltda", "Pilar Sul", "DEMAIS", ["4120-4/00"], end("Av. Itália", "990", "São Bento", "Bento Gonçalves")],
    ];
    const E: Record<string, string> = { ...ctx.empresas };
    for (const [k, c, razaoSocial, nomeFantasia, porte, atividades, endereco] of novasEmpresas) {
      await db.insert(schema.empresas).values({ cnpj: c, razaoSocial, nomeFantasia, porte, atividades, endereco }).onConflictDoNothing();
      E[k] = (await db.query.empresas.findFirst({ where: eq(schema.empresas.cnpj, c) }))!.id;
    }

    const procPorAssunto = async (assunto: string) =>
      (await db.query.processos.findFirst({ where: and(eq(schema.processos.municipioId, ctx.municipioId), eq(schema.processos.assunto, assunto)) }))?.id ?? null;

    // ---- helpers de inserção ----
    type C = typeof schema.contratos.$inferInsert;
    async function contrato(v: Omit<C, "municipioId" | "criadoPorId">) {
      const [c] = await db
        .insert(schema.contratos)
        .values({ ...v, municipioId: ctx.municipioId, criadoPorId: U["33333333333"] })
        .returning();
      return c;
    }
    type NotaDemo = {
      numero: string;
      valor: number;
      comp: string;
      situacao?: "PAGA" | "AGUARDANDO_ATESTO" | "ATESTADA" | "GLOSADA";
      criadaHa?: number;
      pagaHa?: number;
      portal?: string;
      descricao?: string;
      medicaoId?: string;
      glosa?: string;
    };
    async function nota(contratoId: string, fiscalId: string, n: NotaDemo) {
      const situacao = n.situacao ?? "PAGA";
      const criada = ctx.dia(n.criadaHa ?? 0);
      const [x] = await db
        .insert(schema.contratoNotas)
        .values({
          contratoId,
          numero: n.numero,
          valor: reais(n.valor),
          competencia: n.comp,
          emitidaEm: n.criadaHa != null ? iso(ctx.dia(n.criadaHa + 1)) : emissao(n.comp),
          descricao: n.descricao ?? null,
          medicaoId: n.medicaoId ?? null,
          origem: n.portal ? "PORTAL" : "INTERNO",
          enviadaPorPessoaId: n.portal ?? null,
          registradaPorId: n.portal ? null : U["22222222222"],
          situacao,
          atestadaEm: situacao === "PAGA" || situacao === "GLOSADA" ? criada : null,
          atestadaPorId: situacao === "PAGA" || situacao === "GLOSADA" ? fiscalId : null,
          glosaMotivo: n.glosa ?? null,
          pagaEm: situacao === "PAGA" ? ctx.dia(n.pagaHa ?? 20) : null,
          criadoEm: criada,
        })
        .returning();
      return x;
    }
    /** Notas históricas pagas, uma por competência, com data de pagamento ~25 dias depois do mês. */
    async function historico(contratoId: string, fiscalId: string, prefixo: number, itens: [number, number][]) {
      let i = 0;
      for (const [k, valor] of itens) {
        const diasAtras = Math.max(3, -k * 30 - 25);
        await nota(contratoId, fiscalId, { numero: String(prefixo + i * 37), valor, comp: m(k), criadaHa: Math.max(4, -k * 30 - 8), pagaHa: diasAtras });
        i++;
      }
    }

    // ===================================================================
    // 1. Mendes Materiais — material de construção (Carlos é o responsável no portal)
    // ===================================================================
    const cMendes = await contrato({
      ano: Number(d(-262).slice(0, 4)),
      numero: 12,
      objeto: "Fornecimento parcelado de material de construção (cimento, areia, brita, tijolos e ferragens) para manutenção de prédios e vias",
      natureza: "COMPRA",
      modalidade: "PREGAO",
      empresaId: E.mendes,
      setorId: ctx.setores.SEINFRA,
      unidadeGestoraId: ctx.ugs["01"],
      valorGlobal: "186400.00",
      fonte: "ORDINARIOS",
      assinadoEm: d(-262),
      vigenciaInicio: d(-260),
      vigenciaFim: d(105),
      fiscalId: RICARDO,
      gestorId: VALDIR,
    });
    await historico(cMendes.id, RICARDO, 1184, [
      [-7, 18320],
      [-6, 22870.4],
      [-5, 15410],
      [-4, 26980.5],
      [-3, 19044],
    ]);
    const nMendesFila = await nota(cMendes.id, RICARDO, { numero: "1449", valor: 21300, comp: m(-2), situacao: "AGUARDANDO_ATESTO", criadaHa: 24, descricao: "Cimento CP-II, brita 1 e tijolos para a reforma do galpão da Secretaria de Obras" });
    const nMendesAtestada = await nota(cMendes.id, RICARDO, { numero: "1488", valor: 17655.8, comp: m(-1), situacao: "AGUARDANDO_ATESTO", criadaHa: 12, descricao: "Ferragens e areia para recuperação de bueiros na Linha Bonita" });
    await nota(cMendes.id, RICARDO, {
      numero: "1503",
      valor: 12480,
      comp: m(0),
      situacao: "AGUARDANDO_ATESTO",
      criadaHa: 9,
      portal: ctx.pessoas.carlos,
      descricao: "Tijolos e argamassa para a calçada da Praça Central",
    });

    // ===================================================================
    // 2. Hidrobombas Sertão — conjuntos motobomba (Roberto no portal)
    // ===================================================================
    const cHidro = await contrato({
      ano: Number(d(-228).slice(0, 4)),
      numero: 18,
      objeto: "Fornecimento e instalação de conjuntos motobomba submersos para poços artesianos das comunidades do interior",
      natureza: "COMPRA",
      modalidade: "PREGAO",
      empresaId: E.hidrobombas,
      setorId: ctx.setores.SEINFRA,
      unidadeGestoraId: ctx.ugs["01"],
      valorGlobal: "142800.00",
      fonte: "CONVENIOS",
      assinadoEm: d(-228),
      vigenciaInicio: d(-226),
      vigenciaFim: d(47),
      fiscalId: RICARDO,
      gestorId: VALDIR,
    });
    await db.insert(schema.contratoAditivos).values({
      contratoId: cHidro.id,
      numero: 1,
      tipo: "VALOR",
      valor: "18400.00",
      justificativa: "Inclusão de dois poços da comunidade de Linha Bonita, perfurados com recursos do mesmo convênio estadual.",
      assinadoEm: d(-90),
      acrescimoAcumulado: "12.89",
      acimaDoLimite: false,
      criadoPorId: U["33333333333"],
    });
    await historico(cHidro.id, RICARDO, 3021, [
      [-6, 35700],
      [-4, 28560],
    ]);
    const nHidroPago = await nota(cHidro.id, RICARDO, { numero: "3112", valor: 21420, comp: m(-2), situacao: "AGUARDANDO_ATESTO", criadaHa: 30, descricao: "2 conjuntos motobomba 3 cv instalados nos poços de São Roque" });
    const nHidroFila = await nota(cHidro.id, RICARDO, { numero: "3140", valor: 24990, comp: m(-1), situacao: "AGUARDANDO_ATESTO", criadaHa: 14, descricao: "Conjunto motobomba 5 cv e quadro de comando — poço de Linha Bonita" });
    await nota(cHidro.id, RICARDO, { numero: "3168", valor: 9870, comp: m(0), situacao: "AGUARDANDO_ATESTO", criadaHa: 2, portal: ctx.pessoas.roberto, descricao: "Cabos e bóias de nível para os poços de Linha Bonita" });

    // ===================================================================
    // 3. Distribuidora Médica Cariri — medicamentos (Marta no portal). Saldo abaixo de 10%.
    // ===================================================================
    const cCariri = await contrato({
      ano: Number(d(-282).slice(0, 4)),
      numero: 7,
      objeto: "Fornecimento de medicamentos da farmácia básica (RENAME) para as 4 UBS e a farmácia central",
      natureza: "COMPRA",
      modalidade: "PREGAO",
      empresaId: E.cariri,
      setorId: ctx.setores.SESAU,
      unidadeGestoraId: ctx.ugs["02"],
      valorGlobal: "412000.00",
      fonte: "SAUDE",
      assinadoEm: d(-282),
      vigenciaInicio: d(-280),
      vigenciaFim: d(82),
      fiscalId: U["88888888888"],
      gestorId: U["99999999999"],
    });
    await historico(cCariri.id, U["88888888888"], 20411, [
      [-9, 41200],
      [-8, 44870],
      [-7, 39990],
      [-6, 46310],
      [-5, 42880],
      [-4, 45120],
      [-3, 43760],
    ]);
    const nCaririFila = await nota(cCariri.id, U["88888888888"], { numero: "20744", valor: 38940, comp: m(-2), situacao: "AGUARDANDO_ATESTO", criadaHa: 26, descricao: "Reposição mensal: anti-hipertensivos, insulina NPH e antibióticos" });
    const nCaririLiq = await nota(cCariri.id, U["88888888888"], { numero: "20781", valor: 37110, comp: m(-1), situacao: "AGUARDANDO_ATESTO", criadaHa: 8, descricao: "Reposição mensal da farmácia central" });
    await nota(cCariri.id, U["88888888888"], {
      numero: "20809",
      valor: 18450,
      comp: m(0),
      situacao: "AGUARDANDO_ATESTO",
      criadaHa: 1,
      portal: ctx.pessoas.marta,
      descricao: "Pedido complementar: dipirona, amoxicilina e soro de reidratação",
    });

    // ===================================================================
    // 4. Transporte escolar — serviço contínuo prorrogado (art. 107) e reajustado
    // ===================================================================
    const cTransp = await contrato({
      ano: Number(d(-640).slice(0, 4)),
      numero: 21,
      objeto: "Transporte escolar de alunos da rede municipal em 6 rotas urbanas e rurais",
      natureza: "SERVICO_CONTINUO",
      modalidade: "PREGAO",
      empresaId: E.serrano,
      setorId: ctx.setores.SEDUC,
      unidadeGestoraId: ctx.ugs["01"],
      valorGlobal: "598000.00",
      fonte: "EDUCACAO",
      assinadoEm: d(-640),
      vigenciaInicio: d(-635),
      vigenciaFim: d(-270),
      fiscalId: U["10101010101"],
      gestorId: U["12121212121"],
    });
    await db.insert(schema.contratoAditivos).values({
      contratoId: cTransp.id,
      numero: 1,
      tipo: "RENOVACAO",
      valor: "598000.00",
      novaVigenciaFim: d(52),
      justificativa: "Prorrogação por 12 meses do serviço contínuo (art. 107), com preços vantajosos comprovados por pesquisa e boa avaliação da execução.",
      assinadoEm: d(-280),
      acrescimoAcumulado: "0.00",
      acimaDoLimite: false,
      criadoPorId: U["33333333333"],
    });
    await db.insert(schema.contratoApostilamentos).values({
      contratoId: cTransp.id,
      numero: 1,
      tipo: "REAJUSTE",
      indice: "IPCA",
      percentual: "4.8300",
      valor: "28883.40",
      descricao: "Reajuste anual pelo IPCA acumulado de 12 meses, aplicado ao saldo do período prorrogado.",
      data: d(-268),
      criadoPorId: U["33333333333"],
    });
    await historico(
      cTransp.id,
      U["10101010101"],
      551,
      [-20, -19, -18, -17, -16, -15, -14, -13, -12, -11, -10].map((k) => [k, 54363.64] as [number, number]),
    );
    await historico(
      cTransp.id,
      U["10101010101"],
      1010,
      [-8, -7, -6, -5, -4, -3, -2].map((k) => [k, 56990.5] as [number, number]),
    );
    await nota(cTransp.id, U["10101010101"], { numero: "1290", valor: 56990.5, comp: m(-1), situacao: "AGUARDANDO_ATESTO", criadaHa: 4, descricao: "Transporte escolar — 21 dias letivos, 6 rotas" });

    // ===================================================================
    // 5. Coleta de lixo — acréscimos acima de 25% e vigência terminando
    // ===================================================================
    const cColeta = await contrato({
      ano: Number(d(-488).slice(0, 4)),
      numero: 33,
      objeto: "Coleta, transporte e destinação final de resíduos sólidos urbanos, com coleta seletiva",
      natureza: "SERVICO_CONTINUO",
      modalidade: "CONCORRENCIA",
      empresaId: E.ecoserra,
      setorId: ctx.setores.SEINFRA,
      unidadeGestoraId: ctx.ugs["01"],
      valorGlobal: "1104000.00",
      fonte: "ORDINARIOS",
      assinadoEm: d(-488),
      vigenciaInicio: d(-485),
      vigenciaFim: d(-120),
      fiscalId: VALDIR,
      gestorId: U["12121212121"],
    });
    await db.insert(schema.contratoAditivos).values([
      {
        contratoId: cColeta.id,
        numero: 1,
        tipo: "VALOR",
        valor: "198720.00",
        justificativa: "Inclusão da coleta seletiva nos bairros Medianeira e São Cristóvão, com 2 caminhões a mais por semana.",
        assinadoEm: d(-330),
        acrescimoAcumulado: "18.00",
        acimaDoLimite: false,
        criadoPorId: U["33333333333"],
      },
      {
        contratoId: cColeta.id,
        numero: 2,
        tipo: "PRAZO_VALOR",
        valor: "99360.00",
        novaVigenciaFim: d(17),
        justificativa: "Prorrogação por 4 meses até a conclusão da nova concorrência, com inclusão da coleta nos distritos de Lagoa Seca e São Roque.",
        assinadoEm: d(-125),
        acrescimoAcumulado: "27.00",
        acimaDoLimite: true,
        criadoPorId: U["33333333333"],
      },
    ]);
    await db.insert(schema.contratoApostilamentos).values({
      contratoId: cColeta.id,
      numero: 1,
      tipo: "REAJUSTE",
      indice: "IPCA",
      percentual: "4.6200",
      valor: "18914.00",
      descricao: "Reajuste anual pelo IPCA sobre o saldo remanescente.",
      data: d(-118),
      criadoPorId: U["33333333333"],
    });
    await historico(
      cColeta.id,
      VALDIR,
      7701,
      [-14, -13, -12, -11, -10, -9, -8, -7, -6, -5, -4, -3, -2].map((k) => [k, k <= -11 ? 92000 : 98400] as [number, number]),
    );
    const nColeta = await nota(cColeta.id, VALDIR, { numero: "8221", valor: 98400, comp: m(-1), situacao: "AGUARDANDO_ATESTO", criadaHa: 6, descricao: "Coleta e destinação — 1.012 toneladas no mês" });

    // ===================================================================
    // 6. Merenda — chamada pública da agricultura familiar, ligada ao processo de compra
    // ===================================================================
    const cMerenda = await contrato({
      ano: Number(d(-58).slice(0, 4)),
      numero: 15,
      objeto: "Aquisição de gêneros alimentícios da agricultura familiar para a alimentação escolar (PNAE)",
      natureza: "COMPRA",
      modalidade: "CHAMADA_PUBLICA",
      empresaId: E.cooperativa,
      processoOrigemId: await procPorAssunto("Aquisição de gêneros alimentícios — merenda escolar"),
      setorId: ctx.setores.SEDUC,
      unidadeGestoraId: ctx.ugs["01"],
      valorGlobal: "298400.00",
      fonte: "EDUCACAO",
      assinadoEm: d(-58),
      vigenciaInicio: d(-58),
      vigenciaFim: d(63),
      fiscalId: U["10101010101"],
      gestorId: U["12121212121"],
    });
    const nMerendaPago = await nota(cMerenda.id, U["10101010101"], { numero: "412", valor: 48620, comp: m(-1), situacao: "AGUARDANDO_ATESTO", criadaHa: 25, descricao: "Hortifrutigranjeiros, leite e pão para 14 escolas" });
    await nota(cMerenda.id, U["10101010101"], { numero: "437", valor: 23880, comp: m(0), situacao: "AGUARDANDO_ATESTO", criadaHa: 3, descricao: "Entregas da primeira quinzena" });

    // ===================================================================
    // 7. Dedetização — recém-assinado, ligado ao processo de dispensa
    // ===================================================================
    await contrato({
      ano: Number(d(-22).slice(0, 4)),
      numero: 41,
      objeto: "Dedetização e desratização de 14 prédios públicos, com 3 aplicações no ano",
      natureza: "SERVICO",
      modalidade: "DISPENSA",
      empresaId: E.dedetizadora,
      processoOrigemId: await procPorAssunto("Serviço de dedetização dos prédios públicos"),
      setorId: ctx.setores.SEMAD,
      unidadeGestoraId: ctx.ugs["01"],
      valorGlobal: "12650.00",
      fonte: "ORDINARIOS",
      assinadoEm: d(-22),
      vigenciaInicio: d(-22),
      vigenciaFim: d(343),
      fiscalId: U["12121212121"],
      gestorId: U["33333333333"],
    });

    // ===================================================================
    // 8. Limpeza — encerrado por fim da vigência; 9. Ar-condicionado — rescindido
    // ===================================================================
    const cLimpeza = await contrato({
      ano: Number(d(-730).slice(0, 4)),
      numero: 52,
      objeto: "Limpeza e conservação dos prédios da administração municipal",
      natureza: "SERVICO_CONTINUO",
      modalidade: "PREGAO",
      empresaId: E.limpaserra,
      setorId: ctx.setores.SEMAD,
      unidadeGestoraId: ctx.ugs["01"],
      valorGlobal: "236000.00",
      fonte: "ORDINARIOS",
      assinadoEm: d(-730),
      vigenciaInicio: d(-725),
      vigenciaFim: d(-360),
      fiscalId: U["12121212121"],
      gestorId: U["33333333333"],
      situacao: "ENCERRADO",
      encerradoEm: d(-360),
      motivoEncerramento: "Término da vigência. O serviço passou a ser prestado por servidores efetivos após concurso.",
    });
    await historico(
      cLimpeza.id,
      U["12121212121"],
      301,
      [-23, -22, -21, -20, -19, -18, -17, -16, -15, -14, -13, -12].map((k) => [k, 19666.66] as [number, number]),
    );
    const cAr = await contrato({
      ano: Number(d(-300).slice(0, 4)),
      numero: 3,
      objeto: "Manutenção preventiva e corretiva de 86 aparelhos de ar-condicionado dos prédios públicos",
      natureza: "SERVICO",
      modalidade: "PREGAO",
      empresaId: E.climatiza,
      setorId: ctx.setores.SEMAD,
      unidadeGestoraId: ctx.ugs["01"],
      valorGlobal: "64800.00",
      fonte: "ORDINARIOS",
      assinadoEm: d(-300),
      vigenciaInicio: d(-298),
      vigenciaFim: d(65),
      fiscalId: U["12121212121"],
      gestorId: U["33333333333"],
      situacao: "RESCINDIDO",
      encerradoEm: d(-130),
      motivoEncerramento:
        "Rescisão unilateral por inexecução parcial (art. 137, I, da Lei 14.133): três ordens de serviço não atendidas no prazo, mesmo após notificação. Multa aplicada em processo próprio.",
    });
    await historico(cAr.id, U["12121212121"], 88, [
      [-9, 5400],
      [-8, 5400],
      [-7, 3150],
    ]);

    // ===================================================================
    // Obras: cronograma por etapa (% previsto por mês), medições mensais e diário
    // ===================================================================
    type EtapaDemo = [string, number, number[]];
    async function obra(
      v: Omit<C, "municipioId" | "criadoPorId" | "obraInicio" | "natureza" | "valorGlobal"> & { natureza: "OBRA" | "REFORMA"; inicioMes: number },
      etapas: EtapaDemo[],
      medicoes: Record<number, number>[],
      notasMed: { situacao: "PAGA" | "AGUARDANDO_ATESTO" | "SEM_NOTA"; numero?: string; criadaHa?: number }[],
    ) {
      const total = etapas.reduce((s, e) => s + e[1], 0);
      const inicio = `${m(v.inicioMes)}-01`;
      const c = await contrato({ ...v, valorGlobal: reais(total), obraInicio: inicio, obraSituacao: "EM_EXECUCAO" });
      const ets = await db
        .insert(schema.contratoEtapas)
        .values(etapas.map(([nome, valor, previsto], i) => ({ contratoId: c.id, ordem: i + 1, nome, valor: reais(valor), previsto })))
        .returning();
      const ets2 = ets.sort((a, b) => a.ordem - b.ordem);
      const notas: (typeof schema.contratoNotas.$inferSelect | null)[] = [];
      for (let i = 0; i < medicoes.length; i++) {
        const comp = m(v.inicioMes + i);
        const executado = Object.fromEntries(Object.entries(medicoes[i]).map(([idx, pct]) => [ets2[Number(idx)].id, pct]));
        const valor = valorMedicao(ets2, executado);
        const [med] = await db
          .insert(schema.contratoMedicoes)
          .values({
            contratoId: c.id,
            numero: i + 1,
            competencia: comp,
            executado,
            valor: reais(valor),
            registradaPorId: v.fiscalId,
            criadoEm: ctx.dia(Math.max(1, -(v.inicioMes + i) * 30 - 3)),
          })
          .returning();
        const nm = notasMed[i];
        if (!nm || nm.situacao === "SEM_NOTA") {
          notas.push(null);
          continue;
        }
        notas.push(
          await nota(c.id, v.fiscalId!, {
            numero: nm.numero ?? String(900 + i),
            valor: Math.round(valor * 100) / 100,
            comp,
            situacao: nm.situacao === "PAGA" ? "PAGA" : "AGUARDANDO_ATESTO",
            criadaHa: nm.criadaHa ?? Math.max(4, -(v.inicioMes + i) * 30 - 6),
            pagaHa: Math.max(3, -(v.inicioMes + i) * 30 - 28),
            medicaoId: med.id,
            descricao: `Medição ${i + 1}`,
          }),
        );
      }
      return { c, notas, ets: ets2 };
    }

    // 10. Pavimentação — em dia
    const pav = await obra(
      {
        ano: Number(d(-175).slice(0, 4)),
        numero: 24,
        natureza: "OBRA",
        inicioMes: -5,
        objeto: "Pavimentação asfáltica da Rua Ernesto Alves e travessas, Bairro São Cristóvão (2,4 km)",
        modalidade: "CONCORRENCIA",
        empresaId: E.serraalta,
        setorId: ctx.setores.SEINFRA,
        unidadeGestoraId: ctx.ugs["01"],
        fonte: "CONVENIOS",
        assinadoEm: d(-175),
        vigenciaInicio: d(-170),
        vigenciaFim: d(250),
        obraLocal: "Rua Ernesto Alves e travessas — Bairro São Cristóvão",
        obraPrevisaoFim: d(70),
        fiscalId: RICARDO,
        gestorId: VALDIR,
      },
      [
        ["Serviços preliminares e mobilização", 64230, [60, 40, 0, 0, 0, 0, 0, 0]],
        ["Drenagem pluvial", 282612, [0, 30, 40, 30, 0, 0, 0, 0]],
        ["Base e sub-base", 359688, [0, 0, 20, 30, 30, 20, 0, 0]],
        ["Revestimento asfáltico (CBUQ)", 449610, [0, 0, 0, 0, 20, 30, 30, 20]],
        ["Calçadas, meio-fio e sinalização", 128460, [0, 0, 0, 0, 0, 20, 40, 40]],
      ],
      [{ 0: 60 }, { 0: 40, 1: 28 }, { 1: 40, 2: 18 }, { 1: 32, 2: 30 }, { 2: 31, 3: 18 }],
      [{ situacao: "PAGA", numero: "201" }, { situacao: "PAGA", numero: "214" }, { situacao: "PAGA", numero: "229" }, { situacao: "AGUARDANDO_ATESTO", numero: "241", criadaHa: 27 }, { situacao: "AGUARDANDO_ATESTO", numero: "256", criadaHa: 3 }],
    );

    // 11. Reforma da escola — atrasada (desvio acima de 10 pontos)
    const ref = await obra(
      {
        ano: Number(d(-140).slice(0, 4)),
        numero: 27,
        natureza: "REFORMA",
        inicioMes: -4,
        objeto: "Reforma e ampliação da EMEF Santa Rita de Cássia: cobertura nova, 2 salas de aula e acessibilidade",
        modalidade: "CONCORRENCIA",
        empresaId: E.ampliar,
        setorId: ctx.setores.SEDUC,
        unidadeGestoraId: ctx.ugs["01"],
        fonte: "EDUCACAO",
        assinadoEm: d(-140),
        vigenciaInicio: d(-135),
        vigenciaFim: d(120),
        obraLocal: "Rua Santa Rita, 410 — Bairro Medianeira",
        obraPrevisaoFim: d(90),
        obraMotivo:
          "Atraso na entrega das telhas termoacústicas pelo fabricante e chuvas acima da média em setembro. A empresa foi notificada e apresentou plano de recuperação, em análise pela fiscalização.",
        fiscalId: RICARDO,
        gestorId: U["10101010101"],
      },
      [
        ["Demolições e retirada da cobertura antiga", 38904, [70, 30, 0, 0, 0, 0]],
        ["Estrutura metálica e cobertura nova", 165342, [0, 30, 30, 20, 20, 0]],
        ["Alvenaria das 2 salas novas", 116712, [0, 10, 30, 30, 30, 0]],
        ["Instalações elétricas e hidráulicas", 77808, [0, 0, 10, 30, 30, 30]],
        ["Acessibilidade, pisos e pintura", 87534, [0, 0, 0, 10, 40, 50]],
      ],
      [{ 0: 70 }, { 0: 30, 1: 25, 2: 15 }, { 1: 25, 2: 25 }, { 1: 15, 2: 20, 3: 15 }],
      [{ situacao: "PAGA", numero: "57" }, { situacao: "PAGA", numero: "63" }, { situacao: "SEM_NOTA" }, { situacao: "SEM_NOTA" }],
    );
    await db.insert(schema.contratoAditivos).values([
      {
        contratoId: ref.c.id,
        numero: 1,
        tipo: "VALOR",
        valor: "58356.00",
        justificativa: "Substituição da rede elétrica antiga, em condição de risco, encontrada após a demolição do forro.",
        assinadoEm: d(-40),
        acrescimoAcumulado: "12.00",
        acimaDoLimite: false,
        criadoPorId: U["33333333333"],
      },
    ]);
    // medição 3: nota glosada (valor acima do medido) e reenviada com o valor correto
    const med3 = (await db.query.contratoMedicoes.findFirst({ where: and(eq(schema.contratoMedicoes.contratoId, ref.c.id), eq(schema.contratoMedicoes.numero, 3)) }))!;
    await nota(ref.c.id, RICARDO, {
      numero: "71",
      valor: Number(med3.valor) + 12400,
      comp: med3.competencia,
      situacao: "GLOSADA",
      criadaHa: 20,
      medicaoId: med3.id,
      descricao: "Medição 3",
      glosa: `A nota soma R$ 12.400,00 a mais que o boletim da medição 3. Emita nova nota com o valor medido (${Number(med3.valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}).`,
    });
    const nRefLiq = await nota(ref.c.id, RICARDO, { numero: "74", valor: Number(med3.valor), comp: med3.competencia, situacao: "AGUARDANDO_ATESTO", criadaHa: 15, medicaoId: med3.id, descricao: "Medição 3 (nota corrigida)" });
    await db
      .update(schema.contratos)
      .set({ vigenciaFim: d(60) })
      .where(eq(schema.contratos.id, ref.c.id));
    await db.insert(schema.contratoAditivos).values({
      contratoId: ref.c.id,
      numero: 2,
      tipo: "PRAZO",
      valor: "0",
      novaVigenciaFim: d(120),
      justificativa: "Prorrogação de 60 dias pelo atraso no fornecimento das telhas, fato alheio à vontade das partes.",
      assinadoEm: d(-10),
      acrescimoAcumulado: "12.00",
      acimaDoLimite: false,
      criadoPorId: U["33333333333"],
    });

    // 12. UBS Medianeira — em dia, levemente abaixo do previsto
    const ubs = await obra(
      {
        ano: Number(d(-220).slice(0, 4)),
        numero: 11,
        natureza: "OBRA",
        inicioMes: -7,
        objeto: "Construção da Unidade Básica de Saúde do Bairro Medianeira (porte I, 420 m²)",
        modalidade: "CONCORRENCIA",
        empresaId: E.pilarsul,
        setorId: ctx.setores.SESAU,
        unidadeGestoraId: ctx.ugs["02"],
        fonte: "SAUDE",
        assinadoEm: d(-220),
        vigenciaInicio: d(-215),
        vigenciaFim: d(240),
        obraLocal: "Rua Pedro Grendene, esquina com Rua das Acácias — Bairro Medianeira",
        obraPrevisaoFim: d(150),
        fiscalId: RICARDO,
        gestorId: U["88888888888"],
      },
      [
        ["Fundações", 258000, [40, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
        ["Estrutura de concreto", 430000, [0, 20, 40, 40, 0, 0, 0, 0, 0, 0, 0, 0]],
        ["Alvenaria e cobertura", 494500, [0, 0, 0, 30, 40, 30, 0, 0, 0, 0, 0, 0]],
        ["Instalações elétricas, hidráulicas e de gases medicinais", 387000, [0, 0, 0, 0, 10, 20, 30, 30, 10, 0, 0, 0]],
        ["Esquadrias, revestimentos e pisos", 408500, [0, 0, 0, 0, 0, 0, 10, 20, 30, 30, 10, 0]],
        ["Urbanização, mobiliário fixo e entrega", 172000, [0, 0, 0, 0, 0, 0, 0, 0, 0, 30, 40, 30]],
      ],
      [{ 0: 40 }, { 0: 60, 1: 15 }, { 1: 40 }, { 1: 40, 2: 20 }, { 1: 5, 2: 35 }, { 2: 30, 3: 15 }, { 2: 10, 3: 30, 4: 5 }],
      [
        { situacao: "PAGA", numero: "1101" },
        { situacao: "PAGA", numero: "1118" },
        { situacao: "PAGA", numero: "1132" },
        { situacao: "PAGA", numero: "1149" },
        { situacao: "PAGA", numero: "1163" },
        { situacao: "AGUARDANDO_ATESTO", numero: "1177", criadaHa: 28 },
        { situacao: "AGUARDANDO_ATESTO", numero: "1190", criadaHa: 2 },
      ],
    );

    // diário de obra
    const diario: [string, number, string, number, string, string][] = [
      [pav.c.id, 1, "Sol", 14, "Imprimação e aplicação de CBUQ no trecho entre as estacas 20 e 31. Ensaio de densidade coletado pelo laboratório.", RICARDO],
      [pav.c.id, 3, "Nublado", 12, "Execução de base com brita graduada na Travessa Itália. Rolo compactador parado 2 h para manutenção.", RICARDO],
      [pav.c.id, 7, "Chuva", 0, "Sem serviço por chuva. Vistoria das caixas de drenagem: sem acúmulo de água.", RICARDO],
      [ref.c.id, 2, "Sol", 6, "Montagem da estrutura metálica da ala norte. Telhas termoacústicas ainda não entregues; fornecedor prometeu para a próxima semana.", RICARDO],
      [ref.c.id, 9, "Chuva", 0, "Obra parada por chuva. Lona provisória sobre as salas 3 e 4 conferida; sem infiltração.", RICARDO],
      [ref.c.id, 16, "Sol", 5, "Alvenaria da sala nova 1 até a altura da cinta. Notificada a empresa sobre o efetivo abaixo do previsto (8 pessoas).", RICARDO],
      [ubs.c.id, 1, "Sol", 18, "Passagem de tubulação de gases medicinais nas salas de procedimento. Reboco interno da ala de vacinação.", RICARDO],
      [ubs.c.id, 6, "Nublado", 16, "Instalação dos quadros elétricos e conferência do aterramento. Visita técnica da Secretaria de Saúde.", RICARDO],
    ];
    for (const [contratoId, diasAtras, clima, efetivo, texto, autorId] of diario)
      await db.insert(schema.contratoDiario).values({ contratoId, data: iso(ctx.dia(diasAtras)), clima, efetivo, texto, autorId, criadoEm: ctx.dia(diasAtras) });

    // ===================================================================
    // Pagamentos pelo motor: atesto → processo de pagamento → liquidação → fila cronológica → pago.
    // Primeiro os que serão pagos (fontes sem ninguém à frente), depois os que ficam na fila.
    // ===================================================================
    const sRicardo = await sessao("15151515151");
    const sValdir = await sessao("16161616161");
    const sPaulo = await sessao("10101010101");
    const sMarcos = await sessao("88888888888");
    const sContador = await sessao("44444444444");
    const sPrefeita = await sessao("11111111111");
    const sTesouraria = await sessao("77777777777");

    async function atestarEEnviar(s: SessaoUsuario, notaId: string) {
      await ops.atestarNota(s, notaId);
      return ops.enviarParaLiquidacao(s, notaId);
    }
    async function liquidar(processoId: string) {
      const d1 = await engine.juntarDocumento(sContador, processoId, "NOTA_LIQUIDACAO", "Nota de liquidação", "Liquidação da despesa: nota fiscal conferida, atesto do fiscal e certidões de regularidade (FGTS, INSS e trabalhista) válidas. Sem retenções além do ISS na fonte.");
      await engine.assinarDocumento(sPrefeita, d1.id, "ORDENADOR");
      await engine.avancar(sContador, processoId, "FILA_PAGAMENTO", "Liquidado. À tesouraria.");
    }
    async function pagar(processoId: string) {
      await engine.receber(sTesouraria, processoId);
      const op = await engine.juntarDocumento(sTesouraria, processoId, "ORDEM_PAGAMENTO", "Ordem de pagamento", "Ordem de pagamento por transferência bancária à conta do fornecedor indicada no contrato.");
      await engine.assinarDocumento(sPrefeita, op.id, "ORDENADOR");
      await engine.assinarDocumento(sTesouraria, op.id, "TESOURARIA");
      await engine.avancar(sTesouraria, processoId, "PAGO", "Pago na ordem da fila.");
      await engine.juntarDocumento(sTesouraria, processoId, "COMPROVANTE_PAGAMENTO", "Comprovante de transferência", "Comprovante de transferência (retorno bancário simulado na demonstração).");
    }

    // pagos (fontes Convênios e Educação, sem ninguém à frente)
    for (const [s, n] of [
      [sRicardo, nHidroPago],
      [sPaulo, nMerendaPago],
    ] as const) {
      const p = await atestarEEnviar(s, n.id);
      await liquidar(p.id);
      await pagar(p.id);
    }

    // na fila cronológica
    for (const [s, n] of [
      [sRicardo, nHidroFila],
      [sRicardo, nMendesFila],
      [sMarcos, nCaririFila],
      [sRicardo, pav.notas[3]!],
      [sRicardo, ubs.notas[5]!],
    ] as const) {
      const p = await atestarEEnviar(s, n.id);
      await liquidar(p.id);
    }
    // em liquidação (processo aberto na contabilidade)
    await atestarEEnviar(sMarcos, nCaririLiq.id);
    await atestarEEnviar(sRicardo, nRefLiq.id);
    // atestadas, aguardando envio
    await ops.atestarNota(sRicardo, nMendesAtestada.id);
    await ops.atestarNota(sValdir, nColeta.id);
  },
};

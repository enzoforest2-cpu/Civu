// Dados de exemplo: um município fictício, setores, usuários (senha "123456"), fluxos e processos.
// Executar: npm run db:seed
import bcrypt from "bcryptjs";
import { createHash } from "crypto";
import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
import { WORKFLOWS_PADRAO } from "../lib/workflow";
import type { CompraDemo } from "./demo/compras";
import { COMPRAS_CONFORMIDADE, cnpj } from "./valor";
import type { DemoCtx } from "./demo/contexto";

export const SLUG_DEMO = "vale-das-araucarias";
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
function canon(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
  const o = v as Record<string, unknown>;
  return (
    "{" +
    Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => JSON.stringify(k) + ":" + canon(o[k]))
      .join(",") +
    "}"
  );
}

/** CPF fictício com dígitos verificadores válidos, a partir de 9 dígitos. */
export function cpfDemo(base9: string) {
  const dv = (b: string) => {
    const s = b.split("").reduce((a, n, i) => a + Number(n) * (b.length + 1 - i), 0) % 11;
    return s < 2 ? 0 : 11 - s;
  };
  const d1 = dv(base9);
  return base9 + d1 + dv(base9 + d1);
}

/** Município fictício de demonstração no RS, com setores, usuários, fluxos, processos, pessoas e empresas. */
export async function seedBase(db: NodePgDatabase<typeof schema>): Promise<DemoCtx> {
  const [mun] = await db
    .insert(schema.municipios)
    .values({ slug: SLUG_DEMO, nome: "Vale das Araucárias", uf: "RS", populacao: 38420, tce: "TCE-RS" })
    .returning();
  const [ug] = await db.insert(schema.unidadesGestoras).values({ municipioId: mun.id, codigo: "01", nome: "Prefeitura Municipal" }).returning();
  const [ug2] = await db.insert(schema.unidadesGestoras).values({ municipioId: mun.id, codigo: "02", nome: "Fundo Municipal de Saúde" }).returning();

  const setoresDef = [
    ["GAB", "Gabinete do Prefeito", 2],
    ["PROT", "Protocolo Geral", 1],
    ["SEMAD", "Secretaria de Administração", 5],
    ["COMPRAS", "Setor de Compras e Licitações", 10],
    ["CONTAB", "Contabilidade e Orçamento", 2],
    ["TES", "Tesouraria", 5],
    ["CGM", "Controladoria Geral", 3],
    ["PGM", "Procuradoria Geral", 5],
    ["SESAU", "Secretaria de Saúde", 5],
    ["SEDUC", "Secretaria de Educação", 5],
    ["SEINFRA", "Secretaria de Infraestrutura", 5],
  ] as const;
  const setores: Record<string, string> = {};
  for (const [sigla, nome, sla] of setoresDef) {
    const [s] = await db.insert(schema.setores).values({ municipioId: mun.id, sigla, nome, slaPadraoDias: sla }).returning();
    setores[sigla] = s.id;
  }

  const senha = await bcrypt.hash("123456", 10);
  const usuariosDef: [string, string, string, string, string[], string][] = [
    ["11111111111", "Maria Albuquerque", "prefeita@valedasaraucarias.rs.gov.br", "Prefeita", ["ORDENADOR", "ADMIN"], "GAB"],
    ["22222222222", "João Protocolo", "protocolo@valedasaraucarias.rs.gov.br", "Chefe do Protocolo", ["PROTOCOLO"], "PROT"],
    ["33333333333", "Ana Compras", "compras@valedasaraucarias.rs.gov.br", "Agente de contratação", ["COMPRAS"], "COMPRAS"],
    ["44444444444", "Carlos Contador", "contabilidade@valedasaraucarias.rs.gov.br", "Contador", ["CONTABILIDADE"], "CONTAB"],
    ["55555555555", "Rita Controladora", "controladoria@valedasaraucarias.rs.gov.br", "Controladora Geral", ["CONTROLE_INTERNO"], "CGM"],
    ["66666666666", "Pedro Procurador", "pgm@valedasaraucarias.rs.gov.br", "Procurador Geral", ["JURIDICO"], "PGM"],
    ["77777777777", "Lúcia Tesoureira", "tesouraria@valedasaraucarias.rs.gov.br", "Tesoureira", ["TESOURARIA"], "TES"],
    ["88888888888", "Dr. Marcos Secretário", "saude@valedasaraucarias.rs.gov.br", "Secretário de Saúde", ["SECRETARIO", "REQUISITANTE", "FISCAL"], "SESAU"],
    ["99999999999", "Fernanda Requisitante", "ubs@valedasaraucarias.rs.gov.br", "Coordenadora de UBS", ["REQUISITANTE"], "SESAU"],
    ["10101010101", "Paulo Educação", "educacao@valedasaraucarias.rs.gov.br", "Secretário de Educação", ["SECRETARIO", "REQUISITANTE", "FISCAL"], "SEDUC"],
    ["12121212121", "Sandra Administração", "admin@valedasaraucarias.rs.gov.br", "Secretária de Administração", ["SECRETARIO", "REQUISITANTE", "ORDENADOR", "FISCAL"], "SEMAD"],
  ];
  // usuário de sistema que registra o que chega pelo portal e pelo WhatsApp (não faz login)
  usuariosDef.push(["00000000000", "Atendimento digital", "atendimento@valedasaraucarias.rs.gov.br", "Canal digital", ["PROTOCOLO"], "PROT"]);
  const usuarios: Record<string, string> = {};
  for (const [cpf, nome, email, cargo, papeis, setor] of usuariosDef) {
    const [u] = await db
      .insert(schema.usuarios)
      .values({ municipioId: mun.id, cpf, nome, email, cargo, papeis, senhaHash: senha, setorId: setores[setor], ativo: cpf !== "00000000000" })
      .returning();
    usuarios[cpf] = u.id;
  }

  const tipos: Record<string, string> = {};
  for (const w of WORKFLOWS_PADRAO) {
    const [t] = await db
      .insert(schema.tiposProcesso)
      .values({ municipioId: mun.id, chave: w.chave, nome: w.nome, descricao: w.descricao, definicao: w.definicao })
      .returning();
    tipos[w.chave] = t.id;
  }

  const ano = new Date().getFullYear();
  await db.insert(schema.feriados).values([
    { municipioId: mun.id, data: `${ano}-09-20`, nome: "Revolução Farroupilha" },
    { municipioId: mun.id, data: `${ano}-11-02`, nome: "Finados" },
    { municipioId: mun.id, data: `${ano}-11-15`, nome: "Proclamação da República" },
    { municipioId: mun.id, data: `${ano}-11-20`, nome: "Consciência Negra" },
    { municipioId: mun.id, data: `${ano}-12-25`, nome: "Natal" },
  ]);

  // ---- processos de compra de exemplo, criados pelo motor em datas passadas (src/db/demo/compras.ts) ----
  const dia = (n: number) => new Date(Date.now() - n * 86400_000);
  const { criarComprasDemo } = await import("./demo/compras");
  const baseCompras = { municipioId: mun.id, usuarios, tipos, ugs: { "01": ug.id, "02": ug2.id }, setores };
  await criarComprasDemo(db, baseCompras, COMPRAS_SEED(ano));
  let seqNum = Number(
    (await db.select({ n: sql<number>`coalesce(max(${schema.processos.sequencial}), 0)` }).from(schema.processos).where(and(eq(schema.processos.municipioId, mun.id), eq(schema.processos.ano, ano))))[0].n,
  );

  // 7. Requerimento de tramitação livre
  seqNum += 1;
  const numReq = `${ano}/${String(seqNum).padStart(6, "0")}`;
  const [req] = await db
    .insert(schema.processos)
    .values({
      municipioId: mun.id,
      unidadeGestoraId: ug.id,
      tipoId: tipos.REQUERIMENTO,
      ano,
      sequencial: seqNum,
      numero: numReq,
      assunto: "Ofício da Câmara — pedido de informações sobre obras da SEINFRA",
      urgencia: "PRIORITARIO",
      estadoAtual: "EM_ANALISE",
      setorAtualId: setores.SEINFRA,
      recebidoEm: null,
      prazoEtapaEm: new Date(Date.now() + 10 * 86400_000),
      abertoPorId: usuarios["22222222222"],
      abertoEm: dia(4),
      metadados: { interessado: "Câmara Municipal" },
    })
    .returning();
  {
    let hashAnterior: string | null = null;
    const evs = [
      {
        seq: 1,
        tipo: "ABERTURA",
        campos: { paraEstado: "PROTOCOLADO", paraSetorId: setores.PROT, dados: { numero: numReq, tipo: "REQUERIMENTO" } },
        d: dia(4),
      },
      {
        seq: 2,
        tipo: "MUDANCA_ESTADO",
        campos: {
          deEstado: "PROTOCOLADO",
          paraEstado: "EM_ANALISE",
          deSetorId: setores.PROT,
          paraSetorId: setores.GAB,
          dados: { rotulo: "Distribuir para análise" },
        },
        d: dia(3),
      },
      { seq: 3, tipo: "ENVIO", campos: { deSetorId: setores.GAB, paraSetorId: setores.SEINFRA, dados: { despacho: "À SEINFRA para informar." } }, d: dia(2) },
    ];
    for (const e of evs) {
      const corpo = canon({ processoId: req.id, seq: e.seq, tipo: e.tipo, autorId: usuarios["22222222222"], ...e.campos, criadoEm: e.d.toISOString() });
      const hash = sha((hashAnterior ?? "") + corpo);
      const c = e.campos as Record<string, unknown>;
      await db
        .insert(schema.eventos)
        .values({
          processoId: req.id,
          seq: e.seq,
          tipo: e.tipo,
          autorId: usuarios["22222222222"],
          deEstado: (c.deEstado as string) ?? null,
          paraEstado: (c.paraEstado as string) ?? null,
          deSetorId: (c.deSetorId as string) ?? null,
          paraSetorId: (c.paraSetorId as string) ?? null,
          dados: c.dados as object,
          hashAnterior,
          hash,
          criadoEm: e.d,
        });
      hashAnterior = hash;
    }
  }

  // compras que alimentam o limite de dispensa, a fila cronológica e as obrigações (PNCP e TCE)
  await criarComprasDemo(db, baseCompras, COMPRAS_CONFORMIDADE(ano));

  // ---- pessoas e empresas fictícias dos portais ----
  const end = (logradouro: string, numero: string, bairro: string) => ({ logradouro, numero, bairro, cidade: "Vale das Araucárias", uf: "RS", cep: "95200-000" });
  const pessoasDef: [string, string, string, string, string | null, ReturnType<typeof end>][] = [
    ["ana", cpfDemo("402118733"), "Ana Beatriz Souza", "(54) 99812-4410", "ouro", end("Rua das Hortênsias", "212", "Centro")],
    ["carlos", cpfDemo("517220984"), "Carlos Mendes", "(54) 99630-1180", "prata", end("Av. Moreira Paz", "1450", "Petrópolis")],
    ["juliana", cpfDemo("638341205"), "Juliana Rocha", "(54) 99155-7720", "ouro", end("Rua Júlio de Castilhos", "88", "Centro")],
    ["roberto", cpfDemo("749462316"), "Roberto Lima", "(54) 99401-3355", "prata", end("Rua Ramiro Barcelos", "640", "Glória")],
    ["marta", cpfDemo("851573427"), "Marta Oliveira", "(54) 99277-0901", "ouro", end("Rua Borges de Medeiros", "33", "Centro")],
  ];
  const pessoas: Record<string, string> = {};
  for (const [k, cpf, nome, telefone, nivel, endereco] of pessoasDef) {
    const [p] = await db
      .insert(schema.pessoas)
      .values({ cpf, nome, telefone, nivelGovbr: nivel, endereco, email: `${k}@exemplo.com.br`, demonstracao: true, telefoneConfirmado: true, senhaHash: k === "ana" ? senha : null })
      .returning();
    pessoas[k] = p.id;
  }
  const empresasDef: [string, string, string, string, string, string[]][] = [
    ["mendes", "28461937000105", "Mendes Materiais de Construção Ltda", "Mendes Materiais", "ME", ["4744-0/99"]],
    ["mendesmei", "41208773000140", "Carlos Mendes Reparos", "Mendes Reparos", "MEI", ["4321-5/00"]],
    ["padaria", "19774502000163", "Padaria Pão da Serra Ltda", "Pão da Serra", "EPP", ["1091-1/02"]],
    ["hidrobombas", "45871230000164", "Hidrobombas Sertão Ltda", "Hidrobombas", "EPP", ["3314-7/02"]],
    ["cariri", "30775541000152", "Distribuidora Médica Cariri Ltda", "Cariri Médica", "DEMAIS", ["4644-3/01"]],
  ];
  const empresas: Record<string, string> = {};
  for (const [k, cnpj, razaoSocial, nomeFantasia, porte, atividades] of empresasDef) {
    const [e] = await db.insert(schema.empresas).values({ cnpj, razaoSocial, nomeFantasia, porte, atividades, endereco: end("Rua do Comércio", "100", "Centro") }).returning();
    empresas[k] = e.id;
  }
  const todos = ["PROCESSOS", "TRIBUTOS", "CONTRATOS", "LICENCAS"];
  const seisMeses = new Date(Date.now() + 182 * 86400_000).toISOString().slice(0, 10);
  await db.insert(schema.representacoes).values([
    { pessoaId: pessoas.carlos, empresaId: empresas.mendes, papel: "RESPONSAVEL_LEGAL", escopos: todos },
    { pessoaId: pessoas.carlos, empresaId: empresas.mendesmei, papel: "RESPONSAVEL_LEGAL", escopos: todos },
    { pessoaId: pessoas.juliana, empresaId: empresas.mendes, papel: "CONTADOR", escopos: ["TRIBUTOS"], validaAte: seisMeses, concedidaPorId: pessoas.carlos },
    { pessoaId: pessoas.juliana, empresaId: empresas.padaria, papel: "CONTADOR", escopos: ["TRIBUTOS", "LICENCAS"], validaAte: seisMeses },
    { pessoaId: pessoas.roberto, empresaId: empresas.hidrobombas, papel: "RESPONSAVEL_LEGAL", escopos: todos },
    { pessoaId: pessoas.marta, empresaId: empresas.cariri, papel: "RESPONSAVEL_LEGAL", escopos: todos },
  ]);

  return {
    db,
    municipioId: mun.id,
    ano,
    ugs: { "01": ug.id, "02": ug2.id },
    setores,
    usuarios,
    tipos,
    pessoas,
    empresas,
    dia,
  };
}

/** Compras de exemplo do município: uma em cada situação típica (atrasada, devolvida, em parecer, em execução, paga, recém-aberta). */
function COMPRAS_SEED(ano: number): CompraDemo[] {
  return [
    {
      // 1. Parada na contabilidade há dias (atrasada, não recebida)
      assunto: "Aquisição de medicamentos básicos para as UBS",
      req: "99999999999",
      meta: {
        objeto: "Medicamentos da RENAME para 4 UBS", natureza: "MEDICAMENTOS", modalidade: "LICITACAO",
        justificativa: "Estoque da farmácia básica abaixo de 15 dias de cobertura.", quantidade: "lote trimestral",
        valorEstimado: 184500, dataPretendida: `${ano}-12-01`, prioridade: "ALTA", noPCA: "SIM",
      },
      ate: "VERIFICACAO_ORCAMENTARIA",
      periodo: [21, 9],
      urgencia: "URGENTE",
      recebido: false,
    },
    {
      // 2. Devolvida pelo controle interno para saneamento (em instrução de novo)
      assunto: "Contratação de serviço de transporte escolar — rota rural",
      req: "10101010101",
      meta: {
        objeto: "Transporte escolar 3 rotas rurais", natureza: "TRANSPORTE", modalidade: "LICITACAO",
        justificativa: "Fim do contrato anterior em dezembro.", quantidade: "3 rotas, 200 dias letivos",
        valorEstimado: 612000, dataPretendida: `${ano + 1}-02-01`, prioridade: "ALTA", noPCA: "SIM",
      },
      ate: "CONTROLE_INTERNO",
      periodo: [40, 23],
      atual: ["CHECKLIST_CI"],
      devolucao: {
        para: "INSTRUCAO",
        motivo: "ETP sem o mapa de riscos e termo de referência sem a quilometragem de cada rota, que sustenta o preço estimado. Complementar e reenviar.",
        diasAtras: 6,
      },
    },
    {
      // 3. Em parecer jurídico, com o prazo vencido
      assunto: "Reforma da cobertura da Escola Municipal Padre Cícero",
      req: "10101010101",
      meta: {
        objeto: "Reforma de telhado, 850 m²", natureza: "SERVICO_ENGENHARIA", modalidade: "DISPENSA_VALOR",
        justificativa: "Infiltrações em 6 salas.", quantidade: "1 obra",
        valorEstimado: 128000, dataPretendida: `${ano}-12-15`, prioridade: "MEDIA", noPCA: "NAO",
      },
      ate: "PARECER_JURIDICO",
      periodo: [30, 8],
    },
    {
      // 4. Em execução: ordem de fornecimento e nota fiscal com o fiscal, aguardando o atesto
      assunto: "Aquisição de gêneros alimentícios — merenda escolar",
      req: "10101010101",
      meta: {
        objeto: "Gêneros alimentícios PNAE", natureza: "GENEROS_ALIMENTICIOS", modalidade: "LICITACAO",
        justificativa: "Alimentação escolar do 2º semestre.", quantidade: "ver TR",
        valorEstimado: 310000, dataPretendida: `${ano}-08-01`, prioridade: "ALTA", noPCA: "SIM",
      },
      ate: "EXECUCAO",
      periodo: [120, 50],
      contratacao: { fornecedor: "Cooperativa Agricultura Familiar do Vale Ltda", cnpj: cnpj("234561780001"), valor: "298400.00", fonte: "EDUCACAO" },
      atual: ["ORDEM_FORNECIMENTO", "ENVIO_FISCAL", "NOTA_FISCAL"],
    },
    {
      // 5. Concluída: paga, com remessa ao TCE, e arquivada
      assunto: "Material de expediente para a Secretaria de Administração",
      req: "12121212121",
      meta: {
        objeto: "Papel A4, toner e material de escritório", natureza: "MATERIAL_EXPEDIENTE", modalidade: "DISPENSA_VALOR",
        justificativa: "Reposição semestral.", quantidade: "ver planilha",
        valorEstimado: 23800, dataPretendida: `${ano}-06-01`, prioridade: "BAIXA", noPCA: "SIM",
      },
      ate: "ARQUIVADO",
      periodo: [160, 74],
      contratacao: { fornecedor: "Papelaria Central do Norte Ltda", cnpj: cnpj("112223330001"), valor: "23800.00", fonte: "ORDINARIOS" },
      remessa: true,
    },
    {
      // 6. Demanda recém-aberta: DFD juntado, ainda sem assinatura
      assunto: "Aquisição de 2 ar-condicionados para a UBS Centro",
      req: "99999999999",
      meta: {
        objeto: "2 aparelhos split 18.000 BTU", natureza: "EQUIPAMENTOS", modalidade: "DISPENSA_VALOR",
        justificativa: "Sala de vacina sem climatização adequada.", quantidade: "2",
        valorEstimado: 7800, dataPretendida: `${ano}-12-20`, prioridade: "MEDIA", noPCA: "NAO",
      },
      ate: "DEMANDA",
      periodo: [1, 1],
      atual: ["DFD"],
    },
  ];
}

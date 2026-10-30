// Dados de exemplo: um município fictício, setores, usuários (senha "123456"), fluxos e processos.
// Executar: npm run db:seed
import bcrypt from "bcryptjs";
import { createHash } from "crypto";
import { eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
import { WORKFLOWS_PADRAO, type WorkflowDef } from "../lib/workflow";
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
    ["12121212121", "Sandra Administração", "admin@valedasaraucarias.rs.gov.br", "Secretária de Administração", ["SECRETARIO", "REQUISITANTE", "ORDENADOR"], "SEMAD"],
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

  // ---- processos de exemplo, com eventos encadeados em datas passadas ----
  const compra = WORKFLOWS_PADRAO[0].definicao as WorkflowDef;
  let seqNum = 0;
  const dia = (n: number) => new Date(Date.now() - n * 86400_000);

  type Passo = { estado: string; setor: string; diasAtras: number; devolucao?: string };
  async function criarCompra(
    assunto: string,
    requisitante: string,
    setorReq: string,
    meta: Record<string, unknown>,
    passos: Passo[],
    opts: { urgencia?: string; recebido?: boolean; prazoAtrasado?: boolean; encerrado?: boolean; docs?: [string, string, string][] } = {},
  ) {
    seqNum += 1;
    const numero = `${ano}/${String(seqNum).padStart(6, "0")}`;
    const ultimo = passos[passos.length - 1];
    const [p] = await db
      .insert(schema.processos)
      .values({
        municipioId: mun.id,
        unidadeGestoraId: ug.id,
        tipoId: tipos.COMPRA,
        ano,
        sequencial: seqNum,
        numero,
        assunto,
        descricao: String(meta.justificativa ?? ""),
        urgencia: opts.urgencia ?? "NORMAL",
        estadoAtual: ultimo.estado,
        setorAtualId: setores[ultimo.setor],
        recebidoEm: opts.recebido === false ? null : dia(ultimo.diasAtras),
        prazoEtapaEm: opts.prazoAtrasado ? dia(3) : new Date(Date.now() + 4 * 86400_000),
        abertoPorId: usuarios[requisitante],
        abertoEm: dia(passos[0].diasAtras),
        encerradoEm: opts.encerrado ? dia(ultimo.diasAtras) : null,
        metadados: meta,
      })
      .returning();
    let hashAnterior: string | null = null;
    let seq = 0;
    for (let i = 0; i < passos.length; i++) {
      const ps = passos[i];
      const anterior = passos[i - 1];
      seq += 1;
      const tipo = i === 0 ? "ABERTURA" : ps.devolucao ? "DEVOLUCAO" : ps.estado === "ARQUIVADO" ? "ENCERRAMENTO" : "MUDANCA_ESTADO";
      const criadoEm = dia(ps.diasAtras);
      const campos: Record<string, unknown> = { paraEstado: ps.estado, paraSetorId: setores[ps.setor] };
      if (anterior) {
        campos.deEstado = anterior.estado;
        campos.deSetorId = setores[anterior.setor];
      }
      campos.dados = ps.devolucao ? { rotulo: ps.devolucao, motivo: ps.devolucao } : i === 0 ? { numero, tipo: "COMPRA" } : { rotulo: "Avanço" };
      const corpo = canon({ processoId: p.id, seq, tipo, autorId: usuarios[requisitante], ...campos, criadoEm: criadoEm.toISOString() });
      const hash = sha((hashAnterior ?? "") + corpo);
      await db
        .insert(schema.eventos)
        .values({
          processoId: p.id,
          seq,
          tipo,
          autorId: usuarios[requisitante],
          deEstado: (campos.deEstado as string) ?? null,
          paraEstado: ps.estado,
          deSetorId: (campos.deSetorId as string) ?? null,
          paraSetorId: setores[ps.setor],
          dados: campos.dados as object,
          hashAnterior,
          hash,
          criadoEm,
        });
      hashAnterior = hash;
    }
    for (const [tipo, titulo, conteudo] of opts.docs ?? []) {
      await db
        .insert(schema.documentos)
        .values({ processoId: p.id, tipo, titulo, conteudo, hash: sha(conteudo), criadoPorId: usuarios[requisitante], criadoEm: dia(passos[0].diasAtras) });
    }
    return p;
  }

  const dfdTexto = (obj: string) =>
    `DOCUMENTO DE FORMALIZAÇÃO DE DEMANDA\n\nObjeto: ${obj}\nJustificativa: atendimento da demanda da unidade conforme planejamento.\nQuantidade: conforme planilha anexa.\nPrioridade: ALTA.`;

  // 1. Compra parada na contabilidade há dias (atrasada, não recebida)
  await criarCompra(
    "Aquisição de medicamentos básicos para as UBS",
    "99999999999",
    "SESAU",
    {
      objeto: "Medicamentos da RENAME para 4 UBS",
      justificativa: "Estoque da farmácia básica abaixo de 15 dias de cobertura.",
      quantidade: "lote trimestral",
      valorEstimado: 184500,
      dataPretendida: `${ano}-12-01`,
      prioridade: "ALTA",
      noPCA: "SIM",
    },
    [
      { estado: "DEMANDA", setor: "SESAU", diasAtras: 21 },
      { estado: "APROVACAO_SECRETARIO", setor: "SESAU", diasAtras: 21 },
      { estado: "AUTUACAO", setor: "PROT", diasAtras: 20 },
      { estado: "AUTORIZACAO", setor: "GAB", diasAtras: 19 },
      { estado: "INSTRUCAO", setor: "COMPRAS", diasAtras: 17 },
      { estado: "VERIFICACAO_ORCAMENTARIA", setor: "CONTAB", diasAtras: 9 },
    ],
    {
      urgencia: "URGENTE",
      recebido: false,
      prazoAtrasado: true,
      docs: [
        ["DFD", "DFD — medicamentos UBS", dfdTexto("Medicamentos da RENAME")],
        ["DESPACHO_AUTORIZACAO", "Autorizo o prosseguimento", "Autorizo a instrução do processo. Prefeita."],
        ["ETP", "ETP — medicamentos", "Estudo técnico preliminar..."],
        ["TR", "Termo de referência", "Termo de referência..."],
        [
          "PESQUISA_PRECOS",
          "Pesquisa de preços (3 fontes)",
          "BPS: R$ 180.200; contratação similar Sobral: R$ 186.900; cotação fornecedor: R$ 190.100. Média: R$ 185.733.",
        ],
      ],
    },
  );

  // 2. Compra devolvida pelo controle interno (em instrução de novo)
  await criarCompra(
    "Contratação de serviço de transporte escolar — rota rural",
    "10101010101",
    "SEDUC",
    {
      objeto: "Transporte escolar 3 rotas rurais",
      justificativa: "Fim do contrato anterior em dezembro.",
      quantidade: "3 rotas, 200 dias letivos",
      valorEstimado: 612000,
      dataPretendida: `${ano + 1}-02-01`,
      prioridade: "ALTA",
      noPCA: "SIM",
    },
    [
      { estado: "DEMANDA", setor: "SEDUC", diasAtras: 40 },
      { estado: "APROVACAO_SECRETARIO", setor: "SEDUC", diasAtras: 40 },
      { estado: "AUTUACAO", setor: "PROT", diasAtras: 39 },
      { estado: "AUTORIZACAO", setor: "GAB", diasAtras: 38 },
      { estado: "INSTRUCAO", setor: "COMPRAS", diasAtras: 36 },
      { estado: "VERIFICACAO_ORCAMENTARIA", setor: "CONTAB", diasAtras: 25 },
      { estado: "RESERVADO", setor: "CONTAB", diasAtras: 24 },
      { estado: "CONTROLE_INTERNO", setor: "CGM", diasAtras: 23 },
      { estado: "INSTRUCAO", setor: "COMPRAS", diasAtras: 20, devolucao: "Saneamento: devolver a compras" },
    ],
    {
      docs: [
        ["DFD", "DFD — transporte escolar", dfdTexto("Transporte escolar")],
        ["DESPACHO_AUTORIZACAO", "Autorizo", "Autorizo."],
        ["ETP", "ETP", "..."],
        ["TR", "TR", "..."],
        ["PESQUISA_PRECOS", "Pesquisa de preços", "..."],
        ["CERTIDAO_DOTACAO", "Certidão de dotação", "12.361.0012.2034 — 3.3.90.39 — fonte 1540. Saldo: R$ 700.000."],
        ["NOTA_RESERVA", "Nota de reserva 0045", "Reserva R$ 612.000"],
      ],
    },
  );

  // 3. Compra em parecer jurídico
  await criarCompra(
    "Reforma da cobertura da Escola Municipal Padre Cícero",
    "10101010101",
    "SEDUC",
    {
      objeto: "Reforma de telhado, 850 m²",
      justificativa: "Infiltrações em 6 salas.",
      quantidade: "1 obra",
      valorEstimado: 128000,
      dataPretendida: `${ano}-12-15`,
      prioridade: "MEDIA",
      noPCA: "NAO",
    },
    [
      { estado: "DEMANDA", setor: "SEDUC", diasAtras: 30 },
      { estado: "APROVACAO_SECRETARIO", setor: "SEDUC", diasAtras: 30 },
      { estado: "AUTUACAO", setor: "PROT", diasAtras: 29 },
      { estado: "AUTORIZACAO", setor: "GAB", diasAtras: 29 },
      { estado: "INSTRUCAO", setor: "COMPRAS", diasAtras: 27 },
      { estado: "VERIFICACAO_ORCAMENTARIA", setor: "CONTAB", diasAtras: 15 },
      { estado: "RESERVADO", setor: "CONTAB", diasAtras: 14 },
      { estado: "CONTROLE_INTERNO", setor: "CGM", diasAtras: 13 },
      { estado: "PARECER_JURIDICO", setor: "PGM", diasAtras: 8 },
    ],
    { prazoAtrasado: true },
  );

  // 4. Compra em execução (aguardando atesto)
  await criarCompra(
    "Aquisição de gêneros alimentícios — merenda escolar",
    "10101010101",
    "SEDUC",
    {
      objeto: "Gêneros alimentícios PNAE",
      justificativa: "Alimentação escolar do 2º semestre.",
      quantidade: "ver TR",
      valorEstimado: 310000,
      dataPretendida: `${ano}-08-01`,
      prioridade: "ALTA",
      noPCA: "SIM",
    },
    [
      { estado: "DEMANDA", setor: "SEDUC", diasAtras: 120 },
      { estado: "APROVACAO_SECRETARIO", setor: "SEDUC", diasAtras: 120 },
      { estado: "AUTUACAO", setor: "PROT", diasAtras: 119 },
      { estado: "AUTORIZACAO", setor: "GAB", diasAtras: 118 },
      { estado: "INSTRUCAO", setor: "COMPRAS", diasAtras: 116 },
      { estado: "VERIFICACAO_ORCAMENTARIA", setor: "CONTAB", diasAtras: 100 },
      { estado: "RESERVADO", setor: "CONTAB", diasAtras: 99 },
      { estado: "CONTROLE_INTERNO", setor: "CGM", diasAtras: 98 },
      { estado: "PARECER_JURIDICO", setor: "PGM", diasAtras: 95 },
      { estado: "SESSAO_DISPUTA", setor: "COMPRAS", diasAtras: 88 },
      { estado: "HOMOLOGADO", setor: "GAB", diasAtras: 60 },
      { estado: "EMPENHADO", setor: "CONTAB", diasAtras: 59 },
      { estado: "CONTRATADO", setor: "COMPRAS", diasAtras: 58 },
      { estado: "EXECUCAO", setor: "SEDUC", diasAtras: 50 },
    ],
  );

  // 5. Compra concluída (paga e arquivada)
  await criarCompra(
    "Material de expediente para a Secretaria de Administração",
    "12121212121",
    "SEMAD",
    {
      objeto: "Papel A4, toner e material de escritório",
      justificativa: "Reposição semestral.",
      quantidade: "ver planilha",
      valorEstimado: 23800,
      dataPretendida: `${ano}-06-01`,
      prioridade: "BAIXA",
      noPCA: "SIM",
    },
    [
      { estado: "DEMANDA", setor: "SEMAD", diasAtras: 160 },
      { estado: "APROVACAO_SECRETARIO", setor: "SEMAD", diasAtras: 160 },
      { estado: "AUTUACAO", setor: "PROT", diasAtras: 159 },
      { estado: "AUTORIZACAO", setor: "GAB", diasAtras: 159 },
      { estado: "INSTRUCAO", setor: "COMPRAS", diasAtras: 157 },
      { estado: "VERIFICACAO_ORCAMENTARIA", setor: "CONTAB", diasAtras: 150 },
      { estado: "RESERVADO", setor: "CONTAB", diasAtras: 149 },
      { estado: "CONTROLE_INTERNO", setor: "CGM", diasAtras: 148 },
      { estado: "PARECER_JURIDICO", setor: "PGM", diasAtras: 146 },
      { estado: "SESSAO_DISPUTA", setor: "COMPRAS", diasAtras: 140 },
      { estado: "HOMOLOGADO", setor: "GAB", diasAtras: 125 },
      { estado: "EMPENHADO", setor: "CONTAB", diasAtras: 124 },
      { estado: "CONTRATADO", setor: "COMPRAS", diasAtras: 122 },
      { estado: "EXECUCAO", setor: "SEMAD", diasAtras: 120 },
      { estado: "LIQUIDADO", setor: "CONTAB", diasAtras: 100 },
      { estado: "FILA_PAGAMENTO", setor: "TES", diasAtras: 98 },
      { estado: "PAGAMENTO_ENVIADO", setor: "TES", diasAtras: 76 },
      { estado: "PAGO", setor: "TES", diasAtras: 75 },
      { estado: "ARQUIVADO", setor: "PROT", diasAtras: 74 },
    ],
    { encerrado: true },
  );

  // 6. Demanda recém-aberta, sem DFD assinado
  await criarCompra(
    "Aquisição de 2 ar-condicionados para a UBS Centro",
    "99999999999",
    "SESAU",
    {
      objeto: "2 aparelhos split 18.000 BTU",
      justificativa: "Sala de vacina sem climatização adequada.",
      quantidade: "2",
      valorEstimado: 7800,
      dataPretendida: `${ano}-12-20`,
      prioridade: "MEDIA",
      noPCA: "NAO",
    },
    [{ estado: "DEMANDA", setor: "SESAU", diasAtras: 1 }],
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

  await db.execute(sql`select 1`);

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

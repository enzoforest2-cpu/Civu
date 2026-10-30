import "server-only";
// Operações do módulo de contratos. Toda checagem de permissão acontece aqui, no servidor.
// O pagamento de cada nota atestada corre num processo do motor (tipo PAGAMENTO_CONTRATO), que entra na fila cronológica.
import { and, eq, max, ne } from "drizzle-orm";
import { db } from "@/db";
import {
  contratoAditivos,
  contratoApostilamentos,
  contratoDiario,
  contratoEtapas,
  contratoMedicoes,
  contratoNotas,
  contratos,
  usuarios,
} from "@/db/schema";
import type { SessaoUsuario } from "@/lib/auth";
import { temPapel } from "@/lib/auth";
import { abrirProcesso, assinarDocumento, juntarDocumento } from "@/lib/engine";
import { FONTES } from "@/lib/workflow";
import { fmtData, fmtMoeda } from "@/lib/dates";
import { fmtCnpj } from "@/lib/pagamentos";
import { exigirEscopo, type SessaoPortal } from "@/lib/portal";
import {
  MODALIDADES_CONTRATO,
  NATUREZAS_CONTRATO,
  TIPOS_ADITIVO,
  ehObra,
  num,
  numeroContrato,
  resumoFinanceiro,
  simularAcrescimo,
  valorMedicao,
} from "./regras";
import { garantirTipoPagamento } from "./dados";

export class ErroContrato extends Error {}

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const COMP = /^\d{4}-(0[1-9]|1[0-2])$/;

export function lerValor(v: string | number | null | undefined): number {
  if (typeof v === "number") return v;
  const s = String(v ?? "").trim();
  if (!s) return NaN;
  // aceita "1.234,56", "1234,56" e "1234.56"
  const limpo = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  return Number(limpo.replace(/[^\d.-]/g, ""));
}

async function contratoDo(municipioId: string, id: string) {
  const c = await db.query.contratos.findFirst({
    where: and(eq(contratos.id, id), eq(contratos.municipioId, municipioId)),
    with: { aditivos: true, apostilamentos: true, notas: true, etapas: true, medicoes: true, empresa: true },
  });
  if (!c) throw new ErroContrato("Contrato não encontrado.");
  return c;
}

export const podeGerir = (u: SessaoUsuario, c: { gestorId: string | null }) => temPapel(u, "COMPRAS") || u.id === c.gestorId;
export const ehFiscalDo = (u: SessaoUsuario, c: { fiscalId: string | null }) => temPapel(u, "ADMIN") || u.id === c.fiscalId;
export const podeEnviarLiquidacao = (u: SessaoUsuario, c: { fiscalId: string | null; gestorId: string | null }) =>
  ehFiscalDo(u, c) || u.id === c.gestorId || temPapel(u, "CONTABILIDADE");

// ---------------------------------------------------------------------------
// Contrato
// ---------------------------------------------------------------------------
export type EtapaEntrada = { nome: string; valor: number; previsto: number[] };
export type NovoContrato = {
  numero?: number;
  ano: number;
  objeto: string;
  natureza: string;
  modalidade: string;
  empresaId: string;
  processoOrigemId?: string | null;
  setorId?: string | null;
  unidadeGestoraId?: string | null;
  valorGlobal: number;
  fonte: string;
  assinadoEm: string;
  vigenciaInicio: string;
  vigenciaFim: string;
  fiscalId: string;
  gestorId: string;
  obraLocal?: string | null;
  obraInicio?: string | null;
  obraPrevisaoFim?: string | null;
  etapas?: EtapaEntrada[];
};

export async function criarContrato(u: SessaoUsuario, d: NovoContrato) {
  if (!temPapel(u, "COMPRAS")) throw new ErroContrato("Só o setor de compras e contratos registra contratos.");
  if (d.objeto.trim().length < 10) throw new ErroContrato("Descreva o objeto do contrato.");
  if (!NATUREZAS_CONTRATO[d.natureza]) throw new ErroContrato("Escolha a natureza do contrato.");
  if (!MODALIDADES_CONTRATO[d.modalidade]) throw new ErroContrato("Escolha a modalidade.");
  if (!FONTES[d.fonte]) throw new ErroContrato("Escolha a fonte de recurso.");
  if (!Number.isFinite(d.valorGlobal) || d.valorGlobal <= 0) throw new ErroContrato("Informe o valor global.");
  for (const x of [d.assinadoEm, d.vigenciaInicio, d.vigenciaFim]) if (!DATA.test(x)) throw new ErroContrato("Informe as datas de assinatura e vigência.");
  if (d.vigenciaFim < d.vigenciaInicio) throw new ErroContrato("O fim da vigência precisa ser depois do início.");
  const emp = await db.query.empresas.findFirst({ where: (e, { eq }) => eq(e.id, d.empresaId) });
  if (!emp) throw new ErroContrato("Escolha a empresa contratada.");
  for (const uid of [d.fiscalId, d.gestorId]) {
    const x = await db.query.usuarios.findFirst({ where: and(eq(usuarios.id, uid), eq(usuarios.municipioId, u.municipioId)) });
    if (!x) throw new ErroContrato("Escolha o fiscal e o gestor do contrato.");
  }
  if (d.fiscalId === d.gestorId) throw new ErroContrato("Fiscal e gestor devem ser pessoas diferentes (segregação de funções).");
  if (d.processoOrigemId) {
    const p = await db.query.processos.findFirst({ where: (p, { and, eq }) => and(eq(p.id, d.processoOrigemId!), eq(p.municipioId, u.municipioId)) });
    if (!p) throw new ErroContrato("Processo de origem não encontrado.");
  }
  const obra = ehObra(d.natureza);
  const etapas = obra ? (d.etapas ?? []).filter((e) => e.nome.trim()) : [];
  if (obra) {
    if (!d.obraInicio || !DATA.test(d.obraInicio)) throw new ErroContrato("Informe a data de início da obra (ordem de serviço).");
    if (!d.obraLocal?.trim()) throw new ErroContrato("Informe o local da obra.");
    if (!etapas.length) throw new ErroContrato("Informe ao menos uma etapa do cronograma.");
    const soma = etapas.reduce((s, e) => s + e.valor, 0);
    if (Math.abs(soma - d.valorGlobal) > 0.05) throw new ErroContrato(`As etapas somam ${fmtMoeda(soma)}; o valor global é ${fmtMoeda(d.valorGlobal)}. Ajuste para fechar.`);
    for (const e of etapas) {
      if (!Number.isFinite(e.valor) || e.valor <= 0) throw new ErroContrato(`Informe o valor da etapa "${e.nome}".`);
      const t = e.previsto.reduce((s, v) => s + v, 0);
      if (e.previsto.some((v) => !Number.isFinite(v) || v < 0) || Math.abs(t - 100) > 0.05)
        throw new ErroContrato(`O previsto da etapa "${e.nome}" precisa somar 100% (soma atual: ${t.toFixed(1)}%).`);
    }
  }
  return db.transaction(async (tx) => {
    let numero = d.numero;
    if (!numero) {
      const [{ m }] = await tx
        .select({ m: max(contratos.numero) })
        .from(contratos)
        .where(and(eq(contratos.municipioId, u.municipioId), eq(contratos.ano, d.ano)));
      numero = (m ?? 0) + 1;
    } else {
      const ja = await tx.query.contratos.findFirst({ where: and(eq(contratos.municipioId, u.municipioId), eq(contratos.ano, d.ano), eq(contratos.numero, numero)) });
      if (ja) throw new ErroContrato(`Já existe o contrato ${numeroContrato({ numero, ano: d.ano })}.`);
    }
    const [c] = await tx
      .insert(contratos)
      .values({
        municipioId: u.municipioId,
        unidadeGestoraId: d.unidadeGestoraId || null,
        ano: d.ano,
        numero,
        objeto: d.objeto.trim(),
        natureza: d.natureza,
        modalidade: d.modalidade,
        empresaId: d.empresaId,
        processoOrigemId: d.processoOrigemId || null,
        setorId: d.setorId || null,
        valorGlobal: d.valorGlobal.toFixed(2),
        fonte: d.fonte,
        assinadoEm: d.assinadoEm,
        vigenciaInicio: d.vigenciaInicio,
        vigenciaFim: d.vigenciaFim,
        fiscalId: d.fiscalId,
        gestorId: d.gestorId,
        obraLocal: obra ? d.obraLocal!.trim() : null,
        obraInicio: obra ? d.obraInicio : null,
        obraPrevisaoFim: obra ? d.obraPrevisaoFim || d.vigenciaFim : null,
        obraSituacao: obra ? "EM_EXECUCAO" : null,
        criadoPorId: u.id,
      })
      .returning();
    if (etapas.length)
      await tx.insert(contratoEtapas).values(etapas.map((e, i) => ({ contratoId: c.id, ordem: i + 1, nome: e.nome.trim(), valor: e.valor.toFixed(2), previsto: e.previsto })));
    return c;
  });
}

export async function registrarAditivo(
  u: SessaoUsuario,
  contratoId: string,
  d: { tipo: string; valor: number; novaVigenciaFim?: string | null; justificativa: string; assinadoEm: string },
) {
  const c = await contratoDo(u.municipioId, contratoId);
  if (!podeGerir(u, c)) throw new ErroContrato("Só compras ou o gestor do contrato registram aditivos.");
  if (c.situacao !== "ATIVO") throw new ErroContrato("Contrato encerrado ou rescindido não recebe aditivo.");
  if (!TIPOS_ADITIVO[d.tipo]) throw new ErroContrato("Escolha o tipo de aditivo.");
  if (!DATA.test(d.assinadoEm)) throw new ErroContrato("Informe a data de assinatura do aditivo.");
  if (d.justificativa.trim().length < 15) throw new ErroContrato("Justifique o aditivo (pelo menos 15 caracteres).");
  const fin = resumoFinanceiro(c, c.aditivos, c.apostilamentos, c.notas);
  let valor = 0;
  if (d.tipo === "VALOR" || d.tipo === "PRAZO_VALOR" || d.tipo === "RENOVACAO") {
    if (!Number.isFinite(d.valor) || d.valor <= 0) throw new ErroContrato("Informe o valor do acréscimo.");
    valor = d.valor;
  } else if (d.tipo === "SUPRESSAO") {
    if (!Number.isFinite(d.valor) || d.valor <= 0) throw new ErroContrato("Informe o valor suprimido.");
    if (d.valor > fin.saldo) throw new ErroContrato("A supressão não pode ser maior que o saldo do contrato.");
    valor = -d.valor;
  }
  let nova: string | null = null;
  if (d.tipo === "PRAZO" || d.tipo === "PRAZO_VALOR" || d.tipo === "RENOVACAO") {
    if (d.tipo === "RENOVACAO" && c.natureza !== "SERVICO_CONTINUO") throw new ErroContrato("A prorrogação do art. 107 vale só para serviços contínuos.");
    if (!d.novaVigenciaFim || !DATA.test(d.novaVigenciaFim)) throw new ErroContrato("Informe a nova data de fim da vigência.");
    if (d.novaVigenciaFim <= fin.vigenciaFimAtual) throw new ErroContrato(`A nova vigência precisa ser depois de ${fmtData(fin.vigenciaFimAtual + "T12:00:00")}.`);
    nova = d.novaVigenciaFim;
  }
  const sim = simularAcrescimo(fin.global + fin.reajustes,fin.acrescimos, valor, c.natureza);
  const numero = c.aditivos.reduce((m, a) => Math.max(m, a.numero), 0) + 1;
  await db.insert(contratoAditivos).values({
    contratoId: c.id,
    numero,
    tipo: d.tipo,
    valor: valor.toFixed(2),
    novaVigenciaFim: nova,
    justificativa: d.justificativa.trim(),
    assinadoEm: d.assinadoEm,
    acrescimoAcumulado: sim.pct.toFixed(2),
    acimaDoLimite: sim.acima,
    criadoPorId: u.id,
  });
  return { numero, ...sim };
}

export async function registrarApostilamento(
  u: SessaoUsuario,
  contratoId: string,
  d: { tipo: string; indice?: string; percentual?: number; valor?: number; descricao: string; data: string },
) {
  const c = await contratoDo(u.municipioId, contratoId);
  if (!podeGerir(u, c)) throw new ErroContrato("Só compras ou o gestor do contrato registram apostilamentos.");
  if (c.situacao !== "ATIVO") throw new ErroContrato("Contrato encerrado ou rescindido.");
  if (!DATA.test(d.data)) throw new ErroContrato("Informe a data do apostilamento.");
  if (d.descricao.trim().length < 10) throw new ErroContrato("Descreva o apostilamento.");
  const fin = resumoFinanceiro(c, c.aditivos, c.apostilamentos, c.notas);
  let valor = 0;
  let percentual: number | null = null;
  if (d.tipo === "REAJUSTE") {
    if (!d.indice?.trim()) throw new ErroContrato("Informe o índice do reajuste (ex.: IPCA).");
    if (!d.percentual || !Number.isFinite(d.percentual) || d.percentual <= 0 || d.percentual > 30) throw new ErroContrato("Informe o percentual do reajuste.");
    percentual = d.percentual;
    // o reajuste incide sobre o saldo ainda não executado
    valor = d.valor && Number.isFinite(d.valor) && d.valor > 0 ? d.valor : Math.round(fin.saldo * d.percentual) / 100;
  }
  const numero = c.apostilamentos.reduce((m, a) => Math.max(m, a.numero), 0) + 1;
  await db.insert(contratoApostilamentos).values({
    contratoId: c.id,
    numero,
    tipo: d.tipo,
    indice: d.indice?.trim() || null,
    percentual: percentual != null ? percentual.toFixed(4) : null,
    valor: valor.toFixed(2),
    descricao: d.descricao.trim(),
    data: d.data,
    criadoPorId: u.id,
  });
  return { numero, valor };
}

export async function encerrarContrato(u: SessaoUsuario, contratoId: string, tipo: "ENCERRADO" | "RESCINDIDO", motivo: string, data: string) {
  const c = await contratoDo(u.municipioId, contratoId);
  if (!podeGerir(u, c)) throw new ErroContrato("Só compras ou o gestor do contrato encerram o contrato.");
  if (c.situacao !== "ATIVO") throw new ErroContrato("O contrato já está encerrado.");
  if (motivo.trim().length < 15) throw new ErroContrato("Explique o motivo (pelo menos 15 caracteres).");
  if (!DATA.test(data)) throw new ErroContrato("Informe a data.");
  await db.update(contratos).set({ situacao: tipo, encerradoEm: data, motivoEncerramento: motivo.trim() }).where(eq(contratos.id, c.id));
}

// ---------------------------------------------------------------------------
// Notas fiscais: registro (servidor ou portal), atesto, glosa e envio à liquidação
// ---------------------------------------------------------------------------
type NovaNota = { numero: string; valor: number; competencia: string; emitidaEm: string; descricao?: string; medicaoId?: string | null };

async function inserirNota(
  c: Awaited<ReturnType<typeof contratoDo>>,
  d: NovaNota,
  origem: { tipo: "PORTAL"; pessoaId: string } | { tipo: "INTERNO"; usuarioId: string },
) {
  const fin = resumoFinanceiro(c, c.aditivos, c.apostilamentos, c.notas);
  if (c.situacao !== "ATIVO") throw new ErroContrato("Este contrato está encerrado ou rescindido e não recebe notas.");
  const numero = d.numero.replace(/\s+/g, "").trim();
  if (!numero) throw new ErroContrato("Informe o número da nota fiscal.");
  if (!Number.isFinite(d.valor) || d.valor <= 0) throw new ErroContrato("Informe o valor da nota.");
  if (!COMP.test(d.competencia)) throw new ErroContrato("Informe o mês de referência (competência).");
  if (!DATA.test(d.emitidaEm)) throw new ErroContrato("Informe a data de emissão.");
  if (d.emitidaEm > new Date().toISOString().slice(0, 10)) throw new ErroContrato("A data de emissão não pode ser futura.");
  if (c.notas.some((n) => n.numero === numero && n.situacao !== "GLOSADA")) throw new ErroContrato(`A nota ${numero} já foi enviada neste contrato.`);
  const disponivel = fin.saldo - fin.aAtestar;
  if (d.valor > disponivel + 0.005)
    throw new ErroContrato(`O valor passa do saldo disponível do contrato (${fmtMoeda(disponivel)}, descontadas as notas ainda em atesto).`);
  let medicaoId: string | null = null;
  if (d.medicaoId) {
    const m = c.medicoes.find((x) => x.id === d.medicaoId);
    if (!m) throw new ErroContrato("Medição não encontrada neste contrato.");
    if (c.notas.some((n) => n.medicaoId === m.id && n.situacao !== "GLOSADA")) throw new ErroContrato("Esta medição já tem nota.");
    medicaoId = m.id;
  }
  // nota glosada com o mesmo número: a nova substitui (o histórico da glosa continua na anterior)
  const glosada = c.notas.find((n) => n.numero === numero && n.situacao === "GLOSADA");
  const numeroFinal = glosada ? `${numero}-R${c.notas.filter((n) => n.numero.startsWith(numero + "-R")).length + 1}` : numero;
  const [n] = await db
    .insert(contratoNotas)
    .values({
      contratoId: c.id,
      numero: numeroFinal,
      valor: d.valor.toFixed(2),
      competencia: d.competencia,
      emitidaEm: d.emitidaEm,
      descricao: d.descricao?.trim() || null,
      medicaoId,
      origem: origem.tipo,
      enviadaPorPessoaId: origem.tipo === "PORTAL" ? origem.pessoaId : null,
      registradaPorId: origem.tipo === "INTERNO" ? origem.usuarioId : null,
    })
    .returning();
  return n;
}

export async function registrarNotaInterna(u: SessaoUsuario, contratoId: string, d: NovaNota) {
  const c = await contratoDo(u.municipioId, contratoId);
  if (!ehFiscalDo(u, c) && !podeGerir(u, c) && !temPapel(u, "PROTOCOLO", "CONTABILIDADE"))
    throw new ErroContrato("Você não pode registrar notas neste contrato.");
  return inserirNota(c, d, { tipo: "INTERNO", usuarioId: u.id });
}

/** Fornecedor envia a nota pelo Civu Empresas. Exige representação com o assunto "Contratos e pagamentos". */
export async function enviarNotaPortal(s: SessaoPortal, contratoId: string, d: NovaNota) {
  if (!s.empresaAtiva) throw new ErroContrato("Escolha a empresa em nome da qual você está agindo.");
  exigirEscopo(s, s.empresaAtiva.id, "CONTRATOS");
  const c0 = await db.query.contratos.findFirst({ where: eq(contratos.id, contratoId), columns: { municipioId: true, empresaId: true } });
  if (!c0 || c0.empresaId !== s.empresaAtiva.id) throw new ErroContrato("Este contrato não é da empresa que você representa.");
  const c = await contratoDo(c0.municipioId, contratoId);
  return inserirNota(c, d, { tipo: "PORTAL", pessoaId: s.pessoa.id });
}

async function notaDo(municipioId: string, notaId: string) {
  const n = await db.query.contratoNotas.findFirst({ where: eq(contratoNotas.id, notaId) });
  if (!n) throw new ErroContrato("Nota não encontrada.");
  const c = await contratoDo(municipioId, n.contratoId);
  return { n, c };
}

export async function atestarNota(u: SessaoUsuario, notaId: string) {
  const { n, c } = await notaDo(u.municipioId, notaId);
  if (!ehFiscalDo(u, c)) throw new ErroContrato("Só o fiscal designado no contrato atesta as notas.");
  if (n.situacao !== "AGUARDANDO_ATESTO") throw new ErroContrato("Esta nota não está aguardando atesto.");
  await db.update(contratoNotas).set({ situacao: "ATESTADA", atestadaEm: new Date(), atestadaPorId: u.id, glosaMotivo: null }).where(eq(contratoNotas.id, n.id));
}

export async function glosarNota(u: SessaoUsuario, notaId: string, motivo: string) {
  const { n, c } = await notaDo(u.municipioId, notaId);
  if (!ehFiscalDo(u, c)) throw new ErroContrato("Só o fiscal designado no contrato glosa as notas.");
  if (n.situacao !== "AGUARDANDO_ATESTO") throw new ErroContrato("Só notas aguardando atesto podem ser glosadas.");
  if (motivo.trim().length < 15) throw new ErroContrato("Explique ao fornecedor o que precisa ser corrigido (pelo menos 15 caracteres).");
  await db.update(contratoNotas).set({ situacao: "GLOSADA", glosaMotivo: motivo.trim(), atestadaEm: new Date(), atestadaPorId: u.id }).where(eq(contratoNotas.id, n.id));
}

/**
 * Envia a nota atestada à liquidação: abre um processo de pagamento no motor com nota fiscal e atesto juntados.
 * Daí em diante, liquidação, fila cronológica e pagamento seguem o processo (e a fila pública de pagamentos).
 */
export async function enviarParaLiquidacao(u: SessaoUsuario, notaId: string) {
  const { n, c } = await notaDo(u.municipioId, notaId);
  if (!podeEnviarLiquidacao(u, c)) throw new ErroContrato("Só o fiscal, o gestor do contrato ou a contabilidade enviam à liquidação.");
  if (n.situacao !== "ATESTADA") throw new ErroContrato("Só notas atestadas seguem para liquidação.");
  const tipoId = await garantirTipoPagamento(u.municipioId);
  const ug =
    c.unidadeGestoraId ??
    (await db.query.unidadesGestoras.findFirst({ where: (g, { and, eq }) => and(eq(g.municipioId, u.municipioId), eq(g.codigo, "01")) }))?.id;
  if (!ug) throw new ErroContrato("Unidade gestora não encontrada.");
  const rotulo = numeroContrato(c);
  const atestador = n.atestadaPorId ? await db.query.usuarios.findFirst({ where: eq(usuarios.id, n.atestadaPorId), columns: { nome: true } }) : null;
  const p = await abrirProcesso(u, {
    tipoId,
    unidadeGestoraId: ug,
    assunto: `Pagamento da NF ${n.numero} — contrato ${rotulo} (${c.empresa.nomeFantasia ?? c.empresa.razaoSocial})`,
    descricao: `${c.objeto}. Competência ${n.competencia}.`,
    metadados: {
      interessado: c.empresa.razaoSocial,
      contratacao: { fornecedor: c.empresa.razaoSocial, cnpj: c.empresa.cnpj, valor: num(n.valor).toFixed(2), fonte: c.fonte },
      contrato: { id: c.id, numero: rotulo, notaId: n.id, nota: n.numero, competencia: n.competencia, processoOrigemId: c.processoOrigemId },
    },
  });
  await juntarDocumento(
    u,
    p.id,
    "NOTA_FISCAL",
    `Nota fiscal ${n.numero}`,
    `Nota fiscal ${n.numero}, emitida em ${fmtData(n.emitidaEm + "T12:00:00")} por ${c.empresa.razaoSocial} (CNPJ ${fmtCnpj(c.empresa.cnpj)}).\n` +
      `Valor: ${fmtMoeda(n.valor)}. Competência: ${n.competencia}.\nContrato ${rotulo}: ${c.objeto}.` +
      (n.descricao ? `\nDescrição: ${n.descricao}` : "") +
      `\n\nRegistro de demonstração: a nota não foi validada na Receita (NF-e) nem no sistema municipal de NFS-e.`,
  );
  const atesto = await juntarDocumento(
    u,
    p.id,
    "ATESTO",
    `Atesto da nota ${n.numero}`,
    `Atesto que os bens ou serviços da nota fiscal ${n.numero} (${fmtMoeda(n.valor)}) foram entregues ou executados conforme o contrato ${rotulo}.\n` +
      `Fiscal: ${atestador?.nome ?? "—"}. Atestado em ${n.atestadaEm ? fmtData(n.atestadaEm) : "—"} no módulo de contratos.`,
  );
  if (u.id === n.atestadaPorId && temPapel(u, "FISCAL")) await assinarDocumento(u, atesto.id, "FISCAL");
  await db.update(contratoNotas).set({ situacao: "LIQUIDACAO", processoId: p.id, enviadaLiquidacaoEm: new Date() }).where(eq(contratoNotas.id, n.id));
  return p;
}

// ---------------------------------------------------------------------------
// Obras: medição, diário e situação
// ---------------------------------------------------------------------------
export async function registrarMedicao(u: SessaoUsuario, contratoId: string, competencia: string, executado: Record<string, number>, observacao?: string) {
  const c = await contratoDo(u.municipioId, contratoId);
  if (!ehObra(c.natureza)) throw new ErroContrato("Medição por etapa é só para obras.");
  if (!ehFiscalDo(u, c)) throw new ErroContrato("Só o fiscal da obra registra a medição.");
  if (c.situacao !== "ATIVO") throw new ErroContrato("Contrato encerrado ou rescindido.");
  if (!COMP.test(competencia)) throw new ErroContrato("Informe o mês da medição.");
  if (c.medicoes.some((m) => m.competencia === competencia)) throw new ErroContrato("Já existe medição neste mês.");
  if (c.obraInicio && competencia < c.obraInicio.slice(0, 7)) throw new ErroContrato("O mês é anterior ao início da obra.");
  const limpo: Record<string, number> = {};
  for (const e of c.etapas) {
    const v = executado[e.id] ?? 0;
    if (!Number.isFinite(v) || v < 0) throw new ErroContrato(`Percentual inválido na etapa "${e.nome}".`);
    const antes = c.medicoes.reduce((s, m) => s + (m.executado[e.id] ?? 0), 0);
    if (antes + v > 100.0001) throw new ErroContrato(`A etapa "${e.nome}" passaria de 100% (já medido: ${antes.toFixed(1)}%).`);
    if (v > 0) limpo[e.id] = v;
  }
  if (!Object.keys(limpo).length) throw new ErroContrato("Informe o percentual executado de ao menos uma etapa.");
  const valor = valorMedicao(c.etapas, limpo);
  const numero = c.medicoes.length + 1;
  const [m] = await db
    .insert(contratoMedicoes)
    .values({ contratoId: c.id, numero, competencia, executado: limpo, valor: valor.toFixed(2), observacao: observacao?.trim() || null, registradaPorId: u.id })
    .returning();
  return m;
}

export async function registrarDiario(u: SessaoUsuario, contratoId: string, d: { data: string; clima?: string; efetivo?: number | null; texto: string }) {
  const c = await contratoDo(u.municipioId, contratoId);
  if (!ehObra(c.natureza)) throw new ErroContrato("Diário é só para obras.");
  if (!ehFiscalDo(u, c) && u.id !== c.gestorId) throw new ErroContrato("Só o fiscal ou o gestor registram o diário da obra.");
  if (!DATA.test(d.data)) throw new ErroContrato("Informe a data.");
  if (d.texto.trim().length < 10) throw new ErroContrato("Descreva o que foi feito no dia.");
  await db.insert(contratoDiario).values({ contratoId: c.id, data: d.data, clima: d.clima?.trim() || null, efetivo: d.efetivo ?? null, texto: d.texto.trim(), autorId: u.id });
}

export async function alterarSituacaoObra(u: SessaoUsuario, contratoId: string, situacao: string, motivo: string) {
  const c = await contratoDo(u.municipioId, contratoId);
  if (!ehObra(c.natureza)) throw new ErroContrato("Este contrato não é de obra.");
  if (!ehFiscalDo(u, c) && !podeGerir(u, c)) throw new ErroContrato("Só o fiscal ou o gestor alteram a situação da obra.");
  if (!["EM_EXECUCAO", "PARALISADA", "CONCLUIDA"].includes(situacao)) throw new ErroContrato("Situação inválida.");
  if (situacao === "PARALISADA" && motivo.trim().length < 15) throw new ErroContrato("Informe o motivo da paralisação (aparece na página pública).");
  await db.update(contratos).set({ obraSituacao: situacao, obraMotivo: motivo.trim() || null }).where(eq(contratos.id, c.id));
}

/** Usuários do município que podem ser fiscal/gestor. */
export async function usuariosDoMunicipio(municipioId: string) {
  return db.query.usuarios.findMany({
    where: and(eq(usuarios.municipioId, municipioId), eq(usuarios.ativo, true), ne(usuarios.cpf, "00000000000")),
    columns: { id: true, nome: true, cargo: true, papeis: true },
    orderBy: usuarios.nome,
  });
}

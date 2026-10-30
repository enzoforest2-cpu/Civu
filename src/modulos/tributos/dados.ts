import "server-only";
// Consultas e regras com banco do módulo de tributos. Toda checagem de acesso do portal é feita aqui, no servidor.
import { redirect } from "next/navigation";
import { and, asc, desc, eq, gte, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  empresas,
  municipios,
  pessoas,
  processos,
  tiposProcesso,
  tribAliquotas,
  tribCertidoes,
  tribDividaAtiva,
  tribGuias,
  tribImoveis,
  tribInscricoes,
  tribItbi,
  tribLancamentos,
  tribLicencas,
  tribParcelas,
  tribPlanta,
  tribPrevisoes,
  tribProprietarios,
} from "@/db/schema";
import { requireUser, type SessaoUsuario } from "@/lib/auth";
import { ErroAcesso, exigirEscopo, type SessaoPortal } from "@/lib/portal";
import { atualizar, avaliarItbi, diaISO, mediana, r2, type Pendencia, tipoCertidao } from "./regras";
import { CHAVE_FLUXO_ALVARA } from "./fluxo";

// ---------------------------------------------------------------------------
// Acesso
// ---------------------------------------------------------------------------
const PAPEIS_TRIBUTOS = ["ADMIN", "TESOURARIA", "CONTABILIDADE", "ORDENADOR"];

export function podeTributos(u: SessaoUsuario) {
  return u.papeis.some((p) => PAPEIS_TRIBUTOS.includes(p));
}

/** Gestão: exige servidor com papel de fazenda (tesouraria, contabilidade, ordenador) ou administrador. */
export async function requireTributos() {
  const u = await requireUser();
  if (!podeTributos(u)) redirect("/painel");
  return u;
}

export type Dono = { tipo: "PESSOA" | "EMPRESA"; id: string; nome: string; documento: string };

/** Contribuinte do contexto atual do portal. Em nome de empresa exige o assunto informado (TRIBUTOS ou LICENCAS). */
export function donoPortal(s: SessaoPortal, escopo: "TRIBUTOS" | "LICENCAS" = "TRIBUTOS"): Dono {
  if (s.empresaAtiva) {
    exigirEscopo(s, s.empresaAtiva.id, escopo);
    return { tipo: "EMPRESA", id: s.empresaAtiva.id, nome: s.empresaAtiva.razaoSocial, documento: s.empresaAtiva.cnpj };
  }
  return { tipo: "PESSOA", id: s.pessoa.id, nome: s.pessoa.nome, documento: s.pessoa.cpf };
}

/** Versão que não lança: devolve o motivo para a tela explicar. */
export function donoPortalOuMotivo(s: SessaoPortal, escopo: "TRIBUTOS" | "LICENCAS" = "TRIBUTOS"): { dono: Dono; motivo: null } | { dono: null; motivo: string } {
  try {
    return { dono: donoPortal(s, escopo), motivo: null };
  } catch (e) {
    if (e instanceof ErroAcesso) return { dono: null, motivo: e.message };
    throw e;
  }
}

const filtroContribuinte = (d: Dono) => (d.tipo === "PESSOA" ? eq(tribLancamentos.contribuintePessoaId, d.id) : eq(tribLancamentos.contribuinteEmpresaId, d.id));
const filtroDevedor = (d: Dono) => (d.tipo === "PESSOA" ? eq(tribDividaAtiva.devedorPessoaId, d.id) : eq(tribDividaAtiva.devedorEmpresaId, d.id));

/** Município do atendimento no portal (a demonstração tem um só). */
export async function municipioPortal(slug?: string) {
  const lista = await db.query.municipios.findMany({ orderBy: municipios.nome });
  return lista.find((m) => m.slug === slug) ?? lista[0];
}

export const hojeISO = () => diaISO(new Date());

// ---------------------------------------------------------------------------
// Imóveis
// ---------------------------------------------------------------------------
export async function meusImoveis(d: Dono) {
  const vinc = await db.query.tribProprietarios.findMany({
    where: and(d.tipo === "PESSOA" ? eq(tribProprietarios.pessoaId, d.id) : eq(tribProprietarios.empresaId, d.id), isNull(tribProprietarios.ate)),
    with: { imovel: true },
  });
  const ids = vinc.map((v) => v.imovelId);
  if (!ids.length) return [];
  const ano = new Date().getFullYear();
  const lancs = await db.query.tribLancamentos.findMany({
    where: and(inArray(tribLancamentos.imovelId, ids), eq(tribLancamentos.tributo, "IPTU")),
    with: { parcelas: { orderBy: (p, { asc }) => [asc(p.numero)] } },
    orderBy: [desc(tribLancamentos.exercicio)],
  });
  const das = await db.query.tribDividaAtiva.findMany({ where: inArray(tribDividaAtiva.lancamentoId, lancs.map((l) => l.id).concat("—")) });
  return vinc.map((v) => {
    const doImovel = lancs.filter((l) => l.imovelId === v.imovelId);
    const atual = doImovel.find((l) => l.exercicio === ano) ?? null;
    return {
      ...v.imovel,
      fracao: v.fracao,
      iptuAtual: atual ? { ...atual, resumo: resumoParcelas(atual.parcelas) } : null,
      dividas: das.filter((x) => doImovel.some((l) => l.id === x.lancamentoId) && (x.situacao === "ATIVA" || x.situacao === "AJUIZADA")),
    };
  });
}

/** Situação das parcelas de um lançamento em linguagem simples. */
export function resumoParcelas(ps: { numero: number; situacao: string; vencimento: string; valor: number }[]) {
  const hoje = hojeISO();
  const unica = ps.find((p) => p.numero === 0);
  const parcelas = ps.filter((p) => p.numero > 0 && p.situacao !== "CANCELADA");
  const pagas = parcelas.filter((p) => p.situacao === "PAGA").length;
  const vencidas = parcelas.filter((p) => p.situacao === "ABERTA" && p.vencimento < hoje);
  const proxima = parcelas.find((p) => p.situacao === "ABERTA" && p.vencimento >= hoje) ?? null;
  const quitadoUnica = unica?.situacao === "PAGA";
  const quitado = quitadoUnica || (parcelas.length > 0 && pagas === parcelas.length);
  const situacao: { tone: "ok" | "warn" | "bad" | "neutral"; texto: string } = quitado
    ? { tone: "ok", texto: quitadoUnica ? "Quitado em cota única" : "Quitado" }
    : vencidas.length
      ? { tone: "bad", texto: `${vencidas.length} ${vencidas.length === 1 ? "parcela vencida" : "parcelas vencidas"}` }
      : pagas > 0
        ? { tone: "ok", texto: `Parcelado em dia (${pagas} de ${parcelas.length} pagas)` }
        : { tone: "neutral", texto: "Em aberto" };
  return { quitado, pagas, total: parcelas.length, vencidas: vencidas.length, proxima, unicaDisponivel: unica && unica.situacao === "ABERTA" && unica.vencimento >= hoje ? unica : null, situacao };
}

export async function carregarImovel(municipioId: string, id: string) {
  const im = await db.query.tribImoveis.findFirst({
    where: and(eq(tribImoveis.id, id), eq(tribImoveis.municipioId, municipioId)),
    with: {
      proprietarios: { with: { pessoa: true, empresa: true }, orderBy: (p, { desc }) => [desc(p.principal)] },
      lancamentos: { with: { parcelas: { orderBy: (p, { asc }) => [asc(p.numero)] } }, orderBy: (l, { desc }) => [desc(l.exercicio), desc(l.lancadoEm)] },
      itbis: { orderBy: (i, { desc }) => [desc(i.declaradoEm)] },
    },
  });
  return im ?? null;
}

/** O imóvel é do contribuinte (vínculo vigente)? */
export async function imovelDoDono(d: Dono, imovelId: string) {
  const v = await db.query.tribProprietarios.findFirst({
    where: and(eq(tribProprietarios.imovelId, imovelId), isNull(tribProprietarios.ate), d.tipo === "PESSOA" ? eq(tribProprietarios.pessoaId, d.id) : eq(tribProprietarios.empresaId, d.id)),
  });
  return Boolean(v);
}

export async function listarImoveis(municipioId: string, f: { q?: string; bairro?: string; uso?: string; pagina?: number }) {
  const cond: SQL[] = [eq(tribImoveis.municipioId, municipioId)];
  if (f.bairro) cond.push(eq(tribImoveis.bairro, f.bairro));
  if (f.uso) cond.push(eq(tribImoveis.uso, f.uso));
  if (f.q) {
    const q = `%${f.q}%`;
    const donos = await db
      .select({ id: tribProprietarios.imovelId })
      .from(tribProprietarios)
      .leftJoin(pessoas, eq(pessoas.id, tribProprietarios.pessoaId))
      .leftJoin(empresas, eq(empresas.id, tribProprietarios.empresaId))
      .where(and(isNull(tribProprietarios.ate), or(ilike(pessoas.nome, q), ilike(empresas.razaoSocial, q), ilike(pessoas.cpf, q), ilike(empresas.cnpj, q))));
    cond.push(or(ilike(tribImoveis.inscricao, q), ilike(tribImoveis.logradouro, q), inArray(tribImoveis.id, donos.map((x) => x.id).concat("—")))!);
  }
  const porPagina = 40;
  const pagina = Math.max(1, f.pagina ?? 1);
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(tribImoveis).where(and(...cond));
  const lista = await db.query.tribImoveis.findMany({
    where: and(...cond),
    with: { proprietarios: { where: isNull(tribProprietarios.ate), with: { pessoa: true, empresa: true } } },
    orderBy: [asc(tribImoveis.inscricao)],
    limit: porPagina,
    offset: (pagina - 1) * porPagina,
  });
  return { lista, total, pagina, paginas: Math.max(1, Math.ceil(total / porPagina)) };
}

export async function bairros(municipioId: string) {
  const ano = new Date().getFullYear();
  return db.query.tribPlanta.findMany({ where: and(eq(tribPlanta.municipioId, municipioId), eq(tribPlanta.exercicio, ano)), orderBy: [desc(tribPlanta.valorM2Construcao)] });
}

export async function aliquotasIptu(municipioId: string, exercicio: number) {
  return db.query.tribAliquotas.findMany({ where: and(eq(tribAliquotas.municipioId, municipioId), eq(tribAliquotas.exercicio, exercicio), eq(tribAliquotas.tributo, "IPTU")) });
}

export function nomeProprietario(p: { pessoa: { nome: string } | null; empresa: { razaoSocial: string } | null }) {
  return p.pessoa?.nome ?? p.empresa?.razaoSocial ?? "—";
}

// ---------------------------------------------------------------------------
// Débitos, guias e pagamento
// ---------------------------------------------------------------------------
export type Debito = {
  parcelaId: string;
  lancamentoId: string;
  tributo: string;
  descricao: string;
  numero: number;
  vencimento: string;
  valor: number;
  desconto: number;
  vencida: boolean;
  acrescimos: number;
  total: number;
};

/** Parcelas em aberto do contribuinte. Cota única só aparece até o vencimento; vencida, o débito segue pelas parcelas. */
export async function debitosEmAberto(d: Dono): Promise<Debito[]> {
  const rows = await db
    .select({ p: tribParcelas, l: tribLancamentos })
    .from(tribParcelas)
    .innerJoin(tribLancamentos, eq(tribLancamentos.id, tribParcelas.lancamentoId))
    .where(and(filtroContribuinte(d), eq(tribParcelas.situacao, "ABERTA"), eq(tribLancamentos.situacao, "ABERTO")))
    .orderBy(asc(tribParcelas.vencimento), asc(tribParcelas.numero));
  const hoje = hojeISO();
  const out: Debito[] = [];
  for (const { p, l } of rows) {
    const vencida = p.vencimento < hoje;
    const temParcelas = rows.some((x) => x.l.id === l.id && x.p.numero > 0);
    if (p.numero === 0 && vencida && temParcelas) continue;
    const a = atualizar(p.valor, p.vencimento);
    out.push({
      parcelaId: p.id,
      lancamentoId: l.id,
      tributo: l.tributo,
      descricao: l.descricao,
      numero: p.numero,
      vencimento: p.vencimento,
      valor: p.valor,
      desconto: p.desconto,
      vencida,
      acrescimos: r2(a.total - p.valor),
      total: a.total,
    });
  }
  return out;
}

export type DividaAtualizada = Awaited<ReturnType<typeof dividasDoDono>>[number];

export async function dividasDoDono(d: Dono) {
  const lista = await db.query.tribDividaAtiva.findMany({
    where: filtroDevedor(d),
    with: { lancamento: true },
    orderBy: [asc(tribDividaAtiva.vencimentoOriginal)],
  });
  return lista.map((x) => ({ ...x, atual: atualizar(x.valorOriginal, x.vencimentoOriginal) }));
}

/** Pendências que entram na certidão (CTN, arts. 205 e 206). */
export async function pendenciasCertidao(d: Dono): Promise<Pendencia[]> {
  const deb = await debitosEmAberto(d);
  const das = await dividasDoDono(d);
  const out: Pendencia[] = [];
  for (const x of deb.filter((x) => x.vencida)) out.push({ tipo: "PARCELA_VENCIDA", descricao: `${x.descricao} — ${x.numero === 0 ? "cota única" : `parcela ${x.numero}`}, venceu em ${x.vencimento.split("-").reverse().join("/")}`, valor: x.total });
  for (const x of das) {
    if (x.situacao === "ATIVA" || x.situacao === "AJUIZADA") out.push({ tipo: "DIVIDA_ATIVA", descricao: `Dívida ativa ${x.numeroInscricao} — ${x.lancamento.descricao}`, valor: x.atual.total });
    if (x.situacao === "PARCELADA" || x.situacao === "SUSPENSA") out.push({ tipo: "DIVIDA_PARCELADA", descricao: `Dívida ativa ${x.numeroInscricao} — parcelada, com exigibilidade suspensa`, valor: x.valorOriginal });
  }
  return out;
}

export async function situacaoFiscal(d: Dono) {
  const p = await pendenciasCertidao(d);
  return { pendencias: p, tipo: tipoCertidao(p) };
}

export async function guiasDoDono(d: Dono) {
  return db.query.tribGuias.findMany({
    where: eq(tribGuias.contribuinteDocumento, d.documento),
    orderBy: [desc(tribGuias.emitidaEm)],
    limit: 30,
  });
}

// ---------------------------------------------------------------------------
// ITBI e observatório
// ---------------------------------------------------------------------------
/** Transações quitadas (24 meses) de um bairro e uso: base de comparação para a referência fiscal. */
export async function comparaveis(municipioId: string, bairro: string, uso: string, antesDe = new Date(), excluirItbiId?: string) {
  const desde = new Date(antesDe.getTime() - 730 * 86400000);
  const rows = await db
    .select({ itbi: tribItbi, im: tribImoveis })
    .from(tribItbi)
    .innerJoin(tribImoveis, eq(tribImoveis.id, tribItbi.imovelId))
    .where(and(eq(tribItbi.municipioId, municipioId), eq(tribItbi.situacao, "PAGO"), eq(tribImoveis.bairro, bairro), eq(tribImoveis.uso, uso), gte(tribItbi.quitadoEm, desde)))
    .orderBy(desc(tribItbi.quitadoEm));
  return rows
    .filter((r) => r.itbi.id !== excluirItbiId && r.im.areaConstruida > 0 && r.itbi.baseCalculo)
    .map((r) => ({ id: r.itbi.id, numero: r.itbi.numero, data: r.itbi.quitadoEm!, area: r.im.areaConstruida, valor: r.itbi.baseCalculo!, m2: r2(r.itbi.baseCalculo! / r.im.areaConstruida), padrao: r.im.padrao, inscricao: r.im.inscricao }));
}

export async function avaliacaoSugerida(municipioId: string, itbi: { id: string; valorDeclarado: number; valorFinanciado: number | null }, im: { bairro: string; uso: string; areaConstruida: number; areaTerreno: number; valorVenal: number }) {
  const comps = await comparaveis(municipioId, im.bairro, im.uso, new Date(), itbi.id);
  const mem = avaliarItbi({ ...im, valorDeclarado: itbi.valorDeclarado, valorFinanciadoSfh: itbi.valorFinanciado, m2Comparaveis: comps.map((c) => c.m2) });
  return { mem, comps };
}

export async function filaItbi(municipioId: string) {
  return db.query.tribItbi.findMany({
    where: eq(tribItbi.municipioId, municipioId),
    with: { imovel: true },
    orderBy: [asc(tribItbi.declaradoEm)],
  });
}

export async function carregarItbi(municipioId: string, id: string) {
  return (
    (await db.query.tribItbi.findFirst({
      where: and(eq(tribItbi.id, id), eq(tribItbi.municipioId, municipioId)),
      with: { imovel: { with: { proprietarios: { with: { pessoa: true, empresa: true } } } }, lancamento: { with: { parcelas: true } }, avaliadoPor: true },
    })) ?? null
  );
}

export async function meusItbi(d: Dono) {
  return db.query.tribItbi.findMany({
    where: d.tipo === "PESSOA" ? eq(tribItbi.compradorPessoaId, d.id) : eq(tribItbi.compradorEmpresaId, d.id),
    with: { imovel: true, lancamento: { with: { parcelas: true } } },
    orderBy: [desc(tribItbi.declaradoEm)],
  });
}

/** Observatório: por bairro, m² transacionado (ITBI quitado, 24 meses) contra o m² da planta (valor venal / área). */
export async function observatorio(municipioId: string, uso = "RESIDENCIAL") {
  const desde = new Date(Date.now() - 730 * 86400000);
  const rows = await db
    .select({ itbi: tribItbi, im: tribImoveis })
    .from(tribItbi)
    .innerJoin(tribImoveis, eq(tribImoveis.id, tribItbi.imovelId))
    .where(and(eq(tribItbi.municipioId, municipioId), eq(tribItbi.situacao, "PAGO"), eq(tribImoveis.uso, uso), gte(tribItbi.quitadoEm, desde)));
  const plantas = await bairros(municipioId);
  const porBairro = new Map<string, { m2: number[]; pgv: number[]; declarado: number[]; datas: Date[]; total: number }>();
  for (const { itbi, im } of rows) {
    if (!im.areaConstruida || !itbi.baseCalculo) continue;
    const b = porBairro.get(im.bairro) ?? { m2: [], pgv: [], declarado: [], datas: [], total: 0 };
    b.m2.push(itbi.baseCalculo / im.areaConstruida);
    b.pgv.push(im.valorVenal / im.areaConstruida);
    b.declarado.push(itbi.valorDeclarado / im.areaConstruida);
    b.datas.push(itbi.quitadoEm!);
    b.total += itbi.baseCalculo;
    porBairro.set(im.bairro, b);
  }
  const linhas = plantas.map((p) => {
    const b = porBairro.get(p.bairro);
    const n = b?.m2.length ?? 0;
    const medM2 = b ? mediana(b.m2)! : null;
    const medPgv = b ? mediana(b.pgv)! : null;
    const min = b ? Math.min(...b.m2) : null;
    const max = b ? Math.max(...b.m2) : null;
    return {
      bairro: p.bairro,
      n,
      medianaM2: medM2 === null ? null : r2(medM2),
      medianaPgvM2: medPgv === null ? null : r2(medPgv),
      faixa: min === null ? null : { min: r2(min), max: r2(max!) },
      razao: medM2 && medPgv ? medPgv / medM2 : null,
      subdeclaracao: b ? b.declarado.filter((x, i) => x < b.m2[i] * 0.95).length : 0,
      volume: b?.total ?? 0,
      ultima: b ? new Date(Math.max(...b.datas.map((d) => d.getTime()))) : null,
      confianca: n >= 8 ? "ADEQUADA" : n >= 5 ? "MODERADA" : n > 0 ? "BAIXA" : "SEM_DADOS",
    } as const;
  });
  // evolução por trimestre (todas as regiões)
  const tri = new Map<string, number[]>();
  for (const { itbi, im } of rows) {
    if (!im.areaConstruida || !itbi.baseCalculo) continue;
    const d = itbi.quitadoEm!;
    const k = `${d.getFullYear()}-T${Math.floor(d.getMonth() / 3) + 1}`;
    tri.set(k, [...(tri.get(k) ?? []), itbi.baseCalculo / im.areaConstruida]);
  }
  const evolucao = [...tri.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, xs]) => ({ periodo: k, n: xs.length, mediana: r2(mediana(xs)!) }));
  return { linhas: linhas.sort((a, b) => (b.medianaM2 ?? 0) - (a.medianaM2 ?? 0)), evolucao, total: rows.length };
}

// ---------------------------------------------------------------------------
// Empresas, alvarás e licenças
// ---------------------------------------------------------------------------
export function situacaoLicenca(validaAte: string, situacao = "VIGENTE"): { tone: "ok" | "warn" | "bad" | "neutral"; texto: string; dias: number } {
  if (situacao === "CANCELADA") return { tone: "neutral", texto: "Cancelada", dias: 0 };
  const dias = Math.ceil((new Date(validaAte + "T23:59:59").getTime() - Date.now()) / 86400000);
  if (dias < 0) return { tone: "bad", texto: `Vencido há ${-dias} ${-dias === 1 ? "dia" : "dias"}`, dias };
  if (dias <= 30) return { tone: "warn", texto: `Vence em ${dias} ${dias === 1 ? "dia" : "dias"}`, dias };
  return { tone: "ok", texto: "Vigente", dias };
}

export async function inscricoesDaEmpresa(empresaId: string) {
  return db.query.tribInscricoes.findMany({
    where: eq(tribInscricoes.empresaId, empresaId),
    with: { empresa: true, licencas: { orderBy: (l, { desc }) => [desc(l.validaAte)] } },
  });
}

export async function listarInscricoes(municipioId: string) {
  return db.query.tribInscricoes.findMany({
    where: eq(tribInscricoes.municipioId, municipioId),
    with: { empresa: true, licencas: { orderBy: (l, { desc }) => [desc(l.validaAte)] } },
    orderBy: [asc(tribInscricoes.numero)],
  });
}

export async function pedidosAlvara(municipioId: string, empresaId?: string) {
  const tipos = await db.query.tiposProcesso.findMany({ where: and(eq(tiposProcesso.municipioId, municipioId), eq(tiposProcesso.chave, CHAVE_FLUXO_ALVARA)) });
  if (!tipos.length) return [];
  return db.query.processos.findMany({
    where: and(eq(processos.municipioId, municipioId), inArray(processos.tipoId, tipos.map((t) => t.id)), empresaId ? eq(processos.interessadoEmpresaId, empresaId) : undefined),
    orderBy: [desc(processos.abertoEm)],
  });
}

export async function carregarLicencaPublica(codigo: string) {
  return (
    (await db.query.tribLicencas.findFirst({
      where: eq(tribLicencas.codigoVerificacao, codigo.toUpperCase().trim()),
      with: { inscricao: { with: { empresa: true } }, municipio: true },
    })) ?? null
  );
}

export async function carregarCertidaoPublica(codigo: string) {
  return (await db.query.tribCertidoes.findFirst({ where: eq(tribCertidoes.codigoVerificacao, codigo.toUpperCase().trim()), with: { municipio: true } })) ?? null;
}

export async function certidoesDoDono(d: Dono) {
  return db.query.tribCertidoes.findMany({ where: eq(tribCertidoes.documento, d.documento), orderBy: [desc(tribCertidoes.emitidaEm)], limit: 10 });
}

// ---------------------------------------------------------------------------
// Visão da gestão
// ---------------------------------------------------------------------------
const GRUPO_RECEITA: Record<string, string> = { IPTU: "IPTU", ITBI: "ITBI", ISS: "ISS", TLF: "TLF", PARCELAMENTO: "PARCELAMENTO" };

export async function arrecadacao(municipioId: string, ano: number) {
  const pago = await db.execute(sql`
    select l.tributo, coalesce(sum(p.valor_pago),0)::float v
    from tramite.trib_parcelas p join tramite.trib_lancamentos l on l.id = p.lancamento_id
    where l.municipio_id = ${municipioId} and p.situacao = 'PAGA' and extract(year from p.pago_em at time zone 'America/Sao_Paulo') = ${ano}
    group by 1`);
  const lancado = await db.execute(sql`
    select tributo, coalesce(sum(valor),0)::float v from tramite.trib_lancamentos
    where municipio_id = ${municipioId} and exercicio = ${ano} and situacao <> 'CANCELADO' group by 1`);
  const prev = await db.query.tribPrevisoes.findMany({ where: and(eq(tribPrevisoes.municipioId, municipioId), eq(tribPrevisoes.exercicio, ano)) });
  const get = (rows: unknown[], t: string) => Number((rows as { tributo: string; v: number }[]).find((r) => r.tributo === t)?.v ?? 0);
  return Object.keys(GRUPO_RECEITA).map((t) => ({
    tributo: t,
    previsto: prev.find((p) => p.tributo === t)?.valorPrevisto ?? 0,
    arrecadado: get(pago.rows, t),
    lancado: get(lancado.rows, t),
  }));
}

/** Inadimplência do exercício: parte do valor já vencido que não foi paga (cota única vencida não conta). */
export async function inadimplencia(municipioId: string, ano: number) {
  const r = await db.execute(sql`
    select l.tributo,
      coalesce(sum(p.valor) filter (where p.situacao in ('ABERTA','PAGA')),0)::float vencido,
      coalesce(sum(p.valor) filter (where p.situacao = 'ABERTA'),0)::float aberto,
      count(distinct l.id) filter (where p.situacao = 'ABERTA')::int contribuintes
    from tramite.trib_parcelas p join tramite.trib_lancamentos l on l.id = p.lancamento_id
    where l.municipio_id = ${municipioId} and l.exercicio = ${ano} and p.vencimento < current_date
      and not (p.numero = 0 and exists (select 1 from tramite.trib_parcelas q where q.lancamento_id = l.id and q.numero > 0))
    group by 1`);
  return (r.rows as { tributo: string; vencido: number; aberto: number; contribuintes: number }[]).map((x) => ({ ...x, taxa: x.vencido ? x.aberto / x.vencido : 0 }));
}

/** Maiores devedores: dívida ativa (atualizada) + parcelas vencidas do exercício, por contribuinte. */
export async function maioresDevedores(municipioId: string, limite = 10) {
  const das = await db.query.tribDividaAtiva.findMany({
    where: and(eq(tribDividaAtiva.municipioId, municipioId), inArray(tribDividaAtiva.situacao, ["ATIVA", "AJUIZADA"])),
    with: { pessoa: true, empresa: true },
  });
  const vencidas = await db
    .select({ p: tribParcelas, l: tribLancamentos, pe: pessoas, em: empresas })
    .from(tribParcelas)
    .innerJoin(tribLancamentos, eq(tribLancamentos.id, tribParcelas.lancamentoId))
    .leftJoin(pessoas, eq(pessoas.id, tribLancamentos.contribuintePessoaId))
    .leftJoin(empresas, eq(empresas.id, tribLancamentos.contribuinteEmpresaId))
    .where(and(eq(tribLancamentos.municipioId, municipioId), eq(tribParcelas.situacao, "ABERTA"), eq(tribLancamentos.situacao, "ABERTO"), sql`${tribParcelas.vencimento} < current_date`, sql`(${tribParcelas.numero} > 0 or ${tribLancamentos.tributo} <> 'IPTU')`));
  const mapa = new Map<string, { nome: string; documento: string; tipo: "PESSOA" | "EMPRESA"; divida: number; vencido: number; inscricoes: number }>();
  const add = (k: string, nome: string, documento: string, tipo: "PESSOA" | "EMPRESA", campo: "divida" | "vencido", v: number) => {
    const x = mapa.get(k) ?? { nome, documento, tipo, divida: 0, vencido: 0, inscricoes: 0 };
    x[campo] += v;
    if (campo === "divida") x.inscricoes += 1;
    mapa.set(k, x);
  };
  for (const d of das) {
    const v = atualizar(d.valorOriginal, d.vencimentoOriginal).total;
    if (d.pessoa) add(d.pessoa.id, d.pessoa.nome, d.pessoa.cpf, "PESSOA", "divida", v);
    else if (d.empresa) add(d.empresa.id, d.empresa.razaoSocial, d.empresa.cnpj, "EMPRESA", "divida", v);
  }
  for (const { p, pe, em } of vencidas) {
    const v = atualizar(p.valor, p.vencimento).total;
    if (pe) add(pe.id, pe.nome, pe.cpf, "PESSOA", "vencido", v);
    else if (em) add(em.id, em.razaoSocial, em.cnpj, "EMPRESA", "vencido", v);
  }
  return [...mapa.values()].map((x) => ({ ...x, total: r2(x.divida + x.vencido) })).sort((a, b) => b.total - a.total).slice(0, limite);
}

export async function listarDividaAtiva(municipioId: string, f: { situacao?: string; tributo?: string }) {
  const lista = await db.query.tribDividaAtiva.findMany({
    where: and(eq(tribDividaAtiva.municipioId, municipioId), f.situacao ? eq(tribDividaAtiva.situacao, f.situacao) : undefined),
    with: { pessoa: true, empresa: true, lancamento: true },
    orderBy: [asc(tribDividaAtiva.numeroInscricao)],
  });
  return lista.filter((d) => !f.tributo || d.lancamento.tributo === f.tributo).map((d) => ({ ...d, atual: atualizar(d.valorOriginal, d.vencimentoOriginal) }));
}

import "server-only";
// Regras e consultas do módulo de serviços urbanos.
// Toda checagem de acesso fica aqui, no servidor: setor responsável na gestão, dono do pedido no portal.
import { and, asc, desc, eq, gte, inArray, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { feriados, setores, servicosCatalogo, servicosEquipes, servicosEventos, servicosOcorrencias, servicosOrdens, type MaterialUsado } from "@/db/schema";
import { temPapel, type SessaoUsuario } from "@/lib/auth";
import { exigirEscopo, type SessaoPortal } from "@/lib/portal";
import { addDiasUteis } from "@/lib/dates";
import { EM_ABERTO, fmtDia, hojeIso, type StatusOcorrencia } from "./constantes";

export class ErroServico extends Error {}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Exec = Tx | typeof db;

// ---------------------------------------------------------------- utilidades

export async function feriadosDe(municipioId: string): Promise<Set<string>> {
  const rows = await db.select({ data: feriados.data }).from(feriados).where(eq(feriados.municipioId, municipioId));
  return new Set(rows.map((r) => String(r.data)));
}

/** Quem pode agir sobre uma ocorrência/OS: servidor do setor responsável ou administrador. */
export function podeAtuar(u: SessaoUsuario, setorId: string) {
  return temPapel(u, "ADMIN") || u.setorId === setorId;
}

function exigeSetor(u: SessaoUsuario, setorId: string) {
  if (!podeAtuar(u, setorId)) throw new ErroServico("Esta ocorrência é de outra secretaria. Só a secretaria responsável pode movimentá-la.");
}

type Autor = { usuario?: SessaoUsuario; pessoaId?: string; nome: string };

export async function registrarEvento(
  tx: Exec,
  ocorrenciaId: string,
  tipo: string,
  texto: string,
  autor: Autor,
  opts: { publico?: boolean; dados?: Record<string, unknown>; criadoEm?: Date } = {},
) {
  await tx.insert(servicosEventos).values({
    ocorrenciaId,
    tipo,
    texto,
    publico: opts.publico ?? true,
    autorUsuarioId: autor.usuario?.id ?? null,
    autorPessoaId: autor.pessoaId ?? null,
    autorNome: autor.nome,
    dados: { ...(opts.dados ?? {}), ...(autor.usuario?.setor ? { setor: autor.usuario.setor.nome } : {}) },
    ...(opts.criadoEm ? { criadoEm: opts.criadoEm } : {}),
  });
}

/** Próximo número sequencial do ano, com trava por município para não repetir. */
async function proximoSequencial(tx: Tx, municipioId: string, ano: number, tabela: "ocorrencia" | "ordem") {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${tabela + ":" + municipioId}))`);
  const t = tabela === "ocorrencia" ? servicosOcorrencias : servicosOrdens;
  const [r] = await tx
    .select({ max: sql<number>`coalesce(max(${t.sequencial}), 0)::int` })
    .from(t)
    .where(and(eq(t.municipioId, municipioId), eq(t.ano, ano)));
  return (r?.max ?? 0) + 1;
}

export const numeroProtocolo = (ano: number, seq: number) => `SU-${ano}-${String(seq).padStart(5, "0")}`;
export const numeroOrdem = (ano: number, seq: number) => `OS-${ano}-${String(seq).padStart(4, "0")}`;

export function atrasada(o: { status: string; prazoEm: Date }, agora = Date.now()) {
  return EM_ABERTO.includes(o.status as StatusOcorrencia) && o.prazoEm.getTime() < agora;
}

// ---------------------------------------------------------------- catálogo e equipes

export async function catalogo(municipioId: string, somenteAtivos = true) {
  return db.query.servicosCatalogo.findMany({
    where: somenteAtivos ? and(eq(servicosCatalogo.municipioId, municipioId), eq(servicosCatalogo.ativo, true)) : eq(servicosCatalogo.municipioId, municipioId),
    with: { setor: true },
    orderBy: [asc(servicosCatalogo.ordem), asc(servicosCatalogo.nome)],
  });
}

/** Secretarias que respondem por algum serviço do catálogo. */
export async function setoresResponsaveis(municipioId: string) {
  const cat = await catalogo(municipioId, false);
  const m = new Map<string, { id: string; sigla: string; nome: string }>();
  for (const c of cat) m.set(c.setor.id, { id: c.setor.id, sigla: c.setor.sigla, nome: c.setor.nome });
  return [...m.values()].sort((a, b) => a.nome.localeCompare(b.nome));
}

export async function todosSetores(municipioId: string) {
  return db.query.setores.findMany({ where: eq(setores.municipioId, municipioId), orderBy: asc(setores.nome) });
}

export async function equipes(municipioId: string, setorId?: string) {
  return db.query.servicosEquipes.findMany({
    where: setorId ? and(eq(servicosEquipes.municipioId, municipioId), eq(servicosEquipes.setorId, setorId)) : eq(servicosEquipes.municipioId, municipioId),
    with: { setor: true, encarregado: true },
    orderBy: [asc(servicosEquipes.nome)],
  });
}

export async function salvarServico(
  u: SessaoUsuario,
  input: { id?: string; nome: string; descricao: string; categoria: string; setorId: string; slaDiasUteis: number; exigeFoto: boolean; ativo: boolean },
) {
  if (!temPapel(u, "ADMIN", "SECRETARIO")) throw new ErroServico("Só administradores e secretários configuram o catálogo.");
  if (!input.nome.trim()) throw new ErroServico("Dê um nome ao serviço.");
  if (!Number.isInteger(input.slaDiasUteis) || input.slaDiasUteis < 1 || input.slaDiasUteis > 120)
    throw new ErroServico("O prazo-alvo deve ficar entre 1 e 120 dias úteis.");
  const setor = await db.query.setores.findFirst({ where: and(eq(setores.id, input.setorId), eq(setores.municipioId, u.municipioId)) });
  if (!setor) throw new ErroServico("Escolha a secretaria responsável.");
  if (input.id) {
    const atual = await db.query.servicosCatalogo.findFirst({ where: and(eq(servicosCatalogo.id, input.id), eq(servicosCatalogo.municipioId, u.municipioId)) });
    if (!atual) throw new ErroServico("Serviço não encontrado.");
    if (!temPapel(u, "ADMIN") && atual.setorId !== u.setorId) throw new ErroServico("Este serviço é de outra secretaria.");
    await db
      .update(servicosCatalogo)
      .set({
        nome: input.nome.trim(),
        descricao: input.descricao.trim() || null,
        categoria: input.categoria,
        setorId: setor.id,
        slaDiasUteis: input.slaDiasUteis,
        exigeFoto: input.exigeFoto,
        ativo: input.ativo,
      })
      .where(eq(servicosCatalogo.id, atual.id));
    return;
  }
  const chave =
    input.nome
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "servico";
  const existe = await db.query.servicosCatalogo.findFirst({ where: and(eq(servicosCatalogo.municipioId, u.municipioId), eq(servicosCatalogo.chave, chave)) });
  if (existe) throw new ErroServico("Já existe um serviço com esse nome.");
  await db.insert(servicosCatalogo).values({
    municipioId: u.municipioId,
    chave,
    nome: input.nome.trim(),
    descricao: input.descricao.trim() || null,
    categoria: input.categoria,
    setorId: setor.id,
    slaDiasUteis: input.slaDiasUteis,
    exigeFoto: input.exigeFoto,
    ativo: input.ativo,
    ordem: 80,
  });
}

export async function criarEquipe(u: SessaoUsuario, input: { nome: string; setorId: string; membros: string }) {
  if (!input.nome.trim()) throw new ErroServico("Dê um nome à equipe.");
  const setor = await db.query.setores.findFirst({ where: and(eq(setores.id, input.setorId), eq(setores.municipioId, u.municipioId)) });
  if (!setor) throw new ErroServico("Escolha a secretaria da equipe.");
  exigeSetor(u, setor.id);
  await db.insert(servicosEquipes).values({ municipioId: u.municipioId, setorId: setor.id, nome: input.nome.trim(), membros: input.membros.trim() || null });
}

// ---------------------------------------------------------------- portal (cidadão)

function filtroDono(s: SessaoPortal) {
  if (s.empresaAtiva) {
    exigirEscopo(s, s.empresaAtiva.id, "PROCESSOS");
    return eq(servicosOcorrencias.solicitanteEmpresaId, s.empresaAtiva.id);
  }
  return and(eq(servicosOcorrencias.solicitantePessoaId, s.pessoa.id), isNull(servicosOcorrencias.solicitanteEmpresaId));
}

/** Município do portal. Nesta versão há um município por instalação; usa o primeiro com catálogo. */
export async function municipioDoPortal(): Promise<string | null> {
  const r = await db.query.servicosCatalogo.findFirst({ columns: { municipioId: true } });
  return r?.municipioId ?? null;
}

export async function registrarOcorrencia(
  s: SessaoPortal,
  input: {
    servicoId: string;
    logradouro: string;
    numero: string;
    referencia: string;
    bairro: string;
    descricao: string;
    lat?: number | null;
    lng?: number | null;
  },
) {
  if (s.empresaAtiva) exigirEscopo(s, s.empresaAtiva.id, "PROCESSOS");
  const servico = await db.query.servicosCatalogo.findFirst({ where: and(eq(servicosCatalogo.id, input.servicoId), eq(servicosCatalogo.ativo, true)) });
  if (!servico) throw new ErroServico("Escolha um serviço da lista.");
  if (input.logradouro.trim().length < 3) throw new ErroServico("Informe a rua ou o local do problema.");
  if (!input.bairro.trim()) throw new ErroServico("Informe o bairro.");
  if (input.descricao.trim().length < 10) throw new ErroServico("Descreva o problema com um pouco mais de detalhe (ao menos 10 letras).");
  for (const [v, min, max, nome] of [
    [input.lat, -90, 90, "latitude"],
    [input.lng, -180, 180, "longitude"],
  ] as const)
    if (v !== null && v !== undefined && (Number.isNaN(v) || v < min || v > max)) throw new ErroServico(`A ${nome} informada não é válida.`);
  const fer = await feriadosDe(servico.municipioId);
  const agora = new Date();
  const ano = agora.getFullYear();
  const nome = s.empresaAtiva ? `${s.empresaAtiva.razaoSocial} (por ${s.pessoa.nome})` : s.pessoa.nome;
  return db.transaction(async (tx) => {
    const seq = await proximoSequencial(tx, servico.municipioId, ano, "ocorrencia");
    const protocolo = numeroProtocolo(ano, seq);
    const [o] = await tx
      .insert(servicosOcorrencias)
      .values({
        municipioId: servico.municipioId,
        servicoId: servico.id,
        setorId: servico.setorId,
        ano,
        sequencial: seq,
        protocolo,
        status: "ABERTA",
        canal: "PORTAL",
        solicitantePessoaId: s.pessoa.id,
        solicitanteEmpresaId: s.empresaAtiva?.id ?? null,
        solicitanteNome: nome,
        logradouro: input.logradouro.trim(),
        numero: input.numero.trim() || null,
        referencia: input.referencia.trim() || null,
        bairro: input.bairro.trim(),
        lat: input.lat ?? null,
        lng: input.lng ?? null,
        descricao: input.descricao.trim(),
        abertaEm: agora,
        prazoEm: addDiasUteis(agora, servico.slaDiasUteis, fer),
      })
      .returning();
    await registrarEvento(tx, o.id, "REGISTRO", `Pedido registrado pelo ${s.empresaAtiva ? "Civu Empresas" : "Civu Cidadão"}. Protocolo ${protocolo}.`, {
      pessoaId: s.pessoa.id,
      nome,
    });
    return o;
  });
}

export async function minhasOcorrencias(s: SessaoPortal) {
  if (s.empresaAtiva && !s.escoposAtivos.includes("PROCESSOS")) return [];
  return db.query.servicosOcorrencias.findMany({
    where: filtroDono(s),
    with: { servico: true, ordem: true, duplicadaDe: { with: { ordem: true } } },
    orderBy: [desc(servicosOcorrencias.abertaEm)],
  });
}

export async function carregarMinhaOcorrencia(s: SessaoPortal, id: string) {
  const o = await db.query.servicosOcorrencias.findFirst({
    where: eq(servicosOcorrencias.id, id),
    with: {
      servico: true,
      setor: true,
      ordem: true,
      duplicadaDe: { with: { ordem: true } },
      eventos: { where: eq(servicosEventos.publico, true), orderBy: [asc(servicosEventos.criadoEm)] },
    },
  });
  if (!o) return null;
  const meu = s.empresaAtiva ? o.solicitanteEmpresaId === s.empresaAtiva.id : o.solicitantePessoaId === s.pessoa.id && !o.solicitanteEmpresaId;
  if (!meu) throw new ErroServico("Este pedido não pertence a quem você está representando agora.");
  if (s.empresaAtiva) exigirEscopo(s, s.empresaAtiva.id, "PROCESSOS");
  return o;
}

/** Previsão mostrada ao cidadão: data programada da OS, ou o fim do prazo-alvo. */
export function previsao(o: { status: string; prazoEm: Date; ordem?: { programadaPara: string | null } | null }): string | null {
  if (!EM_ABERTO.includes(o.status as StatusOcorrencia)) return null;
  if (o.ordem?.programadaPara) return `${o.status === "EM_EXECUCAO" ? "Em execução desde" : "Programado para"} ${fmtDia(o.ordem.programadaPara)}`;
  return `Previsão de atendimento até ${o.prazoEm.toLocaleDateString("pt-BR", { timeZone: "America/Fortaleza" })}`;
}

export async function avaliar(s: SessaoPortal, id: string, nota: number, comentario: string) {
  const o = await carregarMinhaOcorrencia(s, id);
  if (!o) throw new ErroServico("Pedido não encontrado.");
  if (o.status !== "CONCLUIDA") throw new ErroServico("A avaliação abre quando o serviço é concluído.");
  if (o.avaliacaoNota) throw new ErroServico("Este pedido já foi avaliado.");
  if (!Number.isInteger(nota) || nota < 1 || nota > 5) throw new ErroServico("Escolha uma nota de 1 a 5.");
  await db.transaction(async (tx) => {
    await tx
      .update(servicosOcorrencias)
      .set({ avaliacaoNota: nota, avaliacaoComentario: comentario.trim() || null, avaliadaEm: new Date() })
      .where(eq(servicosOcorrencias.id, o.id));
    await registrarEvento(
      tx,
      o.id,
      "AVALIACAO",
      `Atendimento avaliado com nota ${nota} de 5.${comentario.trim() ? ` “${comentario.trim()}”` : ""}`,
      {
        pessoaId: s.pessoa.id,
        nome: s.pessoa.nome,
      },
      { dados: { nota } },
    );
  });
}

// ---------------------------------------------------------------- gestão: fila e triagem

export type FiltroFila = { setorId?: string; servicoId?: string; bairro?: string; situacao?: string; atrasadas?: boolean };

export const SITUACOES_FILA: Record<string, { rotulo: string; status: StatusOcorrencia[] | null }> = {
  abertas: { rotulo: "Em aberto", status: EM_ABERTO },
  triagem: { rotulo: "Aguardando triagem", status: ["ABERTA"] },
  aceitas: { rotulo: "Aceitas, sem OS", status: ["ACEITA"] },
  programadas: { rotulo: "Programadas ou em execução", status: ["PROGRAMADA", "EM_EXECUCAO"] },
  concluidas: { rotulo: "Concluídas", status: ["CONCLUIDA"] },
  encerradas: { rotulo: "Recusadas ou duplicadas", status: ["RECUSADA", "DUPLICADA"] },
  todas: { rotulo: "Todas", status: null },
};

export async function fila(municipioId: string, f: FiltroFila) {
  const sit = SITUACOES_FILA[f.situacao ?? "abertas"] ?? SITUACOES_FILA.abertas;
  const conds = [eq(servicosOcorrencias.municipioId, municipioId)];
  if (f.setorId) conds.push(eq(servicosOcorrencias.setorId, f.setorId));
  if (f.servicoId) conds.push(eq(servicosOcorrencias.servicoId, f.servicoId));
  if (f.bairro) conds.push(eq(servicosOcorrencias.bairro, f.bairro));
  if (sit.status) conds.push(inArray(servicosOcorrencias.status, sit.status));
  let lista = await db.query.servicosOcorrencias.findMany({
    where: and(...conds),
    with: { servico: true, setor: true, ordem: { with: { equipe: true } } },
    orderBy: [asc(servicosOcorrencias.prazoEm)],
  });
  if (f.atrasadas) lista = lista.filter((o) => atrasada(o));
  // em aberto: atrasadas primeiro, depois prazo; encerradas: mais recentes primeiro
  if (sit.status && sit.status.every((x) => !EM_ABERTO.includes(x)))
    lista.sort((a, b) => (b.concluidaEm ?? b.abertaEm).getTime() - (a.concluidaEm ?? a.abertaEm).getTime());
  return lista;
}

export async function bairrosComOcorrencias(municipioId: string) {
  const rows = await db
    .selectDistinct({ bairro: servicosOcorrencias.bairro })
    .from(servicosOcorrencias)
    .where(eq(servicosOcorrencias.municipioId, municipioId));
  return rows.map((r) => r.bairro).sort((a, b) => a.localeCompare(b));
}

export async function contagemPorSetor(municipioId: string) {
  const rows = await db
    .select({ setorId: servicosOcorrencias.setorId, status: servicosOcorrencias.status, prazoEm: servicosOcorrencias.prazoEm })
    .from(servicosOcorrencias)
    .where(and(eq(servicosOcorrencias.municipioId, municipioId), inArray(servicosOcorrencias.status, EM_ABERTO)));
  const m = new Map<string, { abertas: number; atrasadas: number; triagem: number }>();
  for (const r of rows) {
    const c = m.get(r.setorId) ?? { abertas: 0, atrasadas: 0, triagem: 0 };
    c.abertas += 1;
    if (atrasada(r)) c.atrasadas += 1;
    if (r.status === "ABERTA") c.triagem += 1;
    m.set(r.setorId, c);
  }
  return m;
}

export async function carregarOcorrencia(municipioId: string, id: string) {
  const o = await db.query.servicosOcorrencias.findFirst({
    where: and(eq(servicosOcorrencias.id, id), eq(servicosOcorrencias.municipioId, municipioId)),
    with: {
      servico: true,
      setor: true,
      ordem: { with: { equipe: true } },
      duplicadaDe: true,
      duplicadas: true,
      pessoa: true,
      empresa: true,
      eventos: { orderBy: [asc(servicosEventos.criadoEm)] },
    },
  });
  return o ?? null;
}

/** Ocorrências que podem ser a "principal" de uma duplicada: mesmo serviço, ainda em aberto. Mesmo bairro primeiro. */
export async function candidatasDuplicidade(o: { id: string; municipioId: string; servicoId: string; bairro: string }) {
  const lista = await db.query.servicosOcorrencias.findMany({
    where: and(
      eq(servicosOcorrencias.municipioId, o.municipioId),
      eq(servicosOcorrencias.servicoId, o.servicoId),
      ne(servicosOcorrencias.id, o.id),
      inArray(servicosOcorrencias.status, EM_ABERTO),
    ),
    orderBy: [asc(servicosOcorrencias.abertaEm)],
  });
  return lista.sort((a, b) => Number(b.bairro === o.bairro) - Number(a.bairro === o.bairro)).slice(0, 20);
}

async function ocorrenciaParaAgir(u: SessaoUsuario, id: string) {
  const o = await db.query.servicosOcorrencias.findFirst({ where: and(eq(servicosOcorrencias.id, id), eq(servicosOcorrencias.municipioId, u.municipioId)) });
  if (!o) throw new ErroServico("Ocorrência não encontrada.");
  exigeSetor(u, o.setorId);
  return o;
}

export async function aceitar(u: SessaoUsuario, id: string) {
  const o = await ocorrenciaParaAgir(u, id);
  if (o.status !== "ABERTA") throw new ErroServico("Só é possível aceitar ocorrências aguardando triagem.");
  await db.transaction(async (tx) => {
    await tx.update(servicosOcorrencias).set({ status: "ACEITA", triadaEm: new Date() }).where(eq(servicosOcorrencias.id, o.id));
    await registrarEvento(tx, o.id, "ACEITE", "Pedido analisado e aceito pela secretaria. Ele entra na programação das equipes.", { usuario: u, nome: u.nome });
  });
}

export async function recusar(u: SessaoUsuario, id: string, motivo: string) {
  const o = await ocorrenciaParaAgir(u, id);
  if (!["ABERTA", "ACEITA"].includes(o.status)) throw new ErroServico("Só é possível recusar ocorrências que ainda não estão numa ordem de serviço.");
  if (motivo.trim().length < 10) throw new ErroServico("Explique o motivo da recusa ao cidadão (ao menos 10 letras).");
  await db.transaction(async (tx) => {
    await tx
      .update(servicosOcorrencias)
      .set({ status: "RECUSADA", motivoRecusa: motivo.trim(), triadaEm: o.triadaEm ?? new Date() })
      .where(eq(servicosOcorrencias.id, o.id));
    await registrarEvento(tx, o.id, "RECUSA", `Pedido não será atendido: ${motivo.trim()}`, { usuario: u, nome: u.nome });
  });
}

export async function marcarDuplicada(u: SessaoUsuario, id: string, principalId: string) {
  const o = await ocorrenciaParaAgir(u, id);
  if (!["ABERTA", "ACEITA"].includes(o.status))
    throw new ErroServico("Só é possível marcar como duplicada uma ocorrência que ainda não está numa ordem de serviço.");
  if (principalId === o.id) throw new ErroServico("Escolha outra ocorrência como principal.");
  const p = await db.query.servicosOcorrencias.findFirst({
    where: and(eq(servicosOcorrencias.id, principalId), eq(servicosOcorrencias.municipioId, u.municipioId)),
  });
  if (!p) throw new ErroServico("Ocorrência principal não encontrada.");
  if (p.duplicadaDeId) throw new ErroServico(`A ${p.protocolo} já é duplicada de outra; vincule à principal.`);
  if (!EM_ABERTO.includes(p.status as StatusOcorrencia)) throw new ErroServico("A ocorrência principal já foi encerrada.");
  await db.transaction(async (tx) => {
    await tx.update(servicosOcorrencias).set({ status: "DUPLICADA", duplicadaDeId: p.id, triadaEm: new Date() }).where(eq(servicosOcorrencias.id, o.id));
    // pedidos que já apontavam para esta passam a apontar para a principal
    await tx.update(servicosOcorrencias).set({ duplicadaDeId: p.id }).where(eq(servicosOcorrencias.duplicadaDeId, o.id));
    await registrarEvento(
      tx,
      o.id,
      "DUPLICIDADE",
      `O mesmo problema já tinha sido informado no pedido ${p.protocolo}. Os dois serão atendidos juntos e você acompanha por aqui.`,
      { usuario: u, nome: u.nome },
      { dados: { principalId: p.id, principal: p.protocolo } },
    );
    await registrarEvento(
      tx,
      p.id,
      "DUPLICIDADE",
      `Pedido ${o.protocolo} vinculado a este como duplicado.`,
      { usuario: u, nome: u.nome },
      { publico: false, dados: { duplicadaId: o.id } },
    );
  });
}

export async function encaminhar(u: SessaoUsuario, id: string, setorId: string, motivo: string) {
  const o = await ocorrenciaParaAgir(u, id);
  if (!["ABERTA", "ACEITA"].includes(o.status)) throw new ErroServico("Só é possível encaminhar ocorrências que ainda não estão numa ordem de serviço.");
  const destino = await db.query.setores.findFirst({ where: and(eq(setores.id, setorId), eq(setores.municipioId, u.municipioId)) });
  if (!destino) throw new ErroServico("Escolha a secretaria de destino.");
  if (destino.id === o.setorId) throw new ErroServico("A ocorrência já está nesta secretaria.");
  await db.transaction(async (tx) => {
    await tx.update(servicosOcorrencias).set({ setorId: destino.id, status: "ABERTA" }).where(eq(servicosOcorrencias.id, o.id));
    await registrarEvento(
      tx,
      o.id,
      "ENCAMINHAMENTO",
      `Pedido encaminhado para ${destino.nome}, responsável por este atendimento.`,
      { usuario: u, nome: u.nome },
      {
        dados: { motivo: motivo.trim() || null },
      },
    );
    if (motivo.trim()) await registrarEvento(tx, o.id, "NOTA", `Motivo do encaminhamento: ${motivo.trim()}`, { usuario: u, nome: u.nome }, { publico: false });
  });
}

export async function notaInterna(u: SessaoUsuario, id: string, texto: string) {
  const o = await ocorrenciaParaAgir(u, id);
  if (texto.trim().length < 3) throw new ErroServico("Escreva a anotação.");
  await registrarEvento(db, o.id, "NOTA", texto.trim(), { usuario: u, nome: u.nome }, { publico: false });
}

// ---------------------------------------------------------------- ordens de serviço

export async function ocorrenciasParaOrdem(u: SessaoUsuario, ids: string[]) {
  if (!ids.length) return [];
  return db.query.servicosOcorrencias.findMany({
    where: and(eq(servicosOcorrencias.municipioId, u.municipioId), inArray(servicosOcorrencias.id, ids)),
    with: { servico: true, setor: true },
    orderBy: [asc(servicosOcorrencias.bairro), asc(servicosOcorrencias.logradouro)],
  });
}

export async function criarOrdem(u: SessaoUsuario, input: { ocorrenciaIds: string[]; equipeId: string; data: string; instrucoes: string }) {
  const ids = [...new Set(input.ocorrenciaIds)];
  if (!ids.length) throw new ErroServico("Selecione ao menos uma ocorrência.");
  const ocs = await ocorrenciasParaOrdem(u, ids);
  if (ocs.length !== ids.length) throw new ErroServico("Alguma ocorrência selecionada não foi encontrada.");
  const setorId = ocs[0].setorId;
  if (ocs.some((o) => o.setorId !== setorId)) throw new ErroServico("Uma ordem de serviço reúne ocorrências de uma única secretaria.");
  exigeSetor(u, setorId);
  const fora = ocs.filter((o) => !["ABERTA", "ACEITA"].includes(o.status));
  if (fora.length) throw new ErroServico(`Já estão em outra OS ou encerradas: ${fora.map((o) => o.protocolo).join(", ")}.`);
  const equipe = await db.query.servicosEquipes.findFirst({
    where: and(eq(servicosEquipes.id, input.equipeId), eq(servicosEquipes.municipioId, u.municipioId)),
  });
  if (!equipe || equipe.setorId !== setorId) throw new ErroServico("Escolha uma equipe da secretaria responsável.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.data)) throw new ErroServico("Informe a data programada.");
  if (input.data < hojeIso()) throw new ErroServico("A data programada não pode estar no passado.");
  const ano = new Date().getFullYear();
  return db.transaction(async (tx) => {
    const seq = await proximoSequencial(tx, u.municipioId, ano, "ordem");
    const numero = numeroOrdem(ano, seq);
    const [os] = await tx
      .insert(servicosOrdens)
      .values({
        municipioId: u.municipioId,
        setorId,
        ano,
        sequencial: seq,
        numero,
        equipeId: equipe.id,
        status: "PROGRAMADA",
        programadaPara: input.data,
        instrucoes: input.instrucoes.trim() || null,
        criadaPorId: u.id,
      })
      .returning();
    const agora = new Date();
    for (const o of ocs) {
      await tx
        .update(servicosOcorrencias)
        .set({ status: "PROGRAMADA", ordemId: os.id, triadaEm: o.triadaEm ?? agora })
        .where(eq(servicosOcorrencias.id, o.id));
      if (o.status === "ABERTA") await registrarEvento(tx, o.id, "ACEITE", "Pedido analisado e aceito pela secretaria.", { usuario: u, nome: u.nome });
      await registrarEvento(
        tx,
        o.id,
        "PROGRAMACAO",
        `Serviço programado para ${fmtDia(input.data)}.`,
        { usuario: u, nome: u.nome },
        {
          dados: { ordemId: os.id, ordem: numero, equipe: equipe.nome, data: input.data },
        },
      );
      await registrarEvento(
        tx,
        o.id,
        "ORDEM",
        `Incluída na ${numero}, equipe ${equipe.nome}.`,
        { usuario: u, nome: u.nome },
        { publico: false, dados: { ordemId: os.id } },
      );
    }
    return os;
  });
}

export async function listarOrdens(municipioId: string, f: { setorId?: string; status?: string }) {
  const conds = [eq(servicosOrdens.municipioId, municipioId)];
  if (f.setorId) conds.push(eq(servicosOrdens.setorId, f.setorId));
  if (f.status === "abertas") conds.push(inArray(servicosOrdens.status, ["PROGRAMADA", "EM_EXECUCAO"]));
  else if (f.status && f.status !== "todas") conds.push(eq(servicosOrdens.status, f.status));
  return db.query.servicosOrdens.findMany({
    where: and(...conds),
    with: { equipe: true, setor: true, ocorrencias: { with: { servico: true } } },
    orderBy: [desc(servicosOrdens.programadaPara), desc(servicosOrdens.criadaEm)],
  });
}

export async function carregarOrdem(municipioId: string, id: string) {
  const os = await db.query.servicosOrdens.findFirst({
    where: and(eq(servicosOrdens.id, id), eq(servicosOrdens.municipioId, municipioId)),
    with: {
      equipe: true,
      setor: true,
      criadaPor: true,
      ocorrencias: { with: { servico: true, duplicadas: true }, orderBy: [asc(servicosOcorrencias.bairro)] },
    },
  });
  return os ?? null;
}

/** Equipe de campo: encarregado da equipe da OS, ou servidor da secretaria. */
async function ordemParaAgir(u: SessaoUsuario, id: string) {
  const os = await db.query.servicosOrdens.findFirst({
    where: and(eq(servicosOrdens.id, id), eq(servicosOrdens.municipioId, u.municipioId)),
    with: { equipe: true },
  });
  if (!os) throw new ErroServico("Ordem de serviço não encontrada.");
  if (os.equipe?.encarregadoId !== u.id) exigeSetor(u, os.setorId);
  return os;
}

export async function reprogramarOrdem(u: SessaoUsuario, id: string, input: { equipeId: string; data: string; motivo: string }) {
  const os = await ordemParaAgir(u, id);
  if (!["PROGRAMADA", "EM_EXECUCAO"].includes(os.status)) throw new ErroServico("Esta OS já foi encerrada.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.data)) throw new ErroServico("Informe a nova data.");
  if (input.data < hojeIso()) throw new ErroServico("A nova data não pode estar no passado.");
  if (input.motivo.trim().length < 5) throw new ErroServico("Informe o motivo da mudança; ele aparece para o cidadão.");
  const equipe = await db.query.servicosEquipes.findFirst({ where: and(eq(servicosEquipes.id, input.equipeId), eq(servicosEquipes.setorId, os.setorId)) });
  if (!equipe) throw new ErroServico("Escolha uma equipe da secretaria.");
  const mudouData = input.data !== os.programadaPara;
  await db.transaction(async (tx) => {
    await tx.update(servicosOrdens).set({ equipeId: equipe.id, programadaPara: input.data }).where(eq(servicosOrdens.id, os.id));
    const ocs = await tx.query.servicosOcorrencias.findMany({ where: eq(servicosOcorrencias.ordemId, os.id) });
    for (const o of ocs) {
      if (mudouData)
        await registrarEvento(
          tx,
          o.id,
          "PROGRAMACAO",
          `Nova data prevista: ${fmtDia(input.data)}. Motivo: ${input.motivo.trim()}`,
          { usuario: u, nome: u.nome },
          {
            dados: { de: os.programadaPara, para: input.data },
          },
        );
      if (equipe.id !== os.equipeId)
        await registrarEvento(tx, o.id, "ORDEM", `${os.numero} passada para a equipe ${equipe.nome}.`, { usuario: u, nome: u.nome }, { publico: false });
    }
  });
}

export async function iniciarOrdem(u: SessaoUsuario, id: string) {
  const os = await ordemParaAgir(u, id);
  if (os.status !== "PROGRAMADA") throw new ErroServico("Só é possível iniciar uma OS programada.");
  await db.transaction(async (tx) => {
    await tx.update(servicosOrdens).set({ status: "EM_EXECUCAO", iniciadaEm: new Date() }).where(eq(servicosOrdens.id, os.id));
    const ocs = await tx.query.servicosOcorrencias.findMany({ where: eq(servicosOcorrencias.ordemId, os.id) });
    for (const o of ocs) {
      await tx.update(servicosOcorrencias).set({ status: "EM_EXECUCAO" }).where(eq(servicosOcorrencias.id, o.id));
      await registrarEvento(tx, o.id, "INICIO", "A equipe começou o serviço no local.", { usuario: u, nome: u.nome }, { dados: { ordem: os.numero } });
    }
  });
}

export async function adicionarMaterial(u: SessaoUsuario, id: string, item: string, quantidade: string) {
  const os = await ordemParaAgir(u, id);
  if (os.status === "CONCLUIDA" || os.status === "CANCELADA") throw new ErroServico("Esta OS já foi encerrada.");
  if (!item.trim()) throw new ErroServico("Informe o material.");
  if (!quantidade.trim()) throw new ErroServico("Informe a quantidade (ex.: 3 un, 0,5 m³).");
  const materiais: MaterialUsado[] = [...(os.materiais ?? []), { item: item.trim(), quantidade: quantidade.trim() }];
  await db.update(servicosOrdens).set({ materiais }).where(eq(servicosOrdens.id, os.id));
}

export async function removerMaterial(u: SessaoUsuario, id: string, indice: number) {
  const os = await ordemParaAgir(u, id);
  if (os.status === "CONCLUIDA" || os.status === "CANCELADA") throw new ErroServico("Esta OS já foi encerrada.");
  const materiais = (os.materiais ?? []).filter((_, i) => i !== indice);
  await db.update(servicosOrdens).set({ materiais }).where(eq(servicosOrdens.id, os.id));
}

export async function concluirOrdem(u: SessaoUsuario, id: string, observacao: string) {
  const os = await ordemParaAgir(u, id);
  if (!["PROGRAMADA", "EM_EXECUCAO"].includes(os.status)) throw new ErroServico("Esta OS já foi encerrada.");
  if (observacao.trim().length < 5) throw new ErroServico("Registre o que foi feito (ao menos 5 letras); o cidadão verá este resumo.");
  const agora = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(servicosOrdens)
      .set({ status: "CONCLUIDA", concluidaEm: agora, iniciadaEm: os.iniciadaEm ?? agora, observacao: observacao.trim() })
      .where(eq(servicosOrdens.id, os.id));
    const ocs = await tx.query.servicosOcorrencias.findMany({ where: eq(servicosOcorrencias.ordemId, os.id) });
    for (const o of ocs) {
      await tx.update(servicosOcorrencias).set({ status: "CONCLUIDA", concluidaEm: agora }).where(eq(servicosOcorrencias.id, o.id));
      await registrarEvento(tx, o.id, "CONCLUSAO", `Serviço concluído. ${observacao.trim()}`, { usuario: u, nome: u.nome }, { dados: { ordem: os.numero } });
      // pedidos duplicados deste acompanham a conclusão
      const dups = await tx.query.servicosOcorrencias.findMany({
        where: and(eq(servicosOcorrencias.duplicadaDeId, o.id), eq(servicosOcorrencias.status, "DUPLICADA")),
      });
      for (const d of dups) {
        await tx.update(servicosOcorrencias).set({ status: "CONCLUIDA", concluidaEm: agora }).where(eq(servicosOcorrencias.id, d.id));
        await registrarEvento(tx, d.id, "CONCLUSAO", `Serviço concluído junto com o pedido ${o.protocolo}. ${observacao.trim()}`, { usuario: u, nome: u.nome });
      }
    }
  });
}

// ---------------------------------------------------------------- execução em campo

export async function ordensDeCampo(u: SessaoUsuario, equipeId?: string) {
  const minhas = await db.query.servicosEquipes.findMany({
    where: and(eq(servicosEquipes.municipioId, u.municipioId), eq(servicosEquipes.encarregadoId, u.id)),
  });
  let visiveis = minhas;
  if (!visiveis.length)
    visiveis = await db.query.servicosEquipes.findMany({
      where: temPapel(u, "ADMIN")
        ? eq(servicosEquipes.municipioId, u.municipioId)
        : and(eq(servicosEquipes.municipioId, u.municipioId), eq(servicosEquipes.setorId, u.setorId ?? "")),
    });
  const ids = (equipeId ? visiveis.filter((e) => e.id === equipeId) : visiveis).map((e) => e.id);
  if (!ids.length) return { equipes: visiveis, minhas: minhas.length > 0, ordens: [] };
  const hoje = hojeIso();
  const ordens = await db.query.servicosOrdens.findMany({
    where: and(inArray(servicosOrdens.equipeId, ids), inArray(servicosOrdens.status, ["PROGRAMADA", "EM_EXECUCAO"])),
    with: { equipe: true, ocorrencias: { with: { servico: true }, orderBy: [asc(servicosOcorrencias.bairro), asc(servicosOcorrencias.logradouro)] } },
    orderBy: [asc(servicosOrdens.programadaPara)],
  });
  const concluidasHoje = await db.query.servicosOrdens.findMany({
    where: and(
      inArray(servicosOrdens.equipeId, ids),
      eq(servicosOrdens.status, "CONCLUIDA"),
      gte(servicosOrdens.concluidaEm, new Date(hoje + "T00:00:00-03:00")),
    ),
    with: { equipe: true, ocorrencias: { with: { servico: true } } },
  });
  return { equipes: visiveis, minhas: minhas.length > 0, ordens, concluidasHoje, hoje };
}

// ---------------------------------------------------------------- indicadores

export async function indicadores(municipioId: string, dias: number, setorId?: string) {
  const desde = new Date(Date.now() - dias * 86400_000);
  const base = [eq(servicosOcorrencias.municipioId, municipioId)];
  if (setorId) base.push(eq(servicosOcorrencias.setorId, setorId));
  const todas = await db.query.servicosOcorrencias.findMany({ where: and(...base), with: { servico: true } });
  const agora = Date.now();
  const abertas = todas.filter((o) => EM_ABERTO.includes(o.status as StatusOcorrencia));
  const atrasadas = abertas.filter((o) => atrasada(o, agora));
  const periodo = todas.filter((o) => o.abertaEm >= desde);
  const concluidas = periodo.filter((o) => o.status === "CONCLUIDA" && o.concluidaEm && !o.duplicadaDeId);
  const noPrazo = concluidas.filter((o) => o.concluidaEm! <= o.prazoEm);
  const dur = (o: (typeof todas)[number]) => (o.concluidaEm!.getTime() - o.abertaEm.getTime()) / 86400_000;
  const avaliadas = periodo.filter((o) => o.avaliacaoNota);
  const notas = [1, 2, 3, 4, 5].map((n) => avaliadas.filter((o) => o.avaliacaoNota === n).length);

  const porServico = new Map<string, { nome: string; sla: number; total: number; concluidas: number; somaDias: number; noPrazo: number; abertas: number }>();
  for (const o of periodo) {
    const c = porServico.get(o.servicoId) ?? {
      nome: o.servico.nome,
      sla: o.servico.slaDiasUteis,
      total: 0,
      concluidas: 0,
      somaDias: 0,
      noPrazo: 0,
      abertas: 0,
    };
    c.total += 1;
    if (EM_ABERTO.includes(o.status as StatusOcorrencia)) c.abertas += 1;
    if (o.status === "CONCLUIDA" && o.concluidaEm && !o.duplicadaDeId) {
      c.concluidas += 1;
      c.somaDias += dur(o);
      if (o.concluidaEm <= o.prazoEm) c.noPrazo += 1;
    }
    porServico.set(o.servicoId, c);
  }
  const porBairro = new Map<string, { bairro: string; total: number; abertas: number; atrasadas: number }>();
  for (const o of periodo) {
    const c = porBairro.get(o.bairro) ?? { bairro: o.bairro, total: 0, abertas: 0, atrasadas: 0 };
    c.total += 1;
    if (EM_ABERTO.includes(o.status as StatusOcorrencia)) c.abertas += 1;
    if (atrasada(o, agora)) c.atrasadas += 1;
    porBairro.set(o.bairro, c);
  }
  return {
    dias,
    abertas: abertas.length,
    atrasadas: atrasadas.length,
    triagem: abertas.filter((o) => o.status === "ABERTA").length,
    registradas: periodo.length,
    concluidas: concluidas.length,
    pctNoPrazo: concluidas.length ? Math.round((noPrazo.length / concluidas.length) * 100) : null,
    tempoMedioDias: concluidas.length ? concluidas.reduce((s, o) => s + dur(o), 0) / concluidas.length : null,
    satisfacao: avaliadas.length ? avaliadas.reduce((s, o) => s + (o.avaliacaoNota ?? 0), 0) / avaliadas.length : null,
    avaliacoes: avaliadas.length,
    notas,
    comentarios: avaliadas
      .filter((o) => o.avaliacaoComentario)
      .sort((a, b) => (b.avaliadaEm?.getTime() ?? 0) - (a.avaliadaEm?.getTime() ?? 0))
      .slice(0, 4)
      .map((o) => ({ id: o.id, nota: o.avaliacaoNota!, texto: o.avaliacaoComentario!, servico: o.servico.nome, bairro: o.bairro })),
    porServico: [...porServico.values()].map((c) => ({ ...c, mediaDias: c.concluidas ? c.somaDias / c.concluidas : null })).sort((a, b) => b.total - a.total),
    porBairro: [...porBairro.values()].sort((a, b) => b.total - a.total),
  };
}

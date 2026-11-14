import "server-only";
// Leituras do módulo de repasses e obrigações da área. API pensada também para a cabine da secretaria (Parte 2) e a sala do
// prefeito (Parte 4): funções por município, por secretaria (setor), por área e "o que a pessoa pode ver".
//
// Execução de um repasse = soma dos processos vinculados (metadados.repasseId, gravado pelo motor), com o valor da mesma fonte
// que a fila de pagamentos usa (metadados.contratacao.valor): contratado (contratação registrada), liquidado (está na fila
// cronológica, no envio ao banco ou pago) e pago (chegou a PAGO). Compra e pagamentos do contrato que saiu dela contam uma
// vez só (`somarExecucao`). O percentual executado é pago ÷ valor previsto.
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { contratos, eventos, obrigacaoEntregas, obrigacoesArea, processos, repasseHistorico, repasses, setores, tiposProcesso } from "@/db/schema";
import { areaDoUsuario, cabineDoSetor, ehArea, type Area, type UsuarioComArea } from "@/lib/areas";
import { estadosDeFila, type Contratacao } from "@/lib/pagamentos";
import { nomeDaEtapa, type WorkflowDef } from "@/lib/workflow";
import {
  GRAVIDADE_PRAZO,
  PERIODICIDADES,
  SITUACOES_OBRIGACAO,
  alertaDePrazo,
  areaTemPasta,
  hojeLocal,
  nomeSituacaoRepasse,
  nomeTipoRepasse,
  percentualExecutado,
  podeEditarNaArea,
  podeVerNaArea,
  prazosDoRepasse,
  riscoDoRepasse,
  somarExecucao,
  type AlertaPrazo,
  type Execucao,
  type PrazoRepasse,
  type Risco,
} from "./regras";

const num = (v: string | number | null | undefined) => (v == null || v === "" ? 0 : Number(v));

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export type SetorResumo = { id: string; sigla: string; nome: string; area: Area | null };

export type RepasseResumo = {
  id: string;
  setor: SetorResumo;
  area: Area | null;
  tipo: string;
  tipoNome: string;
  identificacao: string | null;
  /** nome curto para listas e seleções: "Convênio 912345/2025", "Emenda individual 202612340001" */
  rotulo: string;
  concedente: string;
  objeto: string;
  valorPrevisto: number;
  valorRecebido: number;
  assinadoEm: string | null;
  vigenciaFim: string | null;
  prazoExecucao: string | null;
  prazoPrestacaoContas: string | null;
  situacao: string;
  situacaoNome: string;
  observacao: string | null;
  execucao: Execucao & { percentual: number; processos: number };
  /** prazos que valem na situação atual, do mais grave ao menos grave */
  prazos: PrazoRepasse[];
  prazoCritico: PrazoRepasse | null;
  risco: Risco;
  atualizadoEm: Date;
};

export type ProcessoVinculado = {
  id: string;
  numero: string;
  assunto: string;
  etapa: string;
  encerrado: boolean;
  fornecedor: string | null;
  valor: number | null;
  liquidado: boolean;
  pago: boolean;
  cancelado: boolean;
  /** pagamento de contrato: a compra de onde o contrato saiu (a execução não conta os dois) */
  origemId: string | null;
};

export type EventoRepasse = { id: string; quando: Date; titulo: string; detalhe: string | null; autor: string | null; processo?: { id: string; numero: string } };

export type RepasseDetalhe = RepasseResumo & { processos: ProcessoVinculado[]; linhaDoTempo: EventoRepasse[]; criadoEm: Date };

export type ObrigacaoResumo = {
  id: string;
  setor: SetorResumo;
  area: Area | null;
  nome: string;
  destinatario: string;
  periodicidade: string;
  periodicidadeNome: string;
  proximoVencimento: string;
  responsavel: { id: string; nome: string } | null;
  situacao: string;
  situacaoNome: string;
  observacao: string | null;
  exemplo: boolean;
  /** alerta do próximo vencimento; null quando a obrigação já foi entregue (entrega única) */
  alerta: AlertaPrazo | null;
  ultimaEntrega: { entregueEm: string; comprovante: string; vencimento: string } | null;
};

export type ObrigacaoDetalhe = ObrigacaoResumo & { entregas: { id: string; vencimento: string; entregueEm: string; comprovante: string; autor: string | null; criadoEm: Date }[] };

/** Números de repasses e obrigações de uma secretaria (para o mapa das secretarias e a cabine). */
export type ResumoSetor = {
  setorId: string;
  repasses: number;
  valorPrevisto: number;
  valorRecebido: number;
  contratado: number;
  pago: number;
  percentual: number;
  emRisco: number;
  valorEmRisco: number;
  obrigacoesVencidas: number;
  /** a vencer em até 30 dias (sem contar as vencidas) */
  obrigacoesPorVencer: number;
};

// ---------------------------------------------------------------------------
// Execução pelos processos vinculados
// ---------------------------------------------------------------------------

/** Processos vinculados a repasses, classificados (contratado, liquidado, pago, cancelado), agrupados pelo repasse. */
async function vinculados(municipioId: string, repasseIds?: string[]): Promise<Map<string, ProcessoVinculado[]>> {
  const filtro = repasseIds
    ? repasseIds.length
      ? sql`${processos.metadados}->>'repasseId' in (${sql.join(
          repasseIds.map((i) => sql`${i}`),
          sql`, `,
        )})`
      : sql`false`
    : sql`${processos.metadados} ? 'repasseId'`;
  const [cfgs, lista] = await Promise.all([
    estadosDeFila(municipioId),
    db.query.processos.findMany({
      where: and(eq(processos.municipioId, municipioId), filtro),
      columns: { id: true, numero: true, assunto: true, tipoId: true, estadoAtual: true, encerradoEm: true, metadados: true },
      with: { tipo: { columns: { definicao: true } }, eventos: { columns: { paraEstado: true, deEstado: true } } },
      orderBy: (p, { asc }) => [asc(p.abertoEm)],
    }),
  ]);
  const m = new Map<string, ProcessoVinculado[]>();
  for (const p of lista) {
    const meta = (p.metadados ?? {}) as Record<string, unknown>;
    const rid = typeof meta.repasseId === "string" ? meta.repasseId : null;
    if (!rid) continue;
    const c = (meta.contratacao ?? {}) as Contratacao;
    const cfg = cfgs.get(p.tipoId);
    // mesmas definições da fila de pagamentos (src/lib/pagamentos.ts): pago = entrou em PAGO vindo do envio (ou da fila);
    // liquidado = está agora na fila, no envio ao banco ou pago (uma liquidação devolvida à etapa anterior deixa de contar)
    const pago = !!cfg && p.eventos.some((e) => e.deEstado === (cfg.enviado ?? cfg.fila) && e.paraEstado === cfg.pago);
    const liquidado = !!cfg && (pago || p.estadoAtual === cfg.fila || (!!cfg.enviado && p.estadoAtual === cfg.enviado));
    const origem = (meta.contrato as { processoOrigemId?: unknown } | undefined)?.processoOrigemId;
    const valor = c.fornecedor && c.valor != null && c.valor !== "" ? Number(c.valor) : null;
    const arr = m.get(rid) ?? [];
    arr.push({
      id: p.id,
      numero: p.numero,
      assunto: p.assunto,
      etapa: nomeDaEtapa(p.tipo.definicao as WorkflowDef, p.estadoAtual),
      encerrado: !!p.encerradoEm,
      fornecedor: c.fornecedor ?? null,
      valor,
      liquidado,
      pago,
      cancelado: !!p.encerradoEm && !pago,
      origemId: typeof origem === "string" ? origem : null,
    });
    m.set(rid, arr);
  }
  return m;
}

type LinhaRepasse = typeof repasses.$inferSelect & { setor: typeof setores.$inferSelect };

const setorResumo = (s: typeof setores.$inferSelect): SetorResumo => ({ id: s.id, sigla: s.sigla, nome: s.nome, area: ehArea(s.area) ? s.area : null });

function resumir(r: LinhaRepasse, procs: ProcessoVinculado[], hoje: string): RepasseResumo {
  const ex = somarExecucao(procs);
  const valorPrevisto = num(r.valorPrevisto);
  const valorRecebido = num(r.valorRecebido);
  const datas = { situacao: r.situacao, prazoExecucao: r.prazoExecucao, vigenciaFim: r.vigenciaFim, prazoPrestacaoContas: r.prazoPrestacaoContas };
  const prazos = prazosDoRepasse(datas, hoje);
  const tipoNome = nomeTipoRepasse(r.tipo);
  return {
    id: r.id,
    setor: setorResumo(r.setor),
    area: ehArea(r.setor.area) ? r.setor.area : null,
    tipo: r.tipo,
    tipoNome,
    identificacao: r.identificacao,
    rotulo: r.identificacao ? `${tipoNome} ${r.identificacao}` : tipoNome,
    concedente: r.concedente,
    objeto: r.objeto,
    valorPrevisto,
    valorRecebido,
    assinadoEm: r.assinadoEm,
    vigenciaFim: r.vigenciaFim,
    prazoExecucao: r.prazoExecucao,
    prazoPrestacaoContas: r.prazoPrestacaoContas,
    situacao: r.situacao,
    situacaoNome: nomeSituacaoRepasse(r.situacao),
    observacao: r.observacao,
    execucao: { ...ex, percentual: percentualExecutado(ex.pago, valorPrevisto), processos: procs.length },
    prazos,
    prazoCritico: prazos[0] ?? null,
    risco: riscoDoRepasse({ ...datas, valorPrevisto, valorRecebido }, ex.pago, hoje),
    atualizadoEm: r.atualizadoEm,
  };
}

async function listar(municipioId: string, filtro?: ReturnType<typeof eq>): Promise<RepasseResumo[]> {
  const linhas = await db.query.repasses.findMany({
    where: filtro ? and(eq(repasses.municipioId, municipioId), filtro) : eq(repasses.municipioId, municipioId),
    with: { setor: true },
    orderBy: (r, { asc }) => [asc(r.criadoEm)],
  });
  if (!linhas.length) return [];
  const procs = await vinculados(
    municipioId,
    filtro ? linhas.map((l) => l.id) : undefined,
  );
  const hoje = hojeLocal();
  return linhas.map((l) => resumir(l, procs.get(l.id) ?? [], hoje)).sort(ordemRepasse);
}

/** Ordem padrão: os mais críticos primeiro (prazo vencido, 5, 15, 30 dias), depois pelo prazo e pelo objeto. */
function ordemRepasse(a: RepasseResumo, b: RepasseResumo) {
  const ga = a.prazoCritico ? GRAVIDADE_PRAZO[a.prazoCritico.alerta.nivel] : 9;
  const gb = b.prazoCritico ? GRAVIDADE_PRAZO[b.prazoCritico.alerta.nivel] : 9;
  if (a.situacao === "COM_PENDENCIA" !== (b.situacao === "COM_PENDENCIA")) return a.situacao === "COM_PENDENCIA" ? -1 : 1;
  return ga - gb || (a.prazoCritico?.data ?? "9").localeCompare(b.prazoCritico?.data ?? "9") || a.objeto.localeCompare(b.objeto);
}

// ---------------------------------------------------------------------------
// Repasses: leituras públicas
// ---------------------------------------------------------------------------

/** Todos os repasses do município (sem filtro de acesso: use em quem vê tudo ou filtre com `podeVerNaArea`). */
export function repassesDoMunicipio(municipioId: string): Promise<RepasseResumo[]> {
  return listar(municipioId);
}

/** Repasses de uma secretaria (setor responsável). Para a cabine da secretaria. */
export function repassesDoSetor(municipioId: string, setorId: string): Promise<RepasseResumo[]> {
  return listar(municipioId, eq(repasses.setorId, setorId));
}

/** Repasses das secretarias de uma área. */
export async function repassesDaArea(municipioId: string, area: Area): Promise<RepasseResumo[]> {
  return (await listar(municipioId)).filter((r) => r.area === area);
}

/** Repasses que a pessoa pode ver (a área da secretaria responsável; Gabinete, Controle e ADMIN veem todos). */
export async function repassesVisiveis(u: UsuarioComArea & { municipioId: string }): Promise<RepasseResumo[]> {
  return (await listar(u.municipioId)).filter((r) => podeVerNaArea(u, r.area));
}

/** Repasses em risco (prazo em até 30 dias ou vencido, ou com pendência), do mais grave ao menos grave. Filtro opcional por secretaria. */
export async function repassesEmRisco(municipioId: string, opts: { setorId?: string } = {}): Promise<RepasseResumo[]> {
  const lista = opts.setorId ? await repassesDoSetor(municipioId, opts.setorId) : await repassesDoMunicipio(municipioId);
  return lista.filter((r) => r.risco.emRisco);
}

/** Um repasse com os processos vinculados e a linha do tempo (cadastro, alterações e vínculos registrados nos processos). */
export async function carregarRepasse(municipioId: string, id: string): Promise<RepasseDetalhe | null> {
  const r = await db.query.repasses.findFirst({ where: and(eq(repasses.id, id), eq(repasses.municipioId, municipioId)), with: { setor: true } });
  if (!r) return null;
  const [procs, hist, evs] = await Promise.all([
    vinculados(municipioId, [id]),
    db.query.repasseHistorico.findMany({ where: eq(repasseHistorico.repasseId, id), with: { autor: { columns: { nome: true } } }, orderBy: desc(repasseHistorico.criadoEm) }),
    db
      .select({ id: eventos.id, tipo: eventos.tipo, dados: eventos.dados, criadoEm: eventos.criadoEm, processoId: processos.id, numero: processos.numero, autorId: eventos.autorId })
      .from(eventos)
      .innerJoin(processos, eq(processos.id, eventos.processoId))
      .where(
        and(
          eq(processos.municipioId, municipioId),
          or(
            and(eq(eventos.tipo, "VINCULO_REPASSE"), or(sql`${eventos.dados}->>'repasseId' = ${id}`, sql`${eventos.dados}->>'anteriorId' = ${id}`)),
            and(eq(eventos.tipo, "ABERTURA"), sql`${eventos.dados}->'repasse'->>'id' = ${id}`),
          ),
        ),
      ),
  ]);
  const autores = evs.length
    ? new Map((await db.query.usuarios.findMany({ where: (x, { inArray: emLista }) => emLista(x.id, [...new Set(evs.map((e) => e.autorId))]), columns: { id: true, nome: true } })).map((x) => [x.id, x.nome]))
    : new Map<string, string>();
  const lista = procs.get(id) ?? [];
  const linhaDoTempo: EventoRepasse[] = [
    ...hist.map((h) => ({ id: h.id, quando: h.criadoEm, titulo: h.tipo === "CADASTRO" ? "Repasse cadastrado" : "Dados alterados", detalhe: h.descricao, autor: h.autor?.nome ?? null })),
    ...evs.map((e) => {
      const d = (e.dados ?? {}) as { repasseId?: string | null; anteriorId?: string | null; motivo?: string };
      const titulo = e.tipo === "ABERTURA" ? "Processo aberto já vinculado ao repasse" : d.repasseId === id ? "Processo vinculado" : "Processo desvinculado";
      return { id: e.id, quando: e.criadoEm, titulo, detalhe: d.motivo ?? null, autor: autores.get(e.autorId) ?? null, processo: { id: e.processoId, numero: e.numero } };
    }),
  ].sort((a, b) => b.quando.getTime() - a.quando.getTime());
  return { ...resumir(r, lista, hojeLocal()), processos: lista, linhaDoTempo, criadoEm: r.criadoEm };
}

/** Nome curto e área de um repasse (para a página do processo). */
export async function repasseBasico(municipioId: string, id: string): Promise<{ id: string; rotulo: string; objeto: string; area: Area | null } | null> {
  const r = await db.query.repasses.findFirst({ where: and(eq(repasses.id, id), eq(repasses.municipioId, municipioId)), with: { setor: true } });
  if (!r) return null;
  const tipoNome = nomeTipoRepasse(r.tipo);
  return { id: r.id, rotulo: r.identificacao ? `${tipoNome} ${r.identificacao}` : tipoNome, objeto: r.objeto, area: ehArea(r.setor.area) ? r.setor.area : null };
}

/** Repasses que a pessoa pode escolher ao abrir um processo de compra: da área dela (ou todos, no Gabinete), ainda não encerrados. */
export async function repassesParaVincular(u: UsuarioComArea & { municipioId: string }): Promise<{ id: string; rotulo: string; objeto: string; setor: string }[]> {
  const lista = await listar(u.municipioId);
  return lista
    .filter((r) => ["EM_CAPTACAO", "VIGENTE", "EM_EXECUCAO"].includes(r.situacao) && podeEditarNaArea(u, r.area))
    .map((r) => ({ id: r.id, rotulo: r.rotulo, objeto: r.objeto, setor: r.setor.nome }))
    .sort((a, b) => a.objeto.localeCompare(b.objeto));
}

/**
 * Pasta (cabine da secretaria) dona de cada processo: num pagamento de contrato, a do setor responsável pelo contrato; nos
 * demais, a do setor de quem abriu (mesmo recorte da cabine). Setor sem cabine fica com o próprio setor.
 */
export async function pastasDosProcessos(municipioId: string, processoIds: string[]): Promise<Map<string, string | null>> {
  const m = new Map<string, string | null>();
  if (!processoIds.length) return m;
  const [todos, lista] = await Promise.all([
    db.select({ id: setores.id, sigla: setores.sigla, nome: setores.nome, area: setores.area, orgaoOrcamentario: setores.orgaoOrcamentario }).from(setores).where(eq(setores.municipioId, municipioId)),
    db.query.processos.findMany({
      where: and(eq(processos.municipioId, municipioId), inArray(processos.id, processoIds)),
      columns: { id: true, metadados: true },
      with: { abertoPor: { columns: { setorId: true } } },
    }),
  ]);
  const contratoDe = (meta: unknown) => {
    const c = ((meta ?? {}) as { contrato?: { id?: unknown } }).contrato?.id;
    return typeof c === "string" ? c : null;
  };
  const cids = [...new Set(lista.map((p) => contratoDe(p.metadados)).filter((x): x is string => !!x))];
  const setorDoContrato = new Map(
    cids.length ? (await db.select({ id: contratos.id, setorId: contratos.setorId }).from(contratos).where(and(eq(contratos.municipioId, municipioId), inArray(contratos.id, cids)))).map((c) => [c.id, c.setorId]) : [],
  );
  for (const p of lista) {
    const cid = contratoDe(p.metadados);
    const setorId = (cid ? setorDoContrato.get(cid) : null) ?? p.abertoPor.setorId;
    m.set(p.id, setorId ? (cabineDoSetor(todos, setorId)?.id ?? setorId) : null);
  }
  return m;
}

/** Pasta (cabine) do setor responsável por um repasse. */
export async function pastaDoSetor(municipioId: string, setorId: string): Promise<string> {
  const todos = await db.select({ id: setores.id, sigla: setores.sigla, nome: setores.nome, area: setores.area, orgaoOrcamentario: setores.orgaoOrcamentario }).from(setores).where(eq(setores.municipioId, municipioId));
  return cabineDoSetor(todos, setorId)?.id ?? setorId;
}

/**
 * Processos que podem ser vinculados a um repasse: com pagamento (fila cronológica), sem repasse, e não encerrados sem pagamento.
 * Só os da pasta responsável pelo repasse; o Gabinete vê também os das outras pastas (`daArea` marca os da pasta, listados primeiro).
 */
export async function processosParaVincular(
  u: UsuarioComArea & { municipioId: string },
  repasse: { setorId: string },
): Promise<{ id: string; numero: string; assunto: string; etapa: string; daArea: boolean }[]> {
  const municipioId = u.municipioId;
  const tipos = await db.query.tiposProcesso.findMany({ where: eq(tiposProcesso.municipioId, municipioId), columns: { id: true, definicao: true } });
  const comFila = tipos.filter((t) => (t.definicao as WorkflowDef).estados.some((e) => e.filaCronologica));
  if (!comFila.length) return [];
  const defs = new Map(comFila.map((t) => [t.id, t.definicao as WorkflowDef]));
  const lista = (
    await db.query.processos.findMany({
      where: and(eq(processos.municipioId, municipioId), inArray(processos.tipoId, [...defs.keys()]), sql`not coalesce(${processos.metadados} ? 'repasseId', false)`),
      columns: { id: true, numero: true, assunto: true, tipoId: true, estadoAtual: true, encerradoEm: true },
      orderBy: (p, { desc: d }) => [d(p.abertoEm)],
    })
  ).filter((p) => !p.encerradoEm || p.estadoAtual === "ARQUIVADO");
  const [pastas, pastaRepasse] = await Promise.all([pastasDosProcessos(municipioId, lista.map((p) => p.id)), pastaDoSetor(municipioId, repasse.setorId)]);
  const gabinete = areaDoUsuario(u) === "GABINETE";
  return lista
    .map((p) => ({ id: p.id, numero: p.numero, assunto: p.assunto, etapa: nomeDaEtapa(defs.get(p.tipoId)!, p.estadoAtual), daArea: pastas.get(p.id) === pastaRepasse }))
    .filter((p) => p.daArea || gabinete);
}

// ---------------------------------------------------------------------------
// Obrigações da área
// ---------------------------------------------------------------------------

type LinhaObrigacao = typeof obrigacoesArea.$inferSelect & {
  setor: typeof setores.$inferSelect;
  responsavel: { id: string; nome: string } | null;
  entregas: (typeof obrigacaoEntregas.$inferSelect & { autor?: { nome: string } | null })[];
};

function resumirObrigacao(o: LinhaObrigacao, hoje: string): ObrigacaoResumo {
  const ult = [...o.entregas].sort((a, b) => b.criadoEm.getTime() - a.criadoEm.getTime())[0];
  return {
    id: o.id,
    setor: setorResumo(o.setor),
    area: ehArea(o.setor.area) ? o.setor.area : null,
    nome: o.nome,
    destinatario: o.destinatario,
    periodicidade: o.periodicidade,
    periodicidadeNome: PERIODICIDADES[o.periodicidade]?.nome ?? o.periodicidade,
    proximoVencimento: o.proximoVencimento,
    responsavel: o.responsavel ? { id: o.responsavel.id, nome: o.responsavel.nome } : null,
    situacao: o.situacao,
    situacaoNome: SITUACOES_OBRIGACAO[o.situacao]?.nome ?? o.situacao,
    observacao: o.observacao,
    exemplo: o.exemplo,
    alerta: o.situacao === "ENTREGUE" ? null : alertaDePrazo(o.proximoVencimento, hoje),
    ultimaEntrega: ult ? { entregueEm: ult.entregueEm, comprovante: ult.comprovante, vencimento: ult.vencimento } : null,
  };
}

const ordemObrigacao = (a: ObrigacaoResumo, b: ObrigacaoResumo) =>
  (a.alerta ? 0 : 1) - (b.alerta ? 0 : 1) || a.proximoVencimento.localeCompare(b.proximoVencimento) || a.nome.localeCompare(b.nome);

async function listarObrigacoes(municipioId: string, setorId?: string): Promise<ObrigacaoResumo[]> {
  const linhas = await db.query.obrigacoesArea.findMany({
    where: setorId ? and(eq(obrigacoesArea.municipioId, municipioId), eq(obrigacoesArea.setorId, setorId)) : eq(obrigacoesArea.municipioId, municipioId),
    with: { setor: true, responsavel: { columns: { id: true, nome: true } }, entregas: true },
  });
  const hoje = hojeLocal();
  return linhas.map((o) => resumirObrigacao(o, hoje)).sort(ordemObrigacao);
}

/** Todas as obrigações do município (sem filtro de acesso). */
export function obrigacoesDoMunicipio(municipioId: string): Promise<ObrigacaoResumo[]> {
  return listarObrigacoes(municipioId);
}

/** Obrigações de uma secretaria (setor responsável). Para a cabine da secretaria. */
export function obrigacoesDoSetor(municipioId: string, setorId: string): Promise<ObrigacaoResumo[]> {
  return listarObrigacoes(municipioId, setorId);
}

/** Obrigações que a pessoa pode ver (pela área da secretaria responsável). */
export async function obrigacoesVisiveis(u: UsuarioComArea & { municipioId: string }): Promise<ObrigacaoResumo[]> {
  return (await listarObrigacoes(u.municipioId)).filter((o) => podeVerNaArea(u, o.area));
}

/** Obrigações vencidas ou que vencem em até `dias` dias corridos (padrão 30), não entregues. Filtro opcional por secretaria. */
export async function obrigacoesPorVencer(municipioId: string, opts: { dias?: number; setorId?: string } = {}): Promise<ObrigacaoResumo[]> {
  const dias = opts.dias ?? 30;
  return (await listarObrigacoes(municipioId, opts.setorId)).filter((o) => o.alerta && o.alerta.dias <= dias);
}

/** Uma obrigação com o histórico de entregas. */
export async function carregarObrigacao(municipioId: string, id: string): Promise<ObrigacaoDetalhe | null> {
  const o = await db.query.obrigacoesArea.findFirst({
    where: and(eq(obrigacoesArea.id, id), eq(obrigacoesArea.municipioId, municipioId)),
    with: { setor: true, responsavel: { columns: { id: true, nome: true } }, entregas: { with: { autor: { columns: { nome: true } } } } },
  });
  if (!o) return null;
  return {
    ...resumirObrigacao(o, hojeLocal()),
    entregas: [...o.entregas]
      .sort((a, b) => b.criadoEm.getTime() - a.criadoEm.getTime())
      .map((e) => ({ id: e.id, vencimento: e.vencimento, entregueEm: e.entregueEm, comprovante: e.comprovante, autor: e.autor?.nome ?? null, criadoEm: e.criadoEm })),
  };
}

// ---------------------------------------------------------------------------
// Resumo por secretaria (sala do prefeito e cabine)
// ---------------------------------------------------------------------------

/** Números de repasses e obrigações por secretaria (setor responsável). Secretaria sem repasse nem obrigação não aparece. */
export async function resumoPorSetor(municipioId: string): Promise<Map<string, ResumoSetor>> {
  const [reps, obs] = await Promise.all([repassesDoMunicipio(municipioId), obrigacoesDoMunicipio(municipioId)]);
  const m = new Map<string, ResumoSetor>();
  const de = (setorId: string) => {
    let x = m.get(setorId);
    if (!x) {
      x = { setorId, repasses: 0, valorPrevisto: 0, valorRecebido: 0, contratado: 0, pago: 0, percentual: 0, emRisco: 0, valorEmRisco: 0, obrigacoesVencidas: 0, obrigacoesPorVencer: 0 };
      m.set(setorId, x);
    }
    return x;
  };
  for (const r of reps) {
    const x = de(r.setor.id);
    x.repasses += 1;
    x.valorPrevisto += r.valorPrevisto;
    x.valorRecebido += r.valorRecebido;
    x.contratado += r.execucao.contratado;
    x.pago += r.execucao.pago;
    if (r.risco.emRisco) {
      x.emRisco += 1;
      x.valorEmRisco += r.risco.valorEmRisco;
    }
  }
  for (const o of obs) {
    if (!o.alerta) continue;
    const x = de(o.setor.id);
    if (o.alerta.nivel === "vencido") x.obrigacoesVencidas += 1;
    else if (o.alerta.dias <= 30) x.obrigacoesPorVencer += 1;
  }
  for (const x of m.values()) x.percentual = percentualExecutado(x.pago, x.valorPrevisto);
  return m;
}

/** Secretarias (setores de área com pasta própria) que podem ser responsáveis por repasse ou obrigação, com a marca de quem a pessoa pode editar. */
export async function setoresResponsaveis(u: UsuarioComArea & { municipioId: string }): Promise<(SetorResumo & { editavel: boolean })[]> {
  const lista = await db.query.setores.findMany({ where: eq(setores.municipioId, u.municipioId), orderBy: setores.nome });
  return lista
    .filter((s) => areaTemPasta(s.area))
    .map((s) => ({ ...setorResumo(s), editavel: podeEditarNaArea(u, s.area) }));
}

/** Servidores que podem ser responsáveis por obrigação: os ativos dos setores que a pessoa edita (no Gabinete, todos). */
export async function pessoasResponsaveis(u: UsuarioComArea & { municipioId: string }): Promise<{ id: string; rotulo: string }[]> {
  const lista = await db.query.usuarios.findMany({
    where: (x, { and: e, eq: igual }) => e(igual(x.municipioId, u.municipioId), igual(x.ativo, true)),
    columns: { id: true, nome: true, cargo: true },
    with: { setor: { columns: { area: true, sigla: true } } },
    orderBy: (x, { asc }) => [asc(x.nome)],
  });
  return lista
    .filter((p) => p.setor && podeEditarNaArea(u, p.setor.area))
    .map((p) => ({ id: p.id, rotulo: `${p.nome}${p.cargo ? `, ${p.cargo}` : ""}` }));
}

import "server-only";
// Cabine da secretaria (/secretaria e /secretaria/[sigla]): os dados de uma pasta, recortados no servidor.
// Quem abre o quê: `podeAbrirCabine` (src/lib/areas.ts). Recorte de cada bloco:
// - processos: pelo setor de quem abriu (o requisitante) — a cabine e os setores da área que dependem dela;
// - orçamento: dotações do órgão orçamentário ligado ao setor (setores.orgao_orcamentario = fin_dotacoes.orgao);
// - contratos: contratos.setor_id; compras: processos de compra da pasta que ainda não viraram contrato;
// - repasses e obrigações: setor responsável (módulo de repasses).
import { cache } from "react";
import { and, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { eventos, processos, servicosOcorrencias, servicosOrdens, setores, tiposProcesso, usuarios } from "@/db/schema";
import type { SessaoUsuario } from "@/lib/auth";
import { redirect } from "next/navigation";
import { cabineDoSetor, ehCabine, podeAbrirCabine, setoresDaCabine, veTodasAsPastas, type SetorDaCabine } from "@/lib/areas";
import { obrigacoes as obrigacoesLegais } from "@/lib/conformidade";
import { historicoDePagamentos } from "@/lib/pagamentos";
import { DOCUMENTO_TIPOS, avancosDisponiveis, getEstado, nomeDaEtapa, type EstadoDef, type Gate, type Papel, type WorkflowDef } from "@/lib/workflow";
import { alertasContratos, listarContratos, type ContratoLista } from "@/modulos/contratos/dados";
import { anoCorrente, caixa, execucao } from "@/modulos/financas/dados";
import { obrigacoesDoMunicipio, repassesDoMunicipio, type ObrigacaoResumo, type RepasseResumo } from "@/modulos/repasses/dados";
import { arrecadacao, inadimplencia, listarDividaAtiva } from "@/modulos/tributos/dados";
import { trilha } from "./auditoria";
import { avaliarSemaforo, fracaoDoAno, type Semaforo } from "./semaforo";

const DIA = 86400_000;
const ESTADOS_ABERTOS_SERVICO = ["ABERTA", "ACEITA", "PROGRAMADA", "EM_EXECUCAO"];

// ---------------------------------------------------------------------------
// Setores, cabines e autorização
// ---------------------------------------------------------------------------

export const setoresDoMunicipio = cache(async (municipioId: string): Promise<SetorDaCabine[]> =>
  db
    .select({ id: setores.id, sigla: setores.sigla, nome: setores.nome, area: setores.area, orgaoOrcamentario: setores.orgaoOrcamentario })
    .from(setores)
    .where(eq(setores.municipioId, municipioId))
    .orderBy(setores.nome),
);

export type Cabine = { setor: SetorDaCabine; ids: string[]; setores: SetorDaCabine[]; orgaos: string[] };

function montar(todos: SetorDaCabine[], s: SetorDaCabine): Cabine {
  const ids = setoresDaCabine(todos, s);
  const orgaos = [...new Set(todos.filter((x) => ids.includes(x.id) && x.orgaoOrcamentario).map((x) => x.orgaoOrcamentario!))];
  return { setor: s, ids, setores: todos, orgaos };
}

/** Todas as cabines do município (para o mapa das secretarias e a escolha de quem vê tudo). */
export async function cabinesDoMunicipio(municipioId: string): Promise<Cabine[]> {
  const todos = await setoresDoMunicipio(municipioId);
  return todos.filter(ehCabine).map((s) => montar(todos, s));
}

/** Cabine da própria pessoa (a do setor dela ou a da área), ou null. */
export async function cabineDoUsuario(u: SessaoUsuario): Promise<Cabine | null> {
  const todos = await setoresDoMunicipio(u.municipioId);
  const s = cabineDoSetor(todos, u.setorId);
  return s ? montar(todos, s) : null;
}

export type Autorizacao = { ok: true; cabine: Cabine } | { ok: false; motivo: "inexistente" | "sem-acesso"; area: string | null };

/**
 * Confere no servidor se a pessoa abre a cabine da sigla. Gabinete, Controle Interno e administrador abrem qualquer uma;
 * o(a) secretário(a) e os servidores da pasta, só a própria. Usado pelas páginas e por todo filtro "da pasta" nas listas.
 */
export async function autorizarCabine(u: SessaoUsuario, sigla: string): Promise<Autorizacao> {
  const todos = await setoresDoMunicipio(u.municipioId);
  const s = todos.find((x) => x.sigla === sigla.toUpperCase());
  if (!s || !ehCabine(s)) return { ok: false, motivo: "inexistente", area: null };
  if (!podeAbrirCabine(u, s, todos)) return { ok: false, motivo: "sem-acesso", area: s.area };
  return { ok: true, cabine: montar(todos, s) };
}

/** Endereço do "Sem acesso a esta área" para uma cabine de outra pasta. */
export function semAcessoCabine(sigla: string, area: string | null, de = `/secretaria/${sigla}`) {
  const q = new URLSearchParams({ de });
  if (area) q.set("area", area);
  return `/sem-acesso?${q}`;
}

export type Recorte = { cabine: Cabine | null; forcado: boolean };

/**
 * Recorte "da pasta" das listas de contratos e orçamento. Gabinete, controle, administrador, Fazenda e Compras veem todas as
 * pastas e podem filtrar por uma (`?pasta=SIGLA`); as demais secretarias veem só a própria, sempre (o filtro é imposto no
 * servidor). Pedir a pasta de outra secretaria leva a "Sem acesso a esta área".
 */
export async function recorteDaPasta(u: SessaoUsuario, siglaPedida?: string | null): Promise<Recorte> {
  const todos = await setoresDoMunicipio(u.municipioId);
  const pedida = siglaPedida ? todos.find((x) => x.sigla === siglaPedida.toUpperCase() && ehCabine(x)) : undefined;
  if (veTodasAsPastas(u)) return { cabine: pedida ? montar(todos, pedida) : null, forcado: false };
  const propria = cabineDoSetor(todos, u.setorId);
  if (pedida && pedida.id !== propria?.id) redirect(semAcessoCabine(pedida.sigla, pedida.area));
  return { cabine: propria ? montar(todos, propria) : { setor: { id: "", sigla: "", nome: "sua secretaria", area: null, orgaoOrcamentario: null }, ids: [], setores: todos, orgaos: [] }, forcado: true };
}

// ---------------------------------------------------------------------------
// Processos da pasta e o que depende do(a) secretário(a)
// ---------------------------------------------------------------------------

export type ProcessoDaPasta = {
  id: string;
  numero: string;
  assunto: string;
  urgencia: string;
  tipoChave: string;
  tipoNome: string;
  estado: string;
  etapa: string;
  setorAtual: { id: string; sigla: string; nome: string } | null;
  naPasta: boolean;
  prazo: Date | null;
  atrasado: boolean;
  recebido: boolean;
  /** dias desde que chegou ao setor onde está */
  diasNoSetor: number;
  valor: number | null;
  /** posição da etapa no fluxo (para ordenar "do pedido ao contrato") */
  ordem: number;
  antesDoContrato: boolean;
};

export type Pendencia = {
  tipo: "APROVACAO" | "ASSINATURA";
  processoId: string;
  numero: string;
  assunto: string;
  etapa: string;
  prazo: Date | null;
  vencida: boolean;
  /** documentos que faltam assinar como secretário(a) (já juntados) */
  documentos: { id: string; nome: string }[];
  /** avanço que a aprovação faz, quando o motor permite */
  aprovar: { para: string; rotulo: string } | null;
  /** por que não dá para resolver daqui (documento não juntado, por exemplo) */
  bloqueio: string | null;
};

/** O gate pede a assinatura do secretário? (sozinho ou entre outros papéis) */
const pedeSecretario = (g: Gate): g is Extract<Gate, { tipo: "documento" }> =>
  g.tipo === "documento" && ((g.assinadoPor ?? []).includes("SECRETARIO") || (g.assinadoPorQualquer ?? []).includes("SECRETARIO"));

/** Etapa de decisão do secretário (aprovação): o papel SECRETARIO age e o requisitante não. */
const etapaDoSecretario = (e: EstadoDef) => e.papeis.includes("SECRETARIO" satisfies Papel) && !e.papeis.includes("REQUISITANTE");

/** Valor do processo: o contratado, se houver; senão o estimado (mesma regra da lista de processos). */
const valorDe = (meta: Record<string, unknown>) => {
  const v = (meta.contratacao as { valor?: unknown } | undefined)?.valor ?? meta.valorEstimado;
  const n = v == null || v === "" ? NaN : Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Processos em andamento abertos pela pasta, com etapa, onde estão e há quantos dias; e as pendências do(a) secretário(a). */
export async function processosDaPasta(municipioId: string, cab: Cabine) {
  const agora = Date.now();
  const [lista, tipos] = await Promise.all([
    db
      .select({
        id: processos.id,
        numero: processos.numero,
        assunto: processos.assunto,
        urgencia: processos.urgencia,
        tipoId: processos.tipoId,
        estado: processos.estadoAtual,
        setorAtualId: processos.setorAtualId,
        prazo: processos.prazoEtapaEm,
        recebido: processos.recebidoEm,
        metadados: processos.metadados,
        abertoEm: processos.abertoEm,
        chegouEm: sql<Date | null>`(select max(${eventos.criadoEm}) from ${eventos} where ${eventos.processoId} = ${processos.id} and ${eventos.paraSetorId} is not distinct from ${processos.setorAtualId} and ${eventos.paraSetorId} is not null)`,
      })
      .from(processos)
      .innerJoin(usuarios, eq(usuarios.id, processos.abertoPorId))
      .where(and(eq(processos.municipioId, municipioId), isNull(processos.encerradoEm), inArray(usuarios.setorId, cab.ids)))
      .orderBy(processos.prazoEtapaEm),
    db.query.tiposProcesso.findMany({ where: eq(tiposProcesso.municipioId, municipioId), columns: { id: true, chave: true, nome: true, definicao: true } }),
  ]);
  const tipoDe = new Map(tipos.map((t) => [t.id, t]));
  const setorDe = new Map(cab.setores.map((s) => [s.id, s]));

  const itens: (ProcessoDaPasta & { def: WorkflowDef | null })[] = lista.map((p) => {
    const t = tipoDe.get(p.tipoId);
    const def = (t?.definicao as WorkflowDef | undefined) ?? null;
    const ordem = def ? def.estados.findIndex((e) => e.chave === p.estado) : -1;
    const iContrato = def ? def.estados.findIndex((e) => e.chave === "CONTRATADO") : -1;
    const sa = p.setorAtualId ? setorDe.get(p.setorAtualId) : undefined;
    const chegou = p.chegouEm ? new Date(p.chegouEm) : p.abertoEm;
    return {
      id: p.id,
      numero: p.numero,
      assunto: p.assunto,
      urgencia: p.urgencia,
      tipoChave: t?.chave ?? "",
      tipoNome: t?.nome ?? "",
      estado: p.estado,
      etapa: def ? nomeDaEtapa(def, p.estado) : p.estado,
      setorAtual: sa ? { id: sa.id, sigla: sa.sigla, nome: sa.nome } : null,
      naPasta: !!p.setorAtualId && cab.ids.includes(p.setorAtualId),
      prazo: p.prazo,
      atrasado: !!p.prazo && p.prazo.getTime() < agora,
      recebido: !!p.recebido,
      diasNoSetor: Math.max(0, Math.floor((agora - chegou.getTime()) / DIA)),
      valor: valorDe((p.metadados ?? {}) as Record<string, unknown>),
      ordem,
      antesDoContrato: t?.chave === "COMPRA" && iContrato >= 0 && ordem >= 0 && ordem < iContrato,
      def,
    };
  });

  // Pendências do(a) secretário(a): etapas de aprovação na pasta e documentos esperando a assinatura de secretário
  const candidatos = itens.filter((p) => {
    const e = p.def ? getEstado(p.def, p.estado) : undefined;
    // etapa do próprio requisitante (demanda) não conta: o documento espera quem pediu, não o(a) secretário(a)
    return !!e && ((etapaDoSecretario(e) && p.naPasta) || (!e.papeis.includes("REQUISITANTE") && e.gates.some(pedeSecretario)));
  });
  const docs = candidatos.length
    ? await db.query.documentos.findMany({
        where: (d, { inArray }) => inArray(d.processoId, candidatos.map((c) => c.id)),
        columns: { id: true, processoId: true, tipo: true, criadoEm: true },
        with: { assinaturas: { columns: { papel: true } } },
        orderBy: (d, { asc }) => [asc(d.criadoEm)],
      })
    : [];
  const pendencias: Pendencia[] = [];
  for (const p of candidatos) {
    const e = getEstado(p.def!, p.estado)!;
    const faltam: { id: string; nome: string }[] = [];
    let bloqueio: string | null = null;
    for (const g of e.gates.filter(pedeSecretario)) {
      const ultimo = docs.filter((d) => d.processoId === p.id && d.tipo === g.documentoTipo).at(-1);
      const nome = DOCUMENTO_TIPOS[g.documentoTipo] ?? g.documentoTipo;
      if (!ultimo) {
        if (etapaDoSecretario(e)) bloqueio = `Falta juntar o ${nome}.`;
        continue;
      }
      const assinou = (papel: string) => ultimo.assinaturas.some((a) => a.papel === papel);
      const ok = (g.assinadoPorQualquer?.length ? g.assinadoPorQualquer.some(assinou) : true) && (g.assinadoPor ?? []).every(assinou);
      if (!ok) faltam.push({ id: ultimo.id, nome });
    }
    const aprovacao = etapaDoSecretario(e) && p.naPasta;
    if (!aprovacao && faltam.length === 0) continue;
    const av = aprovacao ? avancosDisponiveis(p.def!, e, null)[0] : undefined;
    pendencias.push({
      tipo: aprovacao ? "APROVACAO" : "ASSINATURA",
      processoId: p.id,
      numero: p.numero,
      assunto: p.assunto,
      etapa: p.etapa,
      prazo: p.prazo,
      vencida: p.atrasado,
      documentos: faltam,
      aprovar: av ? { para: av.para, rotulo: av.rotulo } : null,
      bloqueio,
    });
  }
  pendencias.sort((a, b) => Number(b.vencida) - Number(a.vencida) || (a.prazo?.getTime() ?? Infinity) - (b.prazo?.getTime() ?? Infinity));
  return { processos: itens.map(({ def, ...x }) => (void def, x)), pendencias };
}

// ---------------------------------------------------------------------------
// Orçamento da pasta
// ---------------------------------------------------------------------------

export type LinhaOrcamento = { chave: string; acao: string; elemento: string; natureza: string; atualizado: number; reservado: number; empenhado: number; liquidado: number; pago: number; saldo: number; dotacoes: number; dotacaoId: string };
const somaDe = <T>(xs: T[], f: (x: T) => number) => Math.round(xs.reduce((s, x) => s + f(x), 0) * 100) / 100;

export async function orcamentoDaPasta(municipioId: string, orgaos: string[]) {
  const ano = anoCorrente();
  if (!orgaos.length) return { ano, orgaos, orgaoNome: null as string | null, linhas: [] as LinhaOrcamento[], totais: null };
  const ex = await execucao(municipioId, ano);
  const ds = ex.dotacoes.filter((d) => orgaos.includes(d.orgao));
  const porChave = new Map<string, LinhaOrcamento>();
  for (const d of ds) {
    const chave = `${d.acao}|${d.natureza}`;
    const l = porChave.get(chave) ?? { chave, acao: d.acaoNome, elemento: d.natureza, natureza: d.natureza, atualizado: 0, reservado: 0, empenhado: 0, liquidado: 0, pago: 0, saldo: 0, dotacoes: 0, dotacaoId: d.id };
    l.atualizado += d.atualizado;
    l.reservado += d.reservado;
    l.empenhado += d.empenhado;
    l.liquidado += d.liquidado;
    l.pago += d.pago;
    l.saldo += d.disponivel;
    l.dotacoes += 1;
    porChave.set(chave, l);
  }
  const linhas = [...porChave.values()].sort((a, b) => b.atualizado - a.atualizado);
  const totais = {
    atualizado: somaDe(ds, (d) => d.atualizado),
    reservado: somaDe(ds, (d) => d.reservado),
    empenhado: somaDe(ds, (d) => d.empenhado),
    liquidado: somaDe(ds, (d) => d.liquidado),
    pago: somaDe(ds, (d) => d.pago),
    saldo: somaDe(ds, (d) => d.disponivel),
  };
  return { ano, orgaos, orgaoNome: ds[0]?.orgaoNome ?? null, linhas, totais };
}

// ---------------------------------------------------------------------------
// Blocos próprios da área (só onde há módulo)
// ---------------------------------------------------------------------------

async function blocoInfraestrutura(municipioId: string, cab: Cabine, contratos: ContratoLista[]) {
  const agora = new Date();
  const [oc] = await db
    .select({
      abertas: sql<number>`count(*) filter (where ${servicosOcorrencias.status} in ${ESTADOS_ABERTOS_SERVICO})::int`,
      atrasadas: sql<number>`count(*) filter (where ${servicosOcorrencias.status} in ${ESTADOS_ABERTOS_SERVICO} and ${servicosOcorrencias.prazoEm} < ${agora})::int`,
      triagem: sql<number>`count(*) filter (where ${servicosOcorrencias.status} = 'ABERTA')::int`,
      concluidas30: sql<number>`count(*) filter (where ${servicosOcorrencias.status} = 'CONCLUIDA' and ${servicosOcorrencias.concluidaEm} >= ${new Date(agora.getTime() - 30 * DIA)})::int`,
      noPrazo30: sql<number>`count(*) filter (where ${servicosOcorrencias.status} = 'CONCLUIDA' and ${servicosOcorrencias.concluidaEm} >= ${new Date(agora.getTime() - 30 * DIA)} and ${servicosOcorrencias.concluidaEm} <= ${servicosOcorrencias.prazoEm})::int`,
    })
    .from(servicosOcorrencias)
    .where(and(eq(servicosOcorrencias.municipioId, municipioId), inArray(servicosOcorrencias.setorId, cab.ids)));
  const [os] = await db
    .select({
      programadas: sql<number>`count(*) filter (where ${servicosOrdens.status} = 'PROGRAMADA')::int`,
      emExecucao: sql<number>`count(*) filter (where ${servicosOrdens.status} = 'EM_EXECUCAO')::int`,
    })
    .from(servicosOrdens)
    .where(and(eq(servicosOrdens.municipioId, municipioId), inArray(servicosOrdens.setorId, cab.ids)));
  const obras = contratos.filter((c) => c.obra && c.situacao !== "RESCINDIDO" && c.obra.situacao !== "CONCLUIDA");
  return { tipo: "INFRAESTRUTURA" as const, ocorrencias: oc, ordens: os, obras };
}

async function blocoFazenda(municipioId: string) {
  const ano = anoCorrente();
  const [arr, inad, divida, cx] = await Promise.all([arrecadacao(municipioId, ano), inadimplencia(municipioId, ano), listarDividaAtiva(municipioId, {}), caixa(municipioId, ano)]);
  const ativa = divida.filter((d) => d.situacao === "ATIVA" || d.situacao === "AJUIZADA");
  return {
    tipo: "FAZENDA" as const,
    ano,
    previsto: arr.reduce((s, x) => s + x.previsto, 0),
    arrecadado: arr.reduce((s, x) => s + x.arrecadado, 0),
    inadVencido: inad.reduce((s, x) => s + x.vencido, 0),
    inadAberto: inad.reduce((s, x) => s + x.aberto, 0),
    dividaInscricoes: ativa.length,
    dividaValor: ativa.reduce((s, d) => s + d.atual.total, 0),
    caixa: cx.totais,
  };
}

async function blocoCompras(municipioId: string, comprasId: string) {
  const ano = new Date(Date.now() - 365 * DIA);
  const [fila, tempo] = await Promise.all([
    db
      .select({ id: processos.id, numero: processos.numero, assunto: processos.assunto, estado: processos.estadoAtual, prazo: processos.prazoEtapaEm, tipoId: processos.tipoId })
      .from(processos)
      .where(and(eq(processos.municipioId, municipioId), isNull(processos.encerradoEm), eq(processos.setorAtualId, comprasId)))
      .orderBy(processos.prazoEtapaEm),
    db
      .select({
        n: sql<number>`count(*)::int`,
        media: sql<number | null>`avg(extract(epoch from (c.quando - ${processos.abertoEm})) / 86400)::float`,
      })
      .from(processos)
      .innerJoin(
        sql`(select ${eventos.processoId} as pid, min(${eventos.criadoEm}) as quando from ${eventos} where ${eventos.paraEstado} = 'CONTRATADO' group by 1) c`,
        sql`c.pid = ${processos.id}`,
      )
      .where(and(eq(processos.municipioId, municipioId), gte(sql`c.quando`, ano))),
  ]);
  const tipos = await db.query.tiposProcesso.findMany({ where: eq(tiposProcesso.municipioId, municipioId), columns: { id: true, definicao: true } });
  const defDe = new Map(tipos.map((t) => [t.id, t.definicao as WorkflowDef]));
  const agora = Date.now();
  return {
    tipo: "COMPRAS" as const,
    fila: fila.map((p) => ({ ...p, etapa: defDe.get(p.tipoId) ? nomeDaEtapa(defDe.get(p.tipoId)!, p.estado) : p.estado, atrasado: !!p.prazo && p.prazo.getTime() < agora })),
    contratados12m: tempo[0]?.n ?? 0,
    mediaDiasAteContrato: tempo[0]?.media == null ? null : Math.round(tempo[0].media),
  };
}

async function blocoControle(municipioId: string) {
  const [itens, legais, hist, alertas, noControle] = await Promise.all([
    trilha(municipioId, { limite: 6 }),
    obrigacoesLegais(municipioId),
    historicoDePagamentos(municipioId, 90),
    alertasContratos(municipioId),
    db.$count(processos, and(eq(processos.municipioId, municipioId), isNull(processos.encerradoEm), eq(processos.estadoAtual, "CONTROLE_INTERNO"))),
  ]);
  const achados = [
    { chave: "controle", rotulo: "processos aguardando a conferência do controle interno", n: noControle, href: "/processos?etapa=CONTROLE_INTERNO&situacao=abertos" },
    { chave: "legais", rotulo: "obrigações legais vencidas (PNCP e Tribunal de Contas)", n: legais.filter((o) => o.situacao === "vencida").length, href: "/obrigacoes?situacao=vencida" },
    { chave: "ordem", rotulo: "pagamentos fora da ordem cronológica em 90 dias", n: hist.quebras.length, href: "/fila-de-pagamentos" },
    { chave: "aditivos", rotulo: "contratos com acréscimos acima do limite legal", n: alertas.filter((a) => a.tipo === "ADITIVO").length, href: "/contratos?alertas=todos" },
    { chave: "atesto", rotulo: "notas sem atesto há mais de 5 dias úteis", n: alertas.filter((a) => a.tipo === "ATESTO").length, href: "/contratos/atestos" },
  ];
  return { tipo: "CONTROLE_INTERNO" as const, trilha: itens, achados };
}

// ---------------------------------------------------------------------------
// Carga completa da cabine
// ---------------------------------------------------------------------------

export async function carregarCabine(municipioId: string, cab: Cabine) {
  const area = cab.setor.area;
  const [pp, orc, todosContratos, reps, obs] = await Promise.all([
    processosDaPasta(municipioId, cab),
    orcamentoDaPasta(municipioId, cab.orgaos),
    listarContratos(municipioId),
    repassesDoMunicipio(municipioId),
    obrigacoesDoMunicipio(municipioId),
  ]);
  const contratos = todosContratos.filter((c) => c.setorId && cab.ids.includes(c.setorId));
  const repasses = reps.filter((r) => cab.ids.includes(r.setor.id));
  const obrigacoes = obs.filter((o) => cab.ids.includes(o.setor.id));
  const proprio =
    area === "INFRAESTRUTURA"
      ? await blocoInfraestrutura(municipioId, cab, contratos)
      : area === "FAZENDA"
        ? await blocoFazenda(municipioId)
        : area === "COMPRAS"
          ? await blocoCompras(municipioId, cab.setor.id)
          : area === "CONTROLE_INTERNO"
            ? await blocoControle(municipioId)
            : null;
  const compartilhamOrgao = cab.setores.filter((s) => ehCabine(s) && s.id !== cab.setor.id && s.orgaoOrcamentario && cab.orgaos.includes(s.orgaoOrcamentario));
  return { ...pp, orcamento: orc, contratos, repasses, obrigacoes, proprio, compartilhamOrgao, semaforo: semaforoDe(pp, orc, repasses, obrigacoes) };
}
export type DadosCabine = Awaited<ReturnType<typeof carregarCabine>>;

function semaforoDe(
  pp: { processos: ProcessoDaPasta[]; pendencias: Pendencia[] },
  orc: Awaited<ReturnType<typeof orcamentoDaPasta>>,
  repasses: RepasseResumo[],
  obrigacoes: ObrigacaoResumo[],
): Semaforo {
  const vencido = (r: RepasseResumo) => r.situacao === "COM_PENDENCIA" || r.prazoCritico?.alerta.nivel === "vencido";
  return avaliarSemaforo({
    emAndamento: pp.processos.length,
    atrasados: pp.processos.filter((p) => p.atrasado).length,
    dotacaoAtualizada: orc.totais?.atualizado ?? null,
    liquidado: orc.totais?.liquidado ?? 0,
    fracaoDoAno: fracaoDoAno(),
    repassesVencidos: repasses.filter((r) => r.risco.emRisco && vencido(r)).length,
    repassesEmRisco: repasses.filter((r) => r.risco.emRisco && !vencido(r)).length,
    obrigacoesVencidas: obrigacoes.filter((o) => o.alerta?.nivel === "vencido").length,
    pendenciasAssinatura: pp.pendencias.length,
    pendenciasVencidas: pp.pendencias.filter((p) => p.vencida).length,
  });
}

/**
 * Mapa das secretarias (Sala do prefeito): os quatro sinais de cada cabine com pasta, com o semáforo.
 * Carrega processos, orçamento, repasses e obrigações uma vez para o município e recorta em memória.
 */
export async function mapaDasSecretarias(municipioId: string) {
  const cabs = (await cabinesDoMunicipio(municipioId)).filter((c) => c.setor.area !== "COMPRAS" && c.setor.area !== "CONTROLE_INTERNO");
  const [reps, obs] = await Promise.all([repassesDoMunicipio(municipioId), obrigacoesDoMunicipio(municipioId)]);
  const out = [];
  for (const cab of cabs) {
    const [pp, orc] = await Promise.all([processosDaPasta(municipioId, cab), orcamentoDaPasta(municipioId, cab.orgaos)]);
    const repasses = reps.filter((r) => cab.ids.includes(r.setor.id));
    const obrigacoes = obs.filter((o) => cab.ids.includes(o.setor.id));
    const semaforo = semaforoDe(pp, orc, repasses, obrigacoes);
    out.push({
      setor: cab.setor,
      semaforo,
      numeros: {
        emAndamento: pp.processos.length,
        atrasados: pp.processos.filter((p) => p.atrasado).length,
        execucao: orc.totais && orc.totais.atualizado > 0 ? (orc.totais.liquidado / orc.totais.atualizado) * 100 : null,
        repassesEmRisco: repasses.filter((r) => r.risco.emRisco).length,
        valorEmRisco: repasses.filter((r) => r.risco.emRisco).reduce((s, r) => s + r.risco.valorEmRisco, 0),
        obrigacoesVencidas: obrigacoes.filter((o) => o.alerta?.nivel === "vencido").length,
        pendencias: pp.pendencias.length,
      },
    });
  }
  const peso = { vermelho: 0, amarelo: 1, verde: 2 } as const;
  return out.sort((a, b) => peso[a.semaforo.nivel] - peso[b.semaforo.nivel] || a.setor.nome.localeCompare(b.setor.nome));
}
export type CartaoSecretaria = Awaited<ReturnType<typeof mapaDasSecretarias>>[number];

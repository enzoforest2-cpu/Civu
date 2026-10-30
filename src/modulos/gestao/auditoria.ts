import "server-only";
// Auditoria administrativa (tabela própria, append-only) e trilha unificada com os eventos dos processos.
import { and, desc, eq, gte, ilike, inArray, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { eventos, gestaoAuditoria, processos, usuarios } from "@/db/schema";
import { verificarCadeia } from "@/lib/engine";

type Exec = Pick<typeof db, "insert">;

export async function registrarAuditoria(
  input: {
    municipioId: string;
    autorId: string | null;
    acao: string;
    objetoTipo: string;
    objetoId?: string | null;
    objetoRotulo?: string | null;
    antes?: unknown;
    depois?: unknown;
    justificativa?: string | null;
    origem?: "TELA" | "AUTOMACAO" | "SISTEMA";
    criadoEm?: Date;
  },
  exec: Exec = db,
) {
  await exec.insert(gestaoAuditoria).values({
    municipioId: input.municipioId,
    autorId: input.autorId,
    acao: input.acao,
    objetoTipo: input.objetoTipo,
    objetoId: input.objetoId ?? null,
    objetoRotulo: input.objetoRotulo ?? null,
    antes: (input.antes as object) ?? null,
    depois: (input.depois as object) ?? null,
    justificativa: input.justificativa ?? null,
    origem: input.origem ?? "TELA",
    ...(input.criadoEm ? { criadoEm: input.criadoEm } : {}),
  });
}

/** Rótulos das ações administrativas. */
export const ACAO_ROTULO: Record<string, string> = {
  USUARIO_ATIVADO: "Usuário ativado",
  USUARIO_DESATIVADO: "Usuário desativado",
  USUARIO_SETOR: "Setor do usuário alterado",
  USUARIO_PAPEIS: "Papéis do usuário alterados",
  REGRA_CRIADA: "Regra de automação criada",
  REGRA_ATIVADA: "Regra de automação ativada",
  REGRA_SUSPENSA: "Regra de automação suspensa",
  REGRA_EXECUTADA: "Regra de automação executada",
  ALERTA_RESOLVIDO: "Alerta resolvido",
  ALERTA_DESCARTADO: "Alerta descartado",
  DECISAO_LOTE: "Decisão em lote no gabinete",
  INTEGRACAO_TESTE: "Teste de integração",
  INTEGRACAO_CONFIGURADA: "Integração configurada",
  INTEGRIDADE_VERIFICADA: "Verificação de integridade da trilha",
};

/** Rótulos dos eventos de processo. */
export const EVENTO_ROTULO: Record<string, string> = {
  ABERTURA: "Abertura",
  MUDANCA_ESTADO: "Mudança de etapa",
  DEVOLUCAO: "Devolução",
  ENVIO: "Envio a outro setor",
  RECEBIMENTO: "Recebimento",
  ANEXO: "Documento juntado",
  ASSINATURA: "Assinatura",
  DESPACHO: "Despacho",
  ENCERRAMENTO: "Encerramento",
  DADOS_CONTRATACAO: "Dados da contratação",
  REMESSA_TCE: "Remessa ao Tribunal de Contas",
  EXIGENCIA: "Exigência ao interessado",
  RESPOSTA_EXIGENCIA: "Resposta do interessado",
};

export type ItemTrilha = {
  id: string;
  fonte: "PROCESSO" | "ADMINISTRATIVA";
  quando: Date;
  autor: string;
  acao: string;
  objeto: string;
  href: string | null;
  detalhe: string | null;
  hash?: string | null;
};

function resumoDados(tipo: string, dados: unknown): string | null {
  const d = (dados ?? {}) as Record<string, unknown>;
  if (typeof d.despacho === "string" && d.despacho) return d.despacho;
  if (typeof d.texto === "string") return d.texto;
  if (typeof d.motivo === "string") return d.motivo;
  if (typeof d.titulo === "string") return d.titulo;
  if (typeof d.rotulo === "string") return d.rotulo;
  if (tipo === "ASSINATURA" && d.papel) return `Assinou como ${d.papel}`;
  if (tipo === "REMESSA_TCE" && d.recibo) return `Recibo ${d.recibo}`;
  return null;
}

/** Trilha pesquisável: eventos dos processos + auditoria administrativa, mais recentes primeiro. */
export async function trilha(
  municipioId: string,
  f: { q?: string; fonte?: string; de?: Date | null; ate?: Date | null; limite?: number },
): Promise<ItemTrilha[]> {
  const limite = f.limite ?? 80;
  const termo = f.q?.trim() ? `%${f.q.trim()}%` : null;
  const out: ItemTrilha[] = [];

  if (f.fonte !== "ADMINISTRATIVA") {
    const conds = [eq(processos.municipioId, municipioId)];
    if (f.de) conds.push(gte(eventos.criadoEm, f.de));
    if (f.ate) conds.push(lte(eventos.criadoEm, f.ate));
    if (termo) {
      const tiposQ = Object.entries(EVENTO_ROTULO)
        .filter(([, r]) => r.toLowerCase().includes(f.q!.trim().toLowerCase()))
        .map(([k]) => k);
      conds.push(
        or(
          ilike(processos.numero, termo),
          ilike(processos.assunto, termo),
          ilike(usuarios.nome, termo),
          ilike(eventos.tipo, termo),
          sql`${eventos.dados}::text ilike ${termo}`,
          tiposQ.length ? inArray(eventos.tipo, tiposQ) : sql`false`,
        )!,
      );
    }
    const rows = await db
      .select({
        id: eventos.id,
        tipo: eventos.tipo,
        dados: eventos.dados,
        criadoEm: eventos.criadoEm,
        hash: eventos.hash,
        autor: usuarios.nome,
        processoId: processos.id,
        numero: processos.numero,
        assunto: processos.assunto,
      })
      .from(eventos)
      .innerJoin(processos, eq(eventos.processoId, processos.id))
      .innerJoin(usuarios, eq(eventos.autorId, usuarios.id))
      .where(and(...conds))
      .orderBy(desc(eventos.criadoEm))
      .limit(limite);
    for (const r of rows)
      out.push({
        id: r.id,
        fonte: "PROCESSO",
        quando: r.criadoEm,
        autor: r.autor,
        acao: EVENTO_ROTULO[r.tipo] ?? r.tipo,
        objeto: `${r.numero} · ${r.assunto}`,
        href: `/processos/${r.processoId}`,
        detalhe: resumoDados(r.tipo, r.dados),
        hash: r.hash,
      });
  }

  if (f.fonte !== "PROCESSO") {
    const conds = [eq(gestaoAuditoria.municipioId, municipioId)];
    if (f.de) conds.push(gte(gestaoAuditoria.criadoEm, f.de));
    if (f.ate) conds.push(lte(gestaoAuditoria.criadoEm, f.ate));
    if (termo) {
      const acoesQ = Object.entries(ACAO_ROTULO)
        .filter(([, r]) => r.toLowerCase().includes(f.q!.trim().toLowerCase()))
        .map(([k]) => k);
      conds.push(
        or(
          ilike(gestaoAuditoria.objetoRotulo, termo),
          ilike(gestaoAuditoria.justificativa, termo),
          ilike(usuarios.nome, termo),
          ilike(gestaoAuditoria.acao, termo),
          acoesQ.length ? inArray(gestaoAuditoria.acao, acoesQ) : sql`false`,
        )!,
      );
    }
    const rows = await db
      .select({
        id: gestaoAuditoria.id,
        acao: gestaoAuditoria.acao,
        objetoTipo: gestaoAuditoria.objetoTipo,
        objetoRotulo: gestaoAuditoria.objetoRotulo,
        antes: gestaoAuditoria.antes,
        depois: gestaoAuditoria.depois,
        justificativa: gestaoAuditoria.justificativa,
        origem: gestaoAuditoria.origem,
        criadoEm: gestaoAuditoria.criadoEm,
        autor: usuarios.nome,
      })
      .from(gestaoAuditoria)
      .leftJoin(usuarios, eq(gestaoAuditoria.autorId, usuarios.id))
      .where(and(...conds))
      .orderBy(desc(gestaoAuditoria.criadoEm))
      .limit(limite);
    for (const r of rows)
      out.push({
        id: r.id,
        fonte: "ADMINISTRATIVA",
        quando: r.criadoEm,
        autor: r.autor ?? (r.origem === "AUTOMACAO" ? "Automação" : "Sistema"),
        acao: ACAO_ROTULO[r.acao] ?? r.acao,
        objeto: r.objetoRotulo ?? r.objetoTipo,
        href: null,
        detalhe: r.justificativa ?? descreverMudanca(r.antes, r.depois),
      });
  }

  return out.sort((a, b) => b.quando.getTime() - a.quando.getTime()).slice(0, limite);
}

function descreverMudanca(antes: unknown, depois: unknown): string | null {
  if (!antes && !depois) return null;
  const a = (antes ?? {}) as Record<string, unknown>;
  const d = (depois ?? {}) as Record<string, unknown>;
  const partes: string[] = [];
  for (const k of new Set([...Object.keys(a), ...Object.keys(d)])) {
    const va = fmtValor(a[k]);
    const vd = fmtValor(d[k]);
    if (va === vd) continue;
    partes.push(antes ? `${k}: ${va} → ${vd}` : `${k}: ${vd}`);
  }
  return partes.length ? partes.join(" · ") : null;
}

function fmtValor(v: unknown): string {
  if (v === undefined || v === null) return "—";
  if (Array.isArray(v)) return v.join(", ") || "nenhum";
  if (typeof v === "boolean") return v ? "sim" : "não";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export type ResultadoIntegridade = {
  processos: number;
  eventos: number;
  integros: number;
  falhas: { processoId: string; numero: string; seq: number }[];
  verificadoEm: string;
};

/** Verifica a cadeia de hash de todos os processos do município, em lote. */
export async function verificarIntegridade(municipioId: string): Promise<ResultadoIntegridade> {
  const lista = await db.query.processos.findMany({
    where: eq(processos.municipioId, municipioId),
    columns: { id: true, numero: true },
    with: { eventos: { orderBy: (e, { asc }) => [asc(e.seq)] } },
  });
  const falhas: ResultadoIntegridade["falhas"] = [];
  let n = 0;
  for (const p of lista) {
    n += p.eventos.length;
    const r = verificarCadeia(p.eventos);
    if (!r.ok) falhas.push({ processoId: p.id, numero: p.numero, seq: r.seq });
  }
  return { processos: lista.length, eventos: n, integros: lista.length - falhas.length, falhas, verificadoEm: new Date().toISOString() };
}

/** Última verificação registrada na auditoria. */
export async function ultimaVerificacao(municipioId: string) {
  const r = await db.query.gestaoAuditoria.findFirst({
    where: and(eq(gestaoAuditoria.municipioId, municipioId), eq(gestaoAuditoria.acao, "INTEGRIDADE_VERIFICADA")),
    orderBy: desc(gestaoAuditoria.criadoEm),
    with: { autor: true },
  });
  if (!r) return null;
  return { ...(r.depois as ResultadoIntegridade), autor: r.autor?.nome ?? "Sistema", em: r.criadoEm };
}

import "server-only";
// Quem abre um processo (/processos/[id]) e age sobre ele, e quais processos a lista e a busca de /processos mostram.
// Uma regra só, em SQL, para a lista e para a página não discordarem. Participa do processo:
// - quem o pediu (abertoPor) e o setor de origem, com os setores da mesma cabine (a pasta que pediu);
// - o setor onde ele está agora e os setores por onde já passou (eventos com setor de origem ou destino);
// - os setores com etapa fixa no fluxo do tipo (quem tem papel numa etapa do caminho: Compras abre qualquer compra,
//   Contabilidade e Tesouraria as que vão chegar a elas);
// - num processo ligado a contrato (a compra de origem ou o pagamento de uma nota), o fiscal, o gestor e a pasta do contrato.
// Gabinete e Controle Interno abrem todos. O papel ADMIN, sem participar, só lê (auditoria e configuração): não age.
// A consulta pública (/consulta) não passa por aqui.
import { and, eq, exists, inArray, or, sql, type SQL } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { contratos, eventos, processos, setores, tiposProcesso, usuarios } from "@/db/schema";
import type { SessaoUsuario } from "./auth";
import { areaDoUsuario, cabineDoSetor, setoresDaCabine } from "./areas";
import { ErroFluxo } from "./engine";
import type { WorkflowDef } from "./workflow";

export type AcessoProcesso = "agir" | "ler" | null;

/** Gabinete e Controle Interno participam de todos os processos (abrem e agem conforme o papel na etapa). */
const participaDeTodos = (u: SessaoUsuario) => {
  const a = areaDoUsuario(u);
  return a === "GABINETE" || a === "CONTROLE_INTERNO";
};

/** Setores da pasta da pessoa: o dela e, se ela for de uma cabine, todos os setores daquela cabine. */
async function minhaPasta(u: SessaoUsuario): Promise<string[]> {
  if (!u.setorId) return [];
  const todos = await db
    .select({ id: setores.id, sigla: setores.sigla, nome: setores.nome, area: setores.area, orgaoOrcamentario: setores.orgaoOrcamentario })
    .from(setores)
    .where(eq(setores.municipioId, u.municipioId));
  const cab = cabineDoSetor(todos, u.setorId);
  return [...new Set([u.setorId, ...(cab ? setoresDaCabine(todos, cab) : [])])];
}

// Referência à linha de fora nas subconsultas correlacionadas: "processos"."id" vale tanto em db.select().from(processos)
// quanto em db.query.processos (que dá o apelido "processos" à tabela); o nome com o schema só vale no primeiro caso.
const ID_DO_PROCESSO = sql.raw(`"processos"."id"`);

/**
 * Condição SQL "a pessoa participa do processo" (sobre a tabela `processos`), ou undefined quando ela participa de todos.
 * Não inclui o papel ADMIN: quem só administra não aparece como participante (ver `acessoAoProcesso`).
 */
export async function condicaoDeParticipacao(u: SessaoUsuario): Promise<SQL | undefined> {
  if (participaDeTodos(u)) return undefined;
  const pasta = await minhaPasta(u);
  const conds: SQL[] = [eq(processos.abertoPorId, u.id)];
  // contratos em que a pessoa é fiscal ou gestora, ou que são da pasta dela
  const contratoDaPessoa = or(eq(contratos.fiscalId, u.id), eq(contratos.gestorId, u.id), ...(pasta.length ? [inArray(contratos.setorId, pasta)] : []))!;
  conds.push(
    exists(db.select({ x: sql`1` }).from(contratos).where(and(sql`${contratos.processoOrigemId} = ${ID_DO_PROCESSO}`, contratoDaPessoa))),
    inArray(
      sql`${processos.metadados}->'contrato'->>'id'`,
      db.select({ id: contratos.id }).from(contratos).where(and(eq(contratos.municipioId, u.municipioId), contratoDaPessoa)),
    ),
  );
  if (u.setorId) {
    conds.push(
      inArray(processos.abertoPorId, db.select({ id: usuarios.id }).from(usuarios).where(inArray(usuarios.setorId, pasta))),
      eq(processos.setorAtualId, u.setorId),
      exists(
        db
          .select({ x: sql`1` })
          .from(eventos)
          .where(and(sql`${eventos.processoId} = ${ID_DO_PROCESSO}`, or(eq(eventos.paraSetorId, u.setorId), eq(eventos.deSetorId, u.setorId)))),
      ),
    );
    const sigla = u.setor?.sigla;
    if (sigla) {
      const tipos = await db.query.tiposProcesso.findMany({ where: eq(tiposProcesso.municipioId, u.municipioId), columns: { id: true, definicao: true } });
      const comEtapaDoSetor = tipos.filter((t) => (t.definicao as WorkflowDef).estados.some((e) => e.setor === sigla)).map((t) => t.id);
      if (comEtapaDoSetor.length) conds.push(inArray(processos.tipoId, comEtapaDoSetor));
    }
  }
  return or(...conds)!;
}

/**
 * Condição SQL dos processos que a pessoa pode abrir (lista e busca de /processos): os de que participa; quem tem o papel
 * ADMIN lê todos. undefined = sem recorte.
 */
export async function condicaoDeVisibilidade(u: SessaoUsuario): Promise<SQL | undefined> {
  if (u.papeis.includes("ADMIN")) return undefined;
  return condicaoDeParticipacao(u);
}

/** "agir": participa (o motor ainda confere o papel na etapa); "ler": só administra (ADMIN); null: sem acesso. */
export async function acessoAoProcesso(u: SessaoUsuario, processoId: string): Promise<AcessoProcesso> {
  const cond = await condicaoDeParticipacao(u);
  const [linha] = await db
    .select({ id: processos.id })
    .from(processos)
    .where(and(eq(processos.id, processoId), eq(processos.municipioId, u.municipioId), ...(cond ? [cond] : [])))
    .limit(1);
  if (linha) return "agir";
  return u.papeis.includes("ADMIN") ? "ler" : null;
}

/** Endereço do "Sem acesso a este processo". */
export const urlSemAcessoProcesso = (processoId: string) => `/sem-acesso?${new URLSearchParams({ tipo: "processo", de: `/processos/${processoId}` })}`;

/** Para páginas: sem acesso, abre "Sem acesso a este processo". Devolve o nível de acesso. */
export async function exigirLeituraDoProcesso(u: SessaoUsuario, processoId: string): Promise<"agir" | "ler"> {
  const a = await acessoAoProcesso(u, processoId);
  if (!a) redirect(urlSemAcessoProcesso(processoId));
  return a;
}

/**
 * Para server actions sobre um processo: só quem participa age. O administrador, sem participar, lê mas não age; a exceção
 * (`reencaminhar`) é reencaminhar processo parado numa etapa que saiu do fluxo, que o motor confere.
 */
export async function exigirAcaoNoProcesso(u: SessaoUsuario, processoId: string, opts: { reencaminhar?: boolean } = {}): Promise<void> {
  const a = await acessoAoProcesso(u, processoId);
  if (a === "agir" || (a === "ler" && opts.reencaminhar)) return;
  if (a === "ler") throw new ErroFluxo("O administrador do sistema consulta este processo, mas não age nele: quem age é quem participa do fluxo.");
  throw new ErroFluxo("Sem acesso a este processo: ele não é da sua pasta nem passa pelo seu setor.");
}

/** Dos processos indicados, os que a pessoa pode abrir (para listas que citam processos, como os alertas das automações). */
export async function processosVisiveisEntre(u: SessaoUsuario, ids: string[]): Promise<Set<string>> {
  const unicos = [...new Set(ids)];
  if (!unicos.length) return new Set();
  const cond = await condicaoDeVisibilidade(u);
  if (!cond) return new Set(unicos);
  const linhas = await db
    .select({ id: processos.id })
    .from(processos)
    .where(and(eq(processos.municipioId, u.municipioId), inArray(processos.id, unicos), cond));
  return new Set(linhas.map((l) => l.id));
}

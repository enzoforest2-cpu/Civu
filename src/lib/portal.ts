import "server-only";
// Sessão dos portais (Civu Cidadão / Civu Empresas): quem é a pessoa e em nome de quem ela está agindo.
// Toda checagem de acesso a dados privados é feita aqui, no servidor; trocar o perfil na tela não basta.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import bcrypt from "bcryptjs";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { empresas, pessoas, representacoes, sessoesPortal, type Empresa, type Pessoa, type Representacao } from "@/db/schema";

const COOKIE = "civu_portal";
const HORAS = 12;

export class ErroAcesso extends Error {}

export type Escopo = "PROCESSOS" | "TRIBUTOS" | "CONTRATOS" | "LICENCAS";
export const ESCOPO_NOME: Record<Escopo, string> = {
  PROCESSOS: "Processos e solicitações",
  TRIBUTOS: "Tributos e guias",
  CONTRATOS: "Contratos e pagamentos",
  LICENCAS: "Licenças e alvarás",
};
export const PAPEL_REPRESENTACAO: Record<string, string> = {
  RESPONSAVEL_LEGAL: "Responsável legal",
  SOCIO: "Sócio",
  PROCURADOR: "Procurador",
  CONTADOR: "Contador",
};

export type RepresentacaoValida = Representacao & { empresa: Empresa };

export type SessaoPortal = {
  sessaoId: string;
  metodo: string;
  pessoa: Pessoa;
  /** Empresa em nome da qual a pessoa age agora; null = em nome próprio. */
  empresaAtiva: Empresa | null;
  /** Escopos permitidos na empresa ativa (vazio quando age em nome próprio). */
  escoposAtivos: Escopo[];
  representacoes: RepresentacaoValida[];
};

export function representacaoValida(r: Representacao, hoje = new Date()): boolean {
  if (r.revogadaEm) return false;
  if (r.validaAte && new Date(String(r.validaAte) + "T23:59:59") < hoje) return false;
  return true;
}

async function criarSessao(pessoaId: string, metodo: string) {
  const expiraEm = new Date(Date.now() + HORAS * 3600_000);
  const [s] = await db.insert(sessoesPortal).values({ pessoaId, metodo, expiraEm }).returning();
  const jar = await cookies();
  jar.set(COOKIE, s.id, { httpOnly: true, sameSite: "lax", path: "/", expires: expiraEm, secure: process.env.NODE_ENV === "production" });
}

/** Entrada gov.br SIMULADA: só aceita pessoas de demonstração. A integração real depende de adesão do município. */
export async function entrarGovbrSimulado(pessoaId: string) {
  const p = await db.query.pessoas.findFirst({ where: and(eq(pessoas.id, pessoaId), eq(pessoas.demonstracao, true)) });
  if (!p) throw new ErroAcesso("Pessoa de demonstração não encontrada.");
  await criarSessao(p.id, "GOVBR_SIMULADO");
}

/** Cadastro tradicional (CPF e senha): para serviços que não exigem identidade validada. */
export async function entrarComSenha(cpf: string, senha: string) {
  const p = await db.query.pessoas.findFirst({ where: eq(pessoas.cpf, cpf.replace(/\D/g, "")) });
  if (!p?.senhaHash || !(await bcrypt.compare(senha, p.senhaHash))) throw new ErroAcesso("CPF ou senha inválidos.");
  await criarSessao(p.id, "SENHA");
}

export async function sairDoPortal() {
  const jar = await cookies();
  const id = jar.get(COOKIE)?.value;
  if (id) await db.delete(sessoesPortal).where(eq(sessoesPortal.id, id));
  jar.delete(COOKIE);
}

export const getSessaoPortal = cache(async (): Promise<SessaoPortal | null> => {
  const jar = await cookies();
  const id = jar.get(COOKIE)?.value;
  if (!id) return null;
  const s = await db.query.sessoesPortal.findFirst({ where: eq(sessoesPortal.id, id), with: { pessoa: true, empresaAtiva: true } });
  if (!s || s.expiraEm < new Date()) return null;
  const reps = (
    await db.query.representacoes.findMany({ where: and(eq(representacoes.pessoaId, s.pessoaId), isNull(representacoes.revogadaEm)), with: { empresa: true } })
  ).filter((r) => representacaoValida(r));
  // a representação pode ter sido revogada ou vencido depois de ativada: volta a agir em nome próprio
  const repAtiva = s.empresaAtivaId ? reps.find((r) => r.empresaId === s.empresaAtivaId) : undefined;
  return {
    sessaoId: s.id,
    metodo: s.metodo,
    pessoa: s.pessoa,
    empresaAtiva: repAtiva ? repAtiva.empresa : null,
    escoposAtivos: repAtiva ? (repAtiva.escopos as Escopo[]) : [],
    representacoes: reps,
  };
});

export async function requirePortal(): Promise<SessaoPortal> {
  const s = await getSessaoPortal();
  if (!s) redirect("/entrar");
  return s;
}

/** Troca o contexto: agir em nome próprio (null) ou de uma empresa com representação válida. */
export async function agirComo(s: SessaoPortal, empresaId: string | null) {
  if (empresaId && !s.representacoes.some((r) => r.empresaId === empresaId)) throw new ErroAcesso("Você não representa esta empresa.");
  await db.update(sessoesPortal).set({ empresaAtivaId: empresaId }).where(eq(sessoesPortal.id, s.sessaoId));
}

/** Exige que a sessão possa agir pela empresa no assunto indicado. Lança ErroAcesso se não puder. */
export function exigirEscopo(s: SessaoPortal, empresaId: string, escopo: Escopo) {
  const r = s.representacoes.find((x) => x.empresaId === empresaId);
  if (!r) throw new ErroAcesso("Você não representa esta empresa.");
  if (!r.escopos.includes(escopo)) throw new ErroAcesso(`Sua representação não inclui ${ESCOPO_NOME[escopo].toLowerCase()}.`);
}

/** Interessado de um novo pedido feito no portal, conforme o contexto ativo. */
export function interessadoAtual(s: SessaoPortal) {
  return { pessoaId: s.pessoa.id, empresaId: s.empresaAtiva?.id ?? null };
}

/** Filtro de "o que é meu": processos da pessoa (em nome próprio) ou da empresa ativa. */
export function donoAtual(s: SessaoPortal): { tipo: "PESSOA"; id: string } | { tipo: "EMPRESA"; id: string } {
  return s.empresaAtiva ? { tipo: "EMPRESA", id: s.empresaAtiva.id } : { tipo: "PESSOA", id: s.pessoa.id };
}

export async function listarPessoasDemonstracao() {
  return db.query.pessoas.findMany({ where: eq(pessoas.demonstracao, true), with: { representacoes: { with: { empresa: true } } }, orderBy: pessoas.nome });
}

export { empresas };

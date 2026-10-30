import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import bcrypt from "bcryptjs";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { sessoes, usuarios, setores, municipios } from "@/db/schema";
import type { Papel } from "./workflow";

const COOKIE = "civu_sessao";
const DIAS = 7;

export type SessaoUsuario = {
  id: string;
  nome: string;
  cpf: string;
  email: string;
  cargo: string | null;
  papeis: Papel[];
  setorId: string | null;
  setor: { id: string; sigla: string; nome: string } | null;
  municipioId: string;
  municipio: { id: string; nome: string; uf: string; slug: string };
};

export async function login(cpf: string, senha: string): Promise<SessaoUsuario | null> {
  const limpo = cpf.replace(/\D/g, "");
  const u = await db.query.usuarios.findFirst({ where: and(eq(usuarios.cpf, limpo), eq(usuarios.ativo, true)) });
  if (!u) return null;
  const ok = await bcrypt.compare(senha, u.senhaHash);
  if (!ok) return null;
  const expiraEm = new Date(Date.now() + DIAS * 86400_000);
  const [s] = await db.insert(sessoes).values({ usuarioId: u.id, expiraEm }).returning();
  const jar = await cookies();
  jar.set(COOKIE, s.id, { httpOnly: true, sameSite: "lax", path: "/", expires: expiraEm, secure: process.env.NODE_ENV === "production" });
  return (await getSessionUser())!;
}

export async function logout() {
  const jar = await cookies();
  const id = jar.get(COOKIE)?.value;
  if (id) await db.delete(sessoes).where(eq(sessoes.id, id));
  jar.delete(COOKIE);
}

export const getSessionUser = cache(async (): Promise<SessaoUsuario | null> => {
  const jar = await cookies();
  const id = jar.get(COOKIE)?.value;
  if (!id) return null;
  const s = await db.query.sessoes.findFirst({ where: eq(sessoes.id, id) });
  if (!s || s.expiraEm < new Date()) return null;
  const u = await db.query.usuarios.findFirst({ where: eq(usuarios.id, s.usuarioId), with: { setor: true, municipio: true } });
  if (!u || !u.ativo) return null;
  return {
    id: u.id,
    nome: u.nome,
    cpf: u.cpf,
    email: u.email,
    cargo: u.cargo,
    papeis: u.papeis as Papel[],
    setorId: u.setorId,
    setor: u.setor ? { id: u.setor.id, sigla: u.setor.sigla, nome: u.setor.nome } : null,
    municipioId: u.municipioId,
    municipio: { id: u.municipio.id, nome: u.municipio.nome, uf: u.municipio.uf, slug: u.municipio.slug },
  };
});

export async function requireUser(): Promise<SessaoUsuario> {
  const u = await getSessionUser();
  if (!u) redirect("/login");
  return u;
}

export function temPapel(u: SessaoUsuario, ...papeis: Papel[]): boolean {
  if (u.papeis.includes("ADMIN")) return true;
  return papeis.some((p) => u.papeis.includes(p));
}

/** Reautenticação por senha (usada ao assinar). */
export async function confirmarSenha(usuarioId: string, senha: string): Promise<boolean> {
  const u = await db.query.usuarios.findFirst({ where: eq(usuarios.id, usuarioId) });
  if (!u) return false;
  return bcrypt.compare(senha, u.senhaHash);
}

export async function hashSenha(senha: string) {
  return bcrypt.hash(senha, 10);
}

// re-export para quem precisar listar setores/municípios junto
export { setores, municipios };

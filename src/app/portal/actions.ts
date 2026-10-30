"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { pessoas, representacoes } from "@/db/schema";
import { ErroAcesso, agirComo, entrarComSenha, entrarGovbrSimulado, requirePortal, sairDoPortal, type Escopo } from "@/lib/portal";
import type { ActionState } from "@/app/actions";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

function trata(e: unknown): ActionState {
  if (e instanceof ErroAcesso) return { erro: e.message };
  console.error(e);
  return { erro: "Não foi possível concluir. Tente novamente." };
}

export async function entrarGovbrAction(fd: FormData) {
  await entrarGovbrSimulado(str(fd, "pessoaId"));
  redirect("/portal");
}

export async function entrarSenhaAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await entrarComSenha(str(fd, "cpf"), str(fd, "senha"));
  } catch (e) {
    return trata(e);
  }
  redirect("/portal");
}

export async function sairPortalAction() {
  await sairDoPortal();
  redirect("/entrar");
}

export async function agirComoAction(fd: FormData) {
  const s = await requirePortal();
  const v = str(fd, "empresaId");
  await agirComo(s, v || null);
  revalidatePath("/portal", "layout");
  redirect(str(fd, "voltar") || "/portal");
}

/** Responsável legal concede representação a outra pessoa (por CPF), com assuntos e validade. */
export async function concederRepresentacaoAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const s = await requirePortal();
    const empresaId = str(fd, "empresaId");
    const minha = s.representacoes.find((r) => r.empresaId === empresaId);
    if (!minha || minha.papel !== "RESPONSAVEL_LEGAL") throw new ErroAcesso("Só o responsável legal concede representação.");
    const cpf = str(fd, "cpf").replace(/\D/g, "");
    if (cpf.length !== 11) throw new ErroAcesso("Informe um CPF com 11 dígitos.");
    const escopos = fd.getAll("escopos").map(String) as Escopo[];
    if (!escopos.length) throw new ErroAcesso("Escolha ao menos um assunto.");
    const validaAte = str(fd, "validaAte") || null;
    if (validaAte && new Date(validaAte) < new Date()) throw new ErroAcesso("A validade precisa ser uma data futura.");
    let p = await db.query.pessoas.findFirst({ where: eq(pessoas.cpf, cpf) });
    if (!p) [p] = await db.insert(pessoas).values({ cpf, nome: str(fd, "nome") || "Pessoa indicada" }).returning();
    const ja = await db.query.representacoes.findFirst({
      where: and(eq(representacoes.pessoaId, p.id), eq(representacoes.empresaId, empresaId), isNull(representacoes.revogadaEm)),
    });
    if (ja) throw new ErroAcesso("Esta pessoa já representa a empresa. Revogue antes de conceder de novo.");
    await db.insert(representacoes).values({ pessoaId: p.id, empresaId, papel: str(fd, "papel") || "PROCURADOR", escopos, validaAte, concedidaPorId: s.pessoa.id });
  } catch (e) {
    return trata(e);
  }
  revalidatePath("/portal/acesso");
  return { ok: "Representação concedida." };
}

export async function revogarRepresentacaoAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const s = await requirePortal();
    const r = await db.query.representacoes.findFirst({ where: eq(representacoes.id, str(fd, "representacaoId")) });
    if (!r) throw new ErroAcesso("Representação não encontrada.");
    const minha = s.representacoes.find((x) => x.empresaId === r.empresaId);
    const propria = r.pessoaId === s.pessoa.id;
    if (!propria && minha?.papel !== "RESPONSAVEL_LEGAL") throw new ErroAcesso("Só o responsável legal revoga a representação de outra pessoa.");
    if (r.papel === "RESPONSAVEL_LEGAL") throw new ErroAcesso("A responsabilidade legal muda pelo cadastro da empresa, não por aqui.");
    await db.update(representacoes).set({ revogadaEm: new Date() }).where(eq(representacoes.id, r.id));
  } catch (e) {
    return trata(e);
  }
  revalidatePath("/portal/acesso");
  return { ok: "Representação revogada." };
}

export async function responderExigenciaAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, "processoId");
  try {
    const s = await requirePortal();
    const { carregarMeuProcesso } = await import("@/lib/portal-processos");
    const p = await carregarMeuProcesso(s, id);
    if (!p) throw new ErroAcesso("Processo não encontrado.");
    const { responderExigencia, ErroFluxo } = await import("@/lib/engine");
    try {
      await responderExigencia(p.municipioId, p.id, { texto: str(fd, "texto"), pessoaId: s.pessoa.id, nome: s.pessoa.nome });
    } catch (e) {
      if (e instanceof ErroFluxo) throw new ErroAcesso(e.message);
      throw e;
    }
  } catch (e) {
    return trata(e);
  }
  revalidatePath(`/portal/pedidos/${id}`);
  return { ok: "Resposta enviada. A prefeitura foi avisada." };
}

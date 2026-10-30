"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { login, logout, requireUser, confirmarSenha } from "@/lib/auth";
import { ErroFluxo, abrirProcesso, avancar, devolver, tramitar, receber, juntarDocumento, assinarDocumento, despachar, registrarContratacao, registrarRemessaTce, abrirExigencia } from "@/lib/engine";
import { analisarFracionamento, type AnaliseFracionamento } from "@/lib/conformidade";
import type { Papel } from "@/lib/workflow";

export type ActionState = { erro?: string; ok?: string } | null;

function trata(e: unknown): ActionState {
  if (e instanceof ErroFluxo) return { erro: e.message };
  if (e instanceof Error && e.message === "NAO_AUTENTICADO") redirect("/login");
  console.error(e);
  return { erro: "Erro inesperado. Tente novamente." };
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export async function loginAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await login(str(fd, "cpf"), str(fd, "senha"));
  if (!u) return { erro: "CPF ou senha inválidos." };
  redirect("/painel");
}

export async function logoutAction() {
  await logout();
  redirect("/login");
}

export async function abrirProcessoAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id: string;
  try {
    const u = await requireUser();
    const metadados: Record<string, unknown> = {};
    for (const [k, v] of fd.entries()) if (k.startsWith("meta.") && String(v).trim()) metadados[k.slice(5)] = String(v).trim();
    const p = await abrirProcesso(u, {
      tipoId: str(fd, "tipoId"),
      unidadeGestoraId: str(fd, "unidadeGestoraId"),
      assunto: str(fd, "assunto"),
      descricao: str(fd, "descricao"),
      urgencia: str(fd, "urgencia") || "NORMAL",
      metadados,
    });
    id = p.id;
  } catch (e) {
    return trata(e);
  }
  revalidatePath("/processos");
  redirect(`/processos/${id}`);
}

export async function avancarAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const u = await requireUser();
    await avancar(u, str(fd, "processoId"), str(fd, "para"), str(fd, "despacho"));
  } catch (e) {
    return trata(e);
  }
  revalidatePath(`/processos/${str(fd, "processoId")}`);
  return { ok: "Processo movimentado." };
}

export async function devolverAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const u = await requireUser();
    await devolver(u, str(fd, "processoId"), str(fd, "para"), str(fd, "motivo"));
  } catch (e) {
    return trata(e);
  }
  revalidatePath(`/processos/${str(fd, "processoId")}`);
  return { ok: "Processo devolvido." };
}

export async function tramitarAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const u = await requireUser();
    await tramitar(u, str(fd, "processoId"), str(fd, "paraSetorId"), str(fd, "despacho"));
  } catch (e) {
    return trata(e);
  }
  revalidatePath(`/processos/${str(fd, "processoId")}`);
  return { ok: "Processo enviado." };
}

export async function receberAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const u = await requireUser();
    await receber(u, str(fd, "processoId"));
  } catch (e) {
    return trata(e);
  }
  revalidatePath(`/processos/${str(fd, "processoId")}`);
  revalidatePath("/caixa");
  return { ok: "Recebimento confirmado." };
}

export async function juntarDocumentoAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const u = await requireUser();
    await juntarDocumento(u, str(fd, "processoId"), str(fd, "tipo"), str(fd, "titulo"), str(fd, "conteudo"));
  } catch (e) {
    return trata(e);
  }
  revalidatePath(`/processos/${str(fd, "processoId")}`);
  return { ok: "Documento juntado." };
}

export async function assinarAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const u = await requireUser();
    const ok = await confirmarSenha(u.id, str(fd, "senha"));
    if (!ok) return { erro: "Senha incorreta. A assinatura exige reautenticação." };
    await assinarDocumento(u, str(fd, "documentoId"), str(fd, "papel") as Papel);
  } catch (e) {
    return trata(e);
  }
  revalidatePath(`/processos/${str(fd, "processoId")}`);
  return { ok: "Documento assinado." };
}

export async function despacharAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const u = await requireUser();
    await despachar(u, str(fd, "processoId"), str(fd, "texto"));
  } catch (e) {
    return trata(e);
  }
  revalidatePath(`/processos/${str(fd, "processoId")}`);
  return { ok: "Despacho registrado." };
}


export async function contratacaoAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const u = await requireUser();
    await registrarContratacao(u, str(fd, "processoId"), { fornecedor: str(fd, "fornecedor"), cnpj: str(fd, "cnpj"), valor: str(fd, "valor"), fonte: str(fd, "fonte") });
  } catch (e) {
    return trata(e);
  }
  revalidatePath(`/processos/${str(fd, "processoId")}`);
  return { ok: "Dados da contratação registrados." };
}

export async function remessaTceAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const u = await requireUser();
    await registrarRemessaTce(u, str(fd, "processoId"), str(fd, "recibo"));
  } catch (e) {
    return trata(e);
  }
  revalidatePath("/obrigacoes");
  revalidatePath(`/processos/${str(fd, "processoId")}`);
  return { ok: "Remessa registrada." };
}

/** Consulta ao vivo do limite de dispensa, usada pelo formulário de abertura. */
export async function checarFracionamentoAction(input: { unidadeGestoraId: string; natureza: string; valor: number }): Promise<AnaliseFracionamento | null> {
  const u = await requireUser();
  if (!input.natureza || !input.unidadeGestoraId) return null;
  return analisarFracionamento({ municipioId: u.municipioId, unidadeGestoraId: input.unidadeGestoraId, natureza: input.natureza, valorNovo: Number(input.valor) || 0 });
}

export async function abrirExigenciaAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const u = await requireUser();
    await abrirExigencia(u, str(fd, "processoId"), str(fd, "texto"), Number(str(fd, "prazo")) || 10);
  } catch (e) {
    return trata(e);
  }
  revalidatePath(`/processos/${str(fd, "processoId")}`);
  return { ok: "Pedido enviado ao interessado." };
}

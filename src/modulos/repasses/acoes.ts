"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { ErroFluxo } from "@/lib/engine";
import type { ActionState } from "@/app/actions";
import { ErroRepasse, criarObrigacao, criarRepasse, desvincularProcesso, editarObrigacao, editarRepasse, registrarEntrega, vincularProcesso, type EntradaObrigacao, type EntradaRepasse } from "./operacoes";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

function trata(e: unknown): ActionState {
  if (e instanceof ErroRepasse || e instanceof ErroFluxo) return { erro: e.message };
  if (e instanceof Error && e.message === "NAO_AUTENTICADO") redirect("/login");
  console.error(e);
  return { erro: "Não foi possível concluir. Tente novamente." };
}

const revalida = (id?: string) => {
  revalidatePath("/repasses");
  if (id) revalidatePath(`/repasses/${id}`);
  revalidatePath("/secretaria");
  revalidatePath("/gabinete");
};

function lerRepasse(fd: FormData): EntradaRepasse {
  return {
    setorId: str(fd, "setorId"),
    tipo: str(fd, "tipo"),
    identificacao: str(fd, "identificacao"),
    concedente: str(fd, "concedente"),
    objeto: str(fd, "objeto"),
    valorPrevisto: str(fd, "valorPrevisto"),
    valorRecebido: str(fd, "valorRecebido"),
    assinadoEm: str(fd, "assinadoEm"),
    vigenciaFim: str(fd, "vigenciaFim"),
    prazoExecucao: str(fd, "prazoExecucao"),
    prazoPrestacaoContas: str(fd, "prazoPrestacaoContas"),
    situacao: str(fd, "situacao"),
    observacao: str(fd, "observacao"),
  };
}

export async function criarRepasseAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id: string;
  try {
    const u = await requireUser();
    id = (await criarRepasse(u, lerRepasse(fd))).id;
  } catch (e) {
    return trata(e);
  }
  revalida(id);
  redirect(`/repasses/${id}`);
}

export async function editarRepasseAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, "id");
  try {
    const u = await requireUser();
    await editarRepasse(u, id, lerRepasse(fd));
  } catch (e) {
    return trata(e);
  }
  revalida(id);
  redirect(`/repasses/${id}`);
}

export async function vincularProcessoAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, "repasseId");
  try {
    const u = await requireUser();
    await vincularProcesso(u, id, str(fd, "processoId"), str(fd, "motivo"));
  } catch (e) {
    return trata(e);
  }
  revalida(id);
  revalidatePath(`/processos/${str(fd, "processoId")}`);
  return { ok: "Processo vinculado. A execução do repasse já considera o que ele contratou, liquidou e pagou." };
}

export async function desvincularProcessoAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, "repasseId");
  try {
    const u = await requireUser();
    await desvincularProcesso(u, str(fd, "processoId"), str(fd, "motivo"));
  } catch (e) {
    return trata(e);
  }
  revalida(id);
  revalidatePath(`/processos/${str(fd, "processoId")}`);
  return { ok: "Processo desvinculado. O motivo ficou registrado no histórico do processo." };
}

function lerObrigacao(fd: FormData): EntradaObrigacao {
  return {
    setorId: str(fd, "setorId"),
    nome: str(fd, "nome"),
    destinatario: str(fd, "destinatario"),
    periodicidade: str(fd, "periodicidade"),
    proximoVencimento: str(fd, "proximoVencimento"),
    responsavelId: str(fd, "responsavelId"),
    situacao: str(fd, "situacao"),
    observacao: str(fd, "observacao"),
  };
}

const revalidaObrigacoes = (id?: string) => {
  revalidatePath("/obrigacoes-da-area");
  if (id) revalidatePath(`/obrigacoes-da-area/${id}`);
  revalidatePath("/secretaria");
  revalidatePath("/gabinete");
};

export async function criarObrigacaoAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id: string;
  try {
    const u = await requireUser();
    id = (await criarObrigacao(u, lerObrigacao(fd))).id;
  } catch (e) {
    return trata(e);
  }
  revalidaObrigacoes(id);
  redirect(`/obrigacoes-da-area/${id}`);
}

export async function editarObrigacaoAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, "id");
  try {
    const u = await requireUser();
    await editarObrigacao(u, id, lerObrigacao(fd));
  } catch (e) {
    return trata(e);
  }
  revalidaObrigacoes(id);
  return { ok: "Obrigação atualizada." };
}

export async function registrarEntregaAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, "id");
  let proximo: string | null;
  try {
    const u = await requireUser();
    proximo = (await registrarEntrega(u, id, { entregueEm: str(fd, "entregueEm"), comprovante: str(fd, "comprovante") })).proximoVencimento;
  } catch (e) {
    return trata(e);
  }
  revalidaObrigacoes(id);
  return { ok: proximo ? `Entrega registrada. Próximo vencimento: ${proximo.split("-").reverse().join("/")}.` : "Entrega registrada. Esta obrigação está cumprida." };
}

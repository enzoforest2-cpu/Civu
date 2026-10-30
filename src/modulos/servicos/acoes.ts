"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { ErroAcesso, requirePortal } from "@/lib/portal";
import type { ActionState } from "@/app/actions";
import * as d from "./dados";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const num = (fd: FormData, k: string) => {
  const v = str(fd, k).replace(",", ".");
  return v === "" ? null : Number(v);
};

function trata(e: unknown): ActionState {
  if (e instanceof d.ErroServico || e instanceof ErroAcesso) return { erro: e.message };
  console.error(e);
  return { erro: "Não foi possível concluir. Tente novamente." };
}

function revalidaGestao(ocorrenciaId?: string, ordemId?: string) {
  revalidatePath("/servicos", "layout");
  revalidatePath("/campo");
  revalidatePath("/portal/servicos", "layout");
  if (ocorrenciaId) revalidatePath(`/servicos/${ocorrenciaId}`);
  if (ordemId) revalidatePath(`/servicos/ordens/${ordemId}`);
}

// ---------------------------------------------------------------- portal

export async function pedirServicoAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id: string;
  try {
    const s = await requirePortal();
    const o = await d.registrarOcorrencia(s, {
      servicoId: str(fd, "servicoId"),
      logradouro: str(fd, "logradouro"),
      numero: str(fd, "numero"),
      referencia: str(fd, "referencia"),
      bairro: str(fd, "bairro"),
      descricao: str(fd, "descricao"),
      lat: num(fd, "lat"),
      lng: num(fd, "lng"),
    });
    id = o.id;
  } catch (e) {
    return trata(e);
  }
  revalidaGestao();
  redirect(`/portal/servicos/${id}?novo=1`);
}

export async function avaliarAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const s = await requirePortal();
    await d.avaliar(s, str(fd, "ocorrenciaId"), Number(str(fd, "nota")), str(fd, "comentario"));
  } catch (e) {
    return trata(e);
  }
  revalidaGestao(str(fd, "ocorrenciaId"));
  return { ok: "Obrigado pela avaliação. Ela ajuda a secretaria a melhorar o serviço." };
}

// ---------------------------------------------------------------- triagem

export async function triagemAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, "ocorrenciaId");
  const acao = str(fd, "acao");
  let ok = "";
  try {
    const u = await requireUser();
    if (acao === "aceitar") {
      await d.aceitar(u, id);
      ok = "Ocorrência aceita. Ela já pode entrar numa ordem de serviço.";
    } else if (acao === "recusar") {
      await d.recusar(u, id, str(fd, "motivo"));
      ok = "Ocorrência recusada. O cidadão vê o motivo no portal.";
    } else if (acao === "duplicada") {
      await d.marcarDuplicada(u, id, str(fd, "principalId"));
      ok = "Marcada como duplicada e vinculada à ocorrência principal.";
    } else if (acao === "encaminhar") {
      await d.encaminhar(u, id, str(fd, "setorId"), str(fd, "motivo"));
      ok = "Ocorrência encaminhada para a outra secretaria.";
    } else if (acao === "nota") {
      await d.notaInterna(u, id, str(fd, "texto"));
      ok = "Anotação registrada (visível só para a gestão).";
    } else return { erro: "Ação desconhecida." };
  } catch (e) {
    return trata(e);
  }
  revalidaGestao(id);
  return { ok };
}

// ---------------------------------------------------------------- ordens de serviço

export async function criarOrdemAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id: string;
  try {
    const u = await requireUser();
    const os = await d.criarOrdem(u, {
      ocorrenciaIds: fd.getAll("ids").map(String),
      equipeId: str(fd, "equipeId"),
      data: str(fd, "data"),
      instrucoes: str(fd, "instrucoes"),
    });
    id = os.id;
  } catch (e) {
    return trata(e);
  }
  revalidaGestao(undefined, id);
  redirect(`/servicos/ordens/${id}?nova=1`);
}

export async function ordemAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, "ordemId");
  const acao = str(fd, "acao");
  let ok = "";
  try {
    const u = await requireUser();
    if (acao === "iniciar") {
      await d.iniciarOrdem(u, id);
      ok = "Execução iniciada. Os cidadãos veem que a equipe está no local.";
    } else if (acao === "material") {
      await d.adicionarMaterial(u, id, str(fd, "item"), str(fd, "quantidade"));
      ok = "Material registrado.";
    } else if (acao === "remover-material") {
      await d.removerMaterial(u, id, Number(str(fd, "indice")));
      ok = "Material removido.";
    } else if (acao === "reprogramar") {
      await d.reprogramarOrdem(u, id, { equipeId: str(fd, "equipeId"), data: str(fd, "data"), motivo: str(fd, "motivo") });
      ok = "Programação atualizada e cidadãos avisados no portal.";
    } else if (acao === "concluir") {
      await d.concluirOrdem(u, id, str(fd, "observacao"));
      ok = "OS concluída. Os pedidos foram encerrados e os cidadãos já podem avaliar.";
    } else return { erro: "Ação desconhecida." };
  } catch (e) {
    return trata(e);
  }
  revalidaGestao(undefined, id);
  return { ok };
}

// ---------------------------------------------------------------- catálogo e equipes

export async function salvarServicoAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const u = await requireUser();
    await d.salvarServico(u, {
      id: str(fd, "id") || undefined,
      nome: str(fd, "nome"),
      descricao: str(fd, "descricao"),
      categoria: str(fd, "categoria"),
      setorId: str(fd, "setorId"),
      slaDiasUteis: Number(str(fd, "sla")),
      exigeFoto: fd.get("exigeFoto") === "on",
      ativo: fd.get("ativo") === "on",
    });
  } catch (e) {
    return trata(e);
  }
  revalidaGestao();
  return { ok: str(fd, "id") ? "Serviço atualizado." : "Serviço incluído no catálogo." };
}

export async function criarEquipeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const u = await requireUser();
    await d.criarEquipe(u, { nome: str(fd, "nome"), setorId: str(fd, "setorId"), membros: str(fd, "membros") });
  } catch (e) {
    return trata(e);
  }
  revalidaGestao();
  return { ok: "Equipe cadastrada." };
}

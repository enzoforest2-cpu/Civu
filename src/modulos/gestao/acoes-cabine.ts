"use server";
// Ações do bloco "Depende de você" da cabine da secretaria: assinar como secretário(a) e aprovar, sempre pelo motor
// (assinarDocumento, receber, avancar), com a senha onde a assinatura exige reautenticação.
// Autorização no servidor: a pessoa precisa ser secretário(a), da pasta do processo, e o motor confere o papel na etapa.
// O administrador não age em processo (o motor recusa assinar e avançar só por ser ADMIN).
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { confirmarSenha, requireUser, temPapel, type SessaoUsuario } from "@/lib/auth";
import { ErroFluxo, assinarDocumento, avancar, carregarProcesso, podeAgir, receber, type ProcessoCompleto } from "@/lib/engine";
import type { ActionState } from "@/app/actions";
import { cabineDoUsuario } from "./cabine";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

function trata(e: unknown): ActionState {
  if (e instanceof ErroFluxo) return { erro: e.message };
  if (e instanceof Error && e.message === "NAO_AUTENTICADO") redirect("/login");
  console.error(e);
  return { erro: "Erro inesperado. Tente novamente." };
}

/** Documentos da etapa atual que pedem a assinatura de secretário e ainda não a têm. */
function documentosParaAssinar(p: ProcessoCompleto) {
  const out: { id: string; tipo: string }[] = [];
  if (p.estado.papeis.includes("REQUISITANTE")) return out; // etapa do requisitante: quem assina é quem pediu
  for (const g of p.estado.gates) {
    if (g.tipo !== "documento") continue;
    const pede = (g.assinadoPor ?? []).includes("SECRETARIO") || (g.assinadoPorQualquer ?? []).includes("SECRETARIO");
    if (!pede) continue;
    const ultimo = p.documentos.filter((d) => d.tipo === g.documentoTipo).at(-1);
    if (!ultimo) continue;
    const assinou = (papel: string) => ultimo.assinaturas.some((a) => a.papel === papel);
    const ok = (g.assinadoPorQualquer?.length ? g.assinadoPorQualquer.some(assinou) : true) && (g.assinadoPor ?? []).every(assinou);
    if (!ok) out.push({ id: ultimo.id, tipo: ultimo.tipo });
  }
  return out;
}

/** O processo é da pasta da pessoa (aberto por um setor da cabine dela) e ela é secretário(a)? */
async function processoDaMinhaPasta(u: SessaoUsuario, processoId: string) {
  if (!temPapel(u, "SECRETARIO")) throw new ErroFluxo("Só o(a) secretário(a) da pasta assina e aprova por aqui.");
  const cab = await cabineDoUsuario(u);
  const p = await carregarProcesso(u.municipioId, processoId);
  if (!p) throw new ErroFluxo("Processo não encontrado.");
  if (!cab || !p.abertoPor.setorId || !cab.ids.includes(p.abertoPor.setorId)) throw new ErroFluxo("Este processo não é da sua pasta.");
  if (p.encerradoEm) throw new ErroFluxo("Processo já encerrado.");
  return p;
}

/** Assina como secretário(a) um documento da etapa atual de um processo da pasta. */
export async function assinarNaCabineAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const u = await requireUser();
    const p = await processoDaMinhaPasta(u, str(fd, "processoId"));
    const doc = documentosParaAssinar(p).find((d) => d.id === str(fd, "documentoId"));
    if (!doc) throw new ErroFluxo("Este documento não espera mais a sua assinatura. Recarregue a página.");
    if (!(await confirmarSenha(u.id, str(fd, "senha")))) return { erro: "Senha incorreta. A assinatura exige reautenticação." };
    await assinarDocumento(u, doc.id, "SECRETARIO");
  } catch (e) {
    return trata(e);
  }
  revalidatePath("/secretaria", "layout");
  return { ok: "Documento assinado." };
}

/** Aprova um processo na etapa do(a) secretário(a): assina o que falta (com a senha), recebe se preciso e avança pelo motor. */
export async function aprovarNaCabineAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const u = await requireUser();
    const p = await processoDaMinhaPasta(u, str(fd, "processoId"));
    if (!podeAgir(u, p)) throw new ErroFluxo("Você não tem papel para agir nesta etapa.");
    const av = p.estado.avancos.find((a) => a.para === str(fd, "para"));
    if (!av) throw new ErroFluxo("Este processo já saiu da etapa de aprovação. Recarregue a página.");
    const docs = documentosParaAssinar(p);
    if (docs.length) {
      if (!(await confirmarSenha(u.id, str(fd, "senha")))) return { erro: "Senha incorreta. A assinatura exige reautenticação." };
      for (const d of docs) await assinarDocumento(u, d.id, "SECRETARIO");
    }
    if (!p.recebidoEm) await receber(u, p.id);
    await avancar(u, p.id, av.para, "Aprovado pelo(a) secretário(a) na cabine da secretaria.");
  } catch (e) {
    return trata(e);
  }
  revalidatePath("/secretaria", "layout");
  return { ok: "Aprovado e enviado à próxima etapa." };
}

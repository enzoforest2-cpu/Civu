"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { ErroFluxo } from "@/lib/engine";
import { ErroAcesso, requirePortal } from "@/lib/portal";
import type { ActionState } from "@/app/actions";
import {
  ErroContrato,
  alterarSituacaoObra,
  atestarNota,
  criarContrato,
  encerrarContrato,
  enviarNotaPortal,
  enviarParaLiquidacao,
  glosarNota,
  lerValor,
  registrarAditivo,
  registrarApostilamento,
  registrarDiario,
  registrarMedicao,
  registrarNotaInterna,
  type EtapaEntrada,
} from "./operacoes";
import { lerPrevisto } from "./regras";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

function trata(e: unknown): ActionState {
  if (e instanceof ErroContrato || e instanceof ErroFluxo || e instanceof ErroAcesso) return { erro: e.message };
  console.error(e);
  return { erro: "Não foi possível concluir. Tente novamente." };
}

const revalida = (id?: string) => {
  revalidatePath("/contratos");
  if (id) revalidatePath(`/contratos/${id}`);
  revalidatePath("/obras");
  revalidatePath("/portal/contratos", "layout");
};

export async function criarContratoAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id: string;
  try {
    const u = await requireUser();
    const etapas: EtapaEntrada[] = [];
    for (let i = 0; i < 12; i++) {
      const nome = str(fd, `etapa.${i}.nome`);
      if (!nome) continue;
      etapas.push({ nome, valor: lerValor(str(fd, `etapa.${i}.valor`)), previsto: lerPrevisto(str(fd, `etapa.${i}.previsto`)) });
    }
    const assinadoEm = str(fd, "assinadoEm");
    const c = await criarContrato(u, {
      numero: Number(str(fd, "numero")) || undefined,
      ano: Number(str(fd, "ano")) || Number(assinadoEm.slice(0, 4)) || new Date().getFullYear(),
      objeto: str(fd, "objeto"),
      natureza: str(fd, "natureza"),
      modalidade: str(fd, "modalidade"),
      empresaId: str(fd, "empresaId"),
      processoOrigemId: str(fd, "processoOrigemId") || null,
      setorId: str(fd, "setorId") || null,
      unidadeGestoraId: str(fd, "unidadeGestoraId") || null,
      valorGlobal: lerValor(str(fd, "valorGlobal")),
      fonte: str(fd, "fonte"),
      assinadoEm,
      vigenciaInicio: str(fd, "vigenciaInicio"),
      vigenciaFim: str(fd, "vigenciaFim"),
      fiscalId: str(fd, "fiscalId"),
      gestorId: str(fd, "gestorId"),
      obraLocal: str(fd, "obraLocal") || null,
      obraInicio: str(fd, "obraInicio") || null,
      obraPrevisaoFim: str(fd, "obraPrevisaoFim") || null,
      etapas,
    });
    id = c.id;
  } catch (e) {
    return trata(e);
  }
  revalida();
  redirect(`/contratos/${id}`);
}

export async function aditivoAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, "contratoId");
  try {
    const u = await requireUser();
    const r = await registrarAditivo(u, id, {
      tipo: str(fd, "tipo"),
      valor: lerValor(str(fd, "valor")),
      novaVigenciaFim: str(fd, "novaVigenciaFim") || null,
      justificativa: str(fd, "justificativa"),
      assinadoEm: str(fd, "assinadoEm"),
    });
    revalida(id);
    return {
      ok: r.acima
        ? `Aditivo ${r.numero} registrado. Atenção: os acréscimos somam ${r.pct.toFixed(1).replace(".", ",")}% do valor inicial, acima do limite de ${r.limite}% (art. 125).`
        : `Aditivo ${r.numero} registrado.`,
    };
  } catch (e) {
    return trata(e);
  }
}

export async function apostilamentoAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, "contratoId");
  try {
    const u = await requireUser();
    const r = await registrarApostilamento(u, id, {
      tipo: str(fd, "tipo"),
      indice: str(fd, "indice"),
      percentual: lerValor(str(fd, "percentual")),
      valor: lerValor(str(fd, "valor")),
      descricao: str(fd, "descricao"),
      data: str(fd, "data"),
    });
    revalida(id);
    return { ok: `Apostilamento ${r.numero} registrado.` };
  } catch (e) {
    return trata(e);
  }
}

export async function encerrarAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, "contratoId");
  try {
    const u = await requireUser();
    const tipo = str(fd, "tipo") === "RESCINDIDO" ? "RESCINDIDO" : "ENCERRADO";
    await encerrarContrato(u, id, tipo, str(fd, "motivo"), str(fd, "data"));
    revalida(id);
    return { ok: tipo === "RESCINDIDO" ? "Rescisão registrada." : "Contrato encerrado." };
  } catch (e) {
    return trata(e);
  }
}

export async function notaInternaAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, "contratoId");
  try {
    const u = await requireUser();
    const n = await registrarNotaInterna(u, id, {
      numero: str(fd, "numero"),
      valor: lerValor(str(fd, "valor")),
      competencia: str(fd, "competencia"),
      emitidaEm: str(fd, "emitidaEm"),
      descricao: str(fd, "descricao"),
      medicaoId: str(fd, "medicaoId") || null,
    });
    revalida(id);
    return { ok: `Nota ${n.numero} registrada. Aguarda atesto do fiscal.` };
  } catch (e) {
    return trata(e);
  }
}

export async function atestarAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const u = await requireUser();
    await atestarNota(u, str(fd, "notaId"));
    if (str(fd, "enviar") === "1") await enviarParaLiquidacao(u, str(fd, "notaId"));
  } catch (e) {
    return trata(e);
  }
  revalida(str(fd, "contratoId"));
  revalidatePath("/contratos/atestos");
  return { ok: str(fd, "enviar") === "1" ? "Nota atestada e enviada à liquidação." : "Nota atestada." };
}

export async function glosarAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const u = await requireUser();
    await glosarNota(u, str(fd, "notaId"), str(fd, "motivo"));
  } catch (e) {
    return trata(e);
  }
  revalida(str(fd, "contratoId"));
  revalidatePath("/contratos/atestos");
  return { ok: "Nota glosada. O fornecedor vê o motivo no portal e pode enviar a nota corrigida." };
}

export async function liquidacaoAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let numero: string;
  try {
    const u = await requireUser();
    const p = await enviarParaLiquidacao(u, str(fd, "notaId"));
    numero = p.numero;
  } catch (e) {
    return trata(e);
  }
  revalida(str(fd, "contratoId"));
  revalidatePath("/processos");
  return { ok: `Processo de pagamento ${numero} aberto e enviado à contabilidade para liquidação.` };
}

export async function medicaoAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, "contratoId");
  try {
    const u = await requireUser();
    const executado: Record<string, number> = {};
    for (const [k, v] of fd.entries()) if (k.startsWith("etapa.") && String(v).trim()) executado[k.slice(6)] = lerValor(String(v));
    const m = await registrarMedicao(u, id, str(fd, "competencia"), executado, str(fd, "observacao"));
    revalida(id);
    return { ok: `Medição ${m.numero} registrada. O fornecedor já pode enviar a nota dessa medição.` };
  } catch (e) {
    return trata(e);
  }
}

export async function diarioAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, "contratoId");
  try {
    const u = await requireUser();
    const ef = str(fd, "efetivo");
    await registrarDiario(u, id, { data: str(fd, "data"), clima: str(fd, "clima"), efetivo: ef ? Number(ef) : null, texto: str(fd, "texto") });
    revalida(id);
    return { ok: "Registro incluído no diário." };
  } catch (e) {
    return trata(e);
  }
}

export async function situacaoObraAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, "contratoId");
  try {
    const u = await requireUser();
    await alterarSituacaoObra(u, id, str(fd, "situacao"), str(fd, "motivo"));
    revalida(id);
    return { ok: "Situação da obra atualizada." };
  } catch (e) {
    return trata(e);
  }
}

// ---- Portal do fornecedor ----
export async function enviarNotaPortalAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const s = await requirePortal();
    const n = await enviarNotaPortal(s, str(fd, "contratoId"), {
      numero: str(fd, "numero"),
      valor: lerValor(str(fd, "valor")),
      competencia: str(fd, "competencia"),
      emitidaEm: str(fd, "emitidaEm"),
      descricao: str(fd, "descricao"),
      medicaoId: str(fd, "medicaoId") || null,
    });
    revalidatePath("/portal/contratos", "layout");
    revalidatePath("/contratos");
    return { ok: `Nota ${n.numero} recebida. Ela já aparece para o fiscal do contrato, que tem 5 dias úteis para atestar.` };
  } catch (e) {
    return trata(e);
  }
}

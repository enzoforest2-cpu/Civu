"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import {
  ErroFluxo,
  decidirRecurso,
  definirModalidade,
  feriadosDo,
  publicarAvisoDispensa,
  publicarEdital,
  registrarImpugnacao,
  registrarPesquisaPrecos,
  registrarRecurso,
  registrarResultadoSessao,
  registrarRetornoBancario,
  responderImpugnacao,
} from "@/lib/engine";
import { PRAZO_MINIMO_EDITAL, aberturaMinima, type ResultadoSessao, type TipoObjetoEdital } from "@/lib/regras-fluxo";
import type { ActionState } from "@/app/actions";

/** Estado do formulário do edital: além de erro/ok, a abertura mínima calculada no servidor com os feriados do município. */
export type EditalState = (ActionState & { abertura?: string; valores?: Record<string, string> }) | null;

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/** Valor digitado no padrão brasileiro (1.234,56) ou com ponto decimal (1234.56). */
function numero(v: string): number {
  const s = v.replace(/[R$\s]/g, "");
  if (!s) return NaN;
  return Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
}

function trata(e: unknown): { erro: string } {
  if (e instanceof ErroFluxo) return { erro: e.message };
  console.error(e);
  return { erro: "Erro inesperado. Tente novamente." };
}

/** Roda a ação do motor com o usuário da sessão (o motor confere papel e etapa) e atualiza a página do processo. */
async function executar(fd: FormData, ok: string, fn: (u: Awaited<ReturnType<typeof requireUser>>, processoId: string) => Promise<unknown>): Promise<ActionState> {
  const u = await requireUser();
  const processoId = str(fd, "processoId");
  try {
    await fn(u, processoId);
  } catch (e) {
    return trata(e);
  }
  revalidatePath(`/processos/${processoId}`);
  return { ok };
}

export async function definirModalidadeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return executar(fd, "Modalidade definida.", (u, id) => definirModalidade(u, id, str(fd, "modalidade"), str(fd, "justificativa")));
}

export async function pesquisaPrecosAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const nomes = fd.getAll("fonte").map(String);
  const datas = fd.getAll("data").map(String);
  const valores = fd.getAll("valor").map(String);
  const fontes = nomes
    .map((fonte, i) => ({ fonte: fonte.trim(), data: (datas[i] ?? "").trim(), valorTxt: (valores[i] ?? "").trim() }))
    .filter((f) => f.fonte || f.data || f.valorTxt)
    .map((f) => ({ fonte: f.fonte, data: f.data, valor: numero(f.valorTxt) }));
  return executar(fd, "Pesquisa de preços salva.", (u, id) => registrarPesquisaPrecos(u, id, { fontes, justificativa: str(fd, "justificativa") }));
}

export async function publicarEditalAction(_: EditalState, fd: FormData): Promise<EditalState> {
  const u = await requireUser();
  const tipoObjeto = str(fd, "tipoObjeto") as TipoObjetoEdital;
  const publicadoEm = str(fd, "publicadoEm");
  let abertura: string | undefined;
  if (tipoObjeto in PRAZO_MINIMO_EDITAL && /^\d{4}-\d{2}-\d{2}$/.test(publicadoEm)) {
    const [a, m, d] = aberturaMinima(publicadoEm, tipoObjeto, await feriadosDo(u.municipioId)).split("-");
    abertura = `Abertura a partir de ${d}/${m}/${a}: ${PRAZO_MINIMO_EDITAL[tipoObjeto]} dias úteis (art. 55)`;
  }
  const r = await executar(fd, "Edital publicado.", (u2, id) =>
    publicarEdital(u2, id, { numero: str(fd, "numero"), tipoObjeto, publicadoEm, aberturaEm: str(fd, "aberturaEm"), plataforma: str(fd, "plataforma") }),
  );
  const valores = Object.fromEntries(["numero", "tipoObjeto", "publicadoEm", "aberturaEm", "plataforma"].map((k) => [k, str(fd, k)]));
  return { ...r, abertura, valores };
}

export async function registrarImpugnacaoAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return executar(fd, "Impugnação registrada.", (u, id) => registrarImpugnacao(u, id, { autor: str(fd, "autor"), texto: str(fd, "texto"), recebidaEm: str(fd, "recebidaEm") }));
}

export async function responderImpugnacaoAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return executar(fd, "Resposta registrada.", (u, id) =>
    responderImpugnacao(u, id, str(fd, "impugnacaoId"), { resposta: str(fd, "resposta"), acolhida: fd.get("acolhida") === "on", alteraPropostas: fd.get("alteraPropostas") === "on" }),
  );
}

export async function resultadoSessaoAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const situacao = str(fd, "situacao") as ResultadoSessao["situacao"];
  return executar(fd, "Resultado da sessão registrado.", (u, id) =>
    registrarResultadoSessao(u, id, { situacao, fornecedor: str(fd, "fornecedor"), cnpj: str(fd, "cnpj"), valor: numero(str(fd, "valor")), ataEm: str(fd, "ataEm") }),
  );
}

export async function registrarRecursoAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return executar(fd, "Intenção de recurso registrada.", (u, id) => registrarRecurso(u, id, { recorrente: str(fd, "recorrente"), intencaoEm: str(fd, "intencaoEm") }));
}

export async function decidirRecursoAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return executar(fd, "Decisão registrada.", (u, id) => decidirRecurso(u, id, str(fd, "recursoId"), { decisao: str(fd, "decisao"), provido: fd.get("provido") === "on" }));
}

export async function avisoDispensaAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return executar(fd, "Aviso de dispensa registrado.", (u, id) => publicarAvisoDispensa(u, id, { publicadoEm: str(fd, "publicadoEm"), justificativaSemAviso: str(fd, "justificativaSemAviso") }));
}

export async function retornoBancarioAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const aceito = str(fd, "resultado") === "ACEITO";
  return executar(fd, aceito ? "Pagamento confirmado pelo banco." : "Recusa do banco registrada; o pagamento voltou à fila.", (u, id) =>
    registrarRetornoBancario(u, id, { aceito, autenticacao: str(fd, "autenticacao"), motivo: str(fd, "motivo") }),
  );
}

"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import {
  ErroFluxo,
  carregarProcesso,
  corrigirFonteValor,
  podeAgir,
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
import { PRAZO_MINIMO_EDITAL, aberturaMinima, tipoObjetoValido, type ResultadoSessao, type TipoObjetoEdital } from "@/lib/regras-fluxo";
import { numeroBr } from "@/lib/numeros";
import type { ActionState } from "@/app/actions";

/**
 * Estado dos formulários que precisam manter o que foi digitado quando há erro (o React limpa o formulário depois da action):
 * `valores` volta com os campos enviados. No edital, `abertura` traz a abertura mínima calculada com os feriados do município.
 */
export type FormState = (ActionState & { abertura?: string; valores?: Record<string, string> }) | null;
export type EditalState = FormState;

const valoresDe = (fd: FormData, campos: string[]) => Object.fromEntries(campos.map((k) => [k, str(fd, k)]));

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ERRO_PROCESSO = "Processo não encontrado.";

function trata(e: unknown): { erro: string } {
  if (e instanceof ErroFluxo) return { erro: e.message };
  console.error(e);
  return { erro: "Erro inesperado. Tente novamente." };
}

/** Roda a ação do motor com o usuário da sessão (o motor confere papel e etapa) e atualiza a página do processo. */
async function executar(fd: FormData, ok: string, fn: (u: Awaited<ReturnType<typeof requireUser>>, processoId: string) => Promise<unknown>): Promise<ActionState> {
  const u = await requireUser();
  const processoId = str(fd, "processoId");
  if (!UUID.test(processoId)) return { erro: ERRO_PROCESSO };
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
    .map((f) => ({ fonte: f.fonte, data: f.data, valor: numeroBr(f.valorTxt) }));
  return executar(fd, "Pesquisa de preços salva.", (u, id) => registrarPesquisaPrecos(u, id, { fontes, justificativa: str(fd, "justificativa") }));
}

export async function publicarEditalAction(_: EditalState, fd: FormData): Promise<EditalState> {
  const u = await requireUser();
  const tipoObjeto = str(fd, "tipoObjeto") as TipoObjetoEdital;
  const publicadoEm = str(fd, "publicadoEm");
  const valores = valoresDe(fd, ["numero", "tipoObjeto", "publicadoEm", "aberturaEm", "plataforma"]);
  // Só quem pode agir na etapa recebe o cálculo; os demais recebem a recusa do motor
  const processoId = str(fd, "processoId");
  if (!UUID.test(processoId)) return { erro: ERRO_PROCESSO, valores };
  const p = await carregarProcesso(u.municipioId, processoId);
  if (!p || !podeAgir(u, p)) return { erro: "Você não tem papel para agir nesta etapa.", valores };
  let abertura: string | undefined;
  if (tipoObjetoValido(tipoObjeto) && /^\d{4}-\d{2}-\d{2}$/.test(publicadoEm)) {
    const [a, m, d] = aberturaMinima(publicadoEm, tipoObjeto, await feriadosDo(u.municipioId)).split("-");
    abertura = `Abertura a partir de ${d}/${m}/${a}: ${PRAZO_MINIMO_EDITAL[tipoObjeto]} dias úteis (art. 55)`;
  }
  const r = await executar(fd, "Edital publicado.", (u2, id) =>
    publicarEdital(u2, id, { numero: str(fd, "numero"), tipoObjeto, publicadoEm, aberturaEm: str(fd, "aberturaEm"), plataforma: str(fd, "plataforma") }),
  );
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

export async function resultadoSessaoAction(_: FormState, fd: FormData): Promise<FormState> {
  const situacao = str(fd, "situacao") as ResultadoSessao["situacao"];
  const r = await executar(fd, "Resultado da sessão registrado.", (u, id) =>
    registrarResultadoSessao(u, id, { situacao, fornecedor: str(fd, "fornecedor"), cnpj: str(fd, "cnpj"), valor: numeroBr(str(fd, "valor")), ataEm: str(fd, "ataEm") }),
  );
  // Com sucesso o formulário volta vazio para um novo registro; com erro, mantém o que foi digitado
  return r?.erro ? { ...r, valores: valoresDe(fd, ["situacao", "fornecedor", "cnpj", "valor", "ataEm"]) } : r;
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

export async function corrigirFonteValorAction(_: FormState, fd: FormData): Promise<FormState> {
  const r = await executar(fd, "Correção registrada.", (u, id) => corrigirFonteValor(u, id, { fonte: str(fd, "fonte"), valor: str(fd, "valor"), motivo: str(fd, "motivo") }));
  // Com erro, o formulário volta com o que foi digitado; com sucesso, mostra os dados novos (vindos da página)
  return r?.erro ? { ...r, valores: valoresDe(fd, ["fonte", "valor", "motivo"]) } : r;
}

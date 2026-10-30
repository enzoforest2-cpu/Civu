"use server";
// Server actions do módulo Gestão. Toda permissão é conferida aqui, no servidor.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { gestaoAlertas, gestaoRegras, setores, usuarios } from "@/db/schema";
import { requireUser, type SessaoUsuario } from "@/lib/auth";
import { ErroFluxo, juntarDocumento } from "@/lib/engine";
import { PAPEIS, type Papel } from "@/lib/workflow";
import type { ActionState } from "@/app/actions";
import { pode } from "./permissoes";
import { decidirEmLote, type ResultadoLote } from "./gabinete";
import { executarRegra } from "./automacoes";
import { registrarAuditoria, verificarIntegridade } from "./auditoria";
import { configurarConector, testarConector, type StatusIntegracao } from "./integracoes";
import { MODELOS } from "./modelos";
import { CPF_ATENDIMENTO_DIGITAL } from "@/lib/engine";
import type { Gatilho, Gravidade, Nivel, TipoAcao } from "./avaliador";

function trata(e: unknown): ActionState {
  if (e instanceof ErroFluxo) return { erro: e.message };
  if (e instanceof Error && e.message === "NAO_AUTENTICADO") redirect("/login");
  console.error(e);
  return { erro: "Erro inesperado. Tente novamente." };
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

function exigir(ok: boolean, msg = "Você não tem permissão para esta ação.") {
  if (!ok) throw new ErroFluxo(msg);
}

// ---------------------------------------------------------------------------
// Gabinete
// ---------------------------------------------------------------------------
export async function decidirLoteAction(input: { ids: string[]; modo: "AVANCAR" | "DESPACHAR"; texto: string; senha: string }): Promise<{ erro?: string; resultados?: ResultadoLote }> {
  try {
    const u = await requireUser();
    exigir(pode.decidirEmLote(u), "Só o ordenador de despesa decide em lote.");
    if (input.modo !== "AVANCAR" && input.modo !== "DESPACHAR") throw new ErroFluxo("Ação inválida.");
    const resultados = await decidirEmLote(u, { ids: input.ids.slice(0, 30).map(String), modo: input.modo, texto: String(input.texto ?? ""), senha: String(input.senha ?? "") });
    revalidatePath("/gabinete");
    revalidatePath("/painel");
    return { resultados };
  } catch (e) {
    return { erro: trata(e)?.erro };
  }
}

// ---------------------------------------------------------------------------
// Automações
// ---------------------------------------------------------------------------
export async function rodarRegraAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const u = await requireUser();
    exigir(pode.rodarAutomacoes(u));
    const ids = fd.getAll("regraId").map(String).filter(Boolean);
    let regras = ids;
    if (!regras.length) {
      const ativas = await db.query.gestaoRegras.findMany({ where: and(eq(gestaoRegras.municipioId, u.municipioId), eq(gestaoRegras.ativa, true)) });
      regras = ativas.map((r) => r.id);
    }
    if (!regras.length) return { erro: "Nenhuma regra ativa para rodar." };
    let disparos = 0;
    for (const id of regras) disparos += (await executarRegra(u, id)).disparos;
    revalidatePath("/automacoes");
    revalidatePath("/gabinete");
    return { ok: `${regras.length === 1 ? "Regra avaliada" : `${regras.length} regras avaliadas`}: ${disparos === 0 ? "nenhum disparo" : disparos === 1 ? "1 disparo" : `${disparos} disparos`}. Veja o resultado no histórico.` };
  } catch (e) {
    return trata(e);
  }
}

const SIGLA = /^[A-Z]{2,10}$/;

export async function criarRegraAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const u = await requireUser();
    exigir(pode.configurarAutomacoes(u), "Só o administrador cria regras de automação.");
    const nome = str(fd, "nome");
    const gatilho = str(fd, "gatilho") as Gatilho;
    const acao = str(fd, "acao") as TipoAcao;
    const nivel = (str(fd, "nivel") || "INFORMAR") as Nivel;
    if (nome.length < 4) throw new ErroFluxo("Dê um nome à regra (ao menos 4 caracteres).");
    let parametros: object;
    if (gatilho === "PROCESSO_PARADO") {
      const dias = Number(str(fd, "dias"));
      if (!Number.isInteger(dias) || dias < 1 || dias > 365) throw new ErroFluxo("Informe o número de dias (1 a 365).");
      const setorSigla = str(fd, "setorSigla") || null;
      if (setorSigla && !SIGLA.test(setorSigla)) throw new ErroFluxo("Setor inválido.");
      parametros = { dias, setorSigla };
    } else if (gatilho === "PALAVRA_CHAVE") {
      const palavras = str(fd, "palavras")
        .split(/[,;\n]/)
        .map((w) => w.trim())
        .filter((w) => w.length >= 3)
        .slice(0, 20);
      if (!palavras.length) throw new ErroFluxo("Informe ao menos uma palavra-chave (3 letras ou mais), separadas por vírgula.");
      parametros = { palavras, somenteNovos: fd.get("somenteNovos") === "on" };
    } else if (gatilho === "EXIGENCIA_SEM_RESPOSTA") {
      const diasTolerancia = Number(str(fd, "diasTolerancia") || "0");
      if (!Number.isInteger(diasTolerancia) || diasTolerancia < 0 || diasTolerancia > 60) throw new ErroFluxo("Tolerância deve ficar entre 0 e 60 dias.");
      parametros = { diasTolerancia };
    } else throw new ErroFluxo("Escolha o gatilho da regra.");

    let acaoParametros: object;
    let nivelFinal: Nivel = nivel;
    if (acao === "ALERTA") {
      const gravidade = str(fd, "gravidade") as Gravidade;
      if (!["ALTA", "MEDIA", "BAIXA"].includes(gravidade)) throw new ErroFluxo("Escolha a gravidade do alerta.");
      acaoParametros = { gravidade };
      nivelFinal = "INFORMAR";
    } else if (acao === "ENCAMINHAR") {
      const setorSigla = str(fd, "destino");
      const destino = await db.query.setores.findFirst({ where: and(eq(setores.municipioId, u.municipioId), eq(setores.sigla, setorSigla)) });
      if (!destino) throw new ErroFluxo("Escolha o setor de destino.");
      if (!["SUGERIR", "EXECUTAR"].includes(nivel)) throw new ErroFluxo("Escolha se a regra sugere ou executa o encaminhamento.");
      acaoParametros = { setorSigla, despacho: str(fd, "despacho") || undefined };
    } else throw new ErroFluxo("Escolha o que a regra faz.");

    const [r] = await db
      .insert(gestaoRegras)
      .values({ municipioId: u.municipioId, nome, descricao: str(fd, "descricao") || null, gatilho, parametros, acao, acaoParametros, nivel: nivelFinal, criadoPorId: u.id })
      .returning();
    await registrarAuditoria({
      municipioId: u.municipioId,
      autorId: u.id,
      acao: "REGRA_CRIADA",
      objetoTipo: "REGRA",
      objetoId: r.id,
      objetoRotulo: r.nome,
      depois: { gatilho, parametros, acao, acaoParametros, nivel: nivelFinal },
    });
    revalidatePath("/automacoes");
    return { ok: `Regra "${nome}" criada e ativa.` };
  } catch (e) {
    return trata(e);
  }
}

export async function alternarRegraAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const u = await requireUser();
    exigir(pode.configurarAutomacoes(u), "Só o administrador ativa ou suspende regras.");
    const r = await db.query.gestaoRegras.findFirst({ where: and(eq(gestaoRegras.id, str(fd, "regraId")), eq(gestaoRegras.municipioId, u.municipioId)) });
    if (!r) throw new ErroFluxo("Regra não encontrada.");
    const ativa = !r.ativa;
    await db.update(gestaoRegras).set({ ativa, versao: r.versao + 1, atualizadoEm: new Date() }).where(eq(gestaoRegras.id, r.id));
    await registrarAuditoria({
      municipioId: u.municipioId,
      autorId: u.id,
      acao: ativa ? "REGRA_ATIVADA" : "REGRA_SUSPENSA",
      objetoTipo: "REGRA",
      objetoId: r.id,
      objetoRotulo: r.nome,
      antes: { ativa: r.ativa, versão: r.versao },
      depois: { ativa, versão: r.versao + 1 },
      justificativa: str(fd, "justificativa") || null,
    });
    revalidatePath("/automacoes");
    return { ok: ativa ? "Regra ativada." : "Regra suspensa." };
  } catch (e) {
    return trata(e);
  }
}

export async function tratarAlertaAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const u = await requireUser();
    exigir(pode.tratarAlertas(u));
    const situacao = str(fd, "situacao");
    if (situacao !== "RESOLVIDO" && situacao !== "DESCARTADO") throw new ErroFluxo("Situação inválida.");
    const a = await db.query.gestaoAlertas.findFirst({ where: and(eq(gestaoAlertas.id, str(fd, "alertaId")), eq(gestaoAlertas.municipioId, u.municipioId)) });
    if (!a) throw new ErroFluxo("Alerta não encontrado.");
    if (a.situacao !== "ABERTO") throw new ErroFluxo("Este alerta já foi tratado.");
    await db.update(gestaoAlertas).set({ situacao, encerradoEm: new Date(), encerradoPorId: u.id }).where(eq(gestaoAlertas.id, a.id));
    await registrarAuditoria({
      municipioId: u.municipioId,
      autorId: u.id,
      acao: situacao === "RESOLVIDO" ? "ALERTA_RESOLVIDO" : "ALERTA_DESCARTADO",
      objetoTipo: "ALERTA",
      objetoId: a.id,
      objetoRotulo: a.titulo,
      justificativa: str(fd, "justificativa") || null,
    });
    revalidatePath("/automacoes");
    revalidatePath("/gabinete");
    return { ok: situacao === "RESOLVIDO" ? "Alerta marcado como resolvido." : "Alerta descartado." };
  } catch (e) {
    return trata(e);
  }
}

export async function juntarRedacaoAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const u = await requireUser();
    const modelo = MODELOS.find((m) => m.chave === str(fd, "modelo"));
    if (!modelo) throw new ErroFluxo("Escolha um modelo.");
    const processoId = str(fd, "processoId");
    if (!processoId) throw new ErroFluxo("Escolha o processo ao qual o texto será juntado.");
    const texto = String(fd.get("texto") ?? "");
    if (texto.includes("[a preencher")) throw new ErroFluxo("Ainda há campos [a preencher] no texto. Complete antes de juntar.");
    await juntarDocumento(u, processoId, modelo.documentoTipo, `${modelo.titulo}`, texto);
    revalidatePath(`/processos/${processoId}`);
    return { ok: "Texto juntado ao processo como documento. Ele pode ser assinado na página do processo." };
  } catch (e) {
    return trata(e);
  }
}

// ---------------------------------------------------------------------------
// Integrações
// ---------------------------------------------------------------------------
export async function testarIntegracaoAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const u = await requireUser();
    exigir(pode.configurarIntegracoes(u), "Só o administrador testa integrações.");
    const r = await testarConector(u, str(fd, "chave"));
    const falhas = r.filter((x) => x.status !== "SUCESSO").length;
    revalidatePath("/integracoes");
    return { ok: `Teste simulado concluído: ${r.length} ${r.length === 1 ? "operação" : "operações"}, ${falhas === 0 ? "sem falhas" : `${falhas} com falha ou rejeição`}.` };
  } catch (e) {
    return trata(e);
  }
}

export async function configurarIntegracaoAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const u = await requireUser();
    exigir(pode.configurarIntegracoes(u), "Só o administrador configura integrações.");
    const status = str(fd, "status") as StatusIntegracao;
    if (!["ATIVA", "SIMULADA", "NAO_CONFIGURADA"].includes(status)) throw new ErroFluxo("Situação inválida.");
    await configurarConector(u, str(fd, "chave"), status);
    revalidatePath("/integracoes");
    return { ok: status === "SIMULADA" ? "Integração ligada em modo simulado." : "Integração desligada." };
  } catch (e) {
    return trata(e);
  }
}

// ---------------------------------------------------------------------------
// Governança
// ---------------------------------------------------------------------------
async function usuarioAlvo(u: SessaoUsuario, id: string) {
  const alvo = await db.query.usuarios.findFirst({ where: and(eq(usuarios.id, id), eq(usuarios.municipioId, u.municipioId)), with: { setor: true } });
  if (!alvo) throw new ErroFluxo("Usuário não encontrado.");
  if (alvo.id === u.id) throw new ErroFluxo("Ninguém altera o próprio acesso. Peça a outro administrador.");
  if (alvo.cpf === CPF_ATENDIMENTO_DIGITAL) throw new ErroFluxo("O usuário de sistema do atendimento digital não pode ser alterado aqui.");
  return alvo;
}

export async function alternarUsuarioAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const u = await requireUser();
    exigir(pode.administrarUsuarios(u), "Só o administrador ativa ou desativa usuários.");
    const alvo = await usuarioAlvo(u, str(fd, "usuarioId"));
    const ativo = !alvo.ativo;
    await db.update(usuarios).set({ ativo }).where(eq(usuarios.id, alvo.id));
    await registrarAuditoria({
      municipioId: u.municipioId,
      autorId: u.id,
      acao: ativo ? "USUARIO_ATIVADO" : "USUARIO_DESATIVADO",
      objetoTipo: "USUARIO",
      objetoId: alvo.id,
      objetoRotulo: alvo.nome,
      antes: { ativo: alvo.ativo },
      depois: { ativo },
      justificativa: str(fd, "justificativa") || null,
    });
    revalidatePath("/governanca");
    return { ok: ativo ? `${alvo.nome} foi reativado(a).` : `${alvo.nome} foi desativado(a). O histórico continua preservado.` };
  } catch (e) {
    return trata(e);
  }
}

export async function atualizarAcessoAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const u = await requireUser();
    exigir(pode.administrarUsuarios(u), "Só o administrador troca setor e papéis.");
    const alvo = await usuarioAlvo(u, str(fd, "usuarioId"));
    const setorId = str(fd, "setorId");
    const setor = await db.query.setores.findFirst({ where: and(eq(setores.id, setorId), eq(setores.municipioId, u.municipioId)) });
    if (!setor) throw new ErroFluxo("Escolha um setor válido.");
    const papeis = fd
      .getAll("papeis")
      .map(String)
      .filter((p): p is Papel => (PAPEIS as readonly string[]).includes(p));
    if (!papeis.length) throw new ErroFluxo("O usuário precisa de ao menos um papel.");
    const justificativa = str(fd, "justificativa");
    const mudouPapeis = [...papeis].sort().join() !== [...alvo.papeis].sort().join();
    const mudouSetor = setor.id !== alvo.setorId;
    if (!mudouPapeis && !mudouSetor) return { ok: "Nada mudou." };
    if (justificativa.length < 5) throw new ErroFluxo("Informe o motivo da alteração (ex.: portaria de nomeação).");
    await db.update(usuarios).set({ setorId: setor.id, papeis }).where(eq(usuarios.id, alvo.id));
    if (mudouSetor)
      await registrarAuditoria({
        municipioId: u.municipioId,
        autorId: u.id,
        acao: "USUARIO_SETOR",
        objetoTipo: "USUARIO",
        objetoId: alvo.id,
        objetoRotulo: alvo.nome,
        antes: { setor: alvo.setor?.nome ?? "—" },
        depois: { setor: setor.nome },
        justificativa,
      });
    if (mudouPapeis)
      await registrarAuditoria({
        municipioId: u.municipioId,
        autorId: u.id,
        acao: "USUARIO_PAPEIS",
        objetoTipo: "USUARIO",
        objetoId: alvo.id,
        objetoRotulo: alvo.nome,
        antes: { papéis: alvo.papeis },
        depois: { papéis: papeis },
        justificativa,
      });
    revalidatePath("/governanca");
    return { ok: `Acesso de ${alvo.nome} atualizado.` };
  } catch (e) {
    return trata(e);
  }
}

export async function verificarIntegridadeAction(): Promise<ActionState> {
  try {
    const u = await requireUser();
    exigir(pode.verificarIntegridade(u), "Só o controle interno ou o administrador verificam a integridade.");
    const r = await verificarIntegridade(u.municipioId);
    await registrarAuditoria({
      municipioId: u.municipioId,
      autorId: u.id,
      acao: "INTEGRIDADE_VERIFICADA",
      objetoTipo: "TRILHA",
      objetoRotulo: `${r.processos} processos, ${r.eventos} eventos`,
      depois: r,
    });
    revalidatePath("/governanca");
    return r.falhas.length
      ? { erro: `Atenção: ${r.falhas.length} ${r.falhas.length === 1 ? "processo com cadeia quebrada" : "processos com cadeia quebrada"} (${r.falhas.map((f) => `${f.numero}, evento ${f.seq}`).join("; ")}).` }
      : { ok: `Cadeia íntegra em ${r.processos} processos (${r.eventos} eventos conferidos).` };
  } catch (e) {
    return trata(e);
  }
}

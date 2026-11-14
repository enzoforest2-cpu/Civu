import "server-only";
// Gravações do módulo de repasses e obrigações da área, com a autorização decidida aqui (no servidor):
// cadastrar e editar só quem é da área da secretaria responsável ou do Gabinete (`podeEditarNaArea`). O papel ADMIN não
// dá edição (ver não é agir). O vínculo com processo passa pelo motor (`vincularRepasse`), que grava o evento no livro.
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { obrigacaoEntregas, obrigacoesArea, repasseHistorico, repasses, setores, usuarios } from "@/db/schema";
import type { SessaoUsuario } from "@/lib/auth";
import { AREA_NOME, ehArea } from "@/lib/areas";
import { fmtMoeda } from "@/lib/dates";
import { vincularRepasse } from "@/lib/engine";
import { numeroBr } from "@/lib/numeros";
import { PERIODICIDADES, areaTemPasta, SITUACOES_OBRIGACAO, SITUACOES_REPASSE, TIPOS_REPASSE, dataBr, ehDataIso, nomeTipoRepasse, podeEditarNaArea, vencimentoSeguinte } from "./regras";

export class ErroRepasse extends Error {}

type Setor = typeof setores.$inferSelect;

async function setorDoMunicipio(u: SessaoUsuario, setorId: string): Promise<Setor> {
  const s = setorId ? await db.query.setores.findFirst({ where: and(eq(setores.id, setorId), eq(setores.municipioId, u.municipioId)) }) : null;
  if (!s) throw new ErroRepasse("Escolha a secretaria responsável.");
  if (!ehArea(s.area)) throw new ErroRepasse("Esta secretaria ainda não tem área definida. Peça ao administrador para definir em Cadastros.");
  if (!areaTemPasta(s.area)) throw new ErroRepasse("Repasses e obrigações ficam com uma secretaria de pasta própria (Saúde, Educação, Fazenda...), não com este setor.");
  return s;
}

/** Só quem é da área da secretaria ou do Gabinete cadastra e edita. */
function exigirEdicao(u: SessaoUsuario, s: Setor) {
  if (!podeEditarNaArea(u, s.area))
    throw new ErroRepasse(
      `Só quem é da área de ${ehArea(s.area) ? AREA_NOME[s.area] : "da secretaria"} ou do Gabinete cadastra e altera repasses e obrigações desta secretaria.`,
    );
}

const texto = (v: string | null | undefined, rotulo: string, min = 3) => {
  const s = (v ?? "").trim();
  if (s.length < min) throw new ErroRepasse(`Preencha ${rotulo}.`);
  return s;
};
const opcional = (v: string | null | undefined) => (v ?? "").trim() || null;
const data = (v: string | null | undefined, rotulo: string) => {
  const s = (v ?? "").trim();
  if (!s) return null;
  if (!ehDataIso(s)) throw new ErroRepasse(`${rotulo}: informe uma data válida (dd/mm/aaaa).`);
  return s;
};
const valor = (v: string | number | null | undefined, rotulo: string, obrigatorio: boolean) => {
  const s = typeof v === "number" ? String(v) : (v ?? "").trim();
  if (!s) {
    if (obrigatorio) throw new ErroRepasse(`Informe ${rotulo} (ex.: 250.000,00).`);
    return 0;
  }
  const n = typeof v === "number" ? v : numeroBr(s);
  if (!Number.isFinite(n) || n < 0 || (obrigatorio && n === 0)) throw new ErroRepasse(`Informe ${rotulo} em reais (ex.: 250.000,00).`);
  return Math.round(n * 100) / 100;
};

// ---------------------------------------------------------------------------
// Repasses
// ---------------------------------------------------------------------------

export type EntradaRepasse = {
  setorId: string;
  tipo: string;
  identificacao?: string | null;
  concedente: string;
  objeto: string;
  valorPrevisto: string | number;
  valorRecebido?: string | number | null;
  assinadoEm?: string | null;
  vigenciaFim?: string | null;
  prazoExecucao?: string | null;
  prazoPrestacaoContas?: string | null;
  situacao: string;
  observacao?: string | null;
};

function validarRepasse(e: EntradaRepasse) {
  if (!Object.hasOwn(TIPOS_REPASSE, e.tipo)) throw new ErroRepasse("Escolha o tipo do repasse.");
  if (!Object.hasOwn(SITUACOES_REPASSE, e.situacao)) throw new ErroRepasse("Escolha a situação do repasse.");
  const v = {
    tipo: e.tipo,
    identificacao: opcional(e.identificacao),
    concedente: texto(e.concedente, "o concedente (quem repassa o recurso)"),
    objeto: texto(e.objeto, "o objeto (para que é o recurso)", 5),
    valorPrevisto: valor(e.valorPrevisto, "o valor previsto", true),
    valorRecebido: valor(e.valorRecebido, "o valor recebido", false),
    assinadoEm: data(e.assinadoEm, "Assinatura"),
    vigenciaFim: data(e.vigenciaFim, "Fim da vigência"),
    prazoExecucao: data(e.prazoExecucao, "Prazo de execução"),
    prazoPrestacaoContas: data(e.prazoPrestacaoContas, "Prazo da prestação de contas"),
    situacao: e.situacao,
    observacao: opcional(e.observacao),
  };
  if (v.assinadoEm && v.vigenciaFim && v.vigenciaFim < v.assinadoEm) throw new ErroRepasse("O fim da vigência não pode ser antes da assinatura.");
  if (v.situacao !== "EM_CAPTACAO" && v.situacao !== "PRESTADO" && !v.prazoExecucao && !v.vigenciaFim && !v.prazoPrestacaoContas)
    throw new ErroRepasse("Informe ao menos um prazo (execução, vigência ou prestação de contas) para o sistema avisar antes de vencer.");
  return v;
}

export async function criarRepasse(u: SessaoUsuario, e: EntradaRepasse): Promise<{ id: string }> {
  const s = await setorDoMunicipio(u, e.setorId);
  exigirEdicao(u, s);
  const v = validarRepasse(e);
  return db.transaction(async (tx) => {
    const [r] = await tx
      .insert(repasses)
      .values({ municipioId: u.municipioId, setorId: s.id, ...v, valorPrevisto: v.valorPrevisto.toFixed(2), valorRecebido: v.valorRecebido.toFixed(2), criadoPorId: u.id })
      .returning({ id: repasses.id });
    await tx.insert(repasseHistorico).values({
      repasseId: r.id,
      tipo: "CADASTRO",
      descricao: `${nomeTipoRepasse(v.tipo)} com ${fmtMoeda(v.valorPrevisto)} previstos. Concedente: ${v.concedente}. Responsável: ${s.nome}. Situação: ${SITUACOES_REPASSE[v.situacao].nome.toLowerCase()}.`,
      autorId: u.id,
    });
    return r;
  });
}

const CAMPOS: { chave: keyof ReturnType<typeof validarRepasse>; rotulo: string; fmt: (x: unknown) => string }[] = [
  { chave: "tipo", rotulo: "Tipo", fmt: (x) => nomeTipoRepasse(String(x)) },
  { chave: "identificacao", rotulo: "Identificação", fmt: (x) => (x ? String(x) : "sem número") },
  { chave: "concedente", rotulo: "Concedente", fmt: String },
  { chave: "objeto", rotulo: "Objeto", fmt: String },
  { chave: "valorPrevisto", rotulo: "Valor previsto", fmt: (x) => fmtMoeda(Number(x)) },
  { chave: "valorRecebido", rotulo: "Valor recebido", fmt: (x) => fmtMoeda(Number(x)) },
  { chave: "assinadoEm", rotulo: "Assinatura", fmt: (x) => (x ? dataBr(String(x)) : "sem data") },
  { chave: "vigenciaFim", rotulo: "Fim da vigência", fmt: (x) => (x ? dataBr(String(x)) : "sem data") },
  { chave: "prazoExecucao", rotulo: "Prazo de execução", fmt: (x) => (x ? dataBr(String(x)) : "sem data") },
  { chave: "prazoPrestacaoContas", rotulo: "Prestação de contas", fmt: (x) => (x ? dataBr(String(x)) : "sem data") },
  { chave: "situacao", rotulo: "Situação", fmt: (x) => SITUACOES_REPASSE[String(x)]?.nome ?? String(x) },
  { chave: "observacao", rotulo: "Observação", fmt: (x) => (x ? "atualizada" : "retirada") },
];

export async function editarRepasse(u: SessaoUsuario, id: string, e: EntradaRepasse): Promise<{ id: string; mudancas: number }> {
  const atual = await db.query.repasses.findFirst({ where: and(eq(repasses.id, id), eq(repasses.municipioId, u.municipioId)), with: { setor: true } });
  if (!atual) throw new ErroRepasse("Repasse não encontrado.");
  exigirEdicao(u, atual.setor);
  const novoSetor = e.setorId && e.setorId !== atual.setorId ? await setorDoMunicipio(u, e.setorId) : atual.setor;
  if (novoSetor.id !== atual.setorId) exigirEdicao(u, novoSetor);
  const v = validarRepasse(e);
  const antes: Record<string, unknown> = { ...atual, valorPrevisto: Number(atual.valorPrevisto), valorRecebido: Number(atual.valorRecebido) };
  const mudou: string[] = [];
  for (const c of CAMPOS) {
    const a = antes[c.chave] ?? null;
    const d = v[c.chave] ?? null;
    if (String(a) === String(d)) continue;
    mudou.push(c.chave === "objeto" || c.chave === "observacao" ? `${c.rotulo} ${c.chave === "objeto" ? "alterado" : c.fmt(d)}` : `${c.rotulo}: ${c.fmt(a)} → ${c.fmt(d)}`);
  }
  if (novoSetor.id !== atual.setorId) mudou.push(`Secretaria responsável: ${atual.setor.nome} → ${novoSetor.nome}`);
  if (!mudou.length) throw new ErroRepasse("Nada mudou. Altere ao menos um campo antes de salvar.");
  await db.transaction(async (tx) => {
    await tx
      .update(repasses)
      .set({ ...v, setorId: novoSetor.id, valorPrevisto: v.valorPrevisto.toFixed(2), valorRecebido: v.valorRecebido.toFixed(2), atualizadoEm: new Date() })
      .where(eq(repasses.id, id));
    await tx.insert(repasseHistorico).values({ repasseId: id, tipo: "ALTERACAO", descricao: mudou.join("; ") + ".", autorId: u.id });
  });
  return { id, mudancas: mudou.length };
}

async function repasseEditavel(u: SessaoUsuario, repasseId: string) {
  const r = await db.query.repasses.findFirst({ where: and(eq(repasses.id, repasseId), eq(repasses.municipioId, u.municipioId)), with: { setor: true } });
  if (!r) throw new ErroRepasse("Repasse não encontrado.");
  exigirEdicao(u, r.setor);
  const tipoNome = nomeTipoRepasse(r.tipo);
  return { r, rotulo: r.identificacao ? `${tipoNome} ${r.identificacao}` : tipoNome };
}

/** Confere o repasse escolhido na abertura de um processo: existe, não está encerrado e a pessoa pode vinculá-lo. */
export async function repasseParaVincular(u: SessaoUsuario, repasseId: string): Promise<{ id: string; rotulo: string }> {
  const { r, rotulo } = await repasseEditavel(u, repasseId);
  if (r.situacao === "PRESTADO") throw new ErroRepasse("Este repasse já teve as contas prestadas: não recebe novos processos.");
  return { id: r.id, rotulo };
}

/** Vincula um processo de compra (ou de pagamento) ao repasse. O motor grava o vínculo e o evento no livro do processo. */
export async function vincularProcesso(u: SessaoUsuario, repasseId: string, processoId: string, motivo?: string) {
  const alvo = await repasseParaVincular(u, repasseId);
  const p = await db.query.processos.findFirst({ where: (x, { and: e, eq: igual }) => e(igual(x.id, processoId), igual(x.municipioId, u.municipioId)), columns: { id: true, metadados: true } });
  if (!p) throw new ErroRepasse("Escolha o processo a vincular.");
  const atual = (p.metadados as Record<string, unknown> | null)?.repasseId;
  if (typeof atual === "string" && atual !== repasseId) throw new ErroRepasse("Este processo já está vinculado a outro repasse. Desvincule-o lá antes.");
  await vincularRepasse(u, processoId, alvo, motivo);
}

/** Desfaz o vínculo do processo com o repasse atual, com motivo (fica no livro do processo). */
export async function desvincularProcesso(u: SessaoUsuario, processoId: string, motivo: string) {
  const p = await db.query.processos.findFirst({ where: (x, { and: e, eq: igual }) => e(igual(x.id, processoId), igual(x.municipioId, u.municipioId)), columns: { id: true, metadados: true } });
  const atual = (p?.metadados as Record<string, unknown> | null)?.repasseId;
  if (!p || typeof atual !== "string") throw new ErroRepasse("Este processo não está vinculado a repasse.");
  await repasseEditavel(u, atual);
  const m = texto(motivo, "o motivo de desvincular (pelo menos 10 caracteres)", 10);
  await vincularRepasse(u, processoId, null, m);
}

// ---------------------------------------------------------------------------
// Obrigações da área
// ---------------------------------------------------------------------------

export type EntradaObrigacao = {
  setorId: string;
  nome: string;
  destinatario: string;
  periodicidade: string;
  proximoVencimento: string;
  responsavelId?: string | null;
  situacao?: string | null;
  observacao?: string | null;
};

async function validarObrigacao(u: SessaoUsuario, e: EntradaObrigacao) {
  if (!Object.hasOwn(PERIODICIDADES, e.periodicidade)) throw new ErroRepasse("Escolha a periodicidade.");
  const situacao = e.situacao || "PENDENTE";
  if (!Object.hasOwn(SITUACOES_OBRIGACAO, situacao)) throw new ErroRepasse("Escolha a situação.");
  const venc = data(e.proximoVencimento, "Próximo vencimento");
  if (!venc) throw new ErroRepasse("Informe o próximo vencimento.");
  const responsavelId = opcional(e.responsavelId);
  if (responsavelId) {
    const r = await db.query.usuarios.findFirst({ where: and(eq(usuarios.id, responsavelId), eq(usuarios.municipioId, u.municipioId)), columns: { id: true } });
    if (!r) throw new ErroRepasse("Escolha o responsável entre os servidores do município.");
  }
  return {
    nome: texto(e.nome, "o nome da obrigação"),
    destinatario: texto(e.destinatario, "a quem se entrega"),
    periodicidade: e.periodicidade,
    proximoVencimento: venc,
    responsavelId,
    situacao,
    observacao: opcional(e.observacao),
  };
}

export async function criarObrigacao(u: SessaoUsuario, e: EntradaObrigacao): Promise<{ id: string }> {
  const s = await setorDoMunicipio(u, e.setorId);
  exigirEdicao(u, s);
  const v = await validarObrigacao(u, e);
  const [o] = await db
    .insert(obrigacoesArea)
    .values({ municipioId: u.municipioId, setorId: s.id, ...v, criadoPorId: u.id })
    .returning({ id: obrigacoesArea.id });
  return o;
}

export async function editarObrigacao(u: SessaoUsuario, id: string, e: EntradaObrigacao) {
  const atual = await db.query.obrigacoesArea.findFirst({ where: and(eq(obrigacoesArea.id, id), eq(obrigacoesArea.municipioId, u.municipioId)), with: { setor: true } });
  if (!atual) throw new ErroRepasse("Obrigação não encontrada.");
  exigirEdicao(u, atual.setor);
  const s = e.setorId && e.setorId !== atual.setorId ? await setorDoMunicipio(u, e.setorId) : atual.setor;
  if (s.id !== atual.setorId) exigirEdicao(u, s);
  const v = await validarObrigacao(u, e);
  // um exemplo editado passa a ser do município: o rótulo de exemplo sai
  await db.update(obrigacoesArea).set({ ...v, setorId: s.id, exemplo: false, atualizadoEm: new Date() }).where(eq(obrigacoesArea.id, id));
}

/** Registra a entrega do vencimento atual com o comprovante; a recorrente passa ao próximo vencimento, a única fica entregue. */
export async function registrarEntrega(u: SessaoUsuario, id: string, e: { entregueEm: string; comprovante: string }) {
  const atual = await db.query.obrigacoesArea.findFirst({ where: and(eq(obrigacoesArea.id, id), eq(obrigacoesArea.municipioId, u.municipioId)), with: { setor: true } });
  if (!atual) throw new ErroRepasse("Obrigação não encontrada.");
  exigirEdicao(u, atual.setor);
  if (atual.situacao === "ENTREGUE") throw new ErroRepasse("Esta obrigação de entrega única já foi entregue.");
  const entregueEm = data(e.entregueEm, "Data da entrega");
  if (!entregueEm) throw new ErroRepasse("Informe a data da entrega.");
  const comprovante = texto(e.comprovante, "o comprovante (número do recibo, protocolo ou envio)");
  const seguinte = vencimentoSeguinte(atual.periodicidade, atual.proximoVencimento);
  await db.transaction(async (tx) => {
    await tx.insert(obrigacaoEntregas).values({ obrigacaoId: id, vencimento: atual.proximoVencimento, entregueEm, comprovante, autorId: u.id });
    await tx
      .update(obrigacoesArea)
      .set(seguinte ? { proximoVencimento: seguinte, situacao: "PENDENTE", atualizadoEm: new Date() } : { situacao: "ENTREGUE", atualizadoEm: new Date() })
      .where(eq(obrigacoesArea.id, id));
  });
  return { proximoVencimento: seguinte };
}

"use server";
// Ações do módulo de finanças. Cada etapa da despesa é uma ação separada, com papel próprio
// (contabilidade reserva, empenha e liquida; tesouraria paga), e é validada contra os saldos no servidor.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, max } from "drizzle-orm";
import { db } from "@/db";
import { finCreditos, finEmpenhos, finLiquidacoes, finPagamentos, finProcessoEmpenho, finReservas, empresas, processos } from "@/db/schema";
import { requireUser, temPapel, type SessaoUsuario } from "@/lib/auth";
import { ErroFluxo, juntarDocumento } from "@/lib/engine";
import { fmtMoeda } from "@/lib/dates";
import { cnpjValido } from "@/lib/pagamentos";
import type { ActionState } from "@/app/actions";
import { anoCorrente, caixa, execucao, hojeIso } from "./dados";
import { TIPOS_CREDITO, TIPOS_EMPENHO, parseValor } from "./classificacao";

class ErroFin extends Error {}
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const valorDe = (fd: FormData, k = "valor") => {
  const v = parseValor(str(fd, k));
  if (!Number.isFinite(v) || v <= 0) throw new ErroFin("Informe um valor maior que zero.");
  return Math.round(v * 100) / 100;
};
const dataDe = (fd: FormData, k: string, padrao?: string) => {
  const v = str(fd, k) || padrao || "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new ErroFin("Informe a data no formato dd/mm/aaaa.");
  return v;
};
function exigir(u: SessaoUsuario, ...papeis: Parameters<typeof temPapel>[1][]) {
  if (!temPapel(u, ...papeis)) throw new ErroFin("Seu perfil não pode registrar esta etapa. Peça a quem tem o papel de " + papeis.join(" ou ").toLowerCase() + ".");
}
function trata(e: unknown): ActionState {
  if (e instanceof ErroFin || e instanceof ErroFluxo) return { erro: e.message };
  console.error(e);
  return { erro: "Erro inesperado. Tente novamente." };
}
const revalidar = () => revalidatePath("/financas", "layout");

// ---------------------------------------------------------------------------
// Créditos adicionais
// ---------------------------------------------------------------------------
export async function creditoAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const u = await requireUser();
    exigir(u, "CONTABILIDADE");
    const ex = await execucao(u.municipioId, anoCorrente());
    const d = ex.dotacoes.find((x) => x.id === str(fd, "dotacaoId"));
    if (!d) throw new ErroFin("Dotação não encontrada.");
    const tipo = str(fd, "tipo");
    if (!TIPOS_CREDITO[tipo]) throw new ErroFin("Escolha o tipo de crédito.");
    const decreto = str(fd, "decreto");
    if (decreto.length < 3) throw new ErroFin("Informe o número do decreto (ou da lei).");
    const data = dataDe(fd, "data");
    let valor = valorDe(fd);
    if (tipo === "REDUCAO") {
      if (valor > d.disponivel) throw new ErroFin(`A anulação não pode passar do saldo disponível da dotação (${fmtMoeda(d.disponivel)}).`);
      valor = -valor;
    }
    await db.insert(finCreditos).values({ dotacaoId: d.id, tipo, decretoNumero: decreto, decretoData: data, valor, justificativa: str(fd, "justificativa") || null, criadoPorId: u.id });
    revalidar();
    return { ok: `${TIPOS_CREDITO[tipo]} de ${fmtMoeda(Math.abs(valor))} registrado (Decreto ${decreto}).` };
  } catch (e) {
    return trata(e);
  }
}

// ---------------------------------------------------------------------------
// Reserva
// ---------------------------------------------------------------------------
export async function reservaAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const u = await requireUser();
    exigir(u, "CONTABILIDADE");
    const ano = anoCorrente();
    const ex = await execucao(u.municipioId, ano);
    const d = ex.dotacoes.find((x) => x.id === str(fd, "dotacaoId"));
    if (!d) throw new ErroFin("Escolha a dotação.");
    const valor = valorDe(fd);
    if (valor > d.disponivel) throw new ErroFin(`Saldo insuficiente: a dotação tem ${fmtMoeda(d.disponivel)} disponíveis. Peça crédito adicional.`);
    const historico = str(fd, "historico");
    if (historico.length < 5) throw new ErroFin("Descreva para que é a reserva.");
    let processoId: string | null = null;
    const numero = str(fd, "processo");
    if (numero) {
      const p = await db.query.processos.findFirst({ where: and(eq(processos.municipioId, u.municipioId), eq(processos.numero, numero)) });
      if (!p) throw new ErroFin(`Processo ${numero} não encontrado.`);
      processoId = p.id;
    }
    const [{ n }] = await db.select({ n: max(finReservas.numero) }).from(finReservas).where(and(eq(finReservas.municipioId, u.municipioId), eq(finReservas.ano, ano)));
    await db.insert(finReservas).values({ municipioId: u.municipioId, ano, numero: (n ?? 0) + 1, dotacaoId: d.id, processoId, data: hojeIso(), valor, historico, criadoPorId: u.id });
    revalidar();
    return { ok: `Reserva nº ${(n ?? 0) + 1}/${ano} de ${fmtMoeda(valor)} registrada.` };
  } catch (e) {
    return trata(e);
  }
}

export async function anularReservaAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const u = await requireUser();
    exigir(u, "CONTABILIDADE");
    const ex = await execucao(u.municipioId, anoCorrente());
    const r = ex.reservasCalc.find((x) => x.id === str(fd, "reservaId"));
    if (!r || r.situacao !== "ABERTA") throw new ErroFin("Reserva não encontrada ou já anulada.");
    await db.update(finReservas).set({ situacao: "ANULADA", anuladaEm: new Date() }).where(eq(finReservas.id, r.id));
    revalidar();
    return { ok: `Saldo de ${fmtMoeda(r.saldo)} devolvido à dotação.` };
  } catch (e) {
    return trata(e);
  }
}

// ---------------------------------------------------------------------------
// Empenho
// ---------------------------------------------------------------------------
export async function empenhoAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id: string;
  let aviso = "";
  try {
    const u = await requireUser();
    exigir(u, "CONTABILIDADE");
    const ano = anoCorrente();
    const ex = await execucao(u.municipioId, ano);
    const d = ex.dotacoes.find((x) => x.id === str(fd, "dotacaoId"));
    if (!d) throw new ErroFin("Escolha a dotação.");
    const tipo = str(fd, "tipo");
    if (!TIPOS_EMPENHO[tipo]) throw new ErroFin("Escolha o tipo de empenho.");
    const valor = valorDe(fd);
    const reservaId = str(fd, "reservaId") || null;
    const reserva = reservaId ? ex.reservasCalc.find((r) => r.id === reservaId && r.dotacaoId === d.id && r.situacao === "ABERTA") : null;
    if (reservaId && !reserva) throw new ErroFin("A reserva escolhida não pertence a esta dotação ou já foi anulada.");
    const cabe = d.disponivel + (reserva?.saldo ?? 0);
    if (valor > cabe) throw new ErroFin(`Saldo insuficiente: cabem ${fmtMoeda(cabe)} nesta dotação${reserva ? " (disponível + saldo da reserva)" : ""}.`);

    // credor: empresa cadastrada (por CNPJ) ou credor sem CNPJ
    const doc = str(fd, "cnpj").replace(/\D/g, "");
    let empresaId: string | null = null;
    let credorNome = str(fd, "credor");
    if (doc) {
      if (!cnpjValido(doc)) throw new ErroFin("CNPJ do credor inválido. Confira os 14 dígitos.");
      const e = await db.query.empresas.findFirst({ where: eq(empresas.cnpj, doc) });
      if (e) {
        empresaId = e.id;
        credorNome = e.razaoSocial;
      } else if (credorNome.length >= 3) {
        const [n] = await db.insert(empresas).values({ cnpj: doc, razaoSocial: credorNome, porte: "DEMAIS" }).onConflictDoNothing().returning();
        empresaId = n?.id ?? null;
      }
    }
    if (credorNome.length < 3) throw new ErroFin("Informe o credor (razão social).");
    const historico = str(fd, "historico");
    if (historico.length < 5) throw new ErroFin("Descreva o objeto do empenho.");

    let processo: { id: string; numero: string } | null = null;
    const pid = str(fd, "processoId");
    if (pid) {
      const p = await db.query.processos.findFirst({ where: and(eq(processos.municipioId, u.municipioId), eq(processos.id, pid)) });
      if (!p) throw new ErroFin("Processo não encontrado.");
      processo = { id: p.id, numero: p.numero };
    }

    const novo = await db.transaction(async (tx) => {
      const [{ n }] = await tx.select({ n: max(finEmpenhos.numero) }).from(finEmpenhos).where(and(eq(finEmpenhos.municipioId, u.municipioId), eq(finEmpenhos.ano, ano)));
      const [e] = await tx
        .insert(finEmpenhos)
        .values({
          municipioId: u.municipioId,
          ano,
          numero: (n ?? 0) + 1,
          dotacaoId: d.id,
          reservaId: reserva?.id ?? null,
          tipo,
          empresaId,
          credorNome,
          credorDocumento: doc || null,
          historico,
          data: hojeIso(),
          valor,
          criadoPorId: u.id,
        })
        .returning();
      if (processo) await tx.insert(finProcessoEmpenho).values({ processoId: processo.id, empenhoId: e.id });
      return e;
    });
    id = novo.id;

    // junta a nota de empenho ao processo pelo motor (as assinaturas continuam no processo)
    if (processo) {
      try {
        await juntarDocumento(
          u,
          processo.id,
          "NOTA_EMPENHO",
          `Nota de empenho nº ${novo.numero}/${ano}`,
          `NOTA DE EMPENHO Nº ${novo.numero}/${ano} (${TIPOS_EMPENHO[tipo].nome.toUpperCase()})\n\nCredor: ${credorNome}${doc ? ` — CNPJ ${doc}` : ""}\nValor: ${fmtMoeda(valor)}\nDotação: ${d.unidade} · ${d.funcao}.${d.subfuncao}.${d.programa}.${d.acao} · ${d.natureza} · fonte ${d.fonte}\nHistórico: ${historico}\n\nEmitida no módulo de finanças da Civu. Assinaturas do contador e do ordenador no processo.`,
        );
      } catch (e) {
        aviso = e instanceof ErroFluxo ? `&aviso=${encodeURIComponent(e.message)}` : "";
      }
    }
    revalidar();
  } catch (e) {
    return trata(e);
  }
  redirect(`/financas/empenhos/${id}?novo=1${aviso}`);
}

export async function anularEmpenhoAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const u = await requireUser();
    exigir(u, "CONTABILIDADE");
    const ex = await execucao(u.municipioId, anoCorrente());
    const e = ex.empenhos.find((x) => x.id === str(fd, "empenhoId"));
    if (!e) throw new ErroFin("Empenho não encontrado.");
    const valor = valorDe(fd);
    if (valor > e.aLiquidar) throw new ErroFin(`Só o saldo ainda não liquidado pode ser anulado (${fmtMoeda(e.aLiquidar)}).`);
    const motivo = str(fd, "motivo");
    if (motivo.length < 5) throw new ErroFin("Informe o motivo da anulação.");
    const anulacoes = [...(e.anulacoes ?? []), { data: hojeIso(), valor, motivo, autor: u.nome }];
    await db
      .update(finEmpenhos)
      .set({ valorAnulado: Math.round((e.valorAnulado + valor) * 100) / 100, anulacoes })
      .where(eq(finEmpenhos.id, e.id));
    revalidar();
    return { ok: `${fmtMoeda(valor)} anulados; o valor voltou para a dotação.` };
  } catch (e) {
    return trata(e);
  }
}

// ---------------------------------------------------------------------------
// Liquidação
// ---------------------------------------------------------------------------
export async function liquidarAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const u = await requireUser();
    exigir(u, "CONTABILIDADE");
    const ano = anoCorrente();
    const ex = await execucao(u.municipioId, ano);
    const e = ex.empenhos.find((x) => x.id === str(fd, "empenhoId"));
    if (!e) throw new ErroFin("Empenho não encontrado.");
    const valor = valorDe(fd);
    if (valor > e.aLiquidar) throw new ErroFin(`O valor passa do saldo a liquidar do empenho (${fmtMoeda(e.aLiquidar)}).`);
    const documento = str(fd, "documento");
    if (documento.length < 3) throw new ErroFin("Informe a nota fiscal ou o documento que comprova a entrega.");
    const hoje = hojeIso();
    const data = dataDe(fd, "data", hoje);
    if (data > hoje) throw new ErroFin("A liquidação não pode ter data futura.");
    const vencimento = dataDe(fd, "vencimento");
    if (vencimento < data) throw new ErroFin("O vencimento não pode ser anterior à liquidação.");
    await db.insert(finLiquidacoes).values({ empenhoId: e.id, data, valor, documentoFiscal: documento, vencimento, criadoPorId: u.id });
    let extra = "";
    for (const pid of e.processoIds) {
      try {
        await juntarDocumento(
          u,
          pid,
          "NOTA_LIQUIDACAO",
          `Nota de liquidação — empenho ${e.numero}/${ano}`,
          `LIQUIDAÇÃO DA DESPESA (Lei 4.320, art. 63)\n\nEmpenho: ${e.numero}/${ano}\nCredor: ${e.credorNome}\nDocumento: ${documento}\nValor liquidado: ${fmtMoeda(valor)}\nVencimento: ${vencimento.split("-").reverse().join("/")}\n\nRegistrada no módulo de finanças da Civu. Assinatura do ordenador no processo.`,
        );
        extra = " A nota de liquidação foi juntada ao processo para assinatura do ordenador.";
      } catch {
        extra = " Não foi possível juntar a nota ao processo (processo encerrado ou sem permissão).";
      }
    }
    revalidar();
    return { ok: `Liquidação de ${fmtMoeda(valor)} registrada. Ela entra na fila de pagamento da fonte.${extra}` };
  } catch (e) {
    return trata(e);
  }
}

// ---------------------------------------------------------------------------
// Pagamento
// ---------------------------------------------------------------------------
export async function pagarAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const u = await requireUser();
    exigir(u, "TESOURARIA");
    const ano = anoCorrente();
    const [ex, cx] = await Promise.all([execucao(u.municipioId, ano), caixa(u.municipioId, ano)]);
    const l = ex.liquidacoesCalc.find((x) => x.id === str(fd, "liquidacaoId"));
    if (!l) throw new ErroFin("Liquidação não encontrada.");
    const e = ex.empenhos.find((x) => x.id === l.empenhoId)!;
    if (l.criadoPorId === u.id && !temPapel(u, "ADMIN")) throw new ErroFin("Quem liquidou não pode pagar a mesma despesa (segregação de funções).");
    const valor = valorDe(fd);
    if (valor > l.aPagar) throw new ErroFin(`O valor passa do saldo a pagar desta liquidação (${fmtMoeda(l.aPagar)}).`);
    const conta = cx.contas.find((c) => c.id === str(fd, "contaId"));
    if (!conta) throw new ErroFin("Escolha a conta bancária.");
    if (conta.grupoFonte !== e.grupo) throw new ErroFin("A conta escolhida é de outra fonte de recurso. Recursos vinculados só pagam despesas da própria fonte.");
    if (valor > conta.saldoAtual) throw new ErroFin(`Saldo insuficiente na conta (${fmtMoeda(conta.saldoAtual)}).`);
    // ordem cronológica da fonte: liquidações mais antigas ainda não pagas
    const aFrente = ex.liquidacoesCalc.filter((x) => {
      if (x.id === l.id || x.aPagar <= 0) return false;
      const ex2 = ex.empenhos.find((y) => y.id === x.empenhoId)!;
      return ex2.grupo === e.grupo && x.data < l.data && !ex2.dotacao.natureza.startsWith("3.1.");
    });
    const justificativa = str(fd, "justificativa");
    if (aFrente.length && justificativa.length < 15)
      throw new ErroFin(
        `Há ${aFrente.length} ${aFrente.length === 1 ? "despesa liquidada antes" : "despesas liquidadas antes"} nesta fonte. Para pagar fora da ordem cronológica, escreva a justificativa (Lei 14.133, art. 141). Ela fica pública.`,
      );
    await db.insert(finPagamentos).values({ liquidacaoId: l.id, contaId: conta.id, data: hojeIso(), valor, justificativaOrdem: aFrente.length ? justificativa : null, criadoPorId: u.id });
    revalidar();
    return {
      ok: `Pagamento de ${fmtMoeda(valor)} registrado na conta ${conta.nome}. A confirmação do banco é simulada nesta demonstração.${e.processoIds.length ? " Registre também o pagamento no processo vinculado." : ""}`,
    };
  } catch (e) {
    return trata(e);
  }
}

// ---------------------------------------------------------------------------
// Vínculo processo ↔ empenho
// ---------------------------------------------------------------------------
export async function vincularProcessoAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const u = await requireUser();
    exigir(u, "CONTABILIDADE");
    const e = await db.query.finEmpenhos.findFirst({ where: and(eq(finEmpenhos.id, str(fd, "empenhoId")), eq(finEmpenhos.municipioId, u.municipioId)) });
    if (!e) throw new ErroFin("Empenho não encontrado.");
    const numero = str(fd, "processo");
    const p = await db.query.processos.findFirst({ where: and(eq(processos.municipioId, u.municipioId), eq(processos.numero, numero)) });
    if (!p) throw new ErroFin(`Processo ${numero || "(vazio)"} não encontrado. Use o número completo, ex.: 2026/000012.`);
    await db.insert(finProcessoEmpenho).values({ processoId: p.id, empenhoId: e.id }).onConflictDoNothing();
    revalidar();
    return { ok: `Empenho vinculado ao processo ${p.numero}.` };
  } catch (e) {
    return trata(e);
  }
}

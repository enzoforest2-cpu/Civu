"use server";
// Ações do módulo de tributos (portal e gestão). Toda checagem de acesso é refeita aqui, no servidor.
import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { tribCertidoes, tribDividaAtiva, tribGuias, tribImoveis, tribInscricoes, tribItbi, tribLancamentos, tribLicencas, tribParcelas, tribProprietarios } from "@/db/schema";
import { ErroAcesso, requirePortal } from "@/lib/portal";
import { ErroFluxo, abrirProcessoExterno, avancar, carregarProcesso, juntarDocumento, receber } from "@/lib/engine";
import type { ActionState } from "@/app/actions";
import { avaliacaoSugerida, debitosEmAberto, dividasDoDono, donoPortal, hojeISO, imovelDoDono, municipioPortal, pedidosAlvara, pendenciasCertidao, requireTributos, type Dono } from "./dados";
import { ITBI_ALIQUOTA, codigoVerificacao, diaISO, linhaDigitavelFicticia, pixFicticio, r2, simularParcelamento, tipoCertidao } from "./regras";
import { CHAVE_FLUXO_ALVARA } from "./fluxo";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const num = (fd: FormData, k: string) => Number(str(fd, k).replace(/\./g, "").replace(",", "."));

function trata(e: unknown): ActionState {
  if (e instanceof ErroAcesso || e instanceof ErroFluxo) return { erro: e.message };
  console.error(e);
  return { erro: "Não foi possível concluir. Tente novamente." };
}

const codigo = () => codigoVerificacao(randomBytes(16).toString("hex"));
const somaDias = (n: number) => diaISO(new Date(Date.now() + n * 86400000));

async function proximoNumero(tabela: "guia" | "certidao" | "itbi", municipioId: string, ano: number) {
  const prefixo = { guia: "GUIA", certidao: "CND", itbi: "ITBI" }[tabela];
  const alvo = { guia: "trib_guias", certidao: "trib_certidoes", itbi: "trib_itbi" }[tabela];
  const r = await db.execute(
    sql`select count(*)::int n from ${sql.raw(`tramite.${alvo}`)} where municipio_id = ${municipioId} and numero like ${`${prefixo} ${ano}/%`}`,
  );
  const n = Number((r.rows[0] as { n: number }).n) + 1;
  return `${prefixo} ${ano}/${String(n).padStart(tabela === "itbi" ? 4 : 6, "0")}`;
}

// ---------------------------------------------------------------------------
// Guias (portal)
// ---------------------------------------------------------------------------
async function criarGuia(dono: Dono, municipioId: string, parcelaIds: string[], quem: { pessoaId?: string; usuarioId?: string }) {
  const abertos = await debitosEmAberto(dono);
  const sel = abertos.filter((d) => parcelaIds.includes(d.parcelaId));
  if (!sel.length || sel.length !== new Set(parcelaIds).size) throw new ErroAcesso("Escolha débitos em aberto deste contribuinte.");
  const lancs = new Set(sel.map((d) => d.lancamentoId));
  for (const l of lancs) {
    const doL = sel.filter((d) => d.lancamentoId === l);
    if (doL.some((d) => d.numero === 0) && doL.some((d) => d.numero > 0)) throw new ErroAcesso("Escolha a cota única ou as parcelas do mesmo lançamento, não as duas.");
  }
  const principal = r2(sel.reduce((a, d) => a + d.valor, 0));
  const total = r2(sel.reduce((a, d) => a + d.total, 0));
  const algumaVencida = sel.some((d) => d.vencida);
  const vencimento = algumaVencida ? hojeISO() : sel.map((d) => d.vencimento).sort()[0];
  const ano = new Date().getFullYear();
  const numero = await proximoNumero("guia", municipioId, ano);
  const descricao = sel.length === 1 ? `${sel[0].descricao} — ${sel[0].numero === 0 ? "cota única" : `parcela ${sel[0].numero}`}` : `${sel.length} débitos: ${[...new Set(sel.map((d) => d.descricao))].join("; ")}`;
  const [g] = await db
    .insert(tribGuias)
    .values({
      municipioId,
      numero,
      parcelaIds: sel.map((d) => d.parcelaId),
      descricao,
      valorPrincipal: principal,
      acrescimos: r2(total - principal),
      valorTotal: total,
      vencimento,
      linhaDigitavel: linhaDigitavelFicticia(numero, total),
      pixCopiaCola: pixFicticio(numero, total),
      demonstracao: true,
      emitidaPorPessoaId: quem.pessoaId ?? null,
      emitidaPorUsuarioId: quem.usuarioId ?? null,
      contribuinteNome: dono.nome,
      contribuinteDocumento: dono.documento,
    })
    .returning();
  return g;
}

export async function emitirGuiaFormAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id = "";
  try {
    const s = await requirePortal();
    const dono = donoPortal(s, "TRIBUTOS");
    const mun = await municipioPortal();
    const ids = fd.getAll("parcela").map(String).filter(Boolean);
    if (!ids.length) throw new ErroAcesso("Marque ao menos um débito.");
    id = (await criarGuia(dono, mun.id, ids, { pessoaId: s.pessoa.id })).id;
  } catch (e) {
    return trata(e);
  }
  redirect(`/portal/guias/${id}`);
}

/** Baixa da guia: marca parcelas pagas e propaga (cota única cancela parcelas, ITBI quitado transfere a propriedade, acordo quitado baixa a dívida). */
async function baixarGuia(guiaId: string) {
  const g = await db.query.tribGuias.findFirst({ where: eq(tribGuias.id, guiaId) });
  if (!g || g.situacao !== "EMITIDA") throw new ErroAcesso("Guia já paga ou cancelada.");
  const agora = new Date();
  await db.transaction(async (tx) => {
    const parcelas = await tx.query.tribParcelas.findMany({ where: inArray(tribParcelas.id, g.parcelaIds) });
    if (parcelas.some((p) => p.situacao !== "ABERTA")) throw new ErroAcesso("Alguma parcela desta guia já foi paga por outra guia.");
    const fator = g.valorPrincipal ? g.valorTotal / g.valorPrincipal : 1;
    for (const p of parcelas) await tx.update(tribParcelas).set({ situacao: "PAGA", pagoEm: agora, valorPago: r2(p.valor * fator) }).where(eq(tribParcelas.id, p.id));
    await tx.update(tribGuias).set({ situacao: "PAGA", pagaEm: agora }).where(eq(tribGuias.id, g.id));
    for (const lancamentoId of new Set(parcelas.map((p) => p.lancamentoId))) {
      const pagas = parcelas.filter((p) => p.lancamentoId === lancamentoId);
      if (pagas.some((p) => p.numero === 0)) await tx.update(tribParcelas).set({ situacao: "CANCELADA" }).where(and(eq(tribParcelas.lancamentoId, lancamentoId), eq(tribParcelas.situacao, "ABERTA")));
      else await tx.update(tribParcelas).set({ situacao: "CANCELADA" }).where(and(eq(tribParcelas.lancamentoId, lancamentoId), eq(tribParcelas.numero, 0), eq(tribParcelas.situacao, "ABERTA")));
      const restantes = await tx.query.tribParcelas.findMany({ where: and(eq(tribParcelas.lancamentoId, lancamentoId), eq(tribParcelas.situacao, "ABERTA")) });
      if (restantes.length) continue;
      const [l] = await tx.update(tribLancamentos).set({ situacao: "PAGO" }).where(eq(tribLancamentos.id, lancamentoId)).returning();
      if (l.tributo === "PARCELAMENTO") await tx.update(tribDividaAtiva).set({ situacao: "QUITADA" }).where(eq(tribDividaAtiva.parcelamentoId, l.id));
      if (l.tributo === "ITBI") {
        const it = await tx.query.tribItbi.findFirst({ where: eq(tribItbi.lancamentoId, l.id) });
        if (it) {
          await tx.update(tribItbi).set({ situacao: "PAGO", quitadoEm: agora }).where(eq(tribItbi.id, it.id));
          await tx.update(tribProprietarios).set({ ate: diaISO(agora) }).where(and(eq(tribProprietarios.imovelId, it.imovelId), isNull(tribProprietarios.ate)));
          await tx.insert(tribProprietarios).values({ imovelId: it.imovelId, pessoaId: it.compradorPessoaId, empresaId: it.compradorEmpresaId, fracao: 100, principal: true, desde: diaISO(agora) });
        }
      }
    }
  });
}

/** DEMONSTRAÇÃO: simula o retorno do banco confirmando o pagamento. */
export async function simularPagamentoAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const s = await requirePortal();
    const dono = donoPortal(s, "TRIBUTOS");
    const g = await db.query.tribGuias.findFirst({ where: eq(tribGuias.id, str(fd, "guiaId")) });
    if (!g || g.contribuinteDocumento !== dono.documento) throw new ErroAcesso("Guia não encontrada para quem você está representando.");
    await baixarGuia(g.id);
  } catch (e) {
    return trata(e);
  }
  revalidatePath("/portal", "layout");
  return { ok: "Pagamento confirmado (simulado). A situação já foi atualizada." };
}

// ---------------------------------------------------------------------------
// Parcelamento de dívida ativa (portal)
// ---------------------------------------------------------------------------
export async function aderirParcelamentoAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let guiaId = "";
  try {
    const s = await requirePortal();
    const dono = donoPortal(s, "TRIBUTOS");
    const mun = await municipioPortal();
    const ids = fd.getAll("divida").map(String);
    const n = Math.floor(num(fd, "parcelas"));
    if (str(fd, "ciente") !== "sim") throw new ErroAcesso("Confirme que leu as condições do parcelamento.");
    const minhas = (await dividasDoDono(dono)).filter((d) => d.situacao === "ATIVA" && ids.includes(d.id));
    if (!minhas.length) throw new ErroAcesso("Escolha inscrições em dívida ativa que ainda não estejam parceladas.");
    const sim = simularParcelamento(
      minhas.map((d) => ({ principal: d.valorOriginal + d.atual.correcao, acrescimos: d.atual.multa + d.atual.juros })),
      n,
      dono.tipo,
    );
    if (!sim.valido) throw new ErroAcesso(`Escolha de 1 a ${sim.maxParcelas} parcelas (parcela mínima de R$ ${sim.parcelaMinima},00).`);
    const lanc = await db.transaction(async (tx) => {
      const [l] = await tx
        .insert(tribLancamentos)
        .values({
          municipioId: mun.id,
          tributo: "PARCELAMENTO",
          exercicio: new Date().getFullYear(),
          contribuintePessoaId: dono.tipo === "PESSOA" ? dono.id : null,
          contribuinteEmpresaId: dono.tipo === "EMPRESA" ? dono.id : null,
          descricao: `Parcelamento de dívida ativa em ${n}x — ${minhas.map((d) => d.numeroInscricao).join(", ")}`,
          baseCalculo: r2(sim.principal + sim.acrescimos),
          valor: sim.total,
          memoria: { ...sim, inscricoes: minhas.map((d) => d.numeroInscricao), aderidoPor: s.pessoa.nome, canal: "PORTAL" },
        })
        .returning();
      await tx.insert(tribParcelas).values(sim.valores.map((v, k) => ({ lancamentoId: l.id, numero: k + 1, vencimento: somaDias(5 + k * 30), valor: v })));
      await tx.update(tribDividaAtiva).set({ situacao: "PARCELADA", parcelamentoId: l.id }).where(inArray(tribDividaAtiva.id, minhas.map((d) => d.id)));
      return l;
    });
    const primeira = await db.query.tribParcelas.findFirst({ where: and(eq(tribParcelas.lancamentoId, lanc.id), eq(tribParcelas.numero, 1)) });
    guiaId = (await criarGuia(dono, mun.id, [primeira!.id], { pessoaId: s.pessoa.id })).id;
  } catch (e) {
    return trata(e);
  }
  revalidatePath("/portal", "layout");
  redirect(`/portal/guias/${guiaId}?acordo=1`);
}

// ---------------------------------------------------------------------------
// Certidão (portal)
// ---------------------------------------------------------------------------
export async function emitirCertidaoAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let cod = "";
  try {
    const s = await requirePortal();
    const dono = donoPortal(s, "TRIBUTOS");
    const mun = await municipioPortal();
    const pend = await pendenciasCertidao(dono);
    const tipo = tipoCertidao(pend);
    cod = codigo();
    await db.insert(tribCertidoes).values({
      municipioId: mun.id,
      numero: await proximoNumero("certidao", mun.id, new Date().getFullYear()),
      codigoVerificacao: cod,
      tipo,
      pessoaId: dono.tipo === "PESSOA" ? dono.id : null,
      empresaId: dono.tipo === "EMPRESA" ? dono.id : null,
      nome: dono.nome,
      documento: dono.documento,
      finalidade: str(fd, "finalidade") || null,
      pendencias: pend,
      validaAte: somaDias(tipo === "POSITIVA" ? 30 : 90),
      solicitadaPorPessoaId: s.pessoa.id,
    });
  } catch (e) {
    return trata(e);
  }
  revalidatePath("/portal/certidao");
  redirect(`/verificar/certidao/${cod}`);
}

// ---------------------------------------------------------------------------
// ITBI (portal: declarar e contestar; gestão: avaliar)
// ---------------------------------------------------------------------------
export async function pedirItbiAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id = "";
  try {
    const s = await requirePortal();
    const dono = donoPortal(s, "TRIBUTOS");
    const mun = await municipioPortal();
    const inscricao = str(fd, "inscricao");
    const im = await db.query.tribImoveis.findFirst({
      where: and(eq(tribImoveis.municipioId, mun.id), eq(tribImoveis.inscricao, inscricao)),
      with: { proprietarios: { where: isNull(tribProprietarios.ate), with: { pessoa: true, empresa: true } } },
    });
    if (!im) throw new ErroAcesso("Não encontramos imóvel com esta inscrição. Confira no carnê do IPTU ou na matrícula.");
    if (await imovelDoDono(dono, im.id)) throw new ErroAcesso("Você já consta como proprietário deste imóvel.");
    const aberto = await db.query.tribItbi.findFirst({ where: and(eq(tribItbi.imovelId, im.id), inArray(tribItbi.situacao, ["EM_AVALIACAO", "AVALIADO", "CONTESTADO"])) });
    if (aberto) throw new ErroAcesso(`Já existe uma declaração de ITBI em andamento para este imóvel (${aberto.numero}).`);
    const valor = num(fd, "valor");
    if (!(valor > 0)) throw new ErroAcesso("Informe o valor da transação.");
    const financiado = str(fd, "financiado") === "sim";
    const valorFinanciado = financiado ? num(fd, "valorFinanciado") : 0;
    if (financiado && !(valorFinanciado > 0 && valorFinanciado <= valor)) throw new ErroAcesso("O valor financiado deve ser maior que zero e não pode passar do valor da transação.");
    if (str(fd, "declaro") !== "sim") throw new ErroAcesso("Confirme a declaração para enviar.");
    const vend = im.proprietarios.find((p) => p.principal) ?? im.proprietarios[0];
    const natureza = ["COMPRA_VENDA", "PERMUTA", "DACAO", "ARREMATACAO"].includes(str(fd, "natureza")) ? str(fd, "natureza") : "COMPRA_VENDA";
    const [it] = await db
      .insert(tribItbi)
      .values({
        municipioId: mun.id,
        numero: await proximoNumero("itbi", mun.id, new Date().getFullYear()),
        imovelId: im.id,
        natureza,
        compradorPessoaId: dono.tipo === "PESSOA" ? dono.id : null,
        compradorEmpresaId: dono.tipo === "EMPRESA" ? dono.id : null,
        compradorNome: dono.nome,
        compradorDocumento: dono.documento,
        vendedorNome: vend ? (vend.pessoa?.nome ?? vend.empresa?.razaoSocial ?? "—") : "—",
        vendedorDocumento: vend ? (vend.pessoa?.cpf ?? vend.empresa?.cnpj ?? "") : "",
        valorDeclarado: valor,
        financiado,
        valorFinanciado: financiado ? valorFinanciado : null,
        situacao: "EM_AVALIACAO",
        solicitadoPorPessoaId: s.pessoa.id,
        canal: "PORTAL",
      })
      .returning();
    id = it.id;
  } catch (e) {
    return trata(e);
  }
  revalidatePath("/portal/itbi");
  redirect(`/portal/itbi?enviado=${id}`);
}

export async function contestarItbiAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const s = await requirePortal();
    const dono = donoPortal(s, "TRIBUTOS");
    const it = await db.query.tribItbi.findFirst({ where: eq(tribItbi.id, str(fd, "itbiId")) });
    const meu = it && (dono.tipo === "PESSOA" ? it.compradorPessoaId === dono.id : it.compradorEmpresaId === dono.id);
    if (!it || !meu) throw new ErroAcesso("Declaração não encontrada para quem você está representando.");
    if (it.situacao !== "AVALIADO") throw new ErroAcesso("Só é possível contestar uma avaliação ainda não paga.");
    const texto = str(fd, "texto");
    if (texto.length < 30) throw new ErroAcesso("Explique o motivo com pelo menos 30 caracteres (estado do imóvel, laudo, comparáveis).");
    await db.transaction(async (tx) => {
      await tx.update(tribItbi).set({ situacao: "CONTESTADO", contestacao: texto }).where(eq(tribItbi.id, it.id));
      if (it.lancamentoId) {
        await tx.update(tribLancamentos).set({ situacao: "CANCELADO" }).where(eq(tribLancamentos.id, it.lancamentoId));
        await tx.update(tribParcelas).set({ situacao: "CANCELADA" }).where(and(eq(tribParcelas.lancamentoId, it.lancamentoId), eq(tribParcelas.situacao, "ABERTA")));
      }
    });
  } catch (e) {
    return trata(e);
  }
  revalidatePath("/portal/itbi");
  return { ok: "Contestação registrada. A guia foi suspensa até a nova análise da tributação." };
}

export async function avaliarItbiAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, "itbiId");
  try {
    const u = await requireTributos();
    const it = await db.query.tribItbi.findFirst({ where: and(eq(tribItbi.id, id), eq(tribItbi.municipioId, u.municipioId)), with: { imovel: true } });
    if (!it) throw new ErroAcesso("Declaração não encontrada.");
    if (!["EM_AVALIACAO", "CONTESTADO"].includes(it.situacao)) throw new ErroAcesso("Esta declaração já foi avaliada.");
    const { mem } = await avaliacaoSugerida(u.municipioId, it, it.imovel);
    const modo = str(fd, "modo");
    let referencia = mem.valorReferencia;
    let justificativa = str(fd, "justificativa");
    if (modo === "AJUSTE") {
      referencia = num(fd, "valorAvaliado");
      if (!(referencia > 0)) throw new ErroAcesso("Informe o valor de referência avaliado.");
      if (justificativa.length < 30) throw new ErroAcesso("Fundamente o ajuste com pelo menos 30 caracteres: método, vistoria, comparáveis ou laudo.");
    } else if (!justificativa) {
      justificativa = mem.baseCalculo > it.valorDeclarado ? "Valor declarado abaixo da referência fiscal; base ajustada à referência." : "Valor declarado compatível com a referência; base igual ao declarado.";
    }
    const base = Math.max(it.valorDeclarado, referencia);
    const sfh = Math.min(it.valorFinanciado ?? 0, base);
    const imposto = r2(sfh * mem.aliquotaSfh + (base - sfh) * ITBI_ALIQUOTA);
    const memoria = { ...mem, valorReferencia: referencia, baseCalculo: base, valorImposto: imposto, ajusteManual: modo === "AJUSTE", referenciaSugerida: mem.valorReferencia };
    await db.transaction(async (tx) => {
      const [l] = await tx
        .insert(tribLancamentos)
        .values({
          municipioId: u.municipioId,
          tributo: "ITBI",
          exercicio: new Date().getFullYear(),
          imovelId: it.imovelId,
          contribuintePessoaId: it.compradorPessoaId,
          contribuinteEmpresaId: it.compradorEmpresaId,
          descricao: `${it.numero} — ${it.imovel.logradouro}, ${it.imovel.numero}${it.imovel.complemento ? " " + it.imovel.complemento : ""}`,
          baseCalculo: base,
          aliquota: ITBI_ALIQUOTA,
          valor: imposto,
          memoria,
        })
        .returning();
      await tx.insert(tribParcelas).values({ lancamentoId: l.id, numero: 0, vencimento: somaDias(30), valor: imposto });
      await tx
        .update(tribItbi)
        .set({ situacao: "AVALIADO", valorReferencia: referencia, baseCalculo: base, aliquota: ITBI_ALIQUOTA, valorImposto: imposto, memoria, justificativa, avaliadoPorId: u.id, avaliadoEm: new Date(), lancamentoId: l.id })
        .where(eq(tribItbi.id, it.id));
    });
  } catch (e) {
    return trata(e);
  }
  revalidatePath("/tributos/itbi");
  redirect(`/tributos/itbi/${id}`);
}

// ---------------------------------------------------------------------------
// Alvará (portal: pedir; gestão: emitir)
// ---------------------------------------------------------------------------
export async function pedirAlvaraAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let pid = "";
  try {
    const s = await requirePortal();
    const dono = donoPortal(s, "LICENCAS");
    if (dono.tipo !== "EMPRESA") throw new ErroAcesso("Escolha a empresa em “Agindo como” para pedir o alvará.");
    const ins = await db.query.tribInscricoes.findFirst({ where: and(eq(tribInscricoes.id, str(fd, "inscricaoId")), eq(tribInscricoes.empresaId, dono.id)), with: { licencas: true } });
    if (!ins) throw new ErroAcesso("Inscrição municipal não encontrada para esta empresa.");
    const abertos = (await pedidosAlvara(ins.municipioId, dono.id)).filter((p) => !p.encerradoEm && (p.metadados as { inscricaoId?: string } | null)?.inscricaoId === ins.id);
    if (abertos.length) throw new ErroAcesso(`Já existe um pedido em análise para esta inscrição (${abertos[0].numero}).`);
    const renovacao = ins.licencas.some((l) => l.tipo === "LOCALIZACAO_FUNCIONAMENTO");
    const obs = str(fd, "observacoes");
    const p = await abrirProcessoExterno(
      ins.municipioId,
      { pessoaId: s.pessoa.id, empresaId: dono.id, nomeExibicao: dono.nome },
      {
        tipoChave: CHAVE_FLUXO_ALVARA,
        assunto: `${renovacao ? "Renovação do" : "Novo"} alvará de localização e funcionamento — ${s.empresaAtiva?.nomeFantasia ?? dono.nome}`,
        descricao: `Pedido feito pelo portal para a inscrição ${ins.numero}. Atividade: ${ins.cnaePrincipal} — ${ins.cnaeDescricao}.${obs ? `\nObservações: ${obs}` : ""}`,
        metadados: { inscricaoId: ins.id, tipoLicenca: "LOCALIZACAO_FUNCIONAMENTO", renovacao, atividades: `${ins.cnaePrincipal} — ${ins.cnaeDescricao}`, mudouAlgo: str(fd, "mudou") === "sim" },
      },
    );
    pid = p.id;
  } catch (e) {
    return trata(e);
  }
  revalidatePath("/portal/alvara");
  redirect(`/portal/alvara?pedido=${pid}`);
}

export async function emitirAlvaraAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const u = await requireTributos();
    const processoId = str(fd, "processoId");
    const p = await carregarProcesso(u.municipioId, processoId);
    if (!p || p.tipo.chave !== CHAVE_FLUXO_ALVARA) throw new ErroAcesso("Pedido de alvará não encontrado.");
    const meta = (p.metadados ?? {}) as { inscricaoId?: string; tipoLicenca?: string; atividades?: string };
    const ins = meta.inscricaoId ? await db.query.tribInscricoes.findFirst({ where: and(eq(tribInscricoes.id, meta.inscricaoId), eq(tribInscricoes.municipioId, u.municipioId)) }) : null;
    if (!ins) throw new ErroAcesso("O pedido não está ligado a uma inscrição municipal.");
    const ja = await db.query.tribLicencas.findFirst({ where: eq(tribLicencas.processoId, p.id) });
    if (ja) throw new ErroAcesso(`O alvará deste pedido já foi emitido (${ja.numero}).`);
    const meses = Math.min(24, Math.max(1, Math.floor(num(fd, "meses") || 12)));
    const decisao = str(fd, "decisao") || "Documentação conferida, atividade compatível com o zoneamento e sem impedimentos cadastrais. Defiro o alvará.";
    if (p.estadoAtual === "EM_ANALISE") {
      if (!p.recebidoEm) await receber(u, p.id);
      await juntarDocumento(u, p.id, "DESPACHO", "Decisão sobre o pedido de alvará", decisao);
      await avancar(u, p.id, "DEFERIDO", decisao);
    } else if (p.estadoAtual !== "DEFERIDO") throw new ErroAcesso("Este pedido foi indeferido; não é possível emitir alvará.");
    const ano = new Date().getFullYear();
    const [{ n }] = (await db.execute(sql`select count(*)::int n from tramite.trib_licencas where municipio_id = ${u.municipioId} and numero like ${`ALV ${ano}/%`}`)).rows as { n: number }[];
    const validade = new Date();
    validade.setMonth(validade.getMonth() + meses);
    await db.insert(tribLicencas).values({
      municipioId: u.municipioId,
      inscricaoId: ins.id,
      tipo: meta.tipoLicenca ?? "LOCALIZACAO_FUNCIONAMENTO",
      numero: `ALV ${ano}/${String(900 + Number(n) + 1).padStart(5, "0")}`,
      codigoVerificacao: codigo(),
      atividades: meta.atividades ?? `${ins.cnaePrincipal} — ${ins.cnaeDescricao}`,
      validaAte: diaISO(validade),
      processoId: p.id,
      emitidaPorId: u.id,
    });
  } catch (e) {
    return trata(e);
  }
  revalidatePath("/tributos/empresas");
  return { ok: "Alvará emitido. A empresa já vê o documento no portal, com verificação pública." };
}

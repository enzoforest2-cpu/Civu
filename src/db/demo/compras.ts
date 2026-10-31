// Processos de compra da demonstração com histórico de semanas ou meses, criados pelo motor (src/lib/engine.ts)
// com o relógio simulado (./relogio): cada processo passa por todas as etapas do seu caminho, com os documentos
// e as assinaturas que as travas de cada etapa exigem, e para na etapa indicada sem o trabalho dela feito
// (salvo o que `atual` listar). Assim a demonstração nunca mostra documento de etapa futura nem documento
// de etapa vencida sem a assinatura exigida, e a cadeia de eventos é a do motor.
import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { SessaoUsuario } from "../../lib/auth";
import { caminhoDoProcesso, type Papel, type WorkflowDef } from "../../lib/workflow";
import * as s from "../schema";
import { acertar, agoraReal, irPara, voltarAoPresente } from "./relogio";

export type Contratacao = { fornecedor: string; cnpj: string; valor: string; fonte: string };

export type CompraDemo = {
  assunto: string;
  /** CPF de quem abre (requisitante) */
  req: string;
  meta: Record<string, unknown> & { objeto: string; modalidade: string; valorEstimado: number; justificativa: string; quantidade: string; prioridade: string };
  /** Etapa em que o processo para */
  ate: string;
  /** Dias atrás em que o processo foi aberto e em que entrou em `ate`; as etapas do meio são distribuídas entre os dois. */
  periodo: [number, number];
  urgencia?: string;
  /** false: a etapa atual ainda não foi recebida pelo setor */
  recebido?: boolean;
  /** Fornecedor escolhido: na licitação, o vencedor da sessão; na contratação direta, registrado na instrução direta. */
  contratacao?: Contratacao;
  /** Remessa ao Tribunal de Contas registrada logo depois do contrato */
  remessa?: boolean;
  /** Pagamento fora da ordem cronológica: justificativa pública no envio ao banco (art. 141) */
  quebra?: string;
  /** Passos já feitos na etapa atual (ids de PASSOS) */
  atual?: string[];
  /** Devolução feita na etapa `ate`, `diasAtras` dias atrás; os passos de `atual` vêm antes dela */
  devolucao?: { para: string; motivo: string; diasAtras: number };
};

type Base = {
  municipioId: string;
  usuarios: Record<string, string>;
  tipos: Record<string, string>;
  ugs: Record<string, string>;
  setores: Record<string, string>;
};

/** Duração típica de cada etapa (dias corridos), usada para repartir o período do processo. */
const PESO: Record<string, number> = {
  DEMANDA: 1, APROVACAO_SECRETARIO: 1, AUTUACAO: 1, AUTORIZACAO: 2, INSTRUCAO: 10, VERIFICACAO_ORCAMENTARIA: 3, RESERVADO: 1, CONTROLE_INTERNO: 3,
  PARECER_JURIDICO: 4, PUBLICACAO_EDITAL: 2, IMPUGNACOES: 4, SESSAO_DISPUTA: 1, RECURSOS: 4, HOMOLOGADO: 2, INSTRUCAO_DIRETA: 2, AUTORIZACAO_DIRETA: 2,
  EMPENHADO: 2, CONTRATADO: 4, EXECUCAO: 15, LIQUIDADO: 3, FILA_PAGAMENTO: 10, PAGAMENTO_ENVIADO: 1, PAGO: 1,
};
/** Mínimo de dias corridos na etapa: prazo do edital até a abertura (8 dias úteis, art. 55) e aviso da dispensa (3 dias úteis, art. 75, §3º), com folga para feriados. */
const MINIMO: Record<string, number> = { IMPUGNACOES: 15, INSTRUCAO_DIRETA: 8 };

/** Dias atrás em que o processo entrou em cada etapa do caminho. */
export function planejar(caminho: string[], inicio: number, fim: number): number[] {
  if (caminho.length === 1) return [inicio];
  const trechos = caminho.slice(0, -1);
  const minimos = trechos.map((e) => MINIMO[e] ?? 0);
  const pesos = trechos.map((e) => PESO[e] ?? 1);
  const folga = inicio - fim - minimos.reduce((a, b) => a + b, 0);
  if (folga < 0) throw new Error(`Período curto demais para o caminho até ${caminho.at(-1)}: faltam ${-folga} dias.`);
  const somaPesos = pesos.reduce((a, b) => a + b, 0);
  const out = [inicio];
  let acum = 0;
  trechos.forEach((_, i) => {
    acum += minimos[i] + (folga * pesos[i]) / somaPesos;
    out.push(i === trechos.length - 1 ? fim : Math.round(inicio - acum));
  });
  return out;
}

// ---------------------------------------------------------------------------
// Datas da demonstração: planejadas e conferidas antes de qualquer gravação (src/db/deploy.ts valida antes do truncate)
// ---------------------------------------------------------------------------

const somaDias = (iso: string, n: number) => new Date(Date.parse(iso + "T12:00:00Z") + n * 86400_000).toISOString().slice(0, 10);
const diasEntre = (de: string, ate: string) => Math.round((Date.parse(ate + "T12:00:00Z") - Date.parse(de + "T12:00:00Z")) / 86400_000);

/** Dia de hoje no fuso dos municípios atendidos (o mesmo de hojeIso no motor), pela hora real mesmo com o relógio simulado ligado. */
export const hojeDaCarga = () => new Date(agoraReal()).toLocaleDateString("en-CA", { timeZone: "America/Fortaleza" });

/** Dias corridos mínimos para o caminho caber: os mínimos legais (MINIMO) e cerca de um dia útil por etapa. */
function minimoDoCaminho(caminho: string[]) {
  const trechos = caminho.slice(0, -1);
  return trechos.reduce((a, e) => a + (MINIMO[e] ?? 0), 0) + Math.ceil((trechos.length * 7) / 5);
}

/** Maior período (dias atrás da abertura) que uma compra da demonstração pode pedir. */
export const PERIODO_MAXIMO = 160;

/**
 * Período do processo dentro do ano corrente. Uma compra aberta no ano anterior sai do limite de dispensa do exercício e
 * muda a numeração; por isso, se `inicio` cai antes do primeiro dia útil do ano, o período é comprimido para começar nele,
 * na mesma proporção para o tempo parado na etapa atual. Compras que já cabem no ano ficam como estão (a história de quem
 * está parado há N dias não muda). Só no começo de janeiro, quando nem o mínimo do caminho cabe no ano, o período original
 * fica (o histórico começa no ano anterior, que também tem feriados cadastrados).
 */
export function periodoNoAno(periodo: [number, number], caminho: string[], disponivel: number): [number, number] {
  const [inicio, fim] = periodo;
  if (inicio <= disponivel) return periodo;
  const minimo = minimoDoCaminho(caminho);
  if (disponivel < minimo) return periodo;
  let f = Math.round((fim * disponivel) / inicio);
  if (disponivel - f < minimo) f = Math.max(0, disponivel - minimo);
  return [disponivel, f];
}

export type PlanoCompra = {
  c: CompraDemo;
  caminho: string[];
  periodo: [number, number];
  /** Data (AAAA-MM-DD, sempre dia útil) em que o processo entra em cada etapa do caminho; a primeira é a abertura. */
  datas: string[];
  devolucaoEm?: string;
};

/** Planeja as datas de uma lista de compras: caminho, período no ano corrente e entrada em cada etapa num dia útil. */
export function planejarCompras(lista: CompraDemo[], def: WorkflowDef, hoje: string, fer: Set<string>, diaUtil: (iso: string, f: Set<string>) => boolean): PlanoCompra[] {
  const utilAte = (iso: string) => {
    let d = iso;
    while (!diaUtil(d, fer)) d = somaDias(d, -1);
    return d;
  };
  let inicioAno = `${hoje.slice(0, 4)}-01-01`;
  while (!diaUtil(inicioAno, fer)) inicioAno = somaDias(inicioAno, 1);
  const disponivel = diasEntre(inicioAno, hoje);
  const planos = lista.map((c): PlanoCompra => {
    const caminhoTodo = caminhoDoProcesso(def, c.meta).filter((e) => !e.opcional).map((e) => e.chave);
    const caminho = caminhoTodo.slice(0, caminhoTodo.indexOf(c.ate) + 1);
    if (caminho.at(-1) !== c.ate) throw new Error(`${c.assunto}: etapa ${c.ate} fora do caminho da modalidade ${c.meta.modalidade}.`);
    const periodo = periodoNoAno(c.periodo, caminho, disponivel);
    let dias: number[];
    try {
      dias = planejar(caminho, periodo[0], periodo[1]);
    } catch (e) {
      throw new Error(`${c.assunto}: ${(e as Error).message}`);
    }
    const datas: string[] = [];
    for (const n of dias) {
      const d = utilAte(somaDias(hoje, -n));
      datas.push(datas.length && d < datas[datas.length - 1] ? datas[datas.length - 1] : d);
    }
    let devolucaoEm: string | undefined;
    if (c.devolucao) {
      const d = utilAte(somaDias(hoje, -c.devolucao.diasAtras));
      devolucaoEm = d < datas[datas.length - 1] ? datas[datas.length - 1] : d;
    }
    return { c, caminho, periodo, datas, devolucaoEm };
  });
  // Quebra de ordem (art. 141): a compra que sai da fila fora da ordem precisa entrar nela depois de outra da mesma fonte que
  // ficou parada na fila. Com os períodos comprimidos no começo do ano, a ordem pode inverter: a entrada na fila é empurrada
  // para o dia útil seguinte ao da outra (e as etapas seguintes, se preciso), sem passar de hoje.
  planos.forEach((q, i) => {
    if (!q.c.quebra) return;
    const iFila = q.caminho.indexOf("FILA_PAGAMENTO");
    const outras = planos.slice(0, i).filter((o) => o.c.ate === "FILA_PAGAMENTO" && o.c.contratacao?.fonte === q.c.contratacao?.fonte);
    if (iFila < 0 || !outras.length) return;
    const naFila = (o: PlanoCompra) => o.datas[o.caminho.indexOf("FILA_PAGAMENTO")];
    const outra = outras.sort((a, b) => naFila(a).localeCompare(naFila(b)))[0];
    const antes = naFila(outra);
    if (q.datas[iFila] > antes) return;
    let d = somaDias(antes, 1);
    while (!diaUtil(d, fer)) d = somaDias(d, 1);
    if (d <= hoje) {
      for (let k = iFila; k < q.datas.length; k++) if (q.datas[k] < d) q.datas[k] = d;
      return;
    }
    // a outra entrou na fila hoje (fim de janeiro): ela é que entra no dia útil anterior ao da quebra
    let e = somaDias(q.datas[iFila], -1);
    while (!diaUtil(e, fer)) e = somaDias(e, -1);
    const iOutra = outra.caminho.indexOf("FILA_PAGAMENTO");
    for (let k = 0; k <= iOutra; k++) if (outra.datas[k] > e) outra.datas[k] = e;
  });
  return planos;
}

/**
 * Confere tudo o que depende da data da carga, sem tocar no banco: caminho de cada compra, períodos, prazo do edital
 * (aberturaMinima, art. 55), aviso da dispensa (3 dias úteis) e a quebra de ordem da fila (art. 141). Devolve a lista de
 * problemas (vazia se tudo cabe) e os avisos (compras que, no começo de janeiro, ainda começam no ano anterior).
 */
export function validarCompras(lista: CompraDemo[], def: WorkflowDef, hoje: string, fer: Set<string>, regras: typeof import("../../lib/regras-fluxo")) {
  const problemas: string[] = [];
  const avisos: string[] = [];
  let planos: PlanoCompra[] = [];
  try {
    planos = planejarCompras(lista, def, hoje, fer, regras.diaUtil);
  } catch (e) {
    return { problemas: [(e as Error).message], avisos, planos };
  }
  const em = (p: PlanoCompra, etapa: string) => p.datas[p.caminho.indexOf(etapa)];
  planos.forEach((p, i) => {
    const nome = p.c.assunto;
    if (p.c.periodo[0] > PERIODO_MAXIMO) problemas.push(`${nome}: período de ${p.c.periodo[0]} dias passa do máximo de ${PERIODO_MAXIMO}.`);
    if (p.datas.some((d) => d > hoje)) problemas.push(`${nome}: etapa com data futura.`);
    if (p.datas[0].slice(0, 4) !== hoje.slice(0, 4)) avisos.push(`${nome}: aberto em ${p.datas[0]}, no ano anterior (o ano corrente ainda não comporta o caminho).`);
    if (p.caminho.includes("SESSAO_DISPUTA")) {
      const r = regras.regraPrazoEdital(
        { numero: "-", tipoObjeto: "BENS_MENOR_PRECO", publicadoEm: em(p, "PUBLICACAO_EDITAL"), aberturaEm: em(p, "SESSAO_DISPUTA"), plataforma: "-" },
        fer,
      );
      if (!r.ok) problemas.push(`${nome}: edital publicado em ${em(p, "PUBLICACAO_EDITAL")} e sessão em ${em(p, "SESSAO_DISPUTA")}: ${r.motivo}`);
    }
    const iDir = p.caminho.indexOf("INSTRUCAO_DIRETA");
    if (iDir >= 0 && iDir < p.caminho.length - 1) {
      const r = regras.regraAvisoDispensa(p.c.meta.modalidade, { publicadoEm: p.datas[iDir] }, p.datas[iDir + 1], fer);
      if (!r.ok) problemas.push(`${nome}: aviso da dispensa em ${p.datas[iDir]} e autorização em ${p.datas[iDir + 1]}: ${r.motivo}`);
    }
    if (p.c.quebra) {
      // Para sair da fila fora da ordem, outra compra da mesma fonte, criada antes, precisa estar parada na fila, liquidada num dia anterior
      const entrada = em(p, "FILA_PAGAMENTO");
      const fonte = p.c.contratacao?.fonte;
      const aFrente = planos.slice(0, i).filter((o) => o.c.ate === "FILA_PAGAMENTO" && o.c.contratacao?.fonte === fonte && em(o, "FILA_PAGAMENTO") < entrada);
      if (!entrada || !aFrente.length) problemas.push(`${nome}: o pagamento fora da ordem precisa de outra compra da fonte ${fonte} liquidada antes (fila em ${entrada}).`);
    }
  });
  return { problemas, avisos, planos };
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export async function criarComprasDemo(db: NodePgDatabase<typeof s>, base: Base, lista: CompraDemo[]) {
  const engine = await import("../../lib/engine");
  const regras = await import("../../lib/regras-fluxo");

  const sessoes = new Map<string, SessaoUsuario>();
  async function sessao(cpf: string): Promise<SessaoUsuario> {
    const guardada = sessoes.get(cpf);
    if (guardada) return guardada;
    const u = await db.query.usuarios.findFirst({ where: eq(s.usuarios.id, base.usuarios[cpf]), with: { setor: true, municipio: true } });
    if (!u) throw new Error(`Usuário ${cpf} não encontrado`);
    const sess: SessaoUsuario = {
      id: u.id, nome: u.nome, cpf: u.cpf, email: u.email, cargo: u.cargo, papeis: u.papeis as Papel[], setorId: u.setorId,
      setor: u.setor ? { id: u.setor.id, sigla: u.setor.sigla, nome: u.setor.nome } : null,
      municipioId: u.municipioId, municipio: { id: u.municipio.id, nome: u.municipio.nome, uf: u.municipio.uf, slug: u.municipio.slug },
    };
    sessoes.set(cpf, sess);
    return sess;
  }
  const prefeita = await sessao("11111111111");
  const protocolo = await sessao("22222222222");
  const compras = await sessao("33333333333");
  const contador = await sessao("44444444444");
  const controladora = await sessao("55555555555");
  const procurador = await sessao("66666666666");
  const tesouraria = await sessao("77777777777");
  /** Secretário e fiscal de contrato de cada secretaria */
  const pasta: Record<string, { sec: SessaoUsuario; fiscal: SessaoUsuario }> = {
    SESAU: { sec: await sessao("88888888888"), fiscal: await sessao("88888888888") },
    SEDUC: { sec: await sessao("10101010101"), fiscal: await sessao("10101010101") },
    SEMAD: { sec: await sessao("12121212121"), fiscal: await sessao("12121212121") },
  };
  const tipo = await db.query.tiposProcesso.findFirst({ where: eq(s.tiposProcesso.id, base.tipos.COMPRA) });
  const def = tipo!.definicao as WorkflowDef;
  const fer = await engine.feriadosDo(base.municipioId);

  // Datas planejadas antes de gravar (todas em dias úteis e, quando cabe, no ano corrente); o relógio vai às 9h de cada uma
  const planos = planejarCompras(lista, def, hojeDaCarga(), fer, regras.diaUtil);
  const msDoDia = (iso: string) => Date.parse(`${iso}T09:00:00-03:00`);

  let assunto = "";
  let etapa = "";
  try {
    for (const { c, caminho, datas, devolucaoEm } of planos) {
      assunto = c.assunto;
      const req = await sessao(c.req);
      const sigla = req.setor!.sigla;
      const { sec, fiscal } = pasta[sigla];
      const papelReq: Papel = req.id === sec.id ? "SECRETARIO" : "REQUISITANTE";
      const isoDe = (estado: string) => datas[caminho.indexOf(estado)];
      const ct = c.contratacao;
      const objeto = c.meta.objeto;

      acertar(msDoDia(datas[0]));
      const proc = await engine.abrirProcesso(req, {
        tipoId: base.tipos.COMPRA, unidadeGestoraId: base.ugs["01"], assunto: c.assunto, descricao: c.meta.justificativa, urgencia: c.urgencia ?? "NORMAL", metadados: c.meta,
      });
      const id = proc.id;
      const carregar = async () => (await engine.carregarProcesso(base.municipioId, id))!;

      /** Junta o documento e colhe as assinaturas que as travas de qualquer etapa pedem para ele. */
      let dfdId = "";
      const juntar = async (autor: SessaoUsuario, tipoDoc: string, titulo: string, conteudo: string, assinantes: [SessaoUsuario, Papel][] = []) => {
        const d = await engine.juntarDocumento(autor, id, tipoDoc, titulo, conteudo);
        for (const [u, papel] of assinantes) await engine.assinarDocumento(u, d.id, papel);
        return d;
      };

      // Trabalho de cada etapa, na ordem em que acontece. Os ids servem para `atual` (trabalho já feito na etapa em que o processo para).
      const PASSOS: Record<string, [string, () => Promise<unknown>][]> = {
        DEMANDA: [["DFD", async () => {
          const d = await juntar(req, "DFD", `DFD — ${objeto}`,
            `DOCUMENTO DE FORMALIZAÇÃO DE DEMANDA\n\nObjeto: ${objeto}\nJustificativa: ${c.meta.justificativa}\nQuantidade: ${c.meta.quantidade}\nValor estimado: ${brl(c.meta.valorEstimado)}`,
            // parado na demanda: o DFD está juntado e ainda espera a assinatura
            c.ate === "DEMANDA" ? [] : [[req, papelReq]]);
          dfdId = d.id;
        }]],
        APROVACAO_SECRETARIO: [["DFD_SECRETARIO", async () => {
          // quem abre como secretário já assinou o DFD nesse papel
          if (papelReq !== "SECRETARIO") await engine.assinarDocumento(sec, dfdId, "SECRETARIO");
        }]],
        AUTUACAO: [["TERMO_AUTUACAO", () => juntar(protocolo, "TERMO_AUTUACAO", `Termo de autuação — ${proc.numero}`, `TERMO DE AUTUAÇÃO\n\nProcesso ${proc.numero}\nAssunto: ${c.assunto}\nDFD conferido e assinado pela secretaria.`)]],
        AUTORIZACAO: [["DESPACHO_AUTORIZACAO", () => juntar(prefeita, "DESPACHO_AUTORIZACAO", "Autorizo o prosseguimento", "Autorizo a instrução do processo pelo setor de compras.", [[prefeita, "ORDENADOR"]])]],
        INSTRUCAO: [
          ["MODALIDADE", () => engine.definirModalidade(compras, id, c.meta.modalidade, c.meta.modalidade === "LICITACAO"
            ? "Valor e natureza do objeto pedem disputa aberta entre os fornecedores (pregão eletrônico)."
            : "Contratação direta: valor dentro do limite de dispensa para a natureza do objeto no exercício.")],
          ["PESQUISA_PRECOS", () => engine.registrarPesquisaPrecos(compras, id, { fontes: [
            { fonte: "Painel de preços do governo federal", data: isoDe("INSTRUCAO"), valor: c.meta.valorEstimado },
            { fonte: "Contratação similar de município vizinho", data: isoDe("INSTRUCAO"), valor: Math.round(c.meta.valorEstimado * 1.06) },
            { fonte: "Cotação direta com fornecedor local", data: isoDe("INSTRUCAO"), valor: Math.round(c.meta.valorEstimado * 0.97) },
          ] })],
          ["ETP", () => juntar(compras, "ETP", `ETP — ${objeto}`, `ESTUDO TÉCNICO PRELIMINAR\n\nObjeto: ${objeto}\nNecessidade: ${c.meta.justificativa}\nSolução escolhida e mapa de riscos anexos.`)],
          ["TR", () => juntar(compras, "TR", `TR — ${objeto}`, `TERMO DE REFERÊNCIA\n\nObjeto: ${objeto}\nQuantidade: ${c.meta.quantidade}\nPrazo de entrega, garantia e forma de pagamento conforme minuta.`, [[sec, "SECRETARIO"]])],
        ],
        VERIFICACAO_ORCAMENTARIA: [["CERTIDAO_DOTACAO", () => juntar(contador, "CERTIDAO_DOTACAO", "Certidão de dotação", `Dotação indicada (órgão, ação, natureza e fonte) com saldo suficiente para ${brl(c.meta.valorEstimado)}.`)]],
        RESERVADO: [["NOTA_RESERVA", () => juntar(contador, "NOTA_RESERVA", "Nota de reserva", `Reserva de ${brl(c.meta.valorEstimado)} na dotação indicada.`)]],
        CONTROLE_INTERNO: [["CHECKLIST_CI", () => c.devolucao
          ? juntar(controladora, "CHECKLIST_CI", "Checklist do controle interno — não conforme", `Itens não conformes: ${c.devolucao.motivo}`, [[controladora, "CONTROLE_INTERNO"]])
          : juntar(controladora, "CHECKLIST_CI", "Checklist do controle interno", "ETP, TR, estimativa de preços, dotação e segregação de funções conferidos: conforme.", [[controladora, "CONTROLE_INTERNO"]])]],
        PARECER_JURIDICO: [["PARECER_JURIDICO", () => juntar(procurador, "PARECER_JURIDICO", "Parecer jurídico", `Parecer favorável à ${c.meta.modalidade === "LICITACAO" ? "licitação e à minuta do edital" : "contratação direta"} (Lei 14.133, art. 53).`, [[procurador, "JURIDICO"]])]],
        PUBLICACAO_EDITAL: [
          ["EDITAL", () => juntar(compras, "EDITAL", `Edital — ${objeto}`, `EDITAL DE PREGÃO ELETRÔNICO\n\nObjeto: ${objeto}\nCritério: menor preço.`)],
          ["PUBLICAR_EDITAL", async () => {
            const publicadoEm = isoDe("PUBLICACAO_EDITAL");
            const aberturaEm = isoDe("SESSAO_DISPUTA");
            if (aberturaEm < regras.aberturaMinima(publicadoEm, "BENS_MENOR_PRECO", fer)) throw new Error(`${c.assunto}: sessão cedo demais para o prazo do edital.`);
            await engine.publicarEdital(compras, id, { numero: `Pregão Eletrônico ${proc.sequencial}/${proc.ano}`, tipoObjeto: "BENS_MENOR_PRECO", publicadoEm, aberturaEm, plataforma: "Portal Nacional de Contratações Públicas" });
          }],
        ],
        SESSAO_DISPUTA: [
          ["ATA_SESSAO", () => juntar(compras, "ATA_SESSAO", "Ata da sessão pública", `Sessão realizada na plataforma eletrônica. Vencedor: ${ct?.fornecedor}. Proposta aceita e licitante habilitado.`)],
          ["RESULTADO", () => engine.registrarResultadoSessao(compras, id, { situacao: "VENCEDOR", fornecedor: ct!.fornecedor, cnpj: ct!.cnpj, valor: Number(ct!.valor), ataEm: isoDe("SESSAO_DISPUTA") })],
        ],
        HOMOLOGADO: [["TERMO_HOMOLOGACAO", () => juntar(prefeita, "TERMO_HOMOLOGACAO", "Termo de adjudicação e homologação", `Adjudico o objeto e homologo o resultado em favor de ${ct?.fornecedor}.`, [[prefeita, "ORDENADOR"]])]],
        INSTRUCAO_DIRETA: [
          ["AVISO", () => engine.publicarAvisoDispensa(compras, id, { publicadoEm: isoDe("INSTRUCAO_DIRETA") })],
          ["CONTRATACAO", () => engine.registrarContratacao(compras, id, ct!)],
        ],
        AUTORIZACAO_DIRETA: [["ATO_AUTORIZACAO_DIRETA", () => juntar(prefeita, "ATO_AUTORIZACAO_DIRETA", "Ato de autorização da contratação direta", `Autorizo a contratação direta de ${ct?.fornecedor}, nos termos do parecer jurídico. Publique-se no site oficial.`, [[prefeita, "ORDENADOR"]])]],
        EMPENHADO: [["NOTA_EMPENHO", () => juntar(contador, "NOTA_EMPENHO", "Nota de empenho", `Empenho de ${brl(Number(ct?.valor ?? c.meta.valorEstimado))} em nome de ${ct?.fornecedor}.`, [[contador, "CONTABILIDADE"], [prefeita, "ORDENADOR"]])]],
        CONTRATADO: [
          ...(c.meta.modalidade === "LICITACAO" ? [["CONTRATACAO", () => engine.registrarContratacao(compras, id, ct!)] as [string, () => Promise<unknown>]] : []),
          ["CONTRATO", () => juntar(compras, "CONTRATO", `Contrato — ${objeto}`, `Contrato com ${ct?.fornecedor} para ${objeto.toLowerCase()}.`, [[prefeita, "ORDENADOR"]])],
          ["PORTARIA_FISCAL", () => juntar(compras, "PORTARIA_FISCAL", "Portaria de gestor e fiscal", `Designa ${fiscal.nome} como fiscal do contrato, com suplente.`)],
          ["PUBLICACAO_PNCP", () => juntar(compras, "PUBLICACAO_PNCP", "Publicação no PNCP", "Extrato do contrato publicado no PNCP (simulado).")],
          ...(c.remessa ? [["REMESSA", () => engine.registrarRemessaTce(compras, id, `${proc.ano}.${String(proc.sequencial).padStart(4, "0")}.${(proc.sequencial * 37) % 97}`)] as [string, () => Promise<unknown>]] : []),
        ],
        EXECUCAO: [
          ["ORDEM_FORNECIMENTO", () => juntar(compras, "ORDEM_FORNECIMENTO", "Ordem de fornecimento", `Execute-se o fornecimento nos termos do contrato com ${ct?.fornecedor}.`)],
          ["ENVIO_FISCAL", async () => {
            await engine.tramitar(compras, id, base.setores[sigla], "Ao fiscal do contrato para acompanhar a execução.");
            await engine.receber(fiscal, id);
          }],
          ["NOTA_FISCAL", () => juntar(fiscal, "NOTA_FISCAL", "Nota fiscal", `Nota fiscal de ${ct?.fornecedor} no valor de ${brl(Number(ct?.valor))}.`)],
          ["ATESTO", () => juntar(fiscal, "ATESTO", "Atesto do fiscal", "Recebido e conferido conforme o contrato.", [[fiscal, "FISCAL"]])],
          ["CERTIDOES", () => juntar(fiscal, "CERTIDOES", "Certidões de regularidade", "Certidões federal, estadual, municipal, FGTS e trabalhista vigentes.")],
        ],
        LIQUIDADO: [["NOTA_LIQUIDACAO", () => juntar(contador, "NOTA_LIQUIDACAO", "Nota de liquidação", "Direito do credor verificado (Lei 4.320, art. 63).", [[prefeita, "ORDENADOR"]])]],
        FILA_PAGAMENTO: [["ORDEM_PAGAMENTO", () => juntar(tesouraria, "ORDEM_PAGAMENTO", "Ordem de pagamento", `Pague-se a ${ct?.fornecedor}.`, [[prefeita, "ORDENADOR"], [tesouraria, "TESOURARIA"]])]],
        PAGO: [["COMPROVANTE_PAGAMENTO", () => juntar(tesouraria, "COMPROVANTE_PAGAMENTO", "Comprovante de pagamento", "Crédito confirmado na conta do fornecedor.")]],
      };
      const ATOR: Record<string, SessaoUsuario> = {
        DEMANDA: req, APROVACAO_SECRETARIO: sec, AUTUACAO: protocolo, AUTORIZACAO: prefeita, HOMOLOGADO: prefeita, AUTORIZACAO_DIRETA: prefeita,
        VERIFICACAO_ORCAMENTARIA: contador, RESERVADO: contador, EMPENHADO: contador, LIQUIDADO: contador, CONTROLE_INTERNO: controladora, PARECER_JURIDICO: procurador,
        EXECUCAO: fiscal, FILA_PAGAMENTO: tesouraria, PAGAMENTO_ENVIADO: tesouraria, PAGO: tesouraria, ARQUIVADO: protocolo,
      };
      const ator = (e: string) => ATOR[e] ?? compras;

      for (let i = 0; i < caminho.length; i++) {
        const e = caminho[i];
        etapa = e;
        const final = i === caminho.length - 1;
        if (i > 0) {
          irPara(msDoDia(isoDe(e)));
          const de = caminho[i - 1];
          if (de === "PAGAMENTO_ENVIADO") await engine.registrarRetornoBancario(tesouraria, id, { aceito: true, autenticacao: `Autenticação ${proc.sequencial}${(proc.sequencial * 7919) % 100000}` });
          else await engine.avancar(ator(de), id, e, de === "FILA_PAGAMENTO" && c.quebra ? c.quebra : undefined);
        }
        if (final && c.recebido === false) break;
        await engine.receber(ator(e), id); // não faz nada se a etapa já chegou recebida (mesmo setor)
        for (const [passo, fazer] of PASSOS[e] ?? []) if (!final || c.atual?.includes(passo)) await fazer();
      }
      if (c.devolucao) {
        irPara(msDoDia(devolucaoEm!));
        await engine.devolver(ator(c.ate), id, c.devolucao.para, c.devolucao.motivo);
        await engine.receber(ator(c.devolucao.para), id);
      }
      if (c.quebra) {
        const p = await carregar();
        if (!p.eventos.some((ev) => (ev.dados as { quebraOrdem?: unknown } | null)?.quebraOrdem)) throw new Error(`${c.assunto}: o pagamento deveria ter saído fora da ordem cronológica.`);
      }
    }
  } catch (e) {
    throw new Error(`Demonstração: "${assunto}" na etapa ${etapa}: ${(e as Error).message}`, { cause: e });
  } finally {
    voltarAoPresente();
  }
}

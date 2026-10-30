// Avaliador de regras de automação "quando X então Y" — função pura, sem banco nem relógio próprio.
// Recebe a regra, a fotografia dos processos e a hora de referência; devolve os disparos.
// Quem aplica os disparos (alerta, sugestão ou encaminhamento pelo motor) é o executor em automacoes.ts.

export type Gatilho = "PROCESSO_PARADO" | "PALAVRA_CHAVE" | "EXIGENCIA_SEM_RESPOSTA";
export type TipoAcao = "ALERTA" | "ENCAMINHAR";
export type Nivel = "INFORMAR" | "SUGERIR" | "EXECUTAR";
export type Gravidade = "ALTA" | "MEDIA" | "BAIXA";

export type ParamParado = { dias: number; setorSigla?: string | null };
export type ParamPalavra = { palavras: string[]; somenteNovos?: boolean };
export type ParamExigencia = { diasTolerancia: number };
export type ParamAlerta = { gravidade: Gravidade };
export type ParamEncaminhar = { setorSigla: string; despacho?: string };

export type RegraAvaliavel = {
  id: string;
  nome: string;
  gatilho: Gatilho;
  parametros: ParamParado | ParamPalavra | ParamExigencia;
  acao: TipoAcao;
  acaoParametros: ParamAlerta | ParamEncaminhar;
  nivel: Nivel;
};

export type FotoProcesso = {
  id: string;
  numero: string;
  assunto: string;
  descricao: string | null;
  tipoChave: string;
  estadoAtual: string;
  /** primeiro avanço do estado atual leva a um estado de tramitação livre? (requerimento protocolado) */
  aguardandoDistribuicao: boolean;
  setorSigla: string | null;
  setorNome: string | null;
  encerrado: boolean;
  /** última movimentação de setor ou etapa (ou recebimento) */
  ultimaMovimentacao: Date;
  exigencia: { texto: string; prazo: Date } | null;
};

export type Disparo = {
  processoId: string;
  numero: string;
  motivo: string;
  acao: TipoAcao;
  gravidade: Gravidade;
  titulo: string;
  setorDestino?: string;
  despacho?: string;
};

const DIA = 86400_000;

/** Normaliza para comparar palavras sem acento nem caixa. */
export function normalizar(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** Quais processos disparam a regra agora. */
export function avaliarRegra(regra: RegraAvaliavel, fotos: FotoProcesso[], agora: Date): { avaliados: number; disparos: Disparo[] } {
  const abertos = fotos.filter((p) => !p.encerrado);
  const disparos: Disparo[] = [];
  const gravidade: Gravidade = regra.acao === "ALERTA" ? ((regra.acaoParametros as ParamAlerta).gravidade ?? "MEDIA") : "MEDIA";

  const emitir = (p: FotoProcesso, motivo: string, titulo: string) => {
    if (regra.acao === "ENCAMINHAR") {
      const ap = regra.acaoParametros as ParamEncaminhar;
      if (p.setorSigla === ap.setorSigla) return; // já está lá
      disparos.push({ processoId: p.id, numero: p.numero, motivo, acao: "ENCAMINHAR", gravidade, titulo, setorDestino: ap.setorSigla, despacho: ap.despacho });
    } else {
      disparos.push({ processoId: p.id, numero: p.numero, motivo, acao: "ALERTA", gravidade, titulo });
    }
  };

  if (regra.gatilho === "PROCESSO_PARADO") {
    const prm = regra.parametros as ParamParado;
    const alvo = abertos.filter((p) => !prm.setorSigla || p.setorSigla === prm.setorSigla);
    for (const p of alvo) {
      const dias = Math.floor((agora.getTime() - p.ultimaMovimentacao.getTime()) / DIA);
      if (dias >= prm.dias)
        emitir(p, `Sem movimentação há ${plural(dias, "dia", "dias")} em ${p.setorNome ?? "setor não definido"} (limite da regra: ${prm.dias}).`, `${p.numero} parado há ${dias} dias`);
    }
    return { avaliados: alvo.length, disparos };
  }

  if (regra.gatilho === "PALAVRA_CHAVE") {
    const prm = regra.parametros as ParamPalavra;
    const palavras = prm.palavras.map((w) => normalizar(w.trim())).filter(Boolean);
    const alvo = abertos.filter((p) => p.tipoChave === "REQUERIMENTO" && (!prm.somenteNovos || p.aguardandoDistribuicao));
    for (const p of alvo) {
      const texto = normalizar(`${p.assunto} ${p.descricao ?? ""}`);
      const achou = palavras.filter((w) => new RegExp(`(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(texto));
      if (achou.length) emitir(p, `O pedido menciona: ${achou.join(", ")}.`, `${p.numero}: ${p.assunto}`);
    }
    return { avaliados: alvo.length, disparos };
  }

  if (regra.gatilho === "EXIGENCIA_SEM_RESPOSTA") {
    const prm = regra.parametros as ParamExigencia;
    const alvo = abertos.filter((p) => p.exigencia);
    for (const p of alvo) {
      const atraso = Math.floor((agora.getTime() - p.exigencia!.prazo.getTime()) / DIA);
      if (atraso >= (prm.diasTolerancia ?? 0) && agora.getTime() > p.exigencia!.prazo.getTime())
        emitir(
          p,
          `Exigência sem resposta: prazo venceu ${atraso <= 0 ? "hoje" : `há ${plural(atraso, "dia", "dias")}`}. Pedido: "${p.exigencia!.texto}"`,
          `${p.numero}: interessado não respondeu à exigência`,
        );
    }
    return { avaliados: alvo.length, disparos };
  }

  return { avaliados: 0, disparos };
}

/** Frase "quando X então Y" para exibir a regra. */
export function descreverRegra(r: Pick<RegraAvaliavel, "gatilho" | "parametros" | "acao" | "acaoParametros" | "nivel">, nomeSetor: (sigla: string) => string): {
  quando: string;
  entao: string;
} {
  let quando = "";
  if (r.gatilho === "PROCESSO_PARADO") {
    const p = r.parametros as ParamParado;
    quando = `um processo ficar ${plural(p.dias, "dia", "dias")} sem movimentação${p.setorSigla ? ` em ${nomeSetor(p.setorSigla)}` : " em qualquer setor"}`;
  } else if (r.gatilho === "PALAVRA_CHAVE") {
    const p = r.parametros as ParamPalavra;
    quando = `um requerimento${p.somenteNovos ? " recém-protocolado" : ""} mencionar ${p.palavras.map((w) => `"${w}"`).join(", ")}`;
  } else {
    const p = r.parametros as ParamExigencia;
    quando = `o interessado não responder a uma exigência${p.diasTolerancia ? ` até ${plural(p.diasTolerancia, "dia", "dias")} depois do prazo` : " no prazo"}`;
  }
  let entao = "";
  if (r.acao === "ENCAMINHAR") {
    const a = r.acaoParametros as ParamEncaminhar;
    entao = r.nivel === "EXECUTAR" ? `encaminhar a ${nomeSetor(a.setorSigla)}` : `sugerir o encaminhamento a ${nomeSetor(a.setorSigla)}`;
  } else {
    const a = r.acaoParametros as ParamAlerta;
    entao = `gerar alerta de gravidade ${GRAVIDADE_ROTULO[a.gravidade].toLowerCase()}`;
  }
  return { quando, entao };
}

export const GRAVIDADE_ROTULO: Record<Gravidade, string> = { ALTA: "Alta", MEDIA: "Média", BAIXA: "Baixa" };
export const NIVEL_ROTULO: Record<Nivel, string> = { INFORMAR: "Informar", SUGERIR: "Sugerir", EXECUTAR: "Executar" };
export const GATILHO_ROTULO: Record<Gatilho, string> = {
  PROCESSO_PARADO: "Processo parado no setor",
  PALAVRA_CHAVE: "Requerimento com palavra-chave",
  EXIGENCIA_SEM_RESPOSTA: "Exigência sem resposta",
};

// Dados de demonstração das funções de conformidade (limite de dispensa, fila cronológica, obrigações).
// Gera SQL a partir dos ids do banco de destino, para valer igual no banco local e no de produção.
// É idempotente: pula processos que já existem e eventos já registrados.
import { createHash } from "crypto";
import { WORKFLOW_COMPRA } from "../lib/workflow";

export type IdsValor = {
  municipioId: string;
  ugs: Record<string, string>;
  tipos: Record<string, string>;
  setores: Record<string, string>;
  usuarios: Record<string, string>;
  maxSeq: number;
  ano: number;
  processos: { id: string; assunto: string; numero: string; lastSeq: number | null; lastHash: string | null; hasRemessa: boolean; hasContratacao: boolean }[] | null;
};

/** Consulta que devolve os ids no formato de IdsValor (coluna "ids"). */
export const SQL_IDS = `select json_build_object(
  'municipioId', m.id,
  'ugs', (select json_object_agg(codigo, id) from tramite.unidades_gestoras where municipio_id = m.id),
  'tipos', (select json_object_agg(chave, id) from tramite.tipos_processo where municipio_id = m.id),
  'setores', (select json_object_agg(sigla, id) from tramite.setores where municipio_id = m.id),
  'usuarios', (select json_object_agg(cpf, id) from tramite.usuarios where municipio_id = m.id),
  'maxSeq', (select coalesce(max(sequencial), 0) from tramite.processos where municipio_id = m.id and ano = extract(year from now())::int),
  'ano', extract(year from now())::int,
  'processos', (select json_agg(json_build_object(
      'id', p.id, 'assunto', p.assunto, 'numero', p.numero,
      'lastSeq', (select max(seq) from tramite.eventos e where e.processo_id = p.id),
      'lastHash', (select hash from tramite.eventos e where e.processo_id = p.id order by seq desc limit 1),
      'hasRemessa', exists(select 1 from tramite.eventos e where e.processo_id = p.id and e.tipo = 'REMESSA_TCE'),
      'hasContratacao', coalesce(p.metadados ? 'contratacao', false)))
    from tramite.processos p where p.municipio_id = m.id)
) as ids from tramite.municipios m where m.slug = 'sao-benedito-do-norte'`;

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
function canon(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
  const o = v as Record<string, unknown>;
  return (
    "{" +
    Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => JSON.stringify(k) + ":" + canon(o[k]))
      .join(",") +
    "}"
  );
}
const lit = (v: string | null | undefined) => (v == null ? "null" : `'${v.replace(/'/g, "''")}'`);
const json = (v: unknown) => `${lit(JSON.stringify(v))}::jsonb`;
const ts = (d: Date) => lit(d.toISOString());

/** CNPJ fictício com dígitos verificadores válidos. */
function cnpj(base12: string) {
  const calc = (b: string) => {
    const pesos = b.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const r = b.split("").reduce((a, n, i) => a + Number(n) * pesos[i], 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = calc(base12);
  return base12 + d1 + calc(base12 + d1);
}

type Ev = { tipo: string; autor: string; quando: Date; deEstado?: string; paraEstado?: string; deSetor?: string; paraSetor?: string; dados?: unknown };

export function gerarSqlValor(ids: IdsValor): string {
  const out: string[] = [];
  const agora = Date.now();
  const dia = (n: number) => new Date(agora - n * 86400_000);
  const S = (sigla: string) => ids.setores[sigla];
  const U = (cpf: string) => ids.usuarios[cpf];
  const existentes = new Map((ids.processos ?? []).map((p) => [p.assunto, p]));
  const ug = ids.ugs["01"];

  // 1. Fluxo de compra atualizado (natureza, forma de contratação, dados da contratação, fila cronológica)
  out.push(`update tramite.tipos_processo set definicao = ${json(WORKFLOW_COMPRA)} where municipio_id = ${lit(ids.municipioId)} and chave = 'COMPRA';`);

  // 2. Natureza e forma de contratação nos processos de exemplo que já existem
  const classif: [string, string, string][] = [
    ["Aquisição de medicamentos básicos para as UBS", "MEDICAMENTOS", "LICITACAO"],
    ["Contratação de serviço de transporte escolar — rota rural", "TRANSPORTE", "LICITACAO"],
    ["Reforma da cobertura da Escola Municipal Padre Cícero", "SERVICO_ENGENHARIA", "DISPENSA_VALOR"],
    ["Aquisição de gêneros alimentícios — merenda escolar", "GENEROS_ALIMENTICIOS", "LICITACAO"],
    ["Material de expediente para a Secretaria de Administração", "MATERIAL_EXPEDIENTE", "DISPENSA_VALOR"],
    ["Aquisição de 2 ar-condicionados para a UBS Centro", "EQUIPAMENTOS", "DISPENSA_VALOR"],
  ];
  for (const [assunto, natureza, modalidade] of classif) {
    out.push(
      `update tramite.processos set metadados = coalesce(metadados, '{}'::jsonb) || ${json({ natureza, modalidade })} where municipio_id = ${lit(ids.municipioId)} and assunto = ${lit(assunto)} and not (coalesce(metadados, '{}'::jsonb) ? 'natureza');`,
    );
  }

  const insertEvento = (processoId: string, seq: number, anterior: string | null, e: Ev) => {
    const norm: Record<string, unknown> = {};
    if (e.deEstado) norm.deEstado = e.deEstado;
    if (e.paraEstado) norm.paraEstado = e.paraEstado;
    if (e.deSetor) norm.deSetorId = e.deSetor;
    if (e.paraSetor) norm.paraSetorId = e.paraSetor;
    if (e.dados != null) norm.dados = e.dados;
    const corpo = canon({ processoId, seq, tipo: e.tipo, autorId: e.autor, ...norm, criadoEm: e.quando.toISOString() });
    const hash = sha((anterior ?? "") + corpo);
    out.push(
      `insert into tramite.eventos (processo_id, seq, tipo, autor_id, de_estado, para_estado, de_setor_id, para_setor_id, dados, hash_anterior, hash, criado_em) values (${lit(processoId)}, ${seq}, ${lit(e.tipo)}, ${lit(e.autor)}, ${lit(e.deEstado)}, ${lit(e.paraEstado)}, ${lit(e.deSetor)}, ${lit(e.paraSetor)}, ${e.dados != null ? json(e.dados) : "null"}, ${lit(anterior)}, ${lit(hash)}, ${ts(e.quando)});`,
    );
    return hash;
  };

  // 3. Eventos acrescentados a processos existentes (encadeados ao último hash real)
  const acrescentar = (assunto: string, evs: (p: NonNullable<ReturnType<typeof existentes.get>>) => Ev[], metaExtra?: Record<string, unknown>) => {
    const p = existentes.get(assunto);
    if (!p || p.hasContratacao) return;
    let seq = p.lastSeq ?? 0;
    let h = p.lastHash;
    for (const e of evs(p)) h = insertEvento(p.id, ++seq, h, e);
    if (metaExtra) out.push(`update tramite.processos set metadados = coalesce(metadados, '{}'::jsonb) || ${json(metaExtra)} where id = ${lit(p.id)};`);
  };
  const ctMerenda = { fornecedor: "Cooperativa Agricultura Familiar do Vale Ltda", cnpj: cnpj("234561780001"), valor: "298400.00", fonte: "EDUCACAO" };
  acrescentar("Aquisição de gêneros alimentícios — merenda escolar", () => [{ tipo: "DADOS_CONTRATACAO", autor: U("33333333333"), quando: dia(57), dados: ctMerenda }], { contratacao: ctMerenda });
  const ctExped = { fornecedor: "Papelaria Central do Norte Ltda", cnpj: cnpj("112223330001"), valor: "23800.00", fonte: "ORDINARIOS" };
  acrescentar(
    "Material de expediente para a Secretaria de Administração",
    () => [
      { tipo: "DADOS_CONTRATACAO", autor: U("33333333333"), quando: dia(73), dados: ctExped },
      { tipo: "REMESSA_TCE", autor: U("33333333333"), quando: dia(73), dados: { sistema: "sistema do TCE-CE", recibo: "2026.0412.88" } },
    ],
    { contratacao: ctExped },
  );

  // 4. Processos novos de exemplo
  let seqNum = ids.maxSeq;
  const caminho = ["DEMANDA", "AUTORIZACAO", "INSTRUCAO", "VERIFICACAO_ORCAMENTARIA", "RESERVADO", "CONTROLE_INTERNO", "PARECER_JURIDICO", "CONTRATACAO", "HOMOLOGADO", "CONTRATADO", "EMPENHADO", "EXECUCAO", "LIQUIDADO", "FILA_PAGAMENTO", "PAGO", "ARQUIVADO"];
  const setorDe: Record<string, string | null> = {
    DEMANDA: null, AUTORIZACAO: "GAB", INSTRUCAO: "COMPRAS", VERIFICACAO_ORCAMENTARIA: "CONTAB", RESERVADO: "CONTAB", CONTROLE_INTERNO: "CGM",
    PARECER_JURIDICO: "PGM", CONTRATACAO: "COMPRAS", HOMOLOGADO: "GAB", CONTRATADO: "COMPRAS", EMPENHADO: "CONTAB", EXECUCAO: null,
    LIQUIDADO: "CONTAB", FILA_PAGAMENTO: "TES", PAGO: "TES", ARQUIVADO: "PROT",
  };

  type Novo = {
    assunto: string;
    req: string;
    setorReq: string;
    meta: Record<string, unknown>;
    ate: string;
    /** dias atrás em que entrou em cada estado do caminho, do primeiro até `ate` */
    datas: number[];
    contratacao?: { fornecedor: string; cnpj: string; valor: string; fonte: string };
    quebra?: { aFrente: string[]; justificativa: string };
    docs?: [string, string, string, number][];
    remessa?: boolean;
  };

  const novos: Novo[] = [];
  const numeroDe = new Map<string, string>();
  const reservarNumero = (assunto: string) => {
    const ex = existentes.get(assunto);
    if (ex) return ex.numero;
    if (!numeroDe.has(assunto)) numeroDe.set(assunto, `${ids.ano}/${String(++seqNum).padStart(6, "0")}`);
    return numeroDe.get(assunto)!;
  };
  const base = (objeto: string, valor: number, natureza: string, modalidade: string, prioridade = "MEDIA") => ({
    objeto,
    natureza,
    modalidade,
    justificativa: "Demanda prevista no planejamento da secretaria.",
    quantidade: "conforme termo de referência",
    valorEstimado: valor,
    dataPretendida: `${ids.ano}-12-15`,
    prioridade,
    noPCA: "SIM",
  });
  const datasAte = (estado: string, inicio: number, fim: number) => {
    const n = caminho.indexOf(estado) + 1;
    return Array.from({ length: n }, (_, i) => Math.round(inicio - ((inicio - fim) * i) / Math.max(1, n - 1)));
  };

  // limite de dispensa: material de expediente fica perto do limite
  novos.push({
    assunto: "Material de expediente para as escolas municipais",
    req: "10101010101",
    setorReq: "SEDUC",
    meta: base("Papel, cartolina e material de escritório para 9 escolas", 21400, "MATERIAL_EXPEDIENTE", "DISPENSA_VALOR"),
    ate: "ARQUIVADO",
    datas: datasAte("ARQUIVADO", 110, 40),
    contratacao: { fornecedor: "Papelaria Central do Norte Ltda", cnpj: cnpj("112223330001"), valor: "21400.00", fonte: "EDUCACAO" },
    remessa: true,
  });
  novos.push({
    assunto: "Material de expediente para as UBS",
    req: "99999999999",
    setorReq: "SESAU",
    meta: base("Material de escritório para 4 UBS", 14900, "MATERIAL_EXPEDIENTE", "DISPENSA_VALOR"),
    ate: "EXECUCAO",
    datas: datasAte("EXECUCAO", 45, 6),
    contratacao: { fornecedor: "Papelaria Central do Norte Ltda", cnpj: cnpj("112223330001"), valor: "14900.00", fonte: "SAUDE" },
    remessa: true,
  });

  // fila cronológica
  const nBombas = reservarNumero("Manutenção corretiva das bombas do poço do Sítio Lagoa");
  novos.push({
    assunto: "Manutenção corretiva das bombas do poço do Sítio Lagoa",
    req: "12121212121",
    setorReq: "SEMAD",
    meta: base("Troca de rotor e quadro de comando de 2 bombas", 18750, "SERVICOS_GERAIS", "DISPENSA_VALOR", "ALTA"),
    ate: "FILA_PAGAMENTO",
    datas: datasAte("FILA_PAGAMENTO", 70, 16),
    contratacao: { fornecedor: "Hidrobombas Sertão Ltda", cnpj: cnpj("458712300001"), valor: "18750.00", fonte: "ORDINARIOS" },
    remessa: true,
  });
  novos.push({
    assunto: "Aquisição de luvas e máscaras para as UBS",
    req: "99999999999",
    setorReq: "SESAU",
    meta: base("Luvas de procedimento e máscaras cirúrgicas", 42300, "MEDICAMENTOS", "LICITACAO"),
    ate: "FILA_PAGAMENTO",
    datas: datasAte("FILA_PAGAMENTO", 95, 9),
    contratacao: { fornecedor: "Distribuidora Médica Cariri Ltda", cnpj: cnpj("307755410001"), valor: "41890.00", fonte: "SAUDE" },
    remessa: true,
  });
  novos.push({
    assunto: "Recarga de oxigênio medicinal para o Hospital Municipal",
    req: "88888888888",
    setorReq: "SESAU",
    meta: base("Recarga de 40 cilindros de oxigênio medicinal", 9600, "MEDICAMENTOS", "DISPENSA_VALOR", "ALTA"),
    ate: "FILA_PAGAMENTO",
    datas: datasAte("FILA_PAGAMENTO", 30, 4),
    contratacao: { fornecedor: "Oxigênio Nordeste Ltda", cnpj: cnpj("612098770001"), valor: "9600.00", fonte: "SAUDE" },
  });
  novos.push({
    assunto: "Combustível para a frota da Saúde",
    req: "88888888888",
    setorReq: "SESAU",
    meta: base("Gasolina e diesel para 6 veículos da Saúde", 96000, "COMBUSTIVEIS", "LICITACAO"),
    ate: "FILA_PAGAMENTO",
    datas: datasAte("FILA_PAGAMENTO", 120, 2),
    contratacao: { fornecedor: "Posto Avenida Ltda", cnpj: cnpj("771234560001"), valor: "94380.00", fonte: "SAUDE" },
    remessa: true,
  });
  // pagamento fora da ordem, com justificativa pública
  novos.push({
    assunto: "Conserto emergencial da ambulância do Distrito de Lagoa Seca",
    req: "88888888888",
    setorReq: "SESAU",
    meta: base("Troca de embreagem e revisão da ambulância", 6400, "SERVICOS_GERAIS", "DISPENSA_VALOR", "ALTA"),
    ate: "ARQUIVADO",
    datas: datasAte("ARQUIVADO", 28, 9),
    contratacao: { fornecedor: "Auto Mecânica São José Ltda", cnpj: cnpj("554433220001"), valor: "6400.00", fonte: "ORDINARIOS" },
    quebra: {
      aFrente: [nBombas],
      justificativa:
        "Única ambulância do distrito parada. A oficina só libera o veículo após o pagamento e não há outro veículo para remoção de pacientes. Autorizado pela Prefeita.",
    },
    remessa: true,
  });
  // obrigações: contratos aguardando publicação no PNCP
  novos.push({
    assunto: "Serviço de dedetização dos prédios públicos",
    req: "12121212121",
    setorReq: "SEMAD",
    meta: base("Dedetização e desratização de 14 prédios", 12800, "SERVICOS_GERAIS", "DISPENSA_VALOR"),
    ate: "CONTRATADO",
    datas: datasAte("CONTRATADO", 50, 22),
    contratacao: { fornecedor: "Dedetizadora Limpa Mais Ltda", cnpj: cnpj("663399880001"), valor: "12650.00", fonte: "ORDINARIOS" },
    docs: [["CONTRATO", "Contrato 041/2026 — dedetização", "Contrato de prestação de serviço de dedetização e desratização, 12 meses.", 20]],
  });
  novos.push({
    assunto: "Aquisição de mobiliário para a Escola Padre Cícero",
    req: "10101010101",
    setorReq: "SEDUC",
    meta: base("Carteiras, mesas e armários para 6 salas", 74000, "EQUIPAMENTOS", "LICITACAO"),
    ate: "CONTRATADO",
    datas: datasAte("CONTRATADO", 80, 6),
    docs: [["CONTRATO", "Contrato 044/2026 — mobiliário escolar", "Contrato de fornecimento de mobiliário escolar, entrega em 30 dias.", 5]],
  });

  for (const n of novos) {
    if (existentes.has(n.assunto)) continue;
    const numero = reservarNumero(n.assunto);
    const sequencial = Number(numero.split("/")[1]);
    const id = createHash("md5").update(ids.municipioId + numero + n.assunto).digest("hex").replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");
    const estados = caminho.slice(0, caminho.indexOf(n.ate) + 1);
    const setorEstado = (e: string) => S(setorDe[e] ?? n.setorReq);
    const final = n.ate === "ARQUIVADO";
    const meta = { ...n.meta, ...(n.contratacao ? { contratacao: n.contratacao } : {}) };
    out.push(
      `insert into tramite.processos (id, municipio_id, unidade_gestora_id, tipo_id, ano, sequencial, numero, assunto, descricao, urgencia, estado_atual, setor_atual_id, recebido_em, prazo_etapa_em, aberto_por_id, aberto_em, encerrado_em, metadados) values (${lit(id)}, ${lit(ids.municipioId)}, ${lit(ug)}, ${lit(ids.tipos.COMPRA)}, ${ids.ano}, ${sequencial}, ${lit(numero)}, ${lit(n.assunto)}, ${lit(String(n.meta.justificativa))}, ${lit(n.meta.prioridade === "ALTA" ? "PRIORITARIO" : "NORMAL")}, ${lit(n.ate)}, ${lit(setorEstado(n.ate))}, ${ts(dia(n.datas.at(-1)!))}, ${final ? "null" : ts(new Date(agora + 6 * 86400_000))}, ${lit(U(n.req))}, ${ts(dia(n.datas[0]))}, ${final ? ts(dia(n.datas.at(-1)!)) : "null"}, ${json(meta)});`,
    );
    const evs: Ev[] = [];
    estados.forEach((e, i) => {
      const anterior = estados[i - 1];
      const ehPago = e === "PAGO";
      evs.push({
        tipo: i === 0 ? "ABERTURA" : e === "ARQUIVADO" ? "ENCERRAMENTO" : "MUDANCA_ESTADO",
        autor: U(ehPago || e === "ARQUIVADO" ? "77777777777" : n.req),
        quando: dia(n.datas[i]),
        deEstado: anterior,
        paraEstado: e,
        deSetor: anterior ? setorEstado(anterior) : undefined,
        paraSetor: setorEstado(e),
        dados:
          i === 0
            ? { numero, tipo: "COMPRA" }
            : ehPago && n.quebra
              ? { rotulo: "Registrar pagamento", despacho: n.quebra.justificativa, quebraOrdem: n.quebra }
              : { rotulo: "Avanço" },
      });
      if (e === "CONTRATADO" && n.contratacao) {
        evs.push({ tipo: "DADOS_CONTRATACAO", autor: U("33333333333"), quando: new Date(dia(n.datas[i]).getTime() + 3600_000), dados: n.contratacao });
        if (n.remessa)
          evs.push({
            tipo: "REMESSA_TCE",
            autor: U("33333333333"),
            quando: new Date(dia(n.datas[i]).getTime() + 2 * 3600_000),
            dados: { sistema: "sistema do TCE-CE", recibo: `2026.${String(sequencial).padStart(4, "0")}.${(sequencial * 37) % 97}` },
          });
      }
    });
    let h: string | null = null;
    evs.forEach((e, i) => (h = insertEvento(id, i + 1, h, e)));
    for (const [tipo, titulo, conteudo, diasAtras] of n.docs ?? []) {
      out.push(
        `insert into tramite.documentos (processo_id, tipo, titulo, conteudo, hash, criado_por_id, criado_em) values (${lit(id)}, ${lit(tipo)}, ${lit(titulo)}, ${lit(conteudo)}, ${lit(sha(conteudo))}, ${lit(U("33333333333"))}, ${ts(dia(diasAtras))});`,
      );
    }
  }
  return out.join("\n");
}

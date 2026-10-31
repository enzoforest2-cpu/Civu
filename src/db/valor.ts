// Dados de demonstração das funções de conformidade (limite de dispensa, fila cronológica, obrigações).
// Os processos de compra que alimentam essas funções (COMPRAS_CONFORMIDADE) são criados pelo motor no seed
// (src/db/demo/compras.ts), com todos os documentos e assinaturas de cada etapa por que passaram.
// gerarSqlValor só atualiza o fluxo de compra gravado no banco de destino (idempotente).
import { WORKFLOW_COMPRA } from "../lib/workflow";
import type { CompraDemo } from "./demo/compras";

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
) as ids from tramite.municipios m where m.slug = 'vale-das-araucarias'`;

const lit = (v: string | null | undefined) => (v == null ? "null" : `'${v.replace(/'/g, "''")}'`);
const json = (v: unknown) => `${lit(JSON.stringify(v))}::jsonb`;

/** CNPJ fictício com dígitos verificadores válidos. */
export function cnpj(base12: string) {
  const calc = (b: string) => {
    const pesos = b.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const r = b.split("").reduce((a, n, i) => a + Number(n) * pesos[i], 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = calc(base12);
  return base12 + d1 + calc(base12 + d1);
}

export function gerarSqlValor(ids: IdsValor): string {
  // Fluxo de compra atualizado (natureza, forma de contratação, dados da contratação, fila cronológica)
  return `update tramite.tipos_processo set definicao = ${json(WORKFLOW_COMPRA)} where municipio_id = ${lit(ids.municipioId)} and chave = 'COMPRA';`;
}

const base = (ano: number, objeto: string, valor: number, natureza: string, modalidade: "LICITACAO" | "DISPENSA_VALOR" | "OUTRA_DIRETA", prioridade = "MEDIA") => ({
  objeto,
  natureza,
  modalidade,
  justificativa: "Demanda prevista no planejamento da secretaria.",
  quantidade: "conforme termo de referência",
  valorEstimado: valor,
  dataPretendida: `${ano}-12-15`,
  prioridade,
  noPCA: "SIM",
});
const urg = (prioridade: string) => (prioridade === "ALTA" ? "PRIORITARIO" : "NORMAL");

/** Compras de exemplo das funções de conformidade, na ordem de numeração. */
export function COMPRAS_CONFORMIDADE(ano: number): CompraDemo[] {
  const lista: CompraDemo[] = [
    // fila cronológica: a manutenção das bombas foi liquidada antes do conserto da ambulância, que saiu fora da ordem
    {
      assunto: "Manutenção corretiva das bombas do poço do Sítio Lagoa",
      req: "12121212121",
      meta: base(ano, "Troca de rotor e quadro de comando de 2 bombas", 18750, "SERVICOS_GERAIS", "DISPENSA_VALOR", "ALTA"),
      ate: "FILA_PAGAMENTO",
      periodo: [70, 16],
      contratacao: { fornecedor: "Hidrobombas Sertão Ltda", cnpj: cnpj("458712300001"), valor: "18750.00", fonte: "ORDINARIOS" },
      remessa: true,
    },
    // limite de dispensa: material de expediente fica perto do limite
    {
      assunto: "Material de expediente para as escolas municipais",
      req: "10101010101",
      meta: base(ano, "Papel, cartolina e material de escritório para 9 escolas", 21400, "MATERIAL_EXPEDIENTE", "DISPENSA_VALOR"),
      ate: "ARQUIVADO",
      periodo: [110, 40],
      contratacao: { fornecedor: "Papelaria Central do Norte Ltda", cnpj: cnpj("112223330001"), valor: "21400.00", fonte: "EDUCACAO" },
      remessa: true,
    },
    {
      assunto: "Material de expediente para as UBS",
      req: "99999999999",
      meta: base(ano, "Material de escritório para 4 UBS", 14900, "MATERIAL_EXPEDIENTE", "DISPENSA_VALOR"),
      ate: "EXECUCAO",
      periodo: [45, 6],
      contratacao: { fornecedor: "Papelaria Central do Norte Ltda", cnpj: cnpj("112223330001"), valor: "14900.00", fonte: "SAUDE" },
      remessa: true,
      atual: ["ORDEM_FORNECIMENTO", "ENVIO_FISCAL"],
    },
    {
      assunto: "Aquisição de luvas e máscaras para as UBS",
      req: "99999999999",
      meta: base(ano, "Luvas de procedimento e máscaras cirúrgicas", 42300, "MEDICAMENTOS", "LICITACAO"),
      ate: "FILA_PAGAMENTO",
      periodo: [95, 9],
      contratacao: { fornecedor: "Distribuidora Médica Cariri Ltda", cnpj: cnpj("307755410001"), valor: "41890.00", fonte: "SAUDE" },
      remessa: true,
    },
    {
      assunto: "Recarga de oxigênio medicinal para o Hospital Municipal",
      req: "88888888888",
      meta: base(ano, "Recarga de 40 cilindros de oxigênio medicinal", 9600, "MEDICAMENTOS", "DISPENSA_VALOR", "ALTA"),
      ate: "FILA_PAGAMENTO",
      periodo: [30, 4],
      contratacao: { fornecedor: "Oxigênio Nordeste Ltda", cnpj: cnpj("612098770001"), valor: "9600.00", fonte: "SAUDE" },
    },
    {
      assunto: "Combustível para a frota da Saúde",
      req: "88888888888",
      meta: base(ano, "Gasolina e diesel para 6 veículos da Saúde", 96000, "COMBUSTIVEIS", "LICITACAO"),
      ate: "FILA_PAGAMENTO",
      periodo: [120, 2],
      contratacao: { fornecedor: "Posto Avenida Ltda", cnpj: cnpj("771234560001"), valor: "94380.00", fonte: "SAUDE" },
      remessa: true,
    },
    // pagamento fora da ordem, com justificativa pública
    {
      assunto: "Conserto emergencial da ambulância do Distrito de Lagoa Seca",
      req: "88888888888",
      meta: base(ano, "Troca de embreagem e revisão da ambulância", 6400, "SERVICOS_GERAIS", "DISPENSA_VALOR", "ALTA"),
      ate: "ARQUIVADO",
      periodo: [28, 9],
      contratacao: { fornecedor: "Auto Mecânica São José Ltda", cnpj: cnpj("554433220001"), valor: "6400.00", fonte: "ORDINARIOS" },
      quebra:
        "Única ambulância do distrito parada. A oficina só libera o veículo após o pagamento e não há outro veículo para remoção de pacientes. Autorizado pela Prefeita.",
      remessa: true,
    },
    // obrigações: contratos assinados aguardando publicação no PNCP
    {
      assunto: "Serviço de dedetização dos prédios públicos",
      req: "12121212121",
      meta: base(ano, "Dedetização e desratização de 14 prédios", 12800, "SERVICOS_GERAIS", "DISPENSA_VALOR"),
      ate: "CONTRATADO",
      periodo: [50, 20],
      contratacao: { fornecedor: "Dedetizadora Limpa Mais Ltda", cnpj: cnpj("663399880001"), valor: "12650.00", fonte: "ORDINARIOS" },
      atual: ["CONTRATO"],
    },
    {
      assunto: "Aquisição de mobiliário para a Escola Padre Cícero",
      req: "10101010101",
      meta: base(ano, "Carteiras, mesas e armários para 6 salas", 74000, "EQUIPAMENTOS", "LICITACAO"),
      ate: "CONTRATADO",
      periodo: [80, 5],
      contratacao: { fornecedor: "Móveis Escolares Serra Gaúcha Ltda", cnpj: cnpj("812345670001"), valor: "71900.00", fonte: "EDUCACAO" },
      atual: ["CONTRATACAO", "CONTRATO"],
    },
  ];
  return lista.map((c) => ({ ...c, urgencia: urg(String(c.meta.prioridade)) }));
}

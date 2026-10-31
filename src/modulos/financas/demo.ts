// Dados de demonstração do módulo de finanças para o município fictício de ~38 mil habitantes na Serra gaúcha.
// Receita anual prevista de ~R$ 233 milhões (bruta), pessoal perto de 50% da RCL, saúde ~22% e educação ~27%.
// A execução vai de janeiro até hoje; os processos de compra da demonstração recebem reservas e empenhos coerentes.
import { randomUUID } from "crypto";
import { eq, inArray } from "drizzle-orm";
import type { DemoCtx, ModuloDemo } from "../../db/demo/contexto";
import {
  empresas,
  eventos,
  finContas,
  finCreditos,
  finDotacoes,
  finEmpenhos,
  finLiquidacoes,
  finPagamentos,
  finProcessoEmpenho,
  finReceitas,
  finReservas,
  processos,
} from "../../db/schema";

const r2 = (n: number) => Math.round(n * 100) / 100;
const hojeIso = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const addDias = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const isoDe = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const dt = (ano: number, m: number, d: number) => `${ano}-${String(m).padStart(2, "0")}-${String(Math.min(d, 28)).padStart(2, "0")}`;

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

// ---- fornecedores fictícios (credores) ----
const FORNECEDORES: Record<string, [string, string, string]> = {
  servicos: ["Serviços Gerais Araucária Ltda", "Araucária Serviços", "318204560001"],
  atacado: ["Atacado Serrano de Suprimentos Ltda", "Atacado Serrano", "327145890001"],
  ti: ["Sistemas Públicos Integrados Ltda", "SPI Sistemas", "336021470001"],
  alimentacao: ["Benefícios Sul Cartões Ltda", "Benefícios Sul", "345678120001"],
  informatica: ["Informática Serra Tecnologia Ltda", "Serra Tecnologia", "354812960001"],
  transporte: ["Transportes Vale Verde Ltda", "Vale Verde Transportes", "363945210001"],
  generos: ["Cooperativa Agricultura Familiar do Vale Ltda", "Coop. do Vale", "234561780001"],
  obrasEsc: ["Construtora Encosta Ltda", "Encosta Construções", "372201590001"],
  laboratorio: ["Laboratório Análises Clínicas Araucária Ltda", "Lab Araucária", "381456230001"],
  plantoes: ["MedServ Plantões Médicos Ltda", "MedServ", "390784520001"],
  imagem: ["Clínica de Imagem Serra Gaúcha Ltda", "Imagem Serra", "401236780001"],
  combust: ["Posto Avenida Ltda", "Posto Avenida", "771234560001"],
  cestas: ["Comercial de Alimentos Bom Preço Ltda", "Bom Preço", "410589630001"],
  apae: ["Associação de Pais e Amigos dos Excepcionais de Vale das Araucárias", "APAE", "429371580001"],
  construtora: ["Construtora Planalto Serrano Ltda", "Planalto Serrano", "438652140001"],
  ponte: ["Engenharia Arroio Grande Ltda", "Arroio Grande Engenharia", "447913650001"],
  maquinas: ["Máquinas Agrícolas Colonial Ltda", "Colonial Máquinas", "456174290001"],
  energia: ["Distribuidora de Energia Planalto S.A.", "Energia Planalto", "465430870001"],
  coleta: ["Serrana Ambiental Coleta de Resíduos Ltda", "Serrana Ambiental", "474698310001"],
  pedreira: ["Pedreira São Roque Ltda", "Pedreira São Roque", "483957460001"],
  produtora: ["Produtora Cultural Serra Acima Ltda", "Serra Acima", "492215080001"],
  divida: ["Agência de Fomento do Sul S.A. (financiamento de máquinas)", "Fomento Sul", "501473690001"],
};
// credores sem CNPJ de empresa (folha e previdência)
const CREDOR_PESSOAL: Record<string, string> = {
  "3.1.90.11": "Servidores municipais (folha de pagamento)",
  "3.1.90.13": "Regime Geral de Previdência Social (INSS patronal)",
  "3.1.91.13": "Fundo de Previdência dos Servidores Municipais (RPPS)",
};

const UNIDADES: Record<string, { orgao: string; orgaoNome: string; unidade: string; unidadeNome: string; ug: string }> = {
  GAB: { orgao: "02", orgaoNome: "Gabinete do Prefeito", unidade: "02.01", unidadeNome: "Gabinete do Prefeito", ug: "01" },
  ADM: { orgao: "03", orgaoNome: "Secretaria de Administração e Fazenda", unidade: "03.01", unidadeNome: "Secretaria de Administração e Fazenda", ug: "01" },
  ENC: { orgao: "03", orgaoNome: "Secretaria de Administração e Fazenda", unidade: "03.02", unidadeNome: "Encargos gerais do município", ug: "01" },
  EDU: { orgao: "05", orgaoNome: "Secretaria de Educação", unidade: "05.01", unidadeNome: "Secretaria de Educação", ug: "01" },
  SAU: { orgao: "06", orgaoNome: "Secretaria de Saúde", unidade: "06.01", unidadeNome: "Fundo Municipal de Saúde", ug: "02" },
  ASS: { orgao: "07", orgaoNome: "Secretaria de Assistência Social", unidade: "07.01", unidadeNome: "Fundo Municipal de Assistência Social", ug: "01" },
  OBR: { orgao: "08", orgaoNome: "Secretaria de Obras e Infraestrutura", unidade: "08.01", unidadeNome: "Secretaria de Obras e Infraestrutura", ug: "01" },
  AGR: { orgao: "09", orgaoNome: "Secretaria de Agricultura", unidade: "09.01", unidadeNome: "Secretaria de Agricultura", ug: "01" },
  CUL: { orgao: "10", orgaoNome: "Secretaria de Cultura, Esporte e Turismo", unidade: "10.01", unidadeNome: "Secretaria de Cultura, Esporte e Turismo", ug: "01" },
};
const PROGRAMAS: Record<string, string> = {
  "0000": "Operações especiais",
  "0001": "Gestão do gabinete",
  "0002": "Gestão pública eficiente",
  "0003": "Cidade segura",
  "0012": "Ensino fundamental de qualidade",
  "0013": "Educação infantil",
  "0014": "Alimentação escolar",
  "0020": "Atenção básica à saúde",
  "0021": "Média e alta complexidade",
  "0022": "Assistência farmacêutica",
  "0023": "Vigilância em saúde",
  "0030": "Proteção social básica",
  "0031": "Criança e adolescente",
  "0040": "Cidade bem cuidada",
  "0041": "Cidade limpa",
  "0042": "Estradas do interior",
  "0043": "Água para todos",
  "0050": "Campo forte",
  "0060": "Cultura viva",
  "0061": "Esporte para todos",
};
const ACOES: Record<string, string> = {
  "0001": "Serviço da dívida contratual",
  "2001": "Manutenção do Gabinete",
  "2003": "Manutenção da Administração e Fazenda",
  "2005": "Defesa civil",
  "2030": "Remuneração dos profissionais da educação — FUNDEB",
  "2031": "Manutenção do ensino fundamental",
  "2034": "Transporte escolar",
  "2040": "Manutenção das escolas de educação infantil",
  "2050": "Merenda escolar",
  "1010": "Reforma e ampliação de escolas",
  "1011": "Equipamentos e mobiliário escolar",
  "2060": "Manutenção das UBS e equipes de saúde da família",
  "2061": "Manutenção do Hospital Municipal",
  "2062": "Transporte sanitário",
  "2063": "Farmácia básica",
  "2064": "Vigilância epidemiológica e sanitária",
  "2070": "Manutenção do CRAS",
  "2071": "Subvenções a entidades sociais",
  "1020": "Pavimentação de vias urbanas",
  "1021": "Ponte sobre o Arroio Lajeado Grande",
  "2080": "Manutenção de vias, praças e iluminação",
  "2083": "Coleta e destinação de resíduos",
  "2081": "Conservação de estradas vicinais",
  "2082": "Abastecimento de água no interior",
  "2090": "Patrulha agrícola",
  "2100": "Eventos e difusão cultural",
  "2101": "Esporte comunitário",
};

/** Execução genérica de uma dotação: fração da dotação empenhada e fração do empenho já liquidada. */
type Ex = { c: string; frac: number; liq: number; tipo?: "ORDINARIO" | "ESTIMATIVO" | "GLOBAL"; h: string };
type Dot = [string, string, string, string, string, string, string, number, Ex[]?];
// [unidade, função, subfunção, programa, ação, natureza, fonte, valor inicial em R$ mil, execução]
const DOTACOES: Dot[] = [
  ["GAB", "04", "122", "0001", "2001", "3.1.90.11", "1500.0000", 2400],
  ["GAB", "04", "122", "0001", "2001", "3.3.90.39", "1500.0000", 600, [{ c: "servicos", frac: 0.9, liq: 0.8, h: "Comunicação institucional e publicidade legal" }]],
  ["ADM", "04", "122", "0002", "2003", "3.1.90.11", "1500.0000", 13000],
  ["ADM", "04", "122", "0002", "2003", "3.1.90.13", "1500.0000", 3400],
  ["ADM", "04", "122", "0002", "2003", "3.1.91.13", "1500.0000", 1400],
  ["ADM", "04", "122", "0002", "2003", "3.3.90.30", "1500.0000", 900, [{ c: "atacado", frac: 0.55, liq: 0.8, h: "Material de consumo das secretarias" }]],
  ["ADM", "04", "122", "0002", "2003", "3.3.90.39", "1500.0000", 4000, [{ c: "servicos", frac: 0.72, liq: 0.8, h: "Locações, manutenção predial e serviços administrativos" }]],
  ["ADM", "04", "122", "0002", "2003", "3.3.90.40", "1500.0000", 1100, [{ c: "ti", frac: 0.92, liq: 0.8, tipo: "GLOBAL", h: "Sistemas de gestão e licenças de software" }]],
  ["ADM", "04", "122", "0002", "2003", "3.3.90.46", "1500.0000", 3400, [{ c: "alimentacao", frac: 0.95, liq: 0.83, h: "Auxílio-alimentação dos servidores" }]],
  ["ADM", "04", "122", "0002", "2003", "4.4.90.52", "1500.0000", 900, [{ c: "informatica", frac: 0.5, liq: 0.6, tipo: "ORDINARIO", h: "Computadores e equipamentos de rede" }]],
  ["ADM", "06", "182", "0003", "2005", "3.3.90.30", "1500.0000", 300, [{ c: "atacado", frac: 0.6, liq: 0.7, h: "Lonas, telhas e kits para defesa civil" }]],
  ["ENC", "28", "843", "0000", "0001", "3.2.90.21", "1500.0000", 1400, [{ c: "divida", frac: 0.97, liq: 0.83, h: "Juros do financiamento de máquinas rodoviárias" }]],
  ["ENC", "28", "843", "0000", "0001", "4.6.90.71", "1500.0000", 3900, [{ c: "divida", frac: 0.97, liq: 0.83, h: "Amortização do financiamento de máquinas rodoviárias" }]],
  // Educação
  ["EDU", "12", "361", "0012", "2030", "3.1.90.11", "1540.0000", 17000],
  ["EDU", "12", "361", "0012", "2030", "3.1.90.13", "1540.0000", 3400],
  ["EDU", "12", "361", "0012", "2031", "3.1.90.11", "1500.1001", 9500],
  ["EDU", "12", "361", "0012", "2031", "3.3.90.30", "1500.1001", 1200, [{ c: "atacado", frac: 0.8, liq: 0.8, h: "Material de consumo das escolas" }]],
  ["EDU", "12", "361", "0012", "2031", "3.3.90.39", "1500.1001", 900, [{ c: "servicos", frac: 0.8, liq: 0.8, h: "Manutenção das escolas" }]],
  ["EDU", "12", "361", "0012", "2031", "3.3.90.30", "1540.0000", 1000, [{ c: "atacado", frac: 0.8, liq: 0.75, h: "Material pedagógico" }]],
  ["EDU", "12", "361", "0012", "2031", "3.3.90.39", "1540.0000", 1500, [{ c: "servicos", frac: 0.8, liq: 0.78, h: "Limpeza e vigilância das escolas" }]],
  ["EDU", "12", "361", "0012", "2031", "3.3.90.30", "1550.0000", 900, [{ c: "atacado", frac: 0.6, liq: 0.7, h: "Material escolar (salário-educação)" }]],
  ["EDU", "12", "361", "0012", "2034", "3.3.90.39", "1540.0000", 2100, [{ c: "transporte", frac: 0.62, liq: 0.82, tipo: "GLOBAL", h: "Transporte escolar — rotas urbanas, contrato 012/2025" }]],
  ["EDU", "12", "361", "0012", "2034", "3.3.90.39", "1550.0000", 800, [{ c: "transporte", frac: 0.9, liq: 0.8, tipo: "GLOBAL", h: "Transporte escolar — PNATE" }]],
  ["EDU", "12", "365", "0013", "2040", "3.1.90.11", "1540.0000", 5000],
  ["EDU", "12", "365", "0013", "2040", "3.1.90.11", "1500.1001", 5600],
  ["EDU", "12", "365", "0013", "2040", "3.3.90.30", "1500.1001", 500, [{ c: "atacado", frac: 0.8, liq: 0.8, h: "Material de consumo das EMEIs" }]],
  ["EDU", "12", "306", "0014", "2050", "3.3.90.30", "1552.0000", 1900, [{ c: "generos", frac: 0.7, liq: 0.78, h: "Gêneros alimentícios — chamada pública PNAE 01/2026" }]],
  ["EDU", "12", "306", "0014", "2050", "3.3.90.30", "1500.1001", 600, [{ c: "generos", frac: 0.85, liq: 0.8, h: "Complementação da merenda com recursos próprios" }]],
  ["EDU", "12", "361", "0012", "1010", "4.4.90.51", "1500.1001", 800, [{ c: "obrasEsc", frac: 0.45, liq: 0.6, tipo: "GLOBAL", h: "Ampliação da EMEF Santa Teresinha — 2 salas" }]],
  ["EDU", "12", "361", "0012", "1011", "4.4.90.52", "1550.0000", 1000, [{ c: "informatica", frac: 0.3, liq: 0.9, tipo: "ORDINARIO", h: "Lousas digitais para 12 salas" }]],
  ["EDU", "12", "361", "0012", "1011", "4.4.90.52", "1540.0000", 1000, [{ c: "informatica", frac: 0.55, liq: 0.7, tipo: "ORDINARIO", h: "Computadores para laboratórios de informática" }]],
  // Saúde (Fundo Municipal de Saúde)
  ["SAU", "10", "301", "0020", "2060", "3.1.90.11", "1500.1002", 13000],
  ["SAU", "10", "301", "0020", "2060", "3.1.90.13", "1500.1002", 2600],
  ["SAU", "10", "301", "0020", "2060", "3.1.90.11", "1600.0000", 6000],
  ["SAU", "10", "301", "0020", "2060", "3.3.90.30", "1500.1002", 1600, [{ c: "atacado", frac: 0.75, liq: 0.8, h: "Material de consumo das UBS" }]],
  ["SAU", "10", "301", "0020", "2060", "3.3.90.30", "1600.0000", 2900, [{ c: "atacado", frac: 0.55, liq: 0.78, h: "Insumos de enfermagem e odontologia" }]],
  ["SAU", "10", "301", "0020", "2060", "3.3.90.39", "1500.1002", 1400, [{ c: "laboratorio", frac: 0.85, liq: 0.8, h: "Exames laboratoriais — credenciamento 03/2025" }]],
  ["SAU", "10", "301", "0020", "2060", "3.3.90.39", "1621.0000", 1800, [{ c: "laboratorio", frac: 0.8, liq: 0.78, h: "Exames e consultas especializadas — incentivo estadual" }]],
  ["SAU", "10", "302", "0021", "2061", "3.1.90.11", "1500.1002", 7400],
  ["SAU", "10", "302", "0021", "2061", "3.3.90.30", "1600.0000", 3800, [{ c: "atacado", frac: 0.7, liq: 0.8, h: "Material hospitalar" }]],
  ["SAU", "10", "302", "0021", "2061", "3.3.90.39", "1500.1002", 6200, [{ c: "plantoes", frac: 0.9, liq: 0.82, tipo: "GLOBAL", h: "Plantões médicos do pronto atendimento — contrato 008/2026" }]],
  ["SAU", "10", "302", "0021", "2061", "3.3.90.39", "1600.0000", 6400, [{ c: "imagem", frac: 0.85, liq: 0.8, h: "Exames de imagem e procedimentos de média complexidade" }]],
  ["SAU", "10", "302", "0021", "2062", "3.3.90.30", "1600.0000", 1100, [{ c: "combust", frac: 0.6, liq: 0.8, tipo: "ESTIMATIVO", h: "Combustível das ambulâncias — ata 004/2026" }]],
  ["SAU", "10", "302", "0021", "2062", "3.3.90.39", "1500.1002", 900, [{ c: "servicos", frac: 0.7, liq: 0.8, h: "Manutenção da frota da saúde" }]],
  ["SAU", "10", "303", "0022", "2063", "3.3.90.30", "1500.1002", 2800, [{ c: "cariri", frac: 0.85, liq: 0.8, tipo: "ESTIMATIVO", h: "Medicamentos da farmácia básica — ata de registro de preços 011/2026" }]],
  ["SAU", "10", "303", "0022", "2063", "3.3.90.30", "1621.0000", 1600, [{ c: "cariri", frac: 0.8, liq: 0.78, tipo: "ESTIMATIVO", h: "Medicamentos — componente estadual" }]],
  ["SAU", "10", "305", "0023", "2064", "3.3.90.39", "1600.0000", 900, [{ c: "servicos", frac: 0.7, liq: 0.75, h: "Controle de vetores e vigilância" }]],
  // Assistência social
  ["ASS", "08", "244", "0030", "2070", "3.1.90.11", "1500.0000", 2900],
  ["ASS", "08", "244", "0030", "2070", "3.1.90.11", "1660.0000", 1000],
  ["ASS", "08", "244", "0030", "2070", "3.3.90.32", "1660.0000", 600, [{ c: "cestas", frac: 0.8, liq: 0.75, h: "Cestas básicas — benefícios eventuais" }]],
  ["ASS", "08", "244", "0030", "2070", "3.3.90.39", "1660.0000", 900, [{ c: "servicos", frac: 0.7, liq: 0.7, h: "Oficinas do Serviço de Convivência" }]],
  ["ASS", "08", "244", "0030", "2070", "3.3.90.32", "1500.0000", 700, [{ c: "cestas", frac: 0.8, liq: 0.8, h: "Cestas básicas e auxílio-funeral" }]],
  ["ASS", "08", "243", "0031", "2071", "3.3.50.43", "1500.0000", 1200, [{ c: "apae", frac: 0.95, liq: 0.8, tipo: "GLOBAL", h: "Subvenção à APAE — termo de fomento 02/2026" }]],
  // Obras e infraestrutura
  ["OBR", "15", "451", "0040", "1020", "4.4.90.51", "1700.0000", 6200],
  ["OBR", "15", "451", "0040", "1020", "4.4.90.51", "1500.0000", 4900, [{ c: "construtora", frac: 0.6, liq: 0.55, tipo: "GLOBAL", h: "Pavimentação e drenagem — recursos próprios e contrapartida" }]],
  ["OBR", "15", "451", "0040", "1021", "4.4.90.51", "1701.0000", 2150],
  ["OBR", "15", "452", "0040", "2080", "3.1.90.11", "1500.0000", 7200],
  ["OBR", "15", "452", "0040", "2080", "3.3.90.30", "1500.0000", 3200, [{ c: "atacado", frac: 0.7, liq: 0.8, h: "Material de manutenção de vias e praças" }]],
  ["OBR", "15", "452", "0040", "2080", "3.3.90.39", "1500.0000", 5000, [{ c: "energia", frac: 0.92, liq: 0.8, tipo: "ESTIMATIVO", h: "Energia elétrica — iluminação pública e prédios" }]],
  ["OBR", "15", "452", "0041", "2083", "3.3.90.39", "1500.0000", 5600, [{ c: "coleta", frac: 0.95, liq: 0.82, tipo: "GLOBAL", h: "Coleta e destinação de resíduos — contrato 021/2024" }]],
  ["OBR", "26", "782", "0042", "2081", "3.3.90.30", "1500.0000", 2600, [{ c: "pedreira", frac: 0.5, liq: 0.8, h: "Brita e saibro para estradas vicinais" }, { c: "combust", frac: 0.35, liq: 0.8, tipo: "ESTIMATIVO", h: "Óleo diesel para as máquinas rodoviárias" }]],
  ["OBR", "26", "782", "0042", "2081", "3.3.90.39", "1500.0000", 1400, [{ c: "servicos", frac: 0.8, liq: 0.75, h: "Locação de máquinas e caminhões" }]],
  ["OBR", "17", "512", "0043", "2082", "3.3.90.39", "1500.0000", 900, [{ c: "hidrobombas", frac: 0.07, liq: 0.75, tipo: "GLOBAL", h: "Manutenção preventiva dos poços artesianos do interior" }, { c: "servicos", frac: 0.6, liq: 0.75, h: "Análises de potabilidade e cloração" }]],
  // Agricultura
  ["AGR", "20", "606", "0050", "2090", "3.1.90.11", "1500.0000", 2400],
  ["AGR", "20", "606", "0050", "2090", "3.3.90.30", "1500.0000", 800, [{ c: "combust", frac: 0.8, liq: 0.8, tipo: "ESTIMATIVO", h: "Óleo diesel da patrulha agrícola" }]],
  ["AGR", "20", "606", "0050", "2090", "3.3.90.39", "1500.0000", 500, [{ c: "servicos", frac: 0.8, liq: 0.7, h: "Inseminação e assistência técnica" }]],
  ["AGR", "20", "606", "0050", "2090", "4.4.90.52", "1701.0000", 650],
  // Cultura, esporte e turismo
  ["CUL", "13", "392", "0060", "2100", "3.1.90.11", "1500.0000", 1300],
  ["CUL", "13", "392", "0060", "2100", "3.3.90.39", "1500.0000", 1600, [{ c: "produtora", frac: 0.8, liq: 0.7, h: "Festa da Colheita e programação cultural" }]],
  ["CUL", "27", "812", "0061", "2101", "3.3.90.30", "1500.0000", 400, [{ c: "atacado", frac: 0.7, liq: 0.7, h: "Material esportivo e premiações" }]],
];

// ---- receita: previsão anual (R$ mil) e sazonalidade ----
const PLANO = (pesos: number[]) => pesos.map((p) => p / pesos.reduce((a, b) => a + b, 0));
const RECEITAS: Record<string, { anual: number; pesos: number[]; desempenho: number }> = {
  IPTU: { anual: 9600, pesos: PLANO([30, 18, 12, 6, 5, 5, 5, 4, 4, 4, 4, 3]), desempenho: 1.03 },
  ISS: { anual: 14200, pesos: PLANO(Array(12).fill(1)), desempenho: 1.07 },
  ITBI: { anual: 4400, pesos: PLANO(Array(12).fill(1)), desempenho: 0.82 },
  IRRF: { anual: 5600, pesos: PLANO([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.6]), desempenho: 1.02 },
  TAXAS: { anual: 3900, pesos: PLANO([20, 12, 10, 7, 7, 7, 7, 6, 6, 6, 6, 6]), desempenho: 0.97 },
  OUTRAS_PROPRIAS: { anual: 7200, pesos: PLANO(Array(12).fill(1)), desempenho: 1.05 },
  FPM: { anual: 54500, pesos: PLANO([9, 10, 7.5, 8.5, 8.5, 7, 9.5, 7, 8, 8, 7, 10]), desempenho: 0.98 },
  ICMS: { anual: 51800, pesos: PLANO(Array(12).fill(1)), desempenho: 1.01 },
  IPVA: { anual: 9800, pesos: PLANO([28, 14, 14, 12, 6, 5, 4, 4, 4, 3, 3, 3]), desempenho: 1.04 },
  ITR: { anual: 650, pesos: PLANO([2, 2, 2, 2, 2, 2, 2, 2, 4, 30, 40, 10]), desempenho: 1.0 },
  SUS: { anual: 24500, pesos: PLANO(Array(12).fill(1)), desempenho: 0.99 },
  FUNDEB: { anual: 31000, pesos: PLANO(Array(12).fill(1)), desempenho: 1.02 },
  FNDE: { anual: 4600, pesos: PLANO([0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0]), desempenho: 0.97 },
  FNAS: { anual: 2500, pesos: PLANO(Array(12).fill(1)), desempenho: 0.92 },
  CONVENIOS: { anual: 9000, pesos: PLANO([0, 0, 12, 0, 0, 18, 0, 0, 20, 0, 0, 50]), desempenho: 1 },
};
// convênios: 1ª parcela em março; a 2ª atrasou para julho; a 3ª (setembro) ainda não entrou
const CONVENIOS_ARRECADADO = [0, 0, 1080, 0, 0, 0, 1620, 0, 0, 0, 0, 0];

export const financasDemo: ModuloDemo = {
  nome: "Finanças (orçamento, execução, receita e caixa)",
  async aplicar(ctx: DemoCtx) {
    const { db, municipioId, ano } = ctx;
    const hoje = hojeIso();
    const ontem = addDias(hoje, -1);
    const anoHoje = Number(hoje.slice(0, 4));
    const mesAtual = anoHoje > ano ? 12 : Number(hoje.slice(5, 7));
    const contador = ctx.usuarios["44444444444"];
    const tesoureira = ctx.usuarios["77777777777"] ?? contador;

    // ---- empresas credoras (reaproveita as de demonstração; cria as fictícias que faltam) ----
    const empresaId: Record<string, string> = {
      hidrobombas: ctx.empresas.hidrobombas,
      cariri: ctx.empresas.cariri,
      mendes: ctx.empresas.mendes,
      mendesmei: ctx.empresas.mendesmei,
      padaria: ctx.empresas.padaria,
    };
    const nomeEmpresa: Record<string, string> = {
      hidrobombas: "Hidrobombas Sertão Ltda",
      cariri: "Distribuidora Médica Cariri Ltda",
      mendes: "Mendes Materiais de Construção Ltda",
      mendesmei: "Carlos Mendes Reparos",
      padaria: "Padaria Pão da Serra Ltda",
    };
    const docEmpresa: Record<string, string> = {};
    for (const [k, [razao, fantasia, base]] of Object.entries(FORNECEDORES)) {
      const c = cnpj(base);
      await db
        .insert(empresas)
        .values({ cnpj: c, razaoSocial: razao, nomeFantasia: fantasia, porte: "DEMAIS", endereco: { cidade: "Vale das Araucárias", uf: "RS" } })
        .onConflictDoNothing();
      const e = await db.query.empresas.findFirst({ where: eq(empresas.cnpj, c) });
      empresaId[k] = e!.id;
      nomeEmpresa[k] = e!.razaoSocial;
      docEmpresa[k] = c;
    }
    const demoEmp = await db.query.empresas.findMany({ where: inArray(empresas.id, Object.values(ctx.empresas)) });
    for (const k of ["hidrobombas", "cariri", "mendes", "mendesmei", "padaria"]) docEmpresa[k] = demoEmp.find((e) => e.id === empresaId[k])?.cnpj ?? "";
    const credor = (k: string) => ({ empresaId: empresaId[k] ?? null, credorNome: nomeEmpresa[k], credorDocumento: docEmpresa[k] ?? null });

    // ---- dotações ----
    const chaveDot = (u: string, acao: string, nat: string, fonte: string) => `${u}|${acao}|${nat}|${fonte}`;
    const dotId: Record<string, string> = {};
    const dotValor: Record<string, number> = {};
    // dotações gravadas num insert só, com os ids gerados aqui
    const dotRows: (typeof finDotacoes.$inferInsert)[] = [];
    for (const [u, fn, sub, prog, acao, nat, fonte, mil] of DOTACOES) {
      const un = UNIDADES[u];
      const d = { id: randomUUID() };
      dotRows.push({
        id: d.id,
        municipioId,
        unidadeGestoraId: ctx.ugs[un.ug],
        ano,
        orgao: un.orgao,
        orgaoNome: un.orgaoNome,
        unidade: un.unidade,
        unidadeNome: un.unidadeNome,
        funcao: fn,
        subfuncao: sub,
        programa: prog,
        programaNome: PROGRAMAS[prog],
        acao,
        acaoNome: ACOES[acao],
        natureza: nat,
        fonte,
        valorInicial: mil * 1000,
      });
      dotId[chaveDot(u, acao, nat, fonte)] = d.id;
      dotValor[d.id] = mil * 1000;
    }
    await db.insert(finDotacoes).values(dotRows);
    const D = (u: string, acao: string, nat: string, fonte: string) => {
      const id = dotId[chaveDot(u, acao, nat, fonte)];
      if (!id) throw new Error(`Dotação não encontrada: ${u} ${acao} ${nat} ${fonte}`);
      return id;
    };

    // ---- créditos adicionais (decretos) ----
    const creditos: { dot: string; tipo: string; dec: string; data: string; valor: number; j: string }[] = [
      { dot: D("OBR", "2083", "3.3.90.39", "1500.0000"), tipo: "SUPLEMENTAR", dec: "4.812/2026", data: dt(ano, 3, 12), valor: 1200000, j: "Reajuste do contrato de coleta de resíduos." },
      { dot: D("OBR", "1020", "4.4.90.51", "1500.0000"), tipo: "REDUCAO", dec: "4.812/2026", data: dt(ano, 3, 12), valor: -1200000, j: "Anulação parcial para cobrir o reajuste da coleta." },
      { dot: D("OBR", "1020", "4.4.90.51", "1700.0000"), tipo: "SUPLEMENTAR", dec: "4.851/2026", data: dt(ano, 5, 5), valor: 2400000, j: "Superávit financeiro de 2025 do convênio de pavimentação (saldo reprogramado)." },
      { dot: D("SAU", "2063", "3.3.90.30", "1500.1002"), tipo: "SUPLEMENTAR", dec: "4.903/2026", data: dt(ano, 7, 18), valor: 800000, j: "Excesso de arrecadação do ISS: compra de medicamentos." },
      { dot: D("SAU", "2061", "3.3.90.39", "1600.0000"), tipo: "SUPLEMENTAR", dec: "4.955/2026", data: dt(ano, 9, 22), valor: 600000, j: "Excesso de arrecadação do SUS: incremento temporário da média complexidade." },
      { dot: D("SAU", "2060", "3.1.90.11", "1500.1002"), tipo: "SUPLEMENTAR", dec: "4.977/2026", data: dt(ano, 10, 15), valor: 900000, j: "Reposição salarial e novos agentes comunitários de saúde." },
      { dot: D("ADM", "2003", "3.3.90.39", "1500.0000"), tipo: "REDUCAO", dec: "4.977/2026", data: dt(ano, 10, 15), valor: -900000, j: "Anulação parcial para cobrir a folha da saúde." },
    ];
    for (const c of creditos) {
      await db.insert(finCreditos).values({ dotacaoId: c.dot, tipo: c.tipo, decretoNumero: c.dec, decretoData: c.data, valor: c.valor, justificativa: c.j, criadoPorId: contador });
      dotValor[c.dot] += c.valor;
    }

    // ---- contas bancárias (saldos simulados do extrato de ontem) ----
    const contasDef: [string, string, string, string, string, number][] = [
      ["Banrisul", "0410", "06.012345.0-1", "Movimento — recursos livres", "ORDINARIOS", 14_820_000],
      ["Banrisul", "0410", "06.012346.0-8", "Aplicação — recursos livres", "ORDINARIOS", 12_900_000],
      ["Banco do Brasil", "3071-X", "22.410-5", "FUNDEB", "EDUCACAO", 5_400_000],
      ["Banco do Brasil", "3071-X", "22.411-3", "Salário-educação, PNAE e PNATE", "EDUCACAO", 1_600_000],
      ["Banco do Brasil", "3071-X", "24.118-2", "Fundo Municipal de Saúde — SUS federal", "SAUDE", 3_950_000],
      ["Banrisul", "0410", "06.019870.0-4", "Fundo Municipal de Saúde — repasses do Estado", "SAUDE", 690_000],
      ["Banco do Brasil", "3071-X", "25.302-4", "Fundo Municipal de Assistência Social — FNAS", "ASSISTENCIA", 860_000],
      ["Caixa", "0498", "006.00071-9", "Convênio 912345/2025 — pavimentação urbana", "CONVENIOS", 1_380_000],
      ["Banrisul", "0410", "06.021455.0-2", "Convênios com o Estado — ponte e máquinas", "CONVENIOS", 260_000],
    ];
    const contaDoGrupo: Record<string, string> = {};
    const contaPorNome: Record<string, string> = {};
    for (const [banco, agencia, numero, nome, grupo, saldo] of contasDef) {
      const [c] = await db.insert(finContas).values({ municipioId, banco, agencia, numero, nome, grupoFonte: grupo, saldoExtrato: saldo, extratoEm: ontem }).returning();
      contaDoGrupo[grupo] ??= c.id;
      contaPorNome[nome] = c.id;
    }
    const grupoDe = (fonte: string) =>
      fonte.startsWith("1500") ? "ORDINARIOS" : fonte.startsWith("15") ? "EDUCACAO" : fonte.startsWith("16") && fonte !== "1660.0000" ? "SAUDE" : fonte === "1660.0000" ? "ASSISTENCIA" : "CONVENIOS";
    const fonteDe = new Map(DOTACOES.map(([u, , , , acao, nat, fonte]) => [D(u, acao, nat, fonte), fonte]));
    const contaPara = (dot: string) => {
      const f = fonteDe.get(dot)!;
      if (f === "1621.0000") return contaPorNome["Fundo Municipal de Saúde — repasses do Estado"];
      if (f === "1550.0000" || f === "1552.0000") return contaPorNome["Salário-educação, PNAE e PNATE"];
      if (f === "1701.0000") return contaPorNome["Convênios com o Estado — ponte e máquinas"];
      return contaDoGrupo[grupoDe(f)];
    };

    // ---- empenhos, liquidações e pagamentos (montados em memória, numerados por data) ----
    type Liq = { data: string; valor: number; doc: string; venc: string; pago?: string | null };
    type Emp = {
      dot: string;
      tipo: string;
      credor: { empresaId: string | null; credorNome: string; credorDocumento: string | null };
      historico: string;
      data: string;
      valor: number;
      liqs: Liq[];
      reserva?: { valor: number; data: string; processoId: string; historico: string };
      processoId?: string;
    };
    const emps: Emp[] = [];
    let nf = 1000;
    const nota = () => `NF-e ${(++nf).toString()}`;
    const pagoEm = (data: string, lag = 9) => {
      const p = addDias(data, lag);
      return p <= ontem ? p : null;
    };
    const mesesAte = (desde: number) => Array.from({ length: Math.max(0, mesAtual - desde + 1) }, (_, i) => desde + i);

    // folha: um empenho estimativo por dotação de pessoal; liquidação no dia 28 de cada mês e meia folha (13º) em julho
    for (const [u, , , , acao, nat, fonte] of DOTACOES) {
      if (!nat.startsWith("3.1.")) continue;
      const dot = D(u, acao, nat, fonte);
      const valor = r2(dotValor[dot] * 0.995);
      const F = valor / 13;
      const liqs: Liq[] = [];
      for (let m = 1; m <= mesAtual; m++) {
        const d = dt(ano, m, 28);
        if (d > hoje) continue;
        liqs.push({ data: d, valor: r2(F), doc: `Folha ${String(m).padStart(2, "0")}/${ano}`, venc: d, pago: d });
        if (m === 7) liqs.push({ data: dt(ano, 7, 15), valor: r2(F / 2), doc: `13º salário — 1ª parcela ${ano}`, venc: dt(ano, 7, 15), pago: dt(ano, 7, 15) });
      }
      emps.push({
        dot,
        tipo: "ESTIMATIVO",
        credor: { empresaId: null, credorNome: CREDOR_PESSOAL[nat], credorDocumento: null },
        historico: nat === "3.1.90.11" ? `Folha de pagamento ${ano} — ${ACOES[acao]}` : `Contribuição patronal ${ano} — ${ACOES[acao]}`,
        data: dt(ano, 1, 2),
        valor,
        liqs,
      });
    }

    // execução genérica das demais dotações
    let semente = 7;
    const rnd = () => {
      semente = (semente * 9301 + 49297) % 233280;
      return semente / 233280;
    };
    for (const [u, , , , acao, nat, fonte, , exs] of DOTACOES) {
      for (const x of exs ?? []) {
        const dot = D(u, acao, nat, fonte);
        const valor = r2(dotValor[dot] * x.frac);
        const tipo = x.tipo ?? (nat.startsWith("4.") ? "GLOBAL" : "ESTIMATIVO");
        const total = valor * x.liq;
        const liqs: Liq[] = [];
        if (tipo === "ORDINARIO") {
          const m = Math.max(2, Math.min(mesAtual - 1, 4 + Math.floor(rnd() * 5)));
          const d = dt(ano, m, 8 + Math.floor(rnd() * 15));
          liqs.push({ data: d, valor: r2(valor * Math.min(1, x.liq + 0.2)), doc: nota(), venc: addDias(d, 25), pago: pagoEm(d) });
          emps.push({ dot, tipo, credor: credor(x.c), historico: x.h, data: dt(ano, Math.max(1, m - 1), 10), valor, liqs });
          continue;
        }
        const desde = nat.startsWith("4.4.") ? Math.min(mesAtual, 5) : 1;
        const meses = mesesAte(desde + 1);
        for (const m of meses) {
          const d = dt(ano, m, 6 + Math.floor(rnd() * 20));
          if (d > hoje) continue;
          liqs.push({ data: d, valor: r2(total / meses.length), doc: nota(), venc: addDias(d, 25), pago: pagoEm(d, 8 + Math.floor(rnd() * 6)) });
        }
        emps.push({ dot, tipo, credor: credor(x.c), historico: x.h, data: dt(ano, desde, 5 + Math.floor(rnd() * 10)), valor, liqs });
      }
    }

    // empenhos específicos: convênios e fornecedores de demonstração
    const pav = D("OBR", "1020", "4.4.90.51", "1700.0000");
    emps.push({
      dot: pav,
      tipo: "GLOBAL",
      credor: credor("construtora"),
      historico: "Pavimentação asfáltica das ruas Pinheiro Machado e Bento Gonçalves — contrato 027/2026 (convênio 912345/2025)",
      data: dt(ano, 4, 20),
      valor: 5_400_000,
      liqs: [
        { data: dt(ano, 6, 18), valor: 1_250_000, doc: "Medição 1 — NF-e 3381", venc: dt(ano, 7, 3), pago: dt(ano, 6, 30) },
        { data: dt(ano, 8, 20), valor: 1_600_000, doc: "Medição 2 — NF-e 3420", venc: dt(ano, 9, 4), pago: dt(ano, 8, 29) },
        { data: addDias(hoje, -9), valor: 1_180_000, doc: "Medição 3 — NF-e 3467", venc: addDias(hoje, 13), pago: null },
      ],
    });
    emps.push({
      dot: D("OBR", "1021", "4.4.90.51", "1701.0000"),
      tipo: "GLOBAL",
      credor: credor("ponte"),
      historico: "Construção da ponte sobre o Arroio Lajeado Grande — contrato 031/2026 (convênio SOP/RS)",
      data: dt(ano, 7, 10),
      valor: 1_900_000,
      liqs: [{ data: dt(ano, 9, 15), valor: 600_000, doc: "Medição 1 — NF-e 812", venc: dt(ano, 9, 30), pago: dt(ano, 9, 25) }],
    });
    emps.push({
      dot: D("AGR", "2090", "4.4.90.52", "1701.0000"),
      tipo: "ORDINARIO",
      credor: credor("maquinas"),
      historico: "Retroescavadeira 4x4 para a patrulha agrícola (convênio com o Estado)",
      data: dt(ano, 7, 1),
      valor: 620_000,
      liqs: [{ data: dt(ano, 8, 5), valor: 620_000, doc: "NF-e 20577", venc: dt(ano, 8, 20), pago: dt(ano, 8, 14) }],
    });
    emps.push({
      dot: D("OBR", "2080", "3.3.90.30", "1500.0000"),
      tipo: "GLOBAL",
      credor: credor("mendes"),
      historico: "Cimento, tubos e areia para manutenção de calçadas e bueiros — ata 007/2026",
      data: dt(ano, 3, 10),
      valor: 86_000,
      liqs: [
        { data: dt(ano, 4, 12), valor: 21_000, doc: "NF-e 4410", venc: dt(ano, 5, 2), pago: dt(ano, 4, 24) },
        { data: dt(ano, 6, 15), valor: 24_000, doc: "NF-e 4498", venc: dt(ano, 7, 5), pago: dt(ano, 6, 26) },
        { data: addDias(hoje, -35), valor: 18_400, doc: "NF-e 4577", venc: addDias(hoje, -15), pago: null },
      ],
    });
    emps.push({
      dot: D("ADM", "2003", "3.3.90.39", "1500.0000"),
      tipo: "ORDINARIO",
      credor: credor("mendesmei"),
      historico: "Reparo do telhado do almoxarifado central",
      data: dt(ano, 8, 5),
      valor: 4_200,
      liqs: [{ data: dt(ano, 8, 20), valor: 4_200, doc: "NFS-e 118", venc: dt(ano, 9, 5), pago: dt(ano, 8, 28) }],
    });
    emps.push({
      dot: D("ADM", "2003", "3.3.90.30", "1500.0000"),
      tipo: "ESTIMATIVO",
      credor: credor("padaria"),
      historico: "Lanches para reuniões do conselho municipal e capacitações",
      data: dt(ano, 2, 10),
      valor: 9_800,
      liqs: [2, 4, 6, 8]
        .filter((m) => m <= mesAtual)
        .map((m) => {
          const d = dt(ano, m, 22);
          return { data: d, valor: 1_480, doc: nota(), venc: addDias(d, 20), pago: pagoEm(d, 7) };
        }),
    });

    // ---- processos de compra da demonstração: reserva, empenho, liquidação e pagamento coerentes com o fluxo ----
    const procs = await db.query.processos.findMany({ where: eq(processos.municipioId, municipioId) });
    const evs = procs.length ? await db.query.eventos.findMany({ where: inArray(eventos.processoId, procs.map((p) => p.id)) }) : [];
    const quando = (pid: string, estado: string) => {
      const e = evs.filter((x) => x.processoId === pid && x.paraEstado === estado).sort((a, b) => b.seq - a.seq)[0];
      return e ? isoDe(e.criadoEm) : null;
    };
    type Ct = { fornecedor: string; cnpj: string; valor: string; fonte: string };
    const vinc: { assunto: string; dot: string; tipo: string; historico?: string }[] = [
      { assunto: "Aquisição de gêneros alimentícios — merenda escolar", dot: D("EDU", "2050", "3.3.90.30", "1552.0000"), tipo: "GLOBAL" },
      { assunto: "Material de expediente para a Secretaria de Administração", dot: D("ADM", "2003", "3.3.90.30", "1500.0000"), tipo: "ORDINARIO" },
      { assunto: "Material de expediente para as escolas municipais", dot: D("EDU", "2031", "3.3.90.30", "1550.0000"), tipo: "ORDINARIO" },
      { assunto: "Material de expediente para as UBS", dot: D("SAU", "2060", "3.3.90.30", "1600.0000"), tipo: "ORDINARIO" },
      { assunto: "Manutenção corretiva das bombas do poço do Sítio Lagoa", dot: D("OBR", "2082", "3.3.90.39", "1500.0000"), tipo: "ORDINARIO" },
      { assunto: "Aquisição de luvas e máscaras para as UBS", dot: D("SAU", "2060", "3.3.90.30", "1600.0000"), tipo: "ORDINARIO" },
      { assunto: "Recarga de oxigênio medicinal para o Hospital Municipal", dot: D("SAU", "2061", "3.3.90.30", "1600.0000"), tipo: "ORDINARIO" },
      { assunto: "Combustível para a frota da Saúde", dot: D("SAU", "2062", "3.3.90.30", "1600.0000"), tipo: "ESTIMATIVO" },
      { assunto: "Conserto emergencial da ambulância do Distrito de Lagoa Seca", dot: D("SAU", "2062", "3.3.90.39", "1500.1002"), tipo: "ORDINARIO" },
    ];
    // processos que passaram pela reserva mas ainda não foram empenhados
    const soReserva: { assunto: string; dot: string }[] = [
      { assunto: "Contratação de serviço de transporte escolar — rota rural", dot: D("EDU", "2034", "3.3.90.39", "1540.0000") },
      { assunto: "Reforma da cobertura da Escola Municipal Padre Cícero", dot: D("EDU", "1010", "4.4.90.51", "1500.1001") },
      { assunto: "Serviço de dedetização dos prédios públicos", dot: D("ADM", "2003", "3.3.90.39", "1500.0000") },
      { assunto: "Aquisição de mobiliário para a Escola Padre Cícero", dot: D("EDU", "1011", "4.4.90.52", "1550.0000") },
    ];
    const reservasSoltas: { dot: string; valor: number; data: string; processoId: string; historico: string }[] = [];
    for (const r of soReserva) {
      const p = procs.find((x) => x.assunto === r.assunto);
      const data = p && quando(p.id, "RESERVADO");
      if (!p || !data) continue;
      const meta = (p.metadados ?? {}) as { valorEstimado?: number; objeto?: string };
      reservasSoltas.push({ dot: r.dot, valor: Number(meta.valorEstimado ?? 0), data, processoId: p.id, historico: `Reserva para ${p.numero} — ${meta.objeto ?? p.assunto}` });
    }
    for (const v of vinc) {
      const p = procs.find((x) => x.assunto === v.assunto);
      if (!p) continue;
      const meta = (p.metadados ?? {}) as { contratacao?: Ct; valorEstimado?: number; objeto?: string };
      const ct = meta.contratacao;
      const dataEmp = quando(p.id, "EMPENHADO");
      if (!ct || !dataEmp) continue;
      const valor = Number(ct.valor);
      const emp = await db.query.empresas.findFirst({ where: eq(empresas.cnpj, ct.cnpj) });
      let empresa = emp;
      if (!empresa) {
        await db.insert(empresas).values({ cnpj: ct.cnpj, razaoSocial: ct.fornecedor, porte: "DEMAIS" }).onConflictDoNothing();
        empresa = await db.query.empresas.findFirst({ where: eq(empresas.cnpj, ct.cnpj) });
      }
      const dLiq = quando(p.id, "LIQUIDADO");
      const dPago = quando(p.id, "PAGO");
      const dReserva = quando(p.id, "RESERVADO") ?? addDias(dataEmp, -20);
      emps.push({
        dot: v.dot,
        tipo: v.tipo,
        credor: { empresaId: empresa?.id ?? null, credorNome: ct.fornecedor, credorDocumento: ct.cnpj },
        historico: `${meta.objeto ?? p.assunto} — processo ${p.numero}`,
        data: dataEmp,
        valor,
        liqs: dLiq ? [{ data: dLiq, valor, doc: nota(), venc: addDias(dLiq, 30), pago: dPago && dPago <= ontem ? dPago : null }] : [],
        reserva: { valor, data: dReserva, processoId: p.id, historico: `Reserva para ${p.numero} — ${meta.objeto ?? p.assunto}` },
        processoId: p.id,
      });
    }

    // ---- grava: reservas, empenhos (numerados por data), liquidações e pagamentos ----
    const todasReservas = [
      ...emps.filter((e) => e.reserva).map((e) => ({ ...e.reserva!, dot: e.dot, emp: e })),
      ...reservasSoltas.map((r) => ({ ...r, emp: null as Emp | null })),
    ].sort((a, b) => a.data.localeCompare(b.data));
    const reservaDoEmp = new Map<Emp, string>();
    let nr = 0;
    for (const r of todasReservas) {
      const [row] = await db
        .insert(finReservas)
        .values({ municipioId, ano, numero: ++nr, dotacaoId: r.dot, processoId: r.processoId, data: r.data, valor: r.valor, historico: r.historico, criadoPorId: contador })
        .returning();
      if (r.emp) reservaDoEmp.set(r.emp, row.id);
    }
    emps.sort((a, b) => a.data.localeCompare(b.data) || a.historico.localeCompare(b.historico));
    let ne = 0;
    const liqRows: (typeof finLiquidacoes.$inferInsert)[] = [];
    const pagPendentes: { idx: number; data: string; valor: number; conta: string }[] = [];
    for (const e of emps) {
      const [row] = await db
        .insert(finEmpenhos)
        .values({
          municipioId,
          ano,
          numero: ++ne,
          dotacaoId: e.dot,
          reservaId: reservaDoEmp.get(e) ?? null,
          tipo: e.tipo,
          ...e.credor,
          historico: e.historico,
          data: e.data,
          valor: e.valor,
          criadoPorId: contador,
        })
        .returning();
      if (e.processoId) await db.insert(finProcessoEmpenho).values({ processoId: e.processoId, empenhoId: row.id });
      for (const l of e.liqs) {
        liqRows.push({ empenhoId: row.id, data: l.data, valor: l.valor, documentoFiscal: l.doc, vencimento: l.venc, criadoPorId: contador });
        if (l.pago) pagPendentes.push({ idx: liqRows.length - 1, data: l.pago, valor: l.valor, conta: contaPara(e.dot) });
      }
    }
    const ids: string[] = [];
    for (let i = 0; i < liqRows.length; i += 500) {
      const rs = await db.insert(finLiquidacoes).values(liqRows.slice(i, i + 500)).returning({ id: finLiquidacoes.id });
      ids.push(...rs.map((r) => r.id));
    }
    const pagRows = pagPendentes.map((p) => ({ liquidacaoId: ids[p.idx], contaId: p.conta, data: p.data, valor: p.valor, criadoPorId: tesoureira }));
    for (let i = 0; i < pagRows.length; i += 500) await db.insert(finPagamentos).values(pagRows.slice(i, i + 500));

    // ---- receita prevista × arrecadada ----
    const recRows: (typeof finReceitas.$inferInsert)[] = [];
    for (const [cat, r] of Object.entries(RECEITAS)) {
      r.pesos.forEach((p, i) => {
        const mes = i + 1;
        const previsto = r2(r.anual * 1000 * p);
        let arrecadado: number | null = null;
        if (mes <= mesAtual) {
          arrecadado = cat === "CONVENIOS" ? CONVENIOS_ARRECADADO[i] * 1000 : r2(previsto * r.desempenho * (1 + 0.025 * Math.sin(mes * 1.7 + cat.length)) * (mes === mesAtual ? 0.97 : 1));
        }
        recRows.push({ municipioId, ano, mes, categoria: cat, previsto, arrecadado });
      });
    }
    await db.insert(finReceitas).values(recRows);
  },
};

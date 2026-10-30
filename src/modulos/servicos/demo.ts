// Dados de demonstração do módulo de serviços urbanos: secretarias, equipes, catálogo,
// ~40 ocorrências nos últimos 60 dias (várias concluídas e avaliadas, algumas atrasadas) e ordens de serviço em andamento.
import { and, eq, inArray } from "drizzle-orm";
import type { ModuloDemo } from "../../db/demo/contexto";
import * as schema from "../../db/schema";
import { addDiasUteis } from "../../lib/dates";
import type { MaterialUsado } from "../../db/schema/servicos";

type Status = "ABERTA" | "ACEITA" | "PROGRAMADA" | "EM_EXECUCAO" | "CONCLUIDA" | "RECUSADA" | "DUPLICADA";

/** Quem pediu: chave de pessoa demo, "emp:<empresa>" (Carlos pela empresa) ou nome de quem ligou/escreveu. */
type Spec = {
  k: string;
  s: string;
  b: string;
  r: string;
  n?: string;
  ref?: string;
  desc: string;
  d: number;
  st: Status;
  quem: string;
  canal?: "PORTAL" | "WHATSAPP" | "TELEFONE" | "PRESENCIAL";
  c?: number;
  nota?: number;
  com?: string;
  os?: string;
  motivo?: string;
  dupDe?: string;
};

const SERVICOS = [
  {
    chave: "tapa-buraco",
    nome: "Buraco na rua (tapa-buraco)",
    descricao: "Buracos e afundamentos no asfalto ou no calçamento de ruas do município.",
    categoria: "VIAS",
    setor: "SEINFRA",
    sla: 10,
    foto: true,
  },
  {
    chave: "iluminacao",
    nome: "Lâmpada queimada ou poste apagado",
    descricao: "Iluminação pública apagada, acesa durante o dia ou piscando.",
    categoria: "ILUMINACAO",
    setor: "SMSU",
    sla: 5,
    foto: false,
  },
  {
    chave: "poda",
    nome: "Poda ou avaliação de árvore",
    descricao: "Árvore em área pública com galhos sobre a fiação, risco de queda ou atrapalhando a passagem.",
    categoria: "ARBORIZACAO",
    setor: "SMMA",
    sla: 20,
    foto: true,
  },
  {
    chave: "entulho",
    nome: "Recolhimento de entulho ou galhos",
    descricao: "Galhos, restos de poda e pequenos volumes de entulho deixados em via pública.",
    categoria: "LIMPEZA",
    setor: "SMSU",
    sla: 7,
    foto: false,
  },
  {
    chave: "boca-de-lobo",
    nome: "Limpeza de boca de lobo",
    descricao: "Bueiro ou boca de lobo entupido, com água parada ou mau cheiro.",
    categoria: "DRENAGEM",
    setor: "SMSU",
    sla: 5,
    foto: false,
  },
  {
    chave: "sinalizacao",
    nome: "Placa ou pintura de sinalização",
    descricao: "Placa de trânsito caída ou danificada, faixa de pedestres ou pintura apagada.",
    categoria: "SINALIZACAO",
    setor: "SEINFRA",
    sla: 15,
    foto: false,
  },
  {
    chave: "animal-morto",
    nome: "Animal morto na via",
    descricao: "Recolhimento de animal morto em rua, estrada ou área pública.",
    categoria: "ZOONOSES",
    setor: "SMSU",
    sla: 1,
    foto: false,
  },
  {
    chave: "capina",
    nome: "Capina e roçada em área pública",
    descricao: "Mato alto em praças, canteiros, calçadas e margens de estradas municipais.",
    categoria: "LIMPEZA",
    setor: "SMSU",
    sla: 15,
    foto: false,
  },
] as const;

const EQUIPES = [
  {
    chave: "luz",
    setor: "SMSU",
    nome: "Iluminação Pública",
    membros: "Vanderlei Zanella (eletricista líder), Jonas Pagnoncelli (eletricista). Caminhão cesto aéreo IUV-4C21.",
    enc: true,
  },
  {
    chave: "limpeza",
    setor: "SMSU",
    nome: "Limpeza Urbana – Turma A",
    membros: "Vanderlei Zanella (encarregado), Edson Paim, Lauro Frizzo, Roque Andreola. Caminhão hidrojato.",
    enc: true,
  },
  {
    chave: "coleta",
    setor: "SMSU",
    nome: "Coleta de Galhos e Entulho",
    membros: "Cleber Tonietto (motorista), Mauro Basso, Alcides Giacomin. Caminhão basculante e retroescavadeira.",
  },
  {
    chave: "buraco",
    setor: "SEINFRA",
    nome: "Operação Tapa-Buraco",
    membros: "Darci Moschen (encarregado), Ivan Zatti, Paulo Fiorin, Nelson Cappellari. Caminhão e rolo compactador.",
  },
  { chave: "sinal", setor: "SEINFRA", nome: "Sinalização Viária", membros: "Rudimar Vedana, Elton Bonatto. Caminhonete com kit de pintura." },
  {
    chave: "poda",
    setor: "SMMA",
    nome: "Poda e Arborização",
    membros: "Cláudio Ferrari (técnico florestal), Lucas Debastiani, Valdir Pasqual. Motosserras e triturador.",
  },
] as const;

const EQUIPE_PADRAO: Record<string, string> = {
  "tapa-buraco": "buraco",
  sinalizacao: "sinal",
  iluminacao: "luz",
  "boca-de-lobo": "limpeza",
  capina: "limpeza",
  entulho: "coleta",
  "animal-morto": "coleta",
  poda: "poda",
};

const CONCLUSAO: Record<string, { obs: string; mat: MaterialUsado[] }> = {
  "tapa-buraco": {
    obs: "Buraco recomposto com massa asfáltica e compactação.",
    mat: [
      { item: "Massa asfáltica a frio", quantidade: "0,4 t" },
      { item: "Emulsão asfáltica RR-2C", quantidade: "20 L" },
    ],
  },
  iluminacao: {
    obs: "Lâmpada de LED 100 W substituída e relé fotoelétrico testado.",
    mat: [
      { item: "Lâmpada LED 100 W", quantidade: "1 un" },
      { item: "Relé fotoelétrico", quantidade: "1 un" },
    ],
  },
  poda: { obs: "Poda de limpeza e afastamento da rede elétrica; galhos triturados no local.", mat: [{ item: "Combustível de motosserra", quantidade: "3 L" }] },
  entulho: {
    obs: "Material recolhido com caminhão basculante e levado à central de triagem.",
    mat: [{ item: "Viagem de caminhão basculante", quantidade: "1 viagem" }],
  },
  "boca-de-lobo": { obs: "Boca de lobo desobstruída; retirados areia, folhas e resíduos.", mat: [{ item: "Sacos de ráfia", quantidade: "6 un" }] },
  sinalizacao: {
    obs: "Placa reinstalada e pintura refeita.",
    mat: [
      { item: "Placa de regulamentação", quantidade: "1 un" },
      { item: "Tinta para demarcação viária", quantidade: "3,6 L" },
    ],
  },
  "animal-morto": { obs: "Animal recolhido e encaminhado para destinação adequada.", mat: [{ item: "Sacos para resíduo", quantidade: "2 un" }] },
  capina: { obs: "Capina e roçada concluídas; resíduos recolhidos no mesmo dia.", mat: [{ item: "Fio de roçadeira", quantidade: "15 m" }] },
};

const SPECS: Spec[] = [
  // ---- concluídas
  {
    k: "ana1",
    s: "iluminacao",
    b: "Centro",
    r: "Rua das Hortênsias",
    n: "200",
    ref: "Esquina com a Rua dos Imigrantes",
    desc: "O poste da esquina está apagado há uma semana e a rua fica muito escura à noite.",
    d: 16,
    st: "CONCLUIDA",
    quem: "ana",
    c: 12,
  },
  {
    k: "c2",
    s: "tapa-buraco",
    b: "Petrópolis",
    r: "Rua Bento Gonçalves",
    n: "1450",
    desc: "Buraco grande na pista da direita, perto da parada de ônibus.",
    d: 58,
    st: "CONCLUIDA",
    quem: "Ivone Tomazi",
    canal: "TELEFONE",
    c: 50,
    nota: 4,
    com: "Resolveram bem, só demorou um pouco.",
  },
  {
    k: "c3",
    s: "iluminacao",
    b: "Glória",
    r: "Rua Garibaldi",
    n: "330",
    desc: "Lâmpada do poste em frente ao número 330 queimada.",
    d: 55,
    st: "CONCLUIDA",
    quem: "Sérgio Bortolini",
    canal: "WHATSAPP",
    c: 52,
    nota: 5,
    com: "Trocaram a lâmpada em três dias. Ótimo.",
  },
  {
    k: "c4",
    s: "entulho",
    b: "Centro",
    r: "Rua Júlio de Castilhos",
    n: "88",
    desc: "Restos de poda deixados na calçada há mais de uma semana, atrapalhando quem passa a pé.",
    d: 52,
    st: "CONCLUIDA",
    quem: "juliana",
    c: 47,
    nota: 5,
  },
  {
    k: "c5",
    s: "poda",
    b: "Medianeira",
    r: "Rua Coronel Flores",
    n: "512",
    desc: "Plátano com galhos secos encostando na fiação, risco de cair em cima dos carros.",
    d: 57,
    st: "CONCLUIDA",
    quem: "Rosane Peruzzo",
    canal: "TELEFONE",
    c: 21,
    nota: 2,
    com: "Demorou mais de um mês e um galho caiu no meu carro antes da poda.",
  },
  {
    k: "c6",
    s: "boca-de-lobo",
    b: "Industrial",
    r: "Av. Presidente Vargas",
    n: "2100",
    desc: "Boca de lobo entupida; quando chove a água invade a calçada.",
    d: 49,
    st: "CONCLUIDA",
    quem: "Metalúrgica Serrana (portaria)",
    canal: "TELEFONE",
    c: 45,
    nota: 4,
  },
  {
    k: "c7",
    s: "animal-morto",
    b: "Vila Nova",
    r: "Estrada Municipal VA-020",
    ref: "Km 3, perto da ponte",
    desc: "Cachorro morto no acostamento.",
    d: 45,
    st: "CONCLUIDA",
    quem: "Gilberto Sachet",
    canal: "WHATSAPP",
    c: 44,
    nota: 5,
    com: "Recolheram no mesmo dia.",
  },
  {
    k: "c8",
    s: "sinalizacao",
    b: "Centro",
    r: "Rua Marechal Floriano",
    ref: "Esquina com a Rua Sinimbu",
    desc: "Placa de PARE torta, quase caindo, e faixa de retenção apagada.",
    d: 44,
    st: "CONCLUIDA",
    quem: "Tânia Zanotto",
    canal: "PRESENCIAL",
    c: 30,
    nota: 3,
    com: "A placa foi recolocada, mas a pintura ainda está fraca.",
  },
  {
    k: "c9",
    s: "capina",
    b: "Santa Catarina",
    r: "Praça Santa Catarina",
    desc: "Mato alto em volta dos brinquedos da praça.",
    d: 42,
    st: "CONCLUIDA",
    quem: "Associação de Moradores do Santa Catarina",
    canal: "PRESENCIAL",
    c: 26,
    nota: 4,
  },
  {
    k: "c10",
    s: "tapa-buraco",
    b: "Industrial",
    r: "Rua dos Metalúrgicos",
    n: "300",
    desc: "Afundamento no asfalto na entrada das empresas, caminhões desviando.",
    d: 40,
    st: "CONCLUIDA",
    quem: "Fábio Lorenzon",
    canal: "WHATSAPP",
    c: 31,
  },
  {
    k: "c11",
    s: "iluminacao",
    b: "Vila Nova",
    r: "Rua Ernesto Alves",
    n: "980",
    desc: "Poste aceso durante o dia inteiro.",
    d: 38,
    st: "CONCLUIDA",
    quem: "Lurdes Toigo",
    canal: "TELEFONE",
    c: 36,
    nota: 5,
  },
  {
    k: "c12",
    s: "entulho",
    b: "Glória",
    r: "Rua Os Dezoito do Forte",
    n: "145",
    desc: "Galhos e tábuas largados no terreno da esquina, na calçada.",
    d: 35,
    st: "CONCLUIDA",
    quem: "Roberto Lima",
    canal: "WHATSAPP",
    c: 33,
    nota: 4,
    com: "Atendimento rápido.",
  },
  {
    k: "c13",
    s: "boca-de-lobo",
    b: "Centro",
    r: "Av. Borges de Medeiros",
    n: "640",
    desc: "Mau cheiro forte saindo do bueiro em frente à farmácia.",
    d: 30,
    st: "CONCLUIDA",
    quem: "Clarice Bertoldi",
    canal: "TELEFONE",
    c: 28,
  },
  {
    k: "c14",
    s: "tapa-buraco",
    b: "Medianeira",
    r: "Rua Pinheiro Machado",
    n: "1820",
    desc: "Buraco fundo no meio da rua; já abri pedido antes e ele voltou depois da chuva.",
    d: 28,
    st: "CONCLUIDA",
    quem: "Hélio Casagrande",
    canal: "WHATSAPP",
    c: 8,
    nota: 1,
    com: "Demorou quase três semanas e o buraco voltou a abrir com a chuva.",
  },
  {
    k: "c15",
    s: "iluminacao",
    b: "Petrópolis",
    r: "Rua Visconde de Pelotas",
    n: "410",
    desc: "Duas lâmpadas apagadas em sequência no quarteirão.",
    d: 24,
    st: "CONCLUIDA",
    quem: "Márcia Pozza",
    canal: "TELEFONE",
    c: 22,
    nota: 5,
  },
  {
    k: "c16",
    s: "poda",
    b: "Jardim dos Pinheiros",
    r: "Rua dos Ipês",
    n: "55",
    desc: "Árvore da calçada com galhos baixos batendo nos caminhões de coleta.",
    d: 26,
    st: "CONCLUIDA",
    quem: "Eduardo Grando",
    canal: "TELEFONE",
    c: 10,
    nota: 4,
    com: "Equipe cuidadosa, deixaram tudo limpo.",
  },
  {
    k: "c17",
    s: "entulho",
    b: "Centro",
    r: "Rua do Comércio",
    n: "100",
    desc: "Pedaços da calçada quebrada pela raiz da árvore ficaram amontoados em frente à loja.",
    d: 20,
    st: "CONCLUIDA",
    quem: "emp:mendes",
    c: 15,
  },
  {
    k: "c18",
    s: "animal-morto",
    b: "Centro",
    r: "Rua Sinimbu",
    n: "1200",
    desc: "Gato atropelado no meio da rua.",
    d: 14,
    st: "CONCLUIDA",
    quem: "Paula Fontana",
    canal: "WHATSAPP",
    c: 14,
    nota: 5,
  },
  {
    k: "c19",
    s: "capina",
    b: "Glória",
    r: "Rua Garibaldi",
    ref: "Canteiro central, entre os números 500 e 800",
    desc: "Mato alto no canteiro tapando a visão de quem atravessa.",
    d: 18,
    st: "CONCLUIDA",
    quem: "Neiva Scopel",
    canal: "TELEFONE",
    c: 6,
  },
  {
    k: "c20",
    s: "boca-de-lobo",
    b: "São Cristóvão",
    r: "Rua Tiradentes",
    n: "410",
    desc: "Bueiro entupido com folhas, água empoçada na frente de casa.",
    d: 11,
    st: "CONCLUIDA",
    quem: "carlos",
    c: 7,
    nota: 4,
  },

  // ---- em andamento
  {
    k: "ana2",
    s: "tapa-buraco",
    b: "Centro",
    r: "Rua das Hortênsias",
    n: "230",
    ref: "Perto da faixa de pedestres",
    desc: "Buraco grande perto da faixa de pedestres; os carros desviam para a contramão.",
    d: 6,
    st: "EM_EXECUCAO",
    quem: "ana",
    os: "buraco-hort",
  },
  {
    k: "e22",
    s: "tapa-buraco",
    b: "Centro",
    r: "Rua dos Imigrantes",
    n: "90",
    desc: "Dois buracos seguidos na subida, perto da escola.",
    d: 9,
    st: "EM_EXECUCAO",
    quem: "Neusa Dall'Agnol",
    canal: "WHATSAPP",
    os: "buraco-hort",
  },
  {
    k: "ana3",
    s: "entulho",
    b: "Centro",
    r: "Rua das Hortênsias",
    n: "212",
    desc: "Galhos da poda do condomínio vizinho deixados na calçada, ocupando a passagem.",
    d: 1,
    st: "ABERTA",
    quem: "ana",
  },
  {
    k: "e24",
    s: "iluminacao",
    b: "Petrópolis",
    r: "Rua Visconde de Pelotas",
    n: "120",
    desc: "Lâmpada piscando a noite toda.",
    d: 4,
    st: "PROGRAMADA",
    quem: "Jaqueline Rech",
    canal: "TELEFONE",
    os: "luz-petro",
  },
  {
    k: "e25",
    s: "iluminacao",
    b: "Petrópolis",
    r: "Rua Dom Pedro II",
    n: "455",
    desc: "Poste apagado em frente ao mercado.",
    d: 3,
    st: "PROGRAMADA",
    quem: "Marta Oliveira",
    canal: "WHATSAPP",
    os: "luz-petro",
  },
  {
    k: "e26",
    s: "iluminacao",
    b: "Petrópolis",
    r: "Rua Tuiuti",
    n: "88",
    desc: "Duas lâmpadas queimadas na quadra da creche.",
    d: 2,
    st: "PROGRAMADA",
    quem: "Creche Pequeno Pinheiro",
    canal: "TELEFONE",
    os: "luz-petro",
  },
  {
    k: "e27",
    s: "iluminacao",
    b: "Petrópolis",
    r: "Rua Dom Pedro II",
    n: "450",
    desc: "Poste da frente do mercado sem luz.",
    d: 2,
    st: "DUPLICADA",
    quem: "Ademir Rossi",
    canal: "TELEFONE",
    dupDe: "e25",
  },
  {
    k: "e28",
    s: "boca-de-lobo",
    b: "Centro",
    r: "Rua Marechal Floriano",
    n: "300",
    desc: "Boca de lobo tomada de areia depois da obra da esquina.",
    d: 5,
    st: "EM_EXECUCAO",
    quem: "Jorge Pasqualotto",
    canal: "TELEFONE",
    os: "boca-centro",
  },
  {
    k: "e29",
    s: "boca-de-lobo",
    b: "Centro",
    r: "Rua Júlio de Castilhos",
    n: "410",
    desc: "Água parada e mosquitos na boca de lobo da esquina.",
    d: 4,
    st: "EM_EXECUCAO",
    quem: "Débora Colombo",
    canal: "WHATSAPP",
    os: "boca-centro",
  },
  {
    k: "e30",
    s: "entulho",
    b: "Vila Nova",
    r: "Rua Ernesto Alves",
    n: "1500",
    desc: "Entulho de reforma descartado no terreno baldio ao lado.",
    d: 3,
    st: "PROGRAMADA",
    quem: "Valmor Benetti",
    canal: "TELEFONE",
    os: "entulho-vn",
  },
  {
    k: "e31",
    s: "poda",
    b: "Petrópolis",
    r: "Rua Visconde de Pelotas",
    n: "900",
    desc: "Galho grande apoiado na fiação da rua, balança com o vento.",
    d: 35,
    st: "ACEITA",
    quem: "Irene Mazzotti",
    canal: "TELEFONE",
  },
  {
    k: "e32",
    s: "poda",
    b: "Glória",
    r: "Rua Garibaldi",
    n: "700",
    desc: "Árvore inclinada sobre a calçada, raízes levantando o piso.",
    d: 33,
    st: "ABERTA",
    quem: "Odete Fracasso",
    canal: "PRESENCIAL",
  },
  {
    k: "e33",
    s: "tapa-buraco",
    b: "São Cristóvão",
    r: "Rua Tiradentes",
    n: "1500",
    desc: "Buraco perto do bueiro que aumenta a cada chuva.",
    d: 25,
    st: "ACEITA",
    quem: "Antônio Rigon",
    canal: "WHATSAPP",
  },
  {
    k: "e34",
    s: "sinalizacao",
    b: "Industrial",
    r: "Av. Presidente Vargas",
    ref: "Esquina com a Rua dos Metalúrgicos",
    desc: "Placa de PARE derrubada por caminhão; cruzamento sem sinalização.",
    d: 29,
    st: "ACEITA",
    quem: "Fábio Lorenzon",
    canal: "WHATSAPP",
  },
  {
    k: "e35",
    s: "capina",
    b: "Medianeira",
    r: "Praça da Medianeira",
    desc: "Mato alto em toda a praça; os moradores pararam de usar.",
    d: 27,
    st: "ACEITA",
    quem: "Associação de Moradores da Medianeira",
    canal: "PRESENCIAL",
  },
  {
    k: "e36",
    s: "tapa-buraco",
    b: "Interior (zona rural)",
    r: "Estrada Municipal VA-010",
    ref: "Linha Alegre, perto da capela",
    desc: "Buracos no trecho asfaltado que leva à escola rural; o ônibus escolar está passando com dificuldade.",
    d: 12,
    st: "PROGRAMADA",
    quem: "Comunidade da Linha Alegre",
    canal: "PRESENCIAL",
    os: "va010",
  },
  {
    k: "e37",
    s: "iluminacao",
    b: "Industrial",
    r: "Rua dos Metalúrgicos",
    n: "1020",
    desc: "Três postes apagados no trecho perto do ponto de ônibus.",
    d: 1,
    st: "ABERTA",
    quem: "Silvana Webber",
    canal: "WHATSAPP",
  },
  {
    k: "e38",
    s: "boca-de-lobo",
    b: "Medianeira",
    r: "Rua Coronel Flores",
    n: "300",
    desc: "Grade da boca de lobo solta e entupida com lixo.",
    d: 2,
    st: "ABERTA",
    quem: "juliana",
  },
  {
    k: "e39",
    s: "animal-morto",
    b: "Glória",
    r: "Rua Os Dezoito do Forte",
    n: "600",
    desc: "Animal de grande porte (bezerro) morto no acostamento.",
    d: 0,
    st: "ABERTA",
    quem: "Gerson Pilonetto",
    canal: "TELEFONE",
  },
  {
    k: "e40",
    s: "sinalizacao",
    b: "Centro",
    r: "Rua Sinimbu",
    n: "800",
    ref: "Em frente à Escola Municipal Olavo Bilac",
    desc: "Faixa de pedestres totalmente apagada na frente da escola.",
    d: 8,
    st: "ACEITA",
    quem: "Escola Municipal Olavo Bilac",
    canal: "PRESENCIAL",
  },
  {
    k: "e41",
    s: "poda",
    b: "Santa Catarina",
    r: "Rua das Araucárias",
    n: "140",
    desc: "Galhos da árvore da calçada cobrindo a luminária, a rua fica escura.",
    d: 10,
    st: "ABERTA",
    quem: "Cristiane Lunardi",
    canal: "TELEFONE",
  },
  {
    k: "e42",
    s: "poda",
    b: "Jardim dos Pinheiros",
    r: "Rua dos Pinheiros",
    n: "77",
    desc: "Árvore grande no pátio da minha casa, quero que a prefeitura corte.",
    d: 20,
    st: "RECUSADA",
    quem: "Osmar Tedesco",
    canal: "TELEFONE",
    motivo:
      "A árvore fica dentro de terreno particular. O corte ou a poda é responsabilidade do proprietário e precisa de autorização ambiental, que pode ser pedida na Secretaria de Meio Ambiente.",
  },
];

/** Ordens de serviço que reúnem vários pedidos. `data`: hoje (0) ou dias úteis à frente. */
const ORDENS_GRUPO: Record<
  string,
  { equipe: string; data: number; status: "PROGRAMADA" | "EM_EXECUCAO"; instrucoes?: string; mat?: MaterialUsado[]; reprog?: { de: number; motivo: string } }
> = {
  "buraco-hort": {
    equipe: "buraco",
    data: 0,
    status: "EM_EXECUCAO",
    instrucoes: "Começar pela Rua dos Imigrantes (perto da escola) antes da entrada dos alunos.",
    mat: [{ item: "Massa asfáltica a frio", quantidade: "0,6 t" }],
  },
  "luz-petro": { equipe: "luz", data: 0, status: "PROGRAMADA", instrucoes: "Levar 4 lâmpadas LED 100 W e relés. Verificar também a rede da Rua Dom Pedro II." },
  "boca-centro": { equipe: "limpeza", data: 0, status: "EM_EXECUCAO", instrucoes: "Usar o hidrojato na boca de lobo da Marechal Floriano." },
  "entulho-vn": { equipe: "coleta", data: 1, status: "PROGRAMADA" },
  va010: {
    equipe: "buraco",
    data: 6,
    status: "PROGRAMADA",
    instrucoes: "Trecho de 1,2 km. Avisar a Secretaria de Educação sobre o desvio do ônibus escolar.",
    reprog: { de: 2, motivo: "o rolo compactador está em manutenção e volta na próxima semana." },
  },
};

const TZ = "America/Fortaleza";
const diaIso = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ });
/** Data n dias atrás, no horário local indicado (limitada a "agora"). */
function quando(diasAtras: number, hora: number, min = 0) {
  const base = diaIso(new Date(Date.now() - diasAtras * 86400_000));
  const d = new Date(`${base}T${String(hora).padStart(2, "0")}:${String(min).padStart(2, "0")}:00-03:00`);
  const limite = Date.now() - 20 * 60_000;
  return d.getTime() > limite ? new Date(limite) : d;
}
function fimDeSemana(diasAtras: number) {
  const dow = new Date(`${diaIso(new Date(Date.now() - diasAtras * 86400_000))}T12:00:00-03:00`).getUTCDay();
  return dow === 0 || dow === 6;
}
const maisHoras = (d: Date, h: number) => {
  const x = new Date(d.getTime() + h * 3600_000);
  const limite = Date.now() - 10 * 60_000;
  return x.getTime() > limite ? new Date(limite) : x;
};

export const servicosDemo: ModuloDemo = {
  nome: "Serviços urbanos",
  async aplicar(ctx) {
    const db = ctx.db;
    const mun = ctx.municipioId;

    // ---- secretarias executoras que ainda não existem no seed base
    for (const [sigla, nome, sla] of [
      ["SMSU", "Secretaria de Serviços Urbanos", 5],
      ["SMMA", "Secretaria de Meio Ambiente", 5],
    ] as const)
      await db.insert(schema.setores).values({ municipioId: mun, sigla, nome, slaPadraoDias: sla }).onConflictDoNothing();
    const setRows = await db.query.setores.findMany({ where: eq(schema.setores.municipioId, mun) });
    const setor = Object.fromEntries(setRows.map((s) => [s.sigla, s])) as Record<string, (typeof setRows)[number]>;

    // ---- servidores das secretarias executoras (senha 123456, a mesma do seed)
    const ref = await db.query.usuarios.findFirst({ where: and(eq(schema.usuarios.municipioId, mun), eq(schema.usuarios.cpf, "11111111111")) });
    const senhaHash = ref!.senhaHash;
    const novos: [string, string, string, string, string[], string][] = [
      ["30303030303", "Rogério Battisti", "servicosurbanos@valedasaraucarias.rs.gov.br", "Secretário de Serviços Urbanos", ["SECRETARIO"], "SMSU"],
      ["40404040404", "Vanderlei Zanella", "iluminacao@valedasaraucarias.rs.gov.br", "Encarregado de equipe de campo", [], "SMSU"],
      ["50505050505", "Gilmar Pertile", "vias@valedasaraucarias.rs.gov.br", "Diretor de Vias Urbanas", ["SECRETARIO"], "SEINFRA"],
      ["60606060606", "Luciane Ferronato", "meioambiente@valedasaraucarias.rs.gov.br", "Secretária de Meio Ambiente", ["SECRETARIO"], "SMMA"],
    ];
    for (const [cpf, nome, email, cargo, papeis, sigla] of novos)
      await db.insert(schema.usuarios).values({ municipioId: mun, cpf, nome, email, cargo, papeis, senhaHash, setorId: setor[sigla].id }).onConflictDoNothing();
    const uRows = await db.query.usuarios.findMany({
      where: and(
        eq(schema.usuarios.municipioId, mun),
        inArray(
          schema.usuarios.cpf,
          novos.map((n) => n[0]),
        ),
      ),
    });
    const usr = Object.fromEntries(uRows.map((u) => [u.cpf, u])) as Record<string, (typeof uRows)[number]>;
    const triador: Record<string, (typeof uRows)[number]> = { SMSU: usr["30303030303"], SEINFRA: usr["50505050505"], SMMA: usr["60606060606"] };

    // ---- catálogo e equipes
    const cat: Record<string, { id: string; sla: number; setor: string }> = {};
    let ordem = 10;
    for (const s of SERVICOS) {
      const [c] = await db
        .insert(schema.servicosCatalogo)
        .values({
          municipioId: mun,
          chave: s.chave,
          nome: s.nome,
          descricao: s.descricao,
          categoria: s.categoria,
          setorId: setor[s.setor].id,
          slaDiasUteis: s.sla,
          exigeFoto: s.foto,
          ordem,
        })
        .returning();
      cat[s.chave] = { id: c.id, sla: s.sla, setor: s.setor };
      ordem += 10;
    }
    const eq_: Record<string, { id: string; nome: string; setor: string }> = {};
    for (const e of EQUIPES) {
      const [r] = await db
        .insert(schema.servicosEquipes)
        .values({
          municipioId: mun,
          setorId: setor[e.setor].id,
          nome: e.nome,
          membros: e.membros,
          encarregadoId: "enc" in e && e.enc ? usr["40404040404"].id : null,
        })
        .returning();
      eq_[e.chave] = { id: r.id, nome: e.nome, setor: e.setor };
    }

    const fer = new Set(
      (await db.select({ data: schema.feriados.data }).from(schema.feriados).where(eq(schema.feriados.municipioId, mun))).map((r) => String(r.data)),
    );
    const fmt = (iso: string) => iso.split("-").reverse().join("/");
    /** Hoje (n = 0) ou n dias úteis à frente. */
    const diaUtil = (n: number) => (n <= 0 ? diaIso(new Date()) : diaIso(new Date(addDiasUteis(new Date(), n, fer).getTime() - 12 * 3600_000)));

    // ---- datas de cada pedido
    type Calc = Spec & {
      aberta: Date;
      triada: Date | null;
      concluida: Date | null;
      prazo: Date;
      setor: string;
      nome: string;
      pessoaId: string | null;
      empresaId: string | null;
    };
    const calc: Calc[] = SPECS.map((sp, i) => {
      const svc = cat[sp.s];
      const aberta = quando(sp.d, 7 + ((i * 5) % 11), (i * 17) % 60);
      const triada = sp.st === "ABERTA" ? null : maisHoras(aberta, sp.d === 0 ? 1 : 3 + (i % 5) * 4);
      // equipes trabalham em dias úteis: conclusão cai no dia útil anterior (ou seguinte, se não houver)
      let cDias = sp.c;
      if (cDias !== undefined) {
        while (fimDeSemana(cDias) && cDias < sp.d) cDias += 1;
        while (fimDeSemana(cDias) && cDias > 0) cDias -= 1;
      }
      const c0 = cDias !== undefined ? quando(cDias, 14 + (i % 4), (i * 7) % 60) : null;
      const concluida = c0 && c0.getTime() < aberta.getTime() + 2 * 3600_000 ? maisHoras(aberta, 3) : c0;
      let pessoaId: string | null = null;
      let empresaId: string | null = null;
      let nome = sp.quem;
      if (sp.quem.startsWith("emp:")) {
        pessoaId = ctx.pessoas.carlos;
        empresaId = ctx.empresas[sp.quem.slice(4)];
        nome = "Mendes Materiais de Construção Ltda (por Carlos Mendes)";
      } else if (ctx.pessoas[sp.quem]) {
        pessoaId = ctx.pessoas[sp.quem];
        nome =
          { ana: "Ana Beatriz Souza", carlos: "Carlos Mendes", juliana: "Juliana Rocha", roberto: "Roberto Lima", marta: "Marta Oliveira" }[sp.quem] ?? sp.quem;
      }
      return {
        ...sp,
        aberta,
        triada: concluida && triada && triada > concluida ? new Date(concluida.getTime() - 3600_000) : triada,
        concluida,
        prazo: addDiasUteis(aberta, svc.sla, fer),
        setor: svc.setor,
        nome,
        pessoaId,
        empresaId,
      };
    });

    // ---- ordens de serviço (uma por pedido concluído; grupos definidos acima)
    type OsCalc = {
      chave: string;
      setor: string;
      equipe: string;
      data: string;
      status: string;
      criada: Date;
      iniciada: Date | null;
      concluida: Date | null;
      instrucoes?: string;
      obs?: string;
      mat: MaterialUsado[];
      criador: string;
      membros: Calc[];
      reprog?: { de: string; motivo: string };
    };
    const oss: OsCalc[] = [];
    for (const c of calc.filter((x) => x.st === "CONCLUIDA")) {
      const t = CONCLUSAO[c.s];
      const criada = maisHoras(c.triada!, 1);
      oss.push({
        chave: c.k,
        setor: c.setor,
        equipe: EQUIPE_PADRAO[c.s],
        data: diaIso(c.concluida!),
        status: "CONCLUIDA",
        criada: criada > c.concluida! ? new Date(c.concluida!.getTime() - 1800_000) : criada,
        iniciada: new Date(c.concluida!.getTime() - 2 * 3600_000),
        concluida: c.concluida,
        obs: c.k === "c14" ? `${t.obs} Trecho com base comprometida; recomendada recomposição completa no próximo programa de recapeamento.` : t.obs,
        mat: t.mat,
        criador: triador[c.setor].id,
        membros: [c],
      });
    }
    for (const [chave, g] of Object.entries(ORDENS_GRUPO)) {
      const membros = calc.filter((c) => c.os === chave);
      const ultimaTriagem = new Date(Math.max(...membros.map((m) => m.triada!.getTime())));
      const data = diaUtil(g.data);
      oss.push({
        chave,
        setor: membros[0].setor,
        equipe: g.equipe,
        data,
        status: g.status,
        criada: maisHoras(ultimaTriagem, 2),
        iniciada: g.status === "EM_EXECUCAO" ? quando(0, 8, 10) : null,
        concluida: null,
        instrucoes: g.instrucoes,
        mat: g.mat ?? [],
        criador: triador[membros[0].setor].id,
        membros,
        reprog: g.reprog ? { de: diaUtil(g.reprog.de), motivo: g.reprog.motivo } : undefined,
      });
    }
    oss.sort((a, b) => a.criada.getTime() - b.criada.getTime());
    const osId: Record<string, { id: string; numero: string; os: OsCalc }> = {};
    let seqOs = 0;
    for (const o of oss) {
      seqOs += 1;
      const numero = `OS-${ctx.ano}-${String(seqOs).padStart(4, "0")}`;
      const [r] = await db
        .insert(schema.servicosOrdens)
        .values({
          municipioId: mun,
          setorId: setor[o.setor].id,
          ano: ctx.ano,
          sequencial: seqOs,
          numero,
          equipeId: eq_[o.equipe].id,
          status: o.status,
          programadaPara: o.data,
          instrucoes: o.instrucoes ?? null,
          materiais: o.mat,
          observacao: o.obs ?? null,
          iniciadaEm: o.iniciada,
          concluidaEm: o.concluida,
          criadaPorId: o.criador,
          criadaEm: o.criada,
        })
        .returning();
      for (const m of o.membros) osId[m.k] = { id: r.id, numero, os: o };
    }

    // ---- ocorrências, em ordem de registro
    const ordenadas = [...calc].sort((a, b) => a.aberta.getTime() - b.aberta.getTime());
    const ocId: Record<string, { id: string; protocolo: string }> = {};
    let seq = 0;
    for (const c of ordenadas) {
      seq += 1;
      const protocolo = `SU-${ctx.ano}-${String(seq).padStart(5, "0")}`;
      const [r] = await db
        .insert(schema.servicosOcorrencias)
        .values({
          municipioId: mun,
          servicoId: cat[c.s].id,
          setorId: setor[c.setor].id,
          ano: ctx.ano,
          sequencial: seq,
          protocolo,
          status: c.st,
          canal: c.canal ?? "PORTAL",
          solicitantePessoaId: c.pessoaId,
          solicitanteEmpresaId: c.empresaId,
          solicitanteNome: c.nome,
          logradouro: c.r,
          numero: c.n ?? null,
          referencia: c.ref ?? null,
          bairro: c.b,
          descricao: c.desc,
          abertaEm: c.aberta,
          prazoEm: c.prazo,
          triadaEm: c.triada,
          concluidaEm: c.concluida,
          motivoRecusa: c.motivo ?? null,
          ordemId: osId[c.k]?.id ?? null,
          avaliacaoNota: c.nota ?? null,
          avaliacaoComentario: c.com ?? null,
          avaliadaEm: c.nota && c.concluida ? maisHoras(c.concluida, 18) : null,
        })
        .returning();
      ocId[c.k] = { id: r.id, protocolo };
    }
    for (const c of calc.filter((x) => x.dupDe))
      await db.update(schema.servicosOcorrencias).set({ duplicadaDeId: ocId[c.dupDe!].id }).where(eq(schema.servicosOcorrencias.id, ocId[c.k].id));

    // ---- linha do tempo de cada ocorrência
    const ev: (typeof schema.servicosEventos.$inferInsert)[] = [];
    const add = (
      c: Calc,
      tipo: string,
      texto: string,
      quando_: Date,
      autor: { nome: string; usuarioId?: string; pessoaId?: string; setor?: string },
      publico = true,
      dados: Record<string, unknown> = {},
    ) =>
      ev.push({
        ocorrenciaId: ocId[c.k].id,
        tipo,
        texto,
        publico,
        autorUsuarioId: autor.usuarioId ?? null,
        autorPessoaId: autor.pessoaId ?? null,
        autorNome: autor.nome,
        dados: { ...dados, ...(autor.setor ? { setor: autor.setor } : {}) },
        criadoEm: quando_,
      });
    const canalTexto: Record<string, string> = {
      PORTAL: "pelo Civu Cidadão",
      WHATSAPP: "pelo WhatsApp da prefeitura",
      TELEFONE: "pelo telefone 156",
      PRESENCIAL: "no atendimento presencial",
    };
    for (const c of calc) {
      const t = triador[c.setor];
      const autorT = { nome: t.nome, usuarioId: t.id, setor: setor[c.setor].nome };
      const canal = c.canal ?? "PORTAL";
      add(
        c,
        "REGISTRO",
        `Pedido registrado ${c.empresaId ? "pelo Civu Empresas" : canalTexto[canal]}. Protocolo ${ocId[c.k].protocolo}.`,
        c.aberta,
        canal === "PORTAL" ? { nome: c.nome, pessoaId: c.pessoaId ?? undefined } : { nome: "Central de atendimento 156", setor: "Central de atendimento" },
      );
      if (c.st === "ABERTA") continue;
      if (c.st === "RECUSADA") {
        add(c, "RECUSA", `Pedido não será atendido: ${c.motivo}`, c.triada!, autorT);
        continue;
      }
      if (c.st === "DUPLICADA") {
        const p = ocId[c.dupDe!];
        add(
          c,
          "DUPLICIDADE",
          `O mesmo problema já tinha sido informado no pedido ${p.protocolo}. Os dois serão atendidos juntos e você acompanha por aqui.`,
          c.triada!,
          autorT,
          true,
          {
            principalId: p.id,
            principal: p.protocolo,
          },
        );
        const principal = calc.find((x) => x.k === c.dupDe)!;
        ev.push({
          ocorrenciaId: p.id,
          tipo: "DUPLICIDADE",
          texto: `Pedido ${ocId[c.k].protocolo} vinculado a este como duplicado.`,
          publico: false,
          autorUsuarioId: t.id,
          autorNome: t.nome,
          dados: { duplicadaId: ocId[c.k].id, setor: setor[principal.setor].nome },
          criadoEm: c.triada!,
        });
        continue;
      }
      add(c, "ACEITE", "Pedido analisado e aceito pela secretaria. Ele entra na programação das equipes.", c.triada!, autorT);
      if (c.k === "e31")
        add(
          c,
          "NOTA",
          "Aguardando liberação da RGE para desligar a rede antes da poda. Pedido feito por e-mail à concessionária.",
          maisHoras(c.triada!, 30),
          autorT,
          false,
        );
      const os = osId[c.k];
      if (!os) continue;
      const o = os.os;
      const dataInicial = o.reprog ? o.reprog.de : o.data;
      add(c, "PROGRAMACAO", `Serviço programado para ${fmt(dataInicial)}.`, o.criada, autorT, true, {
        ordemId: os.id,
        ordem: os.numero,
        equipe: eq_[o.equipe].nome,
        data: dataInicial,
      });
      add(c, "ORDEM", `Incluída na ${os.numero}, equipe ${eq_[o.equipe].nome}.`, o.criada, autorT, false, { ordemId: os.id });
      if (o.reprog)
        add(c, "PROGRAMACAO", `Nova data prevista: ${fmt(o.data)}. Motivo: ${o.reprog.motivo}`, maisHoras(o.criada, 26), autorT, true, {
          de: o.reprog.de,
          para: o.data,
        });
      const enc =
        eq_[o.equipe].setor === "SMSU" && ["luz", "limpeza"].includes(o.equipe)
          ? { nome: usr["40404040404"].nome, usuarioId: usr["40404040404"].id, setor: setor.SMSU.nome }
          : autorT;
      if (o.iniciada) add(c, "INICIO", "A equipe começou o serviço no local.", o.iniciada, enc, true, { ordem: os.numero });
      if (c.st === "CONCLUIDA") {
        add(c, "CONCLUSAO", `Serviço concluído. ${o.obs}`, c.concluida!, enc, true, { ordem: os.numero });
        if (c.nota)
          add(
            c,
            "AVALIACAO",
            `Atendimento avaliado com nota ${c.nota} de 5.${c.com ? ` “${c.com}”` : ""}`,
            maisHoras(c.concluida!, 18),
            { nome: c.nome, pessoaId: c.pessoaId ?? undefined },
            true,
            {
              nota: c.nota,
            },
          );
      }
    }
    await db.insert(schema.servicosEventos).values(ev);
  },
};

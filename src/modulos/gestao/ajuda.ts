import { foraDoEscopo } from "@/lib/escopo";
// Central de ajuda: artigos curtos por módulo, ligados às rotas da gestão.
// O link "Ajuda" do topo leva a /ajuda?pagina=<rota atual>, que abre o artigo da página.
// Outros módulos podem acrescentar artigos em ARTIGOS (rotas = prefixos das páginas que o artigo explica).

export type Artigo = {
  slug: string;
  modulo: string;
  titulo: string;
  resumo: string;
  /** prefixos de rota que este artigo explica; o mais específico vence */
  rotas: string[];
  secoes: { titulo: string; texto: string[] }[];
};

const TODOS_ARTIGOS: Artigo[] = [
  {
    slug: "painel",
    modulo: "Visão da gestão",
    titulo: "Como ler o painel",
    resumo: "O que significam as cores, os números do topo e a lista de processos que precisam de atenção.",
    rotas: ["/painel"],
    secoes: [
      {
        titulo: "O resumo do topo",
        texto: [
          "A frase do topo conta quantos processos estão em andamento, quantos passaram do prazo da etapa e quantos ainda não foram recebidos pelo setor de destino.",
          "Os três números abaixo mostram a produção dos últimos 30 dias: processos abertos, concluídos e o tempo médio da abertura ao arquivamento.",
        ],
      },
      {
        titulo: "Cores",
        texto: ["Verde: no prazo. Amarelo: enviado, mas ninguém confirmou o recebimento. Vermelho: prazo da etapa estourado. A cor sempre vem acompanhada de texto."],
      },
    ],
  },
  {
    slug: "gabinete",
    modulo: "Visão da gestão",
    titulo: "Painel do prefeito e decisão em lote",
    resumo: "Como autorizar ou despachar vários processos de uma vez, com segurança e registro na trilha.",
    rotas: ["/gabinete"],
    secoes: [
      {
        titulo: "O que aparece aqui",
        texto: [
          "Processos que estão no Gabinete esperando decisão, alertas por gravidade, indicadores com tendência das últimas 8 semanas, prazos legais e pagamentos feitos fora da ordem cronológica.",
          "Cada indicador leva à sua origem e informa quem responde por ele. Indicadores de outros módulos aparecem aqui conforme cada módulo é implantado.",
        ],
      },
      {
        titulo: "Decidir em lote",
        texto: [
          "Marque os processos e escolha a ação. \"Autorizar\" junta o documento exigido pela etapa (por exemplo, o despacho de autorização), assina como ordenador e avança o processo pelo fluxo. \"Só despachar\" registra um despacho sem mudar a etapa.",
          "A decisão pede sua senha. Cada processo é tratado individualmente: se um deles tiver pendência (por exemplo, falta de documento de outro setor), ele fica de fora e o motivo aparece no resultado.",
          "Tudo fica na trilha de cada processo e o lote inteiro fica registrado na auditoria administrativa.",
        ],
      },
      {
        titulo: "Resumo semanal",
        texto: ["O resumo é montado por regras a partir dos números do sistema. Não usa inteligência artificial e não inventa dados: se um número não existe, a frase correspondente não aparece."],
      },
    ],
  },
  {
    slug: "automacoes",
    modulo: "Inteligência e automação",
    titulo: "Automações: regras \"quando… então…\"",
    resumo: "Como criar regras que avisam sobre processos parados, encaminham requerimentos e cobram exigências sem resposta.",
    rotas: ["/automacoes"],
    secoes: [
      {
        titulo: "Tipos de regra",
        texto: [
          "Processo parado: avisa quando um processo fica N dias sem movimentação, em um setor ou em qualquer setor.",
          "Palavra-chave: lê o assunto e a descrição dos requerimentos e encaminha (ou sugere encaminhar) ao setor certo.",
          "Exigência sem resposta: avisa quando o cidadão ou a empresa não respondeu ao pedido de complemento no prazo.",
        ],
      },
      {
        titulo: "Níveis",
        texto: [
          "Informar: só cria o alerta. Sugerir: registra a sugestão para alguém aplicar. Executar: aplica pelo fluxo, em nome de quem acionou a regra, e grava a versão da regra no despacho.",
          "Nesta versão as regras rodam quando alguém clica em \"Rodar agora\". O agendamento automático virá com a fila de tarefas.",
        ],
      },
      {
        titulo: "Quem pode",
        texto: ["Criar, ativar e suspender regras: administrador. Rodar: administrador, protocolo e controle interno. Toda execução fica no histórico e na auditoria."],
      },
    ],
  },
  {
    slug: "assistente-redacao",
    modulo: "Inteligência e automação",
    titulo: "Assistente de redação",
    resumo: "Modelos de despacho, ofício e resposta ao cidadão preenchidos com os dados do processo.",
    rotas: ["/automacoes/redacao"],
    secoes: [
      {
        titulo: "Como usar",
        texto: [
          "Escolha o modelo e, se quiser, o processo. Número, assunto, interessado, setor, data e quem assina são preenchidos sozinhos; o restante você completa nos campos.",
          "Campos não preenchidos aparecem marcados como [a preencher] para que nada saia incompleto sem querer.",
          "Você pode copiar o texto ou juntá-lo ao processo como documento.",
        ],
      },
      { titulo: "E a inteligência artificial?", texto: ["A versão com IA, que propõe o rascunho a partir do histórico e mostra as fontes usadas, virá depois. Ela continuará exigindo revisão de quem assina."] },
    ],
  },
  {
    slug: "integracoes",
    modulo: "Administração e integrações",
    titulo: "Central de integrações",
    resumo: "O que significa cada situação de conector e por que tudo aparece como simulado nesta versão.",
    rotas: ["/integracoes"],
    secoes: [
      {
        titulo: "Situações",
        texto: [
          "Ativa: conectada ao órgão em produção, com credenciamento e teste homologado. Simulada: responde com dados de exemplo para demonstração e treinamento. Não configurada: ainda não foi preparada.",
          "Nesta versão nenhum conector fala com o órgão real. Cada chamada simulada fica registrada com identificador único da operação, e falhas nunca aparecem como sucesso.",
        ],
      },
      { titulo: "Para entrar em produção", texto: ["Cada órgão tem condições próprias: adesão, credenciais, leiaute, certificados ou convênio. A coluna \"Condição para produção\" resume o que falta em cada um."] },
    ],
  },
  {
    slug: "governanca",
    modulo: "Administração e integrações",
    titulo: "Governança: acessos, auditoria e integridade",
    resumo: "Matriz de permissões, gestão de usuários, trilha de auditoria e verificação da cadeia de hash.",
    rotas: ["/governanca"],
    secoes: [
      {
        titulo: "Usuários e papéis",
        texto: [
          "Só o administrador ativa, desativa e troca setor ou papéis. Ninguém altera o próprio acesso. Cada alteração fica na auditoria com o valor anterior e o novo.",
          "Desativar não apaga nada: o histórico assinado pela pessoa continua válido e consultável.",
        ],
      },
      {
        titulo: "Trilha de auditoria",
        texto: ["Reúne os eventos de todos os processos e os registros administrativos (acessos, regras, integrações, decisões em lote). Pesquise por número, nome, ação ou palavra."],
      },
      {
        titulo: "Integridade",
        texto: [
          "Cada evento de processo guarda o hash do anterior. A verificação recalcula a cadeia de todos os processos e aponta o primeiro evento alterado, se houver.",
          "O encadeamento revela alterações, mas sozinho não impede que um administrador do banco altere dados; por isso a verificação deve ser feita com regularidade pelo controle interno.",
        ],
      },
    ],
  },
  {
    slug: "processos",
    modulo: "Atendimento e processos",
    titulo: "Processos: abrir, receber e movimentar",
    resumo: "O caminho de um processo, do protocolo ao arquivamento.",
    rotas: ["/processos", "/caixa"],
    secoes: [
      {
        titulo: "Receber antes de movimentar",
        texto: ["Quando um processo chega ao seu setor, confirme o recebimento. Até lá, o setor que enviou continua responsável por ele."],
      },
      {
        titulo: "Avançar, devolver ou enviar",
        texto: [
          "Avançar segue o fluxo e só é possível quando os documentos exigidos da etapa estão juntados e assinados. Devolver exige motivo. Enviar a outro setor só vale nas etapas de tramitação livre.",
        ],
      },
    ],
  },
  {
    slug: "obrigacoes",
    modulo: "Compras e contratos",
    titulo: "Obrigações legais: PNCP e Tribunal de Contas",
    resumo: "Como o sistema calcula os prazos de publicação e de remessa de cada contratação.",
    rotas: ["/obrigacoes", "/fila-de-pagamentos"],
    secoes: [
      {
        titulo: "Prazos",
        texto: [
          "PNCP: 10 dias úteis após a assinatura nas contratações diretas e 20 nas licitações (Lei 14.133, art. 94). Sem publicação, o contrato não tem eficácia.",
          "Tribunal de Contas: no RS, remessa ao LicitaCon em até 5 dias úteis após cada evento.",
        ],
      },
      { titulo: "Fila de pagamentos", texto: ["Os pagamentos seguem a ordem de liquidação dentro de cada fonte de recurso. Pagar fora da ordem exige justificativa, que fica pública."] },
    ],
  },
  {
    slug: "cadastros",
    modulo: "Administração e integrações",
    titulo: "Cadastros e fluxos",
    resumo: "Setores, usuários, feriados e tipos de processo do município.",
    rotas: ["/configuracoes", "/fluxos"],
    secoes: [
      { titulo: "Feriados contam nos prazos", texto: ["Os prazos são contados em dias úteis. Cadastre os feriados municipais para que os prazos fiquem corretos."] },
      { titulo: "Fluxos", texto: ["Cada tipo de processo tem um fluxo com etapas, responsáveis, prazos e documentos exigidos. Alterar um fluxo cria uma nova versão; os processos em andamento seguem a versão em que foram abertos."] },
    ],
  },
];

/** Artigo da página: o prefixo de rota mais longo que casa com o caminho. */
/** Artigos de módulos fora do escopo publicado não aparecem. */
export const ARTIGOS: Artigo[] = TODOS_ARTIGOS.filter((a) => !a.rotas.length || a.rotas.some((r) => !foraDoEscopo(r)));

export function artigoDaPagina(caminho: string): Artigo | null {
  let melhor: { a: Artigo; len: number } | null = null;
  for (const a of ARTIGOS)
    for (const r of a.rotas)
      if ((caminho === r || caminho.startsWith(r + "/")) && (!melhor || r.length > melhor.len)) melhor = { a, len: r.length };
  return melhor?.a ?? null;
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Busca simples por termos no título, resumo e texto. */
export function buscarArtigos(q: string): Artigo[] {
  const termos = norm(q).split(/\s+/).filter((t) => t.length > 1);
  if (!termos.length) return ARTIGOS;
  return ARTIGOS.map((a) => {
    const titulo = norm(a.titulo + " " + a.modulo);
    const corpo = norm(a.resumo + " " + a.secoes.map((s) => s.titulo + " " + s.texto.join(" ")).join(" "));
    let pontos = 0;
    for (const t of termos) {
      if (titulo.includes(t)) pontos += 3;
      else if (corpo.includes(t)) pontos += 1;
      else return { a, pontos: -1 };
    }
    return { a, pontos };
  })
    .filter((x) => x.pontos > 0)
    .sort((x, y) => y.pontos - x.pontos)
    .map((x) => x.a);
}

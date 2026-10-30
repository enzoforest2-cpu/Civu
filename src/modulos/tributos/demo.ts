// Dados de demonstração do módulo de tributos: cidade da Serra gaúcha com ~300 imóveis, IPTU do exercício,
// ~80 ITBIs em 24 meses, inscrições municipais com alvarás, ISS, dívida ativa e parcelamentos.
// Determinístico na estrutura (gerador com semente); as datas acompanham o dia em que a carga é feita.
import type { DemoCtx, ModuloDemo } from "@/db/demo/contexto";
import * as s from "@/db/schema";
import { WORKFLOW_ALVARA, CHAVE_FLUXO_ALVARA, SIGLA_SETOR_TRIBUTOS } from "./fluxo";
import {
  ALIQUOTAS_IPTU_DEMO,
  BAIRROS_DEMO,
  FUNDAMENTO_DEMO,
  IPTU_DESCONTO_COTA_UNICA,
  IPTU_PARCELAS,
  ITBI_ALIQUOTA,
  aleatorio,
  avaliarItbi,
  calcularValorVenal,
  codigoVerificacao,
  diaISO,
  dividir,
  r2,
  vencimentosIptu,
} from "./regras";

const NOMES = ["Adriana", "Alexandre", "Aline", "André", "Bruna", "Bruno", "Camila", "César", "Cláudia", "Cristiano", "Daniela", "Diego", "Eduarda", "Eduardo", "Elisa", "Fábio", "Fabiana", "Felipe", "Gabriela", "Gustavo", "Helena", "Henrique", "Isadora", "Jaqueline", "Jefferson", "Joana", "Jonas", "Larissa", "Leandro", "Letícia", "Lucas", "Luciana", "Marcelo", "Mariana", "Maurício", "Natália", "Otávio", "Patrícia", "Rafaela", "Renato", "Rosana", "Samuel", "Sílvia", "Tatiane", "Thiago", "Vanessa", "Vinícius", "Viviane", "Wagner", "Zilda"];
const SOBRENOMES = ["Bertolini", "Boff", "Caon", "Dal Pizzol", "De Carli", "Fontana", "Gasperin", "Girardi", "Lazzari", "Mascarello", "Menegotto", "Pasqualotto", "Pozza", "Rech", "Sartori", "Tomazzoni", "Zanotto", "Zatti", "Ferreira", "Oliveira", "Pereira", "Rodrigues", "Silveira", "Machado", "Rosa", "Becker", "Schmitt", "Weber", "Klein", "Muller"];

const EMPRESAS_EXTRA: [string, string, string, string, string, string, string][] = [
  // razão social, fantasia, porte, cnae, descrição, regime, bairro
  ["Vinícola Encosta Alta Ltda", "Encosta Alta", "EPP", "1112-7/00", "Fabricação de vinho", "SIMPLES", "Distrito Industrial"],
  ["Malharia Serrana Ltda", "Malharia Serrana", "ME", "1422-3/00", "Fabricação de artigos do vestuário de malha", "SIMPLES", "Distrito Industrial"],
  ["Clínica Odontológica Sorriso da Serra Ltda", "Sorriso da Serra", "ME", "8630-5/04", "Atividade odontológica", "SIMPLES", "Centro"],
  ["Contabilidade Araucária S/S", "Contábil Araucária", "ME", "6920-6/01", "Atividades de contabilidade", "NORMAL", "Centro"],
  ["Hotel Pinhal Serrano Ltda", "Hotel Pinhal", "EPP", "5510-8/01", "Hotéis", "NORMAL", "Centro"],
  ["Transportadora Rota Serrana Ltda", "Rota Serrana", "DEMAIS", "4930-2/02", "Transporte rodoviário de carga intermunicipal", "NORMAL", "Distrito Industrial"],
  ["Construtora Vale Verde Ltda", "Vale Verde Construções", "DEMAIS", "4120-4/00", "Construção de edifícios", "NORMAL", "Petrópolis"],
  ["Laboratório de Análises Clínicas Serra Ltda", "LabSerra", "EPP", "8640-2/02", "Laboratórios clínicos", "NORMAL", "Centro"],
  ["Escola de Idiomas Horizonte Ltda", "Horizonte Idiomas", "ME", "8593-7/00", "Ensino de idiomas", "SIMPLES", "Jardim América"],
  ["Auto Center Planalto Ltda", "Auto Center Planalto", "ME", "4520-0/01", "Manutenção mecânica de veículos", "SIMPLES", "Planalto"],
  ["Farmácia Bem-Estar Ltda", "Farmácia Bem-Estar", "EPP", "4771-7/01", "Comércio varejista de medicamentos", "SIMPLES", "Glória"],
  ["Mercado Família Rech Ltda", "Mercado Rech", "EPP", "4711-3/02", "Supermercados", "SIMPLES", "Vila Nova"],
  ["Engenharia Planejar Ltda", "Planejar Engenharia", "ME", "7112-0/00", "Serviços de engenharia", "NORMAL", "Petrópolis"],
  ["Informática Pinheiro Ltda", "Pinheiro TI", "ME", "6201-5/01", "Desenvolvimento de programas de computador sob encomenda", "NORMAL", "Centro"],
  ["Agropecuária Campos de Cima Ltda", "Campos de Cima Agro", "EPP", "4623-1/99", "Comércio atacadista de matérias-primas agrícolas", "SIMPLES", "Distrito Industrial"],
  ["Salão Bella Serra", "Bella Serra", "MEI", "9602-5/01", "Cabeleireiros, manicure e pedicure", "MEI", "São Cristóvão"],
  ["Doces da Nona", "Doces da Nona", "MEI", "1091-1/02", "Fabricação de produtos de panificação", "MEI", "Vila Nova"],
  ["Elétrica Faísca", "Elétrica Faísca", "MEI", "4321-5/00", "Instalação e manutenção elétrica", "MEI", "Planalto"],
  ["Restaurante Galeto do Vale Ltda", "Galeto do Vale", "ME", "5611-2/01", "Restaurantes e similares", "SIMPLES", "Petrópolis"],
  ["Imobiliária Casa Serrana Ltda", "Casa Serrana Imóveis", "ME", "6821-8/01", "Corretagem na compra e venda de imóveis", "NORMAL", "Centro"],
  ["Pet Shop Amigo Fiel", "Amigo Fiel", "MEI", "4789-0/04", "Comércio varejista de animais vivos e artigos para animais", "MEI", "Glória"],
  ["Estúdio Pilates Equilíbrio Ltda", "Equilíbrio Pilates", "ME", "9313-1/00", "Atividades de condicionamento físico", "SIMPLES", "Jardim América"],
];

function cpfValido(base9: string) {
  const dv = (b: string) => {
    const x = b.split("").reduce((a, n, i) => a + Number(n) * (b.length + 1 - i), 0) % 11;
    return x < 2 ? 0 : 11 - x;
  };
  const d1 = dv(base9);
  return base9 + d1 + dv(base9 + d1);
}
function cnpjValido(base12: string) {
  const calc = (b: string) => {
    const pesos = b.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const x = b.split("").reduce((a, n, i) => a + Number(n) * pesos[i], 0) % 11;
    return x < 2 ? 0 : 11 - x;
  };
  const d1 = calc(base12);
  return base12 + d1 + calc(base12 + d1);
}

type Dono = { pessoaId?: string; empresaId?: string };

export const tributosDemo: ModuloDemo = {
  nome: "Tributos e cadastro imobiliário",
  async aplicar(ctx: DemoCtx) {
    const { db } = ctx;
    const rnd = aleatorio(20261029);
    const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
    const entre = (a: number, b: number) => a + rnd() * (b - a);
    const ano = new Date().getFullYear();
    const hoje = new Date();
    const mid = ctx.municipioId;
    const iso = (d: Date) => diaISO(d);
    const diasAtras = (n: number) => new Date(hoje.getTime() - n * 86400000);

    // ---- setor, servidor de tributação e fluxo do alvará ----
    const [setor] = await db.insert(s.setores).values({ municipioId: mid, sigla: SIGLA_SETOR_TRIBUTOS, nome: "Departamento de Tributação e Fiscalização", slaPadraoDias: 5 }).returning();
    const bcrypt = await import("bcryptjs");
    const senhaHash = await bcrypt.hash("123456", 10);
    const [fiscal] = await db
      .insert(s.usuarios)
      .values({ municipioId: mid, cpf: "13131313131", nome: "Rafael Antunes", email: "tributos@valedasaraucarias.rs.gov.br", cargo: "Fiscal de tributos", papeis: ["TESOURARIA"], senhaHash, setorId: setor.id })
      .returning();
    await db.insert(s.tiposProcesso).values({
      municipioId: mid,
      chave: CHAVE_FLUXO_ALVARA,
      nome: "Alvará de localização e funcionamento",
      descricao: "Pedido de alvará novo ou renovação feito pelo portal Civu Empresas.",
      definicao: WORKFLOW_ALVARA,
    });

    // ---- parâmetros por exercício: planta, alíquotas ----
    for (const ex of [ano - 2, ano - 1, ano]) {
      const f = ex === ano ? 1 : ex === ano - 1 ? 0.955 : 0.915; // a planta só é corrigida pela inflação
      await db.insert(s.tribPlanta).values(
        BAIRROS_DEMO.map((b) => ({
          municipioId: mid,
          exercicio: ex,
          bairro: b.nome,
          valorM2Terreno: r2(b.m2Terreno * f),
          valorM2Construcao: r2(b.m2Construcao * f),
          fundamento: `Planta genérica de valores (lei fictícia de 2017), corrigida pelo IPCA para ${ex}`,
        })),
      );
      await db.insert(s.tribAliquotas).values([
        ...Object.entries(ALIQUOTAS_IPTU_DEMO).map(([uso, aliquota]) => ({
          municipioId: mid,
          exercicio: ex,
          tributo: "IPTU",
          uso,
          aliquota,
          descontoCotaUnica: IPTU_DESCONTO_COTA_UNICA,
          parcelas: IPTU_PARCELAS,
          fundamento: FUNDAMENTO_DEMO + ", art. 18",
        })),
        { municipioId: mid, exercicio: ex, tributo: "ITBI", uso: "TODOS", aliquota: ITBI_ALIQUOTA, fundamento: FUNDAMENTO_DEMO + ", art. 41 (0,5% sobre a parte financiada pelo SFH)" },
      ]);
    }
    const plantaDe = (bairro: string, ex: number) => {
      const b = BAIRROS_DEMO.find((x) => x.nome === bairro)!;
      const f = ex === ano ? 1 : ex === ano - 1 ? 0.955 : 0.915;
      return { valorM2Terreno: r2(b.m2Terreno * f), valorM2Construcao: r2(b.m2Construcao * f) };
    };

    // ---- contribuintes sintéticos (não aparecem na entrada do portal) ----
    const pessoasDef = Array.from({ length: 260 }, (_, i) => {
      const nome = `${pick(NOMES)} ${pick(SOBRENOMES)}${rnd() < 0.35 ? " " + pick(SOBRENOMES) : ""}`;
      return { cpf: cpfValido(String(300000000 + i * 7919).slice(0, 9)), nome, demonstracao: false };
    });
    const sinteticas = await db.insert(s.pessoas).values(pessoasDef).onConflictDoNothing().returning();
    let ip = 0;
    const proximaPessoa = () => sinteticas[ip++ % sinteticas.length];

    const empresasExtra = await db
      .insert(s.empresas)
      .values(
        EMPRESAS_EXTRA.map(([razaoSocial, nomeFantasia, porte, cnae], i) => ({
          cnpj: cnpjValido(String(51000000 + i * 1373).padStart(8, "0") + "0001"),
          razaoSocial,
          nomeFantasia,
          porte,
          atividades: [cnae],
        })),
      )
      .onConflictDoNothing()
      .returning();

    // ---- imóveis ----
    type ImovelGerado = {
      id?: string;
      chave?: string;
      dono: Dono[];
      dados: Omit<typeof s.tribImoveis.$inferInsert, "municipioId" | "valorVenal" | "inscricao">;
      pagamento: "UNICA" | "EM_DIA" | "ATRASADO" | "NADA";
      paraAte?: number; // ATRASADO: pagou até a parcela n
      divida?: number[]; // exercícios inscritos em dívida ativa
    };
    const imoveis: ImovelGerado[] = [];
    const especial = (chave: string, dono: Dono[], dados: ImovelGerado["dados"], pagamento: ImovelGerado["pagamento"], extra: Partial<ImovelGerado> = {}) =>
      imoveis.push({ chave, dono, dados, pagamento, ...extra });

    especial("ana", [{ pessoaId: ctx.pessoas.ana }], { logradouro: "Rua das Hortênsias", numero: "212", bairro: "Centro", cep: "95200-012", areaTerreno: 360, areaConstruida: 142, uso: "RESIDENCIAL", padrao: "MEDIO", anoConstrucao: 2008 }, "EM_DIA");
    especial("carlosCasa", [{ pessoaId: ctx.pessoas.carlos }], { logradouro: "Av. Moreira Paz", numero: "1450", bairro: "Petrópolis", cep: "95200-140", areaTerreno: 450, areaConstruida: 214, uso: "RESIDENCIAL", padrao: "ALTO", anoConstrucao: 2015 }, "UNICA");
    especial("carlosTerreno", [{ pessoaId: ctx.pessoas.carlos }], { logradouro: "Rua Farroupilha", numero: "77", bairro: "Vila Nova", cep: "95200-380", areaTerreno: 420, areaConstruida: 0, uso: "TERRENO", padrao: "MEDIO" }, "ATRASADO", { paraAte: 4, divida: [ano - 2, ano - 1] });
    especial("mendesLoja", [{ empresaId: ctx.empresas.mendes }], { logradouro: "Rua Tiradentes", numero: "980", bairro: "Glória", cep: "95200-260", areaTerreno: 900, areaConstruida: 620, uso: "COMERCIAL", padrao: "MEDIO", anoConstrucao: 2004 }, "EM_DIA");
    const donoPadaria = proximaPessoa();
    especial("padariaPredio", [{ pessoaId: donoPadaria.id }], { logradouro: "Rua Júlio de Castilhos", numero: "310", bairro: "Centro", cep: "95200-010", areaTerreno: 300, areaConstruida: 260, uso: "COMERCIAL", padrao: "MEDIO", anoConstrucao: 1994 }, "UNICA");

    const pesoTotal = BAIRROS_DEMO.reduce((a, b) => a + b.peso, 0);
    const sorteiaBairro = () => {
      let x = rnd() * pesoTotal;
      for (const b of BAIRROS_DEMO) if ((x -= b.peso) <= 0) return b;
      return BAIRROS_DEMO[0];
    };
    const empresasDonas = empresasExtra.slice(0, 10);
    while (imoveis.length < 300) {
      const b = sorteiaBairro();
      const r = rnd();
      const uso = b.nome === "Distrito Industrial" ? (r < 0.6 ? "INDUSTRIAL" : r < 0.8 ? "COMERCIAL" : "TERRENO") : r < 0.8 ? "RESIDENCIAL" : r < 0.92 ? "COMERCIAL" : "TERRENO";
      const apto = uso === "RESIDENCIAL" && (b.nome === "Centro" || b.nome === "Petrópolis") && rnd() < 0.45;
      const areaConstruida = uso === "TERRENO" ? 0 : uso === "INDUSTRIAL" ? Math.round(entre(600, 2800)) : apto ? Math.round(entre(48, 135)) : uso === "COMERCIAL" ? Math.round(entre(45, 380)) : Math.round(entre(58, 240));
      const areaTerreno = apto ? Math.round(entre(32, 80)) : uso === "INDUSTRIAL" ? Math.round(areaConstruida * entre(1.6, 3)) : Math.round(entre(250, 620));
      const padrao = b.m2Mercado > 5000 ? (rnd() < 0.4 ? "ALTO" : "MEDIO") : b.m2Mercado < 3600 ? (rnd() < 0.45 ? "BAIXO" : "MEDIO") : rnd() < 0.15 ? "ALTO" : rnd() < 0.3 ? "BAIXO" : "MEDIO";
      const p = rnd();
      const pagamento = p < 0.36 ? "UNICA" : p < 0.84 ? "EM_DIA" : p < 0.95 ? "ATRASADO" : "NADA";
      const dono: Dono[] =
        uso !== "RESIDENCIAL" && rnd() < 0.35 ? [{ empresaId: pick(empresasDonas).id }] : rnd() < 0.16 ? [{ pessoaId: proximaPessoa().id }, { pessoaId: proximaPessoa().id }] : [{ pessoaId: proximaPessoa().id }];
      const divida = pagamento === "NADA" || (pagamento === "ATRASADO" && rnd() < 0.6) ? (rnd() < 0.4 ? [ano - 2, ano - 1] : [ano - 1]) : undefined;
      imoveis.push({
        dono,
        dados: {
          logradouro: pick(b.ruas),
          numero: String(Math.floor(entre(10, 2400))),
          complemento: apto ? `Apto ${Math.floor(entre(1, 9))}0${Math.floor(entre(1, 5))}` : null,
          bairro: b.nome,
          cep: "95200-" + String(Math.floor(entre(0, 999))).padStart(3, "0"),
          areaTerreno,
          areaConstruida,
          uso,
          padrao,
          anoConstrucao: uso === "TERRENO" ? null : Math.floor(entre(1968, ano - 1)),
        },
        pagamento,
        paraAte: Math.floor(entre(1, 7)),
        divida,
      });
    }

    const setorCodigo: Record<string, string> = {};
    BAIRROS_DEMO.forEach((b, i) => (setorCodigo[b.nome] = String(i + 1).padStart(2, "0")));
    const contQuadra: Record<string, number> = {};
    const linhas = imoveis.map((im) => {
      const memoria = calcularValorVenal(
        { bairro: im.dados.bairro, areaTerreno: Number(im.dados.areaTerreno), areaConstruida: Number(im.dados.areaConstruida ?? 0), padrao: im.dados.padrao ?? "MEDIO", anoConstrucao: im.dados.anoConstrucao, uso: im.dados.uso },
        plantaDe(im.dados.bairro, ano),
        ano,
      );
      const sc = setorCodigo[im.dados.bairro];
      contQuadra[sc] = (contQuadra[sc] ?? 0) + 1;
      const n = contQuadra[sc];
      const quadra = String(Math.ceil(n / 8)).padStart(3, "0");
      const lote = String(((n - 1) % 8) + 1).padStart(4, "0");
      const unidade = im.dados.complemento ? String(Math.floor(entre(1, 40))).padStart(3, "0") : "000";
      return { ...im.dados, municipioId: mid, inscricao: `${sc}.${quadra}.${lote}.${unidade}`, quadra, lote, valorVenal: memoria.valorVenal, memoriaValor: memoria };
    });
    const criados = await db.insert(s.tribImoveis).values(linhas).returning();
    criados.forEach((c, i) => (imoveis[i].id = c.id));
    const imovelPor = (chave: string) => imoveis.find((i) => i.chave === chave)!;

    // ---- ITBIs de 24 meses (mudam a propriedade dos imóveis vendidos) ----
    const candidatos = imoveis.filter((i) => !i.chave && i.dados.uso !== "TERRENO" && i.dono.every((d) => d.pessoaId));
    const pesosItbi: Record<string, number> = { Centro: 16, Petrópolis: 13, "Jardim América": 10, Glória: 11, "Bela Vista": 3, Planalto: 9, "São Cristóvão": 7, "Vila Nova": 9, "Distrito Industrial": 2 };
    const vendidos: { im: ImovelGerado; data: Date; situacao: string; comprador: (typeof sinteticas)[number]; vendedor: (typeof sinteticas)[number] | undefined; preco: number; declarado: number; financiado: number }[] = [];
    for (const [bairro, n] of Object.entries(pesosItbi)) {
      const lista = candidatos.filter((c) => c.dados.bairro === bairro && !vendidos.some((v) => v.im === c));
      for (let k = 0; k < n && k < lista.length; k++) {
        const im = lista[k];
        const b = BAIRROS_DEMO.find((x) => x.nome === bairro)!;
        const diasAtrasN = Math.floor(entre(25, 720));
        const data = diasAtras(diasAtrasN);
        const tendencia = 1 + 0.06 * ((720 - diasAtrasN) / 365); // valorização de ~6% ao ano
        const fp = im.dados.padrao === "ALTO" ? 1.18 : im.dados.padrao === "BAIXO" ? 0.85 : 1;
        const fuso = im.dados.uso === "RESIDENCIAL" ? 1 : 0.8;
        const m2 = b.m2Mercado * fp * fuso * tendencia * entre(0.86, 1.14);
        const preco = Math.round((m2 * Number(im.dados.areaConstruida)) / 1000) * 1000;
        const declarado = rnd() < 0.18 ? Math.round((preco * entre(0.62, 0.82)) / 1000) * 1000 : preco;
        const financiado = rnd() < 0.45 ? Math.round((declarado * entre(0.4, 0.7)) / 1000) * 1000 : 0;
        vendidos.push({ im, data, situacao: "PAGO", comprador: proximaPessoa(), vendedor: sinteticas.find((p) => p.id === im.dono[0].pessoaId), preco, declarado, financiado });
      }
    }
    vendidos.sort((a, b) => a.data.getTime() - b.data.getTime());
    // os mais recentes ficam na fila de avaliação ou aguardando pagamento
    const n = vendidos.length;
    for (let k = 0; k < n; k++) {
      const v = vendidos[k];
      if (k >= n - 7) {
        v.situacao = k === n - 7 ? "CONTESTADO" : "EM_AVALIACAO";
        v.data = diasAtras(Math.floor(entre(1, 12)));
      } else if (k >= n - 10) {
        v.situacao = "AVALIADO";
        v.data = diasAtras(Math.floor(entre(13, 22)));
      }
    }
    vendidos.sort((a, b) => a.data.getTime() - b.data.getTime());
    const transacoes: { bairro: string; uso: string; m2: number; data: Date }[] = [];
    const contItbi: Record<number, number> = {};
    for (const v of vendidos) {
      const im = v.im;
      const lin = linhas[imoveis.indexOf(im)];
      const comparaveis = transacoes
        .filter((t) => t.bairro === lin.bairro && t.uso === lin.uso && t.data < v.data && t.data.getTime() > v.data.getTime() - 730 * 86400000)
        .map((t) => t.m2);
      const mem = avaliarItbi({
        bairro: lin.bairro,
        uso: lin.uso,
        areaConstruida: Number(lin.areaConstruida),
        areaTerreno: Number(lin.areaTerreno),
        valorVenal: lin.valorVenal,
        valorDeclarado: v.declarado,
        valorFinanciadoSfh: v.financiado,
        m2Comparaveis: comparaveis,
      });
      const exAno = v.data.getFullYear();
      contItbi[exAno] = (contItbi[exAno] ?? 0) + 1;
      const numero = `ITBI ${exAno}/${String(contItbi[exAno]).padStart(4, "0")}`;
      const avaliado = v.situacao !== "EM_AVALIACAO" && v.situacao !== "CONTESTADO";
      const vendedorNome = v.vendedor?.nome ?? "Proprietário anterior";
      const vendedorDoc = v.vendedor?.cpf ?? "00000000000";
      let lancamentoId: string | null = null;
      const quitadoEm = v.situacao === "PAGO" ? new Date(v.data.getTime() + Math.floor(entre(2, 12)) * 86400000) : null;
      if (avaliado) {
        const [l] = await db
          .insert(s.tribLancamentos)
          .values({
            municipioId: mid,
            tributo: "ITBI",
            exercicio: exAno,
            imovelId: im.id,
            contribuintePessoaId: v.comprador.id,
            descricao: `${numero} — ${lin.logradouro}, ${lin.numero}${lin.complemento ? " " + lin.complemento : ""}`,
            baseCalculo: mem.baseCalculo,
            aliquota: ITBI_ALIQUOTA,
            valor: mem.valorImposto,
            memoria: mem,
            situacao: quitadoEm ? "PAGO" : "ABERTO",
            lancadoEm: new Date(v.data.getTime() + 86400000),
          })
          .returning();
        lancamentoId = l.id;
        await db.insert(s.tribParcelas).values({
          lancamentoId: l.id,
          numero: 0,
          vencimento: iso(new Date(v.data.getTime() + 31 * 86400000)),
          valor: mem.valorImposto,
          situacao: quitadoEm ? "PAGA" : "ABERTA",
          pagoEm: quitadoEm,
          valorPago: quitadoEm ? mem.valorImposto : null,
        });
      }
      await db.insert(s.tribItbi).values({
        municipioId: mid,
        numero,
        imovelId: im.id!,
        natureza: "COMPRA_VENDA",
        compradorPessoaId: v.comprador.id,
        compradorNome: v.comprador.nome,
        compradorDocumento: v.comprador.cpf,
        vendedorNome,
        vendedorDocumento: vendedorDoc,
        valorDeclarado: v.declarado,
        financiado: v.financiado > 0,
        valorFinanciado: v.financiado || null,
        valorReferencia: avaliado ? mem.valorReferencia : null,
        baseCalculo: avaliado ? mem.baseCalculo : null,
        aliquota: avaliado ? ITBI_ALIQUOTA : null,
        valorImposto: avaliado ? mem.valorImposto : null,
        memoria: avaliado ? mem : null,
        situacao: v.situacao,
        justificativa: avaliado ? (mem.baseCalculo > v.declarado ? "Valor declarado abaixo da referência fiscal; base ajustada à referência." : "Valor declarado compatível com a referência; base igual ao declarado.") : null,
        contestacao:
          v.situacao === "CONTESTADO"
            ? "O imóvel precisa de reforma no telhado e na parte elétrica; o preço combinado considera esse estado. Anexamos laudo de vistoria da imobiliária."
            : null,
        avaliadoPorId: avaliado ? fiscal.id : null,
        avaliadoEm: avaliado ? new Date(v.data.getTime() + 86400000) : null,
        lancamentoId,
        solicitadoPorPessoaId: v.comprador.id,
        canal: rnd() < 0.7 ? "PORTAL" : "PRESENCIAL",
        declaradoEm: v.data,
        quitadoEm,
      });
      if (quitadoEm) {
        transacoes.push({ bairro: lin.bairro, uso: lin.uso, m2: mem.baseCalculo / Number(lin.areaConstruida), data: quitadoEm });
        im.dono = [{ pessoaId: v.comprador.id }];
        (im as ImovelGerado & { trocouEm?: Date }).trocouEm = quitadoEm;
      }
    }

    // ---- proprietários ----
    const props: (typeof s.tribProprietarios.$inferInsert)[] = [];
    for (const im of imoveis) {
      const trocou = (im as ImovelGerado & { trocouEm?: Date }).trocouEm;
      const venda = vendidos.find((v) => v.im === im && v.situacao === "PAGO");
      if (trocou && venda?.vendedor) props.push({ imovelId: im.id!, pessoaId: venda.vendedor.id, fracao: 100, principal: true, desde: `${ano - 12}-05-02`, ate: iso(trocou) });
      im.dono.forEach((d, i) =>
        props.push({
          imovelId: im.id!,
          pessoaId: d.pessoaId ?? null,
          empresaId: d.empresaId ?? null,
          fracao: im.dono.length === 2 ? 50 : 100,
          principal: i === 0,
          desde: trocou ? iso(trocou) : `${ano - Math.floor(entre(1, 25))}-0${Math.floor(entre(1, 9))}-1${Math.floor(entre(0, 9))}`,
        }),
      );
    }
    await db.insert(s.tribProprietarios).values(props);

    // ---- IPTU do exercício e de anos anteriores em dívida ativa ----
    const venc = vencimentosIptu(ano);
    const parcelasIns: (typeof s.tribParcelas.$inferInsert)[] = [];
    const lancIns: (typeof s.tribLancamentos.$inferInsert)[] = [];
    const lancMeta: { pg: ImovelGerado["pagamento"]; ate: number }[] = [];
    imoveis.forEach((im, i) => {
      const lin = linhas[i];
      const aliq = ALIQUOTAS_IPTU_DEMO[lin.uso];
      const valor = r2(lin.valorVenal * aliq);
      lancIns.push({
        municipioId: mid,
        tributo: "IPTU",
        exercicio: ano,
        imovelId: im.id,
        contribuintePessoaId: im.dono[0].pessoaId ?? null,
        contribuinteEmpresaId: im.dono[0].empresaId ?? null,
        descricao: `IPTU ${ano} — ${lin.logradouro}, ${lin.numero}${lin.complemento ? " " + lin.complemento : ""}`,
        baseCalculo: lin.valorVenal,
        aliquota: aliq,
        valor,
        memoria: { valorVenal: lin.memoriaValor, aliquota: aliq, uso: lin.uso, fundamento: FUNDAMENTO_DEMO + ", art. 18" },
        situacao: "ABERTO",
        lancadoEm: new Date(`${ano}-01-15T10:00:00-03:00`),
      });
      lancMeta.push({ pg: im.pagamento, ate: im.paraAte ?? 0 });
    });
    const lancs = await db.insert(s.tribLancamentos).values(lancIns).returning();
    const situacaoLanc: { id: string; situacao: string }[] = [];
    lancs.forEach((l, i) => {
      const { pg, ate } = lancMeta[i];
      const desconto = r2(l.valor * IPTU_DESCONTO_COTA_UNICA);
      const vencUnica = new Date(venc.unica + "T12:00:00");
      const pagoUnica = pg === "UNICA" && vencUnica < hoje;
      parcelasIns.push({
        lancamentoId: l.id,
        numero: 0,
        vencimento: venc.unica,
        valor: r2(l.valor - desconto),
        desconto,
        situacao: pagoUnica ? "PAGA" : pg === "UNICA" || vencUnica >= hoje ? "ABERTA" : "CANCELADA",
        pagoEm: pagoUnica ? new Date(`${ano}-03-0${Math.floor(entre(2, 9))}T14:00:00-03:00`) : null,
        valorPago: pagoUnica ? r2(l.valor - desconto) : null,
      });
      let todasPagas = true;
      dividir(l.valor, IPTU_PARCELAS).forEach((v, k) => {
        const vto = new Date(venc.parcelas[k] + "T12:00:00");
        const vencida = vto < hoje;
        const paga = vencida && (pg === "EM_DIA" || (pg === "ATRASADO" && k + 1 <= ate));
        if (!paga) todasPagas = false;
        parcelasIns.push({
          lancamentoId: l.id,
          numero: k + 1,
          vencimento: venc.parcelas[k],
          valor: v,
          situacao: pagoUnica ? "CANCELADA" : paga ? "PAGA" : "ABERTA",
          pagoEm: paga ? new Date(vto.getTime() - Math.floor(entre(0, 6)) * 86400000) : null,
          valorPago: paga ? v : null,
        });
      });
      if (pagoUnica || todasPagas) situacaoLanc.push({ id: l.id, situacao: "PAGO" });
    });
    await db.insert(s.tribParcelas).values(parcelasIns);
    const { inArray, eq } = await import("drizzle-orm");
    const pagos = situacaoLanc.map((x) => x.id);
    if (pagos.length) await db.update(s.tribLancamentos).set({ situacao: "PAGO" }).where(inArray(s.tribLancamentos.id, pagos));

    // dívida ativa de exercícios anteriores
    let contDa = 0;
    const daIns: (typeof s.tribDividaAtiva.$inferInsert)[] = [];
    for (const [i, im] of imoveis.entries()) {
      for (const ex of im.divida ?? []) {
        const lin = linhas[i];
        const aliq = ALIQUOTAS_IPTU_DEMO[lin.uso];
        const mem = calcularValorVenal({ ...lin, padrao: lin.padrao ?? "MEDIO", areaTerreno: Number(lin.areaTerreno), areaConstruida: Number(lin.areaConstruida) }, plantaDe(lin.bairro, ex), ex);
        const valor = r2(mem.valorVenal * aliq);
        const [l] = await db
          .insert(s.tribLancamentos)
          .values({
            municipioId: mid,
            tributo: "IPTU",
            exercicio: ex,
            imovelId: im.id,
            contribuintePessoaId: im.dono[0].pessoaId ?? null,
            contribuinteEmpresaId: im.dono[0].empresaId ?? null,
            descricao: `IPTU ${ex} — ${lin.logradouro}, ${lin.numero}${lin.complemento ? " " + lin.complemento : ""}`,
            baseCalculo: mem.valorVenal,
            aliquota: aliq,
            valor,
            memoria: { valorVenal: mem, aliquota: aliq, uso: lin.uso, fundamento: FUNDAMENTO_DEMO + ", art. 18" },
            situacao: "DIVIDA_ATIVA",
            lancadoEm: new Date(`${ex}-01-15T10:00:00-03:00`),
          })
          .returning();
        contDa++;
        daIns.push({
          municipioId: mid,
          numeroInscricao: `DA ${ex + 1}/${String(contDa).padStart(5, "0")}`,
          lancamentoId: l.id,
          devedorPessoaId: im.dono[0].pessoaId ?? null,
          devedorEmpresaId: im.dono[0].empresaId ?? null,
          valorOriginal: valor,
          vencimentoOriginal: `${ex}-03-10`,
          inscritaEm: `${ex + 1}-02-${String(10 + (contDa % 15)).padStart(2, "0")}`,
          situacao: "ATIVA",
          fundamento: "Lei 6.830/1980 e Código Tributário Municipal (lei fictícia)",
        });
      }
    }

    // ---- inscrições municipais, alvarás, TLF e ISS ----
    const end = (logradouro: string, numero: string, bairro: string) => ({ logradouro, numero, bairro, cidade: "Vale das Araucárias", uf: "RS", cep: "95200-000" });
    type InscDef = { empresaId: string; cnae: string; desc: string; regime: string; endereco: ReturnType<typeof end>; imovelId?: string; area: number; alvaraDias: number; chave?: string };
    const inscDefs: InscDef[] = [
      { chave: "mendes", empresaId: ctx.empresas.mendes, cnae: "4744-0/99", desc: "Comércio varejista de materiais de construção em geral", regime: "SIMPLES", endereco: end("Rua Tiradentes", "980", "Glória"), imovelId: imovelPor("mendesLoja").id, area: 620, alvaraDias: 245 },
      { chave: "mendesmei", empresaId: ctx.empresas.mendesmei, cnae: "4321-5/00", desc: "Instalação e manutenção elétrica", regime: "MEI", endereco: end("Av. Moreira Paz", "1450", "Petrópolis"), imovelId: imovelPor("carlosCasa").id, area: 20, alvaraDias: 150 },
      { chave: "padaria", empresaId: ctx.empresas.padaria, cnae: "1091-1/02", desc: "Fabricação de produtos de padaria e confeitaria com predominância de produção própria", regime: "SIMPLES", endereco: end("Rua Júlio de Castilhos", "310", "Centro"), imovelId: imovelPor("padariaPredio").id, area: 260, alvaraDias: 12 },
    ];
    empresasExtra.forEach((e, i) => {
      const d = EMPRESAS_EXTRA[i];
      const b = BAIRROS_DEMO.find((x) => x.nome === d[6])!;
      inscDefs.push({
        empresaId: e.id,
        cnae: d[3],
        desc: d[4],
        regime: d[5],
        endereco: end(pick(b.ruas), String(Math.floor(entre(20, 1900))), b.nome),
        area: Math.round(entre(30, d[2] === "DEMAIS" ? 1800 : 400)),
        alvaraDias: i % 9 === 4 ? -Math.floor(entre(10, 120)) : Math.floor(entre(30, 360)),
      });
    });
    const inscs = await db
      .insert(s.tribInscricoes)
      .values(
        inscDefs.map((d, i) => ({
          municipioId: mid,
          empresaId: d.empresaId,
          numero: `${String(1000 + i * 37).padStart(6, "0")}`,
          cnaePrincipal: d.cnae,
          cnaeDescricao: d.desc,
          regime: d.regime,
          endereco: d.endereco,
          imovelId: d.imovelId ?? null,
          areaUtilizada: d.area,
          abertaEm: `${ano - 1 - (i % 14)}-0${(i % 9) + 1}-15`,
        })),
      )
      .returning();
    const licencas: (typeof s.tribLicencas.$inferInsert)[] = [];
    inscs.forEach((ins, i) => {
      const d = inscDefs[i];
      const valida = new Date(hoje.getTime() + d.alvaraDias * 86400000);
      const emitida = new Date(valida.getTime() - 365 * 86400000);
      const numero = `ALV ${emitida.getFullYear()}/${String(200 + i * 3).padStart(5, "0")}`;
      licencas.push({
        municipioId: mid,
        inscricaoId: ins.id,
        tipo: "LOCALIZACAO_FUNCIONAMENTO",
        numero,
        codigoVerificacao: codigoVerificacao(`alvara-demo-${i}`),
        atividades: `${d.cnae} — ${d.desc}`,
        emitidaEm: emitida,
        validaAte: iso(valida),
        emitidaPorId: fiscal.id,
      });
      if (["1091-1/02", "8630-5/04", "8640-2/02", "4771-7/01", "5611-2/01", "4711-3/02"].includes(d.cnae)) {
        const vs = new Date(hoje.getTime() + (d.chave === "padaria" ? 140 : Math.floor(entre(20, 300))) * 86400000);
        licencas.push({
          municipioId: mid,
          inscricaoId: ins.id,
          tipo: "SANITARIA",
          numero: `LS ${vs.getFullYear() - 1}/${String(80 + i).padStart(4, "0")}`,
          codigoVerificacao: codigoVerificacao(`sanitaria-demo-${i}`),
          atividades: `${d.cnae} — ${d.desc}`,
          emitidaEm: new Date(vs.getTime() - 365 * 86400000),
          validaAte: iso(vs),
          emitidaPorId: fiscal.id,
          observacoes: "Emitida pela Vigilância Sanitária municipal após vistoria.",
        });
      }
    });
    await db.insert(s.tribLicencas).values(licencas);

    // TLF anual e ISS mensal (regime normal). MEI e Simples recolhem o ISS pelo DAS: não há lançamento municipal.
    const mesAtual = hoje.getMonth() + 1;
    for (const [i, ins] of inscs.entries()) {
      const d = inscDefs[i];
      const tlf = r2(Math.min(1450, 95 + d.area * 1.35));
      const vtoTlf = new Date(`${ano}-04-30T12:00:00`);
      const pagaTlf = vtoTlf < hoje && i % 11 !== 7;
      const contrib = { contribuinteEmpresaId: d.empresaId };
      const [l] = await db
        .insert(s.tribLancamentos)
        .values({
          municipioId: mid,
          tributo: "TLF",
          exercicio: ano,
          inscricaoId: ins.id,
          ...contrib,
          descricao: `Taxa de licença e fiscalização ${ano} — inscrição ${ins.numero}`,
          baseCalculo: d.area,
          valor: tlf,
          memoria: { formula: "R$ 95,00 + R$ 1,35 por m² utilizado (limite R$ 1.450,00)", area: d.area },
          situacao: pagaTlf ? "PAGO" : "ABERTO",
          lancadoEm: new Date(`${ano}-02-01T10:00:00-03:00`),
        })
        .returning();
      await db.insert(s.tribParcelas).values({ lancamentoId: l.id, numero: 0, vencimento: `${ano}-04-30`, valor: tlf, situacao: pagaTlf ? "PAGA" : "ABERTA", pagoEm: pagaTlf ? new Date(`${ano}-04-2${i % 9}T15:00:00-03:00`) : null, valorPago: pagaTlf ? tlf : null });

      if (d.regime === "NORMAL") {
        const base = entre(18000, 160000);
        for (let m = 1; m < mesAtual; m++) {
          const comp = `${ano}-${String(m).padStart(2, "0")}`;
          const receita = r2(base * entre(0.8, 1.2));
          const aliq = d.cnae.startsWith("4930") || d.cnae.startsWith("4120") ? 0.03 : d.cnae.startsWith("62") ? 0.02 : 0.04;
          const v = r2(receita * aliq);
          const vtoM = m === 12 ? `${ano + 1}-01-15` : `${ano}-${String(m + 1).padStart(2, "0")}-15`;
          const vencida = new Date(vtoM + "T23:59:59") < hoje;
          const pagaIss = vencida && !((i === 8 || i === 10) && m >= mesAtual - 3);
          const [li] = await db
            .insert(s.tribLancamentos)
            .values({
              municipioId: mid,
              tributo: "ISS",
              exercicio: ano,
              competencia: comp,
              inscricaoId: ins.id,
              ...contrib,
              descricao: `ISS homologado — competência ${String(m).padStart(2, "0")}/${ano}`,
              baseCalculo: receita,
              aliquota: aliq,
              valor: v,
              memoria: { origem: "Declaração mensal de serviços (simulada)", receita, aliquota: aliq },
              situacao: pagaIss ? "PAGO" : "ABERTO",
              lancadoEm: new Date(`${vtoM}T09:00:00-03:00`),
            })
            .returning();
          await db.insert(s.tribParcelas).values({ lancamentoId: li.id, numero: 0, vencimento: vtoM, valor: v, situacao: pagaIss ? "PAGA" : "ABERTA", pagoEm: pagaIss ? new Date(`${vtoM}T11:00:00-03:00`) : null, valorPago: pagaIss ? v : null });
        }
        // ISS de anos anteriores em dívida ativa para dois prestadores
        if (i === 8 || i === 10) {
          const valor = r2(entre(4200, 26000));
          const [lo] = await db
            .insert(s.tribLancamentos)
            .values({
              municipioId: mid,
              tributo: "ISS",
              exercicio: ano - 1,
              competencia: `${ano - 1}-08`,
              inscricaoId: ins.id,
              ...contrib,
              descricao: `ISS homologado — competência 08/${ano - 1}`,
              baseCalculo: r2(valor / 0.04),
              aliquota: 0.04,
              valor,
              situacao: "DIVIDA_ATIVA",
              lancadoEm: new Date(`${ano - 1}-09-15T09:00:00-03:00`),
            })
            .returning();
          contDa++;
          daIns.push({
            municipioId: mid,
            numeroInscricao: `DA ${ano}/${String(contDa).padStart(5, "0")}`,
            lancamentoId: lo.id,
            devedorEmpresaId: d.empresaId,
            valorOriginal: valor,
            vencimentoOriginal: `${ano - 1}-09-15`,
            inscritaEm: `${ano}-02-20`,
            situacao: "ATIVA",
            fundamento: "Lei 6.830/1980 e Código Tributário Municipal (lei fictícia)",
          });
        }
      }
    }

    // ---- dívida ativa: inscreve e parcela alguns acordos (não os do Carlos) ----
    const das = await db.insert(s.tribDividaAtiva).values(daIns).returning();
    const carlosId = ctx.pessoas.carlos;
    const parcelaveis = das.filter((d) => d.devedorPessoaId && d.devedorPessoaId !== carlosId);
    const porDevedor = new Map<string, typeof das>();
    for (const d of parcelaveis) porDevedor.set(d.devedorPessoaId!, [...(porDevedor.get(d.devedorPessoaId!) ?? []), d]);
    let acordos = 0;
    const { atualizar, simularParcelamento } = await import("./regras");
    for (const [pessoaId, lista] of porDevedor) {
      if (acordos >= 4) break;
      acordos++;
      const dataAcordo = diasAtras(60 + acordos * 35);
      const deb = lista.map((d) => {
        const a = atualizar(d.valorOriginal, d.vencimentoOriginal, dataAcordo);
        return { principal: d.valorOriginal + a.correcao, acrescimos: a.multa + a.juros };
      });
      const np = acordos === 4 ? 1 : 6 + acordos * 2;
      const sim = simularParcelamento(deb, np, "PESSOA");
      const [lp] = await db
        .insert(s.tribLancamentos)
        .values({
          municipioId: mid,
          tributo: "PARCELAMENTO",
          exercicio: dataAcordo.getFullYear(),
          contribuintePessoaId: pessoaId,
          descricao: `Parcelamento de dívida ativa em ${np}x — ${lista.map((d) => d.numeroInscricao).join(", ")}`,
          baseCalculo: sim.principal + sim.acrescimos,
          valor: sim.total,
          memoria: { ...sim, inscricoes: lista.map((d) => d.numeroInscricao) },
          situacao: acordos === 4 ? "PAGO" : "ABERTO",
          lancadoEm: dataAcordo,
        })
        .returning();
      await db.insert(s.tribParcelas).values(
        sim.valores.map((v, k) => {
          const vto = new Date(dataAcordo.getTime() + (k * 30 + 5) * 86400000);
          const paga = vto < hoje;
          return { lancamentoId: lp.id, numero: k + 1, vencimento: iso(vto), valor: v, situacao: paga ? "PAGA" : "ABERTA", pagoEm: paga ? vto : null, valorPago: paga ? v : null };
        }),
      );
      await db
        .update(s.tribDividaAtiva)
        .set({ situacao: acordos === 4 ? "QUITADA" : "PARCELADA", parcelamentoId: lp.id })
        .where(inArray(s.tribDividaAtiva.id, lista.map((d) => d.id)));
    }
    // uma inscrição ajuizada para mostrar a situação
    const ajuizar = das.find((d) => d.devedorEmpresaId);
    if (ajuizar) await db.update(s.tribDividaAtiva).set({ situacao: "AJUIZADA" }).where(eq(s.tribDividaAtiva.id, ajuizar.id));

    // ---- previsão da receita (LOA) coerente com a base de demonstração ----
    const somaLanc = async (tributo: string, ex: number) => {
      const { sql } = await import("drizzle-orm");
      const r = await db.execute(sql`select coalesce(sum(valor),0)::float v from tramite.trib_lancamentos where municipio_id = ${mid} and tributo = ${tributo} and exercicio = ${ex}`);
      return Number((r.rows[0] as { v: number }).v);
    };
    const iptu = await somaLanc("IPTU", ano);
    const itbiAnt = await somaLanc("ITBI", ano - 1);
    const issParcial = await somaLanc("ISS", ano);
    const tlf = await somaLanc("TLF", ano);
    await db.insert(s.tribPrevisoes).values([
      { municipioId: mid, exercicio: ano, tributo: "IPTU", valorPrevisto: r2(iptu * 0.94) },
      { municipioId: mid, exercicio: ano, tributo: "ITBI", valorPrevisto: r2(Math.max(itbiAnt, 1) * 0.6) },
      { municipioId: mid, exercicio: ano, tributo: "ISS", valorPrevisto: r2((issParcial / Math.max(1, mesAtual - 1)) * 12 * 1.04) },
      { municipioId: mid, exercicio: ano, tributo: "TLF", valorPrevisto: r2(tlf * 0.97) },
      { municipioId: mid, exercicio: ano, tributo: "PARCELAMENTO", valorPrevisto: r2(daIns.reduce((a, d) => a + Number(d.valorOriginal), 0) * 0.18) },
    ]);

    // ---- pedidos de alvará em análise (vindos do portal) ----
    const { abrirProcessoExterno } = await import("@/lib/engine");
    for (const k of [5, 13]) {
      const ins = inscs[k];
      const e = empresasExtra[k - 3];
      const rep = proximaPessoa();
      await db.insert(s.representacoes).values({ pessoaId: rep.id, empresaId: e.id, papel: "RESPONSAVEL_LEGAL", escopos: ["PROCESSOS", "TRIBUTOS", "CONTRATOS", "LICENCAS"] });
      await abrirProcessoExterno(
        mid,
        { pessoaId: rep.id, empresaId: e.id, nomeExibicao: e.razaoSocial },
        {
          tipoChave: CHAVE_FLUXO_ALVARA,
          assunto: `Renovação do alvará de localização e funcionamento — ${e.nomeFantasia}`,
          descricao: `Pedido de renovação do alvará da inscrição ${ins.numero}, sem mudança de atividade ou endereço.`,
          metadados: { inscricaoId: ins.id, tipoLicenca: "LOCALIZACAO_FUNCIONAMENTO", renovacao: true, atividades: `${inscDefs[k].cnae} — ${inscDefs[k].desc}` },
        },
      );
    }

    // ---- uma certidão já emitida para a Mendes (verificável) ----
    const mendes = await db.query.empresas.findFirst({ where: eq(s.empresas.id, ctx.empresas.mendes) });
    if (mendes)
      await db.insert(s.tribCertidoes).values({
        municipioId: mid,
        numero: `CND ${ano}/000041`,
        codigoVerificacao: codigoVerificacao("cnd-demo-mendes"),
        tipo: "NEGATIVA",
        empresaId: mendes.id,
        nome: mendes.razaoSocial,
        documento: mendes.cnpj,
        finalidade: "Participação em licitação",
        pendencias: [],
        emitidaEm: diasAtras(20),
        validaAte: iso(new Date(diasAtras(20).getTime() + 90 * 86400000)),
        solicitadaPorPessoaId: ctx.pessoas.carlos,
      });
  },
};

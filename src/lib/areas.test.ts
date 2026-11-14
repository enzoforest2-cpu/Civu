// src/lib/areas.test.ts — matriz perfil × área, telas por perfil e página inicial (npx tsx --test src/lib/areas.test.ts)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { AREAS, AREA_CHAVES, AREA_DA_SIGLA, cabineDoSetor, ehArea, ehCabine, paginaInicial, podeAbrirCabine, podeVerPasta, setoresDaCabine, veTodasAsPastas, type SetorDaCabine, podeVerArea, podeVerRota, regraDaRota, urlSemAcesso, veTudo, type Area, type UsuarioComArea } from "./areas";

const pessoa = (papeis: string[], area: Area | null): UsuarioComArea => ({ papeis, setor: area === null ? null : { area } });

// Perfis da demonstração (src/db/seed.ts) e alguns casos de borda
const PERFIS: Record<string, UsuarioComArea> = {
  prefeita: pessoa(["ORDENADOR", "ADMIN"], "GABINETE"),
  chefeGabinete: pessoa([], "GABINETE"),
  controladora: pessoa(["CONTROLE_INTERNO"], "CONTROLE_INTERNO"),
  administradorTi: pessoa(["ADMIN"], "ADMINISTRACAO"),
  secretarioSaude: pessoa(["SECRETARIO", "REQUISITANTE", "FISCAL"], "SAUDE"),
  requisitanteSaude: pessoa(["REQUISITANTE"], "SAUDE"),
  secretarioFazenda: pessoa(["SECRETARIO", "REQUISITANTE"], "FAZENDA"),
  contador: pessoa(["CONTABILIDADE"], "FAZENDA"),
  compras: pessoa(["COMPRAS"], "COMPRAS"),
  protocolo: pessoa(["PROTOCOLO"], "PROTOCOLO"),
  procurador: pessoa(["JURIDICO"], "PROCURADORIA"),
  secretarioInfra: pessoa(["SECRETARIO", "REQUISITANTE", "FISCAL"], "INFRAESTRUTURA"),
  secretariaAssistencia: pessoa(["SECRETARIO", "REQUISITANTE", "FISCAL"], "ASSISTENCIA_SOCIAL"),
  semSetor: pessoa(["REQUISITANTE"], null),
  // papel de ordenador fora do gabinete (secretária de administração) não dá visão da prefeitura inteira
  ordenadoraAdministracao: pessoa(["SECRETARIO", "ORDENADOR"], "ADMINISTRACAO"),
};

const TODAS = new Set<Area>(AREA_CHAVES);
const so = (...a: Area[]) => new Set<Area>(a);
const ESPERADO: Record<keyof typeof PERFIS, Set<Area>> = {
  prefeita: TODAS,
  chefeGabinete: TODAS,
  controladora: TODAS,
  administradorTi: TODAS,
  secretarioSaude: so("SAUDE"),
  requisitanteSaude: so("SAUDE"),
  secretarioFazenda: so("FAZENDA"),
  contador: so("FAZENDA"),
  compras: so("COMPRAS"),
  protocolo: so("PROTOCOLO"),
  procurador: so("PROCURADORIA"),
  secretarioInfra: so("INFRAESTRUTURA"),
  secretariaAssistencia: so("ASSISTENCIA_SOCIAL"),
  semSetor: so(),
  ordenadoraAdministracao: so("ADMINISTRACAO"),
};

test("áreas: onze áreas da especificação, chaves válidas", () => {
  assert.equal(AREAS.length, 11);
  assert.deepEqual(
    AREAS.map((a) => a.nome),
    ["Gabinete", "Administração", "Fazenda", "Compras", "Saúde", "Educação", "Assistência Social", "Infraestrutura e Obras", "Controle Interno", "Procuradoria", "Protocolo"],
  );
  assert.equal(ehArea("FAZENDA"), true);
  assert.equal(ehArea("fazenda"), false);
  assert.equal(ehArea(null), false);
});

test("podeVerArea: matriz perfil × área", () => {
  for (const [nome, u] of Object.entries(PERFIS)) {
    for (const area of AREA_CHAVES) {
      const esperado = ESPERADO[nome as keyof typeof PERFIS].has(area);
      assert.equal(podeVerArea(u, area), esperado, `${nome} × ${area}: esperado ${esperado}`);
    }
  }
});

test("visão total: gabinete, controle interno e administrador; ninguém mais", () => {
  const comVisao = Object.entries(PERFIS)
    .filter(([, u]) => veTudo(u))
    .map(([n]) => n)
    .sort();
  assert.deepEqual(comVisao, ["administradorTi", "chefeGabinete", "controladora", "prefeita"]);
  // setor com área desconhecida (texto livre antigo) não ganha nada
  assert.equal(podeVerArea({ papeis: ["SECRETARIO"], setor: { area: "QUALQUER" } }, "SAUDE"), false);
});

test("telas: Fazenda vê finanças e tributos; Infraestrutura, serviços, campo e obras; Compras, compras e contratos", () => {
  const { secretarioFazenda, contador, secretarioInfra, compras, secretarioSaude, requisitanteSaude, protocolo, procurador, semSetor, prefeita, controladora } = PERFIS;
  for (const u of [secretarioFazenda, contador]) {
    for (const r of ["/financas", "/financas/receita", "/financas/caixa", "/financas/indices", "/financas/empenhos/x", "/tributos", "/tributos/imoveis/1"]) assert.equal(podeVerRota(u, r), true, r);
    for (const r of ["/servicos", "/campo", "/gabinete", "/governanca"]) assert.equal(podeVerRota(u, r), false, r);
  }
  for (const r of ["/servicos", "/servicos/ordens/1", "/campo", "/contratos/obras", "/contratos", "/financas/orcamento"]) assert.equal(podeVerRota(secretarioInfra, r), true, r);
  for (const r of ["/tributos", "/financas", "/financas/receita", "/gabinete", "/contratos/novo"]) assert.equal(podeVerRota(secretarioInfra, r), false, r);
  for (const r of ["/contratos", "/contratos/novo", "/contratos/atestos", "/contratos/obras", "/obrigacoes", "/integracoes"]) assert.equal(podeVerRota(compras, r), true, r);
  for (const r of ["/financas/orcamento", "/tributos", "/servicos", "/secretaria"]) assert.equal(podeVerRota(compras, r), false, r);
  // secretaria finalística: a própria cabine, processos, contratos e orçamento da pasta; nada de finanças gerais ou tributos
  for (const u of [secretarioSaude, requisitanteSaude]) {
    for (const r of ["/secretaria", "/contratos", "/contratos/atestos", "/contratos/1", "/financas/orcamento", "/financas/orcamento/1", "/processos", "/caixa", "/ajuda"]) assert.equal(podeVerRota(u, r), true, r);
    for (const r of ["/financas", "/financas/empenhos", "/financas/receita", "/tributos", "/servicos", "/campo", "/gabinete", "/contratos/novo", "/governanca", "/configuracoes"]) assert.equal(podeVerRota(u, r), false, r);
  }
  // telas comuns a todos, inclusive sem setor
  for (const u of [protocolo, procurador, semSetor]) for (const r of ["/painel", "/caixa", "/processos", "/processos/1", "/ajuda", "/fluxos", "/automacoes/redacao"]) assert.equal(podeVerRota(u, r), true, r);
  for (const r of ["/contratos", "/financas/orcamento", "/secretaria"]) assert.equal(podeVerRota(procurador, r), false, r);
  // gabinete e controle veem tudo
  for (const u of [prefeita, controladora]) for (const r of ["/gabinete", "/tributos", "/servicos", "/campo", "/financas/indices", "/contratos/novo", "/governanca", "/configuracoes"]) assert.equal(podeVerRota(u, r), true, r);
});

test("regra da rota: vale o prefixo mais longo e não confunde prefixos parecidos", () => {
  assert.equal(regraDaRota("/financas/orcamento/123")?.prefixo, "/financas/orcamento");
  assert.equal(regraDaRota("/financas/orcamentos")?.prefixo, "/financas");
  assert.equal(regraDaRota("/contratos/obras")?.prefixo, "/contratos/obras");
  assert.equal(regraDaRota("/contratosx"), null);
  assert.equal(regraDaRota("/painel"), null);
});

test("página inicial: gabinete → sala do prefeito; secretário(a) → minha secretaria; demais → painel", () => {
  assert.equal(paginaInicial(PERFIS.prefeita), "/gabinete");
  assert.equal(paginaInicial(PERFIS.chefeGabinete), "/gabinete");
  assert.equal(paginaInicial(PERFIS.secretarioSaude), "/secretaria");
  assert.equal(paginaInicial(PERFIS.secretarioFazenda), "/secretaria");
  assert.equal(paginaInicial(PERFIS.ordenadoraAdministracao), "/secretaria");
  assert.equal(paginaInicial(PERFIS.requisitanteSaude), "/painel");
  assert.equal(paginaInicial(PERFIS.contador), "/painel");
  assert.equal(paginaInicial(PERFIS.compras), "/painel");
  assert.equal(paginaInicial(PERFIS.controladora), "/painel");
  assert.equal(paginaInicial(PERFIS.semSetor), "/painel");
  // a página inicial de cada um sempre abre para ele
  for (const u of Object.values(PERFIS)) assert.equal(podeVerRota(u, paginaInicial(u)), true);
});

test("sem acesso: endereço leva a área dona da tela e o caminho tentado", () => {
  assert.equal(urlSemAcesso("/tributos/imoveis"), "/sem-acesso?de=%2Ftributos%2Fimoveis&area=FAZENDA");
  assert.equal(urlSemAcesso("/secretaria"), "/sem-acesso?de=%2Fsecretaria");
});

test("migração 0003 preenche a área pela mesma tabela de siglas de areas.ts", () => {
  const sql = readFileSync(path.join(process.cwd(), "drizzle/0003_areas_dos_setores.sql"), "utf8");
  const pares = [...sql.matchAll(/WHEN '([A-Z]+)' THEN '([A-Z_]+)'/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(Object.fromEntries(pares), AREA_DA_SIGLA);
});

// ---------------------------------------------------------------------------
// Cabine da secretaria (Parte 2)
// ---------------------------------------------------------------------------
const ORGAO: Record<string, string> = { GAB: "02", SEMAD: "03", SEFAZ: "04", SEDUC: "05", SESAU: "06", SEMAS: "07", SEINFRA: "08" };
const SETORES: SetorDaCabine[] = Object.entries(AREA_DA_SIGLA).map(([sigla, area]) => ({ id: sigla, sigla, nome: sigla, area, orgaoOrcamentario: ORGAO[sigla] ?? null }));
const comSetor = (u: UsuarioComArea, setorId: string | null) => ({ ...u, setorId });
const cab = (sigla: string) => SETORES.find((s) => s.sigla === sigla)!;

test("cabines: secretarias com órgão, Compras e Controle; gabinete e setores de apoio não", () => {
  const com = SETORES.filter(ehCabine).map((s) => s.sigla).sort();
  assert.deepEqual(com, ["CGM", "COMPRAS", "SEDUC", "SEFAZ", "SEINFRA", "SEMAD", "SEMAS", "SESAU"]);
  // setores de apoio caem na cabine da área
  assert.equal(cabineDoSetor(SETORES, "CONTAB")?.sigla, "SEFAZ");
  assert.equal(cabineDoSetor(SETORES, "TRIB")?.sigla, "SEFAZ");
  assert.equal(cabineDoSetor(SETORES, "SMSU")?.sigla, "SEINFRA");
  assert.equal(cabineDoSetor(SETORES, "GAB"), null);
  assert.equal(cabineDoSetor(SETORES, "PGM"), null);
  assert.deepEqual(setoresDaCabine(SETORES, cab("SEFAZ")).sort(), ["CONTAB", "SEFAZ", "TES", "TRIB"]);
  assert.deepEqual(setoresDaCabine(SETORES, cab("SEINFRA")).sort(), ["SEINFRA", "SMMA", "SMSU"]);
  assert.deepEqual(setoresDaCabine(SETORES, cab("SESAU")), ["SESAU"]);
});

test("cabines: secretário de uma pasta não abre a de outra; gabinete, controle e administrador abrem todas", () => {
  const saude = comSetor(PERFIS.secretarioSaude, "SESAU");
  const infra = comSetor(PERFIS.secretarioInfra, "SEINFRA");
  for (const s of SETORES.filter(ehCabine)) {
    assert.equal(podeAbrirCabine(saude, s, SETORES), s.sigla === "SESAU", "saúde → " + s.sigla);
    assert.equal(podeAbrirCabine(infra, s, SETORES), s.sigla === "SEINFRA", "infra → " + s.sigla);
    assert.equal(podeAbrirCabine(comSetor(PERFIS.prefeita, "GAB"), s, SETORES), true);
    assert.equal(podeAbrirCabine(comSetor(PERFIS.controladora, "CGM"), s, SETORES), true);
    assert.equal(podeAbrirCabine(comSetor(PERFIS.administradorTi, "SEMAD"), s, SETORES), true);
  }
  // servidor de apoio abre a cabine da área; quem não tem cabine não abre nenhuma
  assert.equal(podeAbrirCabine(comSetor(PERFIS.contador, "CONTAB"), cab("SEFAZ"), SETORES), true);
  assert.equal(podeAbrirCabine(comSetor(PERFIS.contador, "CONTAB"), cab("SESAU"), SETORES), false);
  assert.equal(podeAbrirCabine(comSetor(PERFIS.procurador, "PGM"), cab("SESAU"), SETORES), false);
  // setor sem cabine nunca abre como cabine
  assert.equal(podeAbrirCabine(comSetor(PERFIS.prefeita, "GAB"), cab("GAB"), SETORES), false);
});

test("recorte por pasta: Fazenda, Compras e visão total veem todas; secretarias finalísticas só a sua", () => {
  for (const k of ["prefeita", "controladora", "administradorTi", "secretarioFazenda", "contador", "compras"] as const) assert.equal(veTodasAsPastas(PERFIS[k]), true, k);
  for (const k of ["secretarioSaude", "secretarioInfra", "secretariaAssistencia", "ordenadoraAdministracao", "requisitanteSaude"] as const) assert.equal(veTodasAsPastas(PERFIS[k]), false, k);
});

test("ver outra pasta: uma regra só para processos, contratos e orçamento filtrados por ?pasta=", () => {
  const saude = comSetor(PERFIS.secretarioSaude, "SESAU");
  assert.equal(podeVerPasta(saude, cab("SESAU"), SETORES), true);
  assert.equal(podeVerPasta(saude, cab("SEINFRA"), SETORES), false);
  // Fazenda e Compras filtram qualquer pasta (o que cada processo mostra segue a regra de participação)
  assert.equal(podeVerPasta(comSetor(PERFIS.contador, "CONTAB"), cab("SESAU"), SETORES), true);
  assert.equal(podeVerPasta(comSetor(PERFIS.compras, "COMPRAS"), cab("SEDUC"), SETORES), true);
  assert.equal(podeVerPasta(comSetor(PERFIS.prefeita, "GAB"), cab("SEMAS"), SETORES), true);
  assert.equal(podeVerPasta(comSetor(PERFIS.procurador, "PGM"), cab("SESAU"), SETORES), false);
  // o Gabinete não é pasta de lista (é a Sala do prefeito)
  assert.equal(podeVerPasta(comSetor(PERFIS.prefeita, "GAB"), cab("GAB"), SETORES), false);
});

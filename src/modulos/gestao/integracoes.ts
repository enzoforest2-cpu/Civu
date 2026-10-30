import "server-only";
// Central de integrações. O catálogo (finalidade e condição para produção) é código; o estado por município fica
// em gestao_integracoes e cada chamada em gestao_chamadas. NENHUM conector desta versão fala com o órgão real:
// as chamadas são simuladas, com resultado plausível, e marcadas como simuladas na tela e no banco.
import { createHash, randomUUID } from "crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { gestaoChamadas, gestaoIntegracoes } from "@/db/schema";
import type { SessaoUsuario } from "@/lib/auth";
import { ErroFluxo } from "@/lib/engine";
import { registrarAuditoria } from "./auditoria";

export type StatusIntegracao = "ATIVA" | "SIMULADA" | "NAO_CONFIGURADA";

export type Conector = {
  chave: string;
  nome: string;
  orgao: string;
  finalidade: string;
  condicao: string;
  meio: "API" | "Arquivo" | "Procedimento assistido";
  /** operações de exemplo que o teste simulado executa */
  operacoes: { operacao: string; direcao: "ENVIO" | "CONSULTA" | "RETORNO"; resumoOk: string; resumoFalha?: string }[];
};

export const CATALOGO: Conector[] = [
  {
    chave: "GOVBR",
    nome: "gov.br",
    orgao: "Ministério da Gestão e da Inovação",
    finalidade: "Login de cidadãos e empresas com nível de confiabilidade; assinatura eletrônica em integração separada.",
    condicao: "Adesão do município, credenciais do cliente e níveis exigidos por operação.",
    meio: "API",
    operacoes: [
      { operacao: "Validar sessão e nível da conta", direcao: "CONSULTA", resumoOk: "Conta nível prata confirmada para login no portal." },
      { operacao: "Consultar selos de confiabilidade", direcao: "CONSULTA", resumoOk: "Selos: validação facial, cadastro básico." },
    ],
  },
  {
    chave: "PNCP",
    nome: "PNCP",
    orgao: "Portal Nacional de Contratações Públicas",
    finalidade: "Publicação de contratos, atas e avisos de contratação (Lei 14.133, art. 94).",
    condicao: "Credenciamento do ente, usuário de integração, leiaute vigente e conferência do retorno.",
    meio: "API",
    operacoes: [
      { operacao: "Publicar contrato", direcao: "ENVIO", resumoOk: "Contrato publicado; número de controle PNCP devolvido.", resumoFalha: "Rejeitado: campo 'valorGlobal' diverge do valor do item." },
      { operacao: "Consultar publicação", direcao: "CONSULTA", resumoOk: "Publicação localizada e conferida com o contrato do processo." },
    ],
  },
  {
    chave: "LICITACON",
    nome: "TCE-RS LicitaCon",
    orgao: "Tribunal de Contas do Estado do Rio Grande do Sul",
    finalidade: "Remessa de licitações, contratos e eventos ao LicitaCon (5 dias úteis após cada evento).",
    condicao: "Mapeamento oficial do leiaute, responsáveis cadastrados e validação estadual.",
    meio: "Arquivo",
    operacoes: [
      { operacao: "Gerar e enviar arquivo de remessa", direcao: "ENVIO", resumoOk: "Arquivo aceito; recibo de entrega gerado.", resumoFalha: "Arquivo recusado: CPF do fiscal não consta no cadastro de responsáveis." },
      { operacao: "Consultar situação da remessa", direcao: "RETORNO", resumoOk: "Remessa processada sem inconsistências." },
    ],
  },
  {
    chave: "SICONFI",
    nome: "SICONFI",
    orgao: "Tesouro Nacional",
    finalidade: "Envio da matriz de saldos contábeis (MSC) e das declarações fiscais (RREO, RGF, DCA).",
    condicao: "Responsável técnico, fonte contábil validada e conferência dos demonstrativos.",
    meio: "Arquivo",
    operacoes: [
      { operacao: "Validar MSC do mês", direcao: "ENVIO", resumoOk: "MSC validada sem erros impeditivos; 3 alertas de consistência." },
      { operacao: "Consultar pendências do ente", direcao: "CONSULTA", resumoOk: "Nenhuma pendência de entrega no CAUC fiscal." },
    ],
  },
  {
    chave: "RECEITA_CNPJ",
    nome: "Receita Federal (CNPJ)",
    orgao: "Receita Federal do Brasil",
    finalidade: "Consulta de situação cadastral, sócios e atividades de fornecedores e contribuintes.",
    condicao: "Convênio ou contrato de acesso a dados (ex.: via Serpro) e base legal de finalidade.",
    meio: "API",
    operacoes: [
      { operacao: "Consultar CNPJ do fornecedor", direcao: "CONSULTA", resumoOk: "Situação ATIVA; CNAE principal compatível com o objeto." },
      { operacao: "Consultar quadro societário", direcao: "CONSULTA", resumoOk: "2 sócios; nenhum servidor municipal identificado no cruzamento." },
    ],
  },
  {
    chave: "PIX_BOLETO",
    nome: "PIX e boletos",
    orgao: "Banco arrecadador conveniado",
    finalidade: "Emissão de guias com PIX e boleto, baixa automática e conciliação da arrecadação.",
    condicao: "Convênio bancário, contas definidas, CNAB ou API e dupla conferência na conciliação.",
    meio: "API",
    operacoes: [
      { operacao: "Emitir guia com QR Code PIX", direcao: "ENVIO", resumoOk: "Guia registrada; QR Code dinâmico gerado." },
      { operacao: "Baixar retorno de arrecadação", direcao: "RETORNO", resumoOk: "Retorno do dia: 37 pagamentos conciliados.", resumoFalha: "Retorno com 1 pagamento sem guia correspondente; enviado para conferência." },
    ],
  },
  {
    chave: "NFSE",
    nome: "NFS-e nacional",
    orgao: "Ambiente de Dados Nacional da NFS-e",
    finalidade: "Recepção das notas fiscais de serviço emitidas no padrão nacional e eventos autorizados.",
    condicao: "Adesão ao convênio nacional, certificado do município e parametrização das alíquotas.",
    meio: "API",
    operacoes: [
      { operacao: "Distribuir DF-e do município", direcao: "RETORNO", resumoOk: "128 notas recebidas desde o último sincronismo." },
      { operacao: "Consultar parâmetros municipais", direcao: "CONSULTA", resumoOk: "Alíquotas e regimes conferidos com a legislação municipal." },
    ],
  },
  {
    chave: "ESUS",
    nome: "e-SUS APS",
    orgao: "Ministério da Saúde",
    finalidade: "Indicadores agregados da atenção primária, sem prontuário no painel da gestão.",
    condicao: "Finalidade definida, autorização da Secretaria de Saúde e restrição de dados clínicos.",
    meio: "Procedimento assistido",
    operacoes: [{ operacao: "Importar indicadores agregados", direcao: "CONSULTA", resumoOk: "Indicadores do quadrimestre importados (sem dados individuais)." }],
  },
  {
    chave: "WHATSAPP",
    nome: "WhatsApp",
    orgao: "Meta (via provedor de soluções)",
    finalidade: "Atendimento e avisos ao cidadão vinculados ao processo: protocolo, exigência, conclusão.",
    condicao: "Número oficial, provedor de soluções habilitado para governo, modelos de mensagem aprovados.",
    meio: "API",
    operacoes: [
      { operacao: "Enviar aviso de exigência", direcao: "ENVIO", resumoOk: "Mensagem de modelo entregue ao cidadão.", resumoFalha: "Falha de entrega: número sem WhatsApp; aviso enviado por e-mail." },
      { operacao: "Receber mensagem do cidadão", direcao: "RETORNO", resumoOk: "Mensagem vinculada ao protocolo informado." },
    ],
  },
];

export const STATUS_ROTULO: Record<StatusIntegracao, string> = { ATIVA: "Ativa", SIMULADA: "Simulada", NAO_CONFIGURADA: "Não configurada" };

export async function listarIntegracoes(municipioId: string) {
  const rows = await db.query.gestaoIntegracoes.findMany({ where: eq(gestaoIntegracoes.municipioId, municipioId), with: { responsavel: true } });
  return CATALOGO.map((c) => {
    const r = rows.find((x) => x.chave === c.chave);
    return { ...c, registro: r ?? null, status: (r?.status ?? "NAO_CONFIGURADA") as StatusIntegracao };
  });
}

export async function chamadasRecentes(municipioId: string, chave?: string, limite = 20) {
  const rows = await db
    .select({ c: gestaoChamadas, chave: gestaoIntegracoes.chave })
    .from(gestaoChamadas)
    .innerJoin(gestaoIntegracoes, eq(gestaoChamadas.integracaoId, gestaoIntegracoes.id))
    .where(and(eq(gestaoChamadas.municipioId, municipioId), chave ? eq(gestaoIntegracoes.chave, chave) : undefined))
    .orderBy(desc(gestaoChamadas.criadoEm))
    .limit(limite);
  return rows.map((r) => ({ ...r.c, chave: r.chave, nome: CATALOGO.find((x) => x.chave === r.chave)?.nome ?? r.chave }));
}

/** Resultado determinístico a partir de uma semente: a mesma operação no mesmo minuto dá o mesmo resultado. */
function sorteio(semente: string) {
  return parseInt(createHash("sha256").update(semente).digest("hex").slice(0, 8), 16) / 0xffffffff;
}

/** Garante o registro do conector no município (status SIMULADA ao testar a primeira vez). */
async function registroDe(municipioId: string, chave: string) {
  const r = await db.query.gestaoIntegracoes.findFirst({ where: and(eq(gestaoIntegracoes.municipioId, municipioId), eq(gestaoIntegracoes.chave, chave)) });
  if (r) return r;
  const [novo] = await db.insert(gestaoIntegracoes).values({ municipioId, chave, status: "SIMULADA", ambiente: "DEMONSTRACAO" }).returning();
  return novo;
}

/** Executa as operações de exemplo do conector em modo simulado e registra cada chamada. */
export async function testarConector(u: SessaoUsuario, chave: string) {
  const c = CATALOGO.find((x) => x.chave === chave);
  if (!c) throw new ErroFluxo("Integração desconhecida.");
  const reg = await registroDe(u.municipioId, chave);
  if (reg.status === "NAO_CONFIGURADA") throw new ErroFluxo("Configure a integração (modo simulado) antes de testar.");
  const agora = new Date();
  const valores = c.operacoes.map((op, i) => {
    const s = sorteio(`${u.municipioId}:${chave}:${i}:${agora.toISOString().slice(0, 16)}`);
    const falha = !!op.resumoFalha && s < 0.25;
    return {
      municipioId: u.municipioId,
      integracaoId: reg.id,
      operacao: op.operacao,
      direcao: op.direcao,
      status: falha ? (op.direcao === "ENVIO" ? "REJEITADA" : "FALHA") : "SUCESSO",
      idOperacao: `SIM-${chave}-${randomUUID().slice(0, 8).toUpperCase()}`,
      codigo: falha ? (op.direcao === "ENVIO" ? "422" : "503") : "200",
      duracaoMs: 120 + Math.round(s * 900),
      resumo: falha ? op.resumoFalha! : op.resumoOk,
      simulada: true,
      usuarioId: u.id,
    };
  });
  await db.transaction(async (tx) => {
    await tx.insert(gestaoChamadas).values(valores);
    await tx.update(gestaoIntegracoes).set({ ultimoSincronismo: agora, atualizadoEm: agora }).where(eq(gestaoIntegracoes.id, reg.id));
    await registrarAuditoria(
      {
        municipioId: u.municipioId,
        autorId: u.id,
        acao: "INTEGRACAO_TESTE",
        objetoTipo: "INTEGRACAO",
        objetoId: reg.id,
        objetoRotulo: c.nome,
        depois: { operacoes: valores.length, falhas: valores.filter((v) => v.status !== "SUCESSO").length, simulada: true },
      },
      tx,
    );
  });
  return valores;
}

/** Liga (modo simulado) ou desliga um conector. ATIVA só é possível com credenciamento real, que esta versão não tem. */
export async function configurarConector(u: SessaoUsuario, chave: string, status: StatusIntegracao) {
  const c = CATALOGO.find((x) => x.chave === chave);
  if (!c) throw new ErroFluxo("Integração desconhecida.");
  if (status === "ATIVA") throw new ErroFluxo("Ativar em produção exige credenciamento e teste homologado com o órgão. Nesta versão, use o modo simulado.");
  const antes = await db.query.gestaoIntegracoes.findFirst({ where: and(eq(gestaoIntegracoes.municipioId, u.municipioId), eq(gestaoIntegracoes.chave, chave)) });
  if (antes) await db.update(gestaoIntegracoes).set({ status, responsavelId: u.id, atualizadoEm: new Date() }).where(eq(gestaoIntegracoes.id, antes.id));
  else await db.insert(gestaoIntegracoes).values({ municipioId: u.municipioId, chave, status, responsavelId: u.id });
  await registrarAuditoria({
    municipioId: u.municipioId,
    autorId: u.id,
    acao: "INTEGRACAO_CONFIGURADA",
    objetoTipo: "INTEGRACAO",
    objetoId: antes?.id ?? null,
    objetoRotulo: c.nome,
    antes: { situação: STATUS_ROTULO[(antes?.status ?? "NAO_CONFIGURADA") as StatusIntegracao] },
    depois: { situação: STATUS_ROTULO[status] },
  });
}

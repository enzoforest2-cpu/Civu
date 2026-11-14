import type { SessaoUsuario } from "../../lib/auth";
import type { Papel } from "../../lib/workflow";
import type { ModuloDemo } from "./contexto";

/**
 * Pendências do secretário de Infraestrutura para a cabine da secretaria (Comando da prefeitura, Parte 2), criadas pelo
 * motor: um pedido da Diretoria de Vias esperando a aprovação e outro em instrução com o termo de referência esperando a
 * assinatura do secretário. Roda depois de contratos (que cria o secretário) e de serviços (que cria a Diretoria de Vias).
 */
export const cabinesDemo: ModuloDemo = {
  nome: "Cabines das secretarias (pendências de Infraestrutura)",
  async aplicar(ctx) {
    const engine = await import("../../lib/engine");
    const { eq } = await import("drizzle-orm");
    const s = await import("../schema");
    const db = ctx.db;

    async function sessao(cpf: string): Promise<SessaoUsuario> {
      const u = await db.query.usuarios.findFirst({ where: eq(s.usuarios.cpf, cpf), with: { setor: true, municipio: true } });
      if (!u) throw new Error(`Usuário ${cpf} não encontrado`);
      return {
        id: u.id, nome: u.nome, cpf: u.cpf, email: u.email, cargo: u.cargo, papeis: u.papeis as Papel[], setorId: u.setorId,
        setor: u.setor ? { id: u.setor.id, sigla: u.setor.sigla, nome: u.setor.nome, area: u.setor.area } : null,
        municipioId: u.municipioId, municipio: { id: u.municipio.id, nome: u.municipio.nome, uf: u.municipio.uf, slug: u.municipio.slug },
      };
    }
    const diretorVias = await sessao("50505050505");
    const secretario = await sessao("16161616161");
    const protocolo = await sessao("22222222222");
    const prefeita = await sessao("11111111111");
    const compras = await sessao("33333333333");
    const pretendida = new Date(Date.now() + 60 * 86400_000).toISOString().slice(0, 10);

    async function pedido(assunto: string, objeto: string, valor: number, justificativa: string, quantidade: string) {
      const p = await engine.abrirProcesso(diretorVias, {
        tipoId: ctx.tipos.COMPRA, unidadeGestoraId: ctx.ugs["01"], assunto, descricao: justificativa,
        metadados: { objeto, natureza: "MATERIAL_EXPEDIENTE", modalidade: "DISPENSA_VALOR", justificativa, quantidade, valorEstimado: String(valor), dataPretendida: pretendida, prioridade: "MEDIA", noPCA: "SIM" },
      });
      const dfd = await engine.juntarDocumento(diretorVias, p.id, "DFD", `DFD — ${objeto}`, `DOCUMENTO DE FORMALIZAÇÃO DE DEMANDA\n\nObjeto: ${objeto}\nJustificativa: ${justificativa}\nQuantidade: ${quantidade}`);
      await engine.assinarDocumento(diretorVias, dfd.id, "SECRETARIO");
      await engine.avancar(diretorVias, p.id, "APROVACAO_SECRETARIO", "Encaminho ao secretário da pasta.");
      return p;
    }

    // 1. Esperando a aprovação do secretário (o DFD já está assinado pela diretoria)
    await pedido(
      "Aquisição de placas de sinalização para as escolas da área rural",
      "40 placas de sinalização vertical de advertência escolar",
      18900,
      "Trechos de estrada em frente às escolas rurais sem sinalização de velocidade.",
      "40 placas com suporte",
    );

    // 2. Em instrução em compras, com o termo de referência esperando a assinatura do secretário
    const p2 = await pedido(
      "Aquisição de tinta para a pintura de faixas de pedestres no centro",
      "1.200 litros de tinta acrílica para demarcação viária",
      27400,
      "Faixas de pedestres do centro apagadas, com reclamações registradas na ouvidoria.",
      "1.200 litros",
    );
    await engine.avancar(secretario, p2.id, "AUTUACAO", "Aprovado. Ao protocolo para autuação.");
    await engine.receber(protocolo, p2.id);
    await engine.juntarDocumento(protocolo, p2.id, "TERMO_AUTUACAO", `Termo de autuação — ${p2.numero}`, `TERMO DE AUTUAÇÃO\n\nProcesso ${p2.numero}\nDFD conferido e assinado.`);
    await engine.avancar(protocolo, p2.id, "AUTORIZACAO", "Autuado. Encaminho para autorização do gabinete.");
    await engine.receber(prefeita, p2.id);
    const desp = await engine.juntarDocumento(prefeita, p2.id, "DESPACHO_AUTORIZACAO", "Autorizo o prosseguimento", "Autorizo a instrução do processo.");
    await engine.assinarDocumento(prefeita, desp.id, "ORDENADOR");
    await engine.avancar(prefeita, p2.id, "INSTRUCAO", "Autorizado. À instrução.");
    await engine.receber(compras, p2.id);
    await engine.juntarDocumento(compras, p2.id, "ETP", "ETP — tinta para demarcação viária", "ESTUDO TÉCNICO PRELIMINAR\n\nNecessidade: repintura das faixas do centro.");
    await engine.juntarDocumento(compras, p2.id, "TR", "TR — tinta para demarcação viária", "TERMO DE REFERÊNCIA\n\nObjeto: 1.200 litros de tinta acrílica para demarcação viária, com laudo de retrorrefletância.");
  },
};

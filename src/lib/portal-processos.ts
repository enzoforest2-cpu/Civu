import "server-only";
// O que o portal mostra de cada processo ao interessado: só os processos dele (ou da empresa ativa) e só os eventos externos.
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { processos } from "@/db/schema";
import { ErroAcesso, exigirEscopo, type SessaoPortal } from "./portal";
import type { WorkflowDef } from "./workflow";

/** Eventos que o interessado vê. Despachos internos, assinaturas e anexos internos ficam de fora. */
export const EVENTOS_EXTERNOS = ["ABERTURA", "MUDANCA_ESTADO", "DEVOLUCAO", "ENVIO", "RECEBIMENTO", "ENCERRAMENTO", "EXIGENCIA", "RESPOSTA_EXIGENCIA"];

function filtroDono(s: SessaoPortal) {
  if (s.empresaAtiva) {
    exigirEscopo(s, s.empresaAtiva.id, "PROCESSOS");
    return eq(processos.interessadoEmpresaId, s.empresaAtiva.id);
  }
  return eq(processos.interessadoPessoaId, s.pessoa.id);
}

export async function listarMeusProcessos(s: SessaoPortal) {
  if (s.empresaAtiva && !s.escoposAtivos.includes("PROCESSOS")) return [];
  const lista = await db.query.processos.findMany({
    where: filtroDono(s),
    with: { tipo: true, setorAtual: true, municipio: true },
    orderBy: [desc(processos.abertoEm)],
  });
  // em nome próprio, não mostra os processos que a pessoa abriu em nome de empresas
  return s.empresaAtiva ? lista : lista.filter((p) => !p.interessadoEmpresaId);
}

export async function carregarMeuProcesso(s: SessaoPortal, id: string) {
  const p = await db.query.processos.findFirst({
    where: eq(processos.id, id),
    with: {
      tipo: true,
      setorAtual: true,
      municipio: true,
      eventos: { orderBy: (e, { asc }) => [asc(e.seq)], with: { deSetor: true, paraSetor: true } },
    },
  });
  if (!p) return null;
  const meu = s.empresaAtiva ? p.interessadoEmpresaId === s.empresaAtiva.id : p.interessadoPessoaId === s.pessoa.id && !p.interessadoEmpresaId;
  if (!meu) throw new ErroAcesso("Este processo não pertence a quem você está representando agora.");
  if (s.empresaAtiva) exigirEscopo(s, s.empresaAtiva.id, "PROCESSOS");
  return { ...p, def: p.tipo.definicao as WorkflowDef, eventos: p.eventos.filter((e) => EVENTOS_EXTERNOS.includes(e.tipo)) };
}

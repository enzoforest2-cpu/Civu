import { ArrowDownToLine, ArrowRight, Flag, MessageSquare, PenLine, Paperclip, Send, Undo2, CheckCircle2, Landmark, Building2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { fmtDataHora, fmtMoeda } from "@/lib/dates";
import { dataBr } from "./etapas/util";
import { DOCUMENTO_TIPOS, FONTES, MODALIDADES, PAPEL_NOME, getEstado, nomeEtapa, type Papel, type WorkflowDef } from "@/lib/workflow";

type Ev = {
  id: string;
  seq: number;
  tipo: string;
  deEstado: string | null;
  paraEstado: string | null;
  dados: unknown;
  criadoEm: Date;
  autor: { nome: string };
  deSetor: { nome: string } | null;
  paraSetor: { nome: string } | null;
};

const ESTILO: Record<string, { icon: LucideIcon; cor: string }> = {
  ABERTURA: { icon: Flag, cor: "bg-brand text-white" },
  MUDANCA_ESTADO: { icon: ArrowRight, cor: "bg-brand-soft text-brand" },
  ENCERRAMENTO: { icon: CheckCircle2, cor: "bg-ok text-white" },
  DEVOLUCAO: { icon: Undo2, cor: "bg-bad-soft text-bad" },
  ENVIO: { icon: Send, cor: "bg-sunken text-ink-2" },
  RECEBIMENTO: { icon: ArrowDownToLine, cor: "bg-ok-soft text-ok" },
  ANEXO: { icon: Paperclip, cor: "bg-sunken text-ink-2" },
  ASSINATURA: { icon: PenLine, cor: "bg-ok-soft text-ok" },
  DESPACHO: { icon: MessageSquare, cor: "bg-sunken text-ink-2" },
  DADOS_CONTRATACAO: { icon: Building2, cor: "bg-brand-soft text-brand" },
  CORRECAO_CONTRATACAO: { icon: Building2, cor: "bg-warn-soft text-warn" },
  REMESSA_TCE: { icon: Landmark, cor: "bg-ok-soft text-ok" },
  EXIGENCIA: { icon: MessageSquare, cor: "bg-warn-soft text-warn" },
  RESPOSTA_EXIGENCIA: { icon: MessageSquare, cor: "bg-ok-soft text-ok" },
};

export function Timeline({ eventos, def }: { eventos: Ev[]; def: WorkflowDef }) {
  const nome = (k: string | null) => (k ? nomeEtapa(getEstado(def, k)?.nome ?? k) : "");
  const lista = [...eventos].reverse();
  return (
    <ol className="relative space-y-5">
      <span aria-hidden className="absolute top-2 bottom-2 left-[15px] w-px bg-line" />
      {lista.map((e) => {
        const d = (e.dados ?? {}) as Record<string, string | undefined>;
        let titulo = "";
        let detalhe: string | undefined;
        switch (e.tipo) {
          case "ABERTURA": {
            titulo = "Processo aberto";
            if ((e.dados as { solicitante?: { nome: string; canal: string } } | null)?.solicitante) {
              const so = (e.dados as { solicitante: { nome: string; canal: string } }).solicitante;
              titulo = `Pedido de ${so.nome} pelo ${so.canal === "WHATSAPP" ? "WhatsApp" : "portal"}`;
            }
            const al = (e.dados as { alertaFracionamento?: { situacao: string; total: number; limite: number } } | null)?.alertaFracionamento;
            if (al)
              detalhe =
                al.situacao === "excede"
                  ? `Alerta de fracionamento: dispensas da mesma natureza somariam ${fmtMoeda(al.total)}, acima do limite de ${fmtMoeda(al.limite)}.`
                  : `Atenção: dispensas da mesma natureza somariam ${fmtMoeda(al.total)}, perto do limite de ${fmtMoeda(al.limite)}.`;
            break;
          }
          case "MUDANCA_ESTADO": {
            titulo = `Avançou para “${nome(e.paraEstado)}”`;
            detalhe = d.despacho ?? undefined;
            const q = (e.dados as { quebraOrdem?: { aFrente: string[] } } | null)?.quebraOrdem;
            if (q) titulo += ` fora da ordem cronológica (${q.aFrente.length} à frente)`;
            break;
          }
          case "DADOS_CONTRATACAO":
            titulo = "Registrou os dados da contratação";
            detalhe = `${d.fornecedor ?? ""} · ${fmtMoeda(d.valor)}`;
            break;
          case "CORRECAO_CONTRATACAO": {
            const c = (e.dados ?? {}) as { antes?: { fonte?: string | null; valor?: string | null }; depois?: { fonte?: string | null; valor?: string | null }; motivo?: string };
            const mudou: string[] = [];
            if (c.antes?.fonte !== c.depois?.fonte) mudou.push(`fonte de ${FONTES[c.antes?.fonte ?? ""] ?? "não informada"} para ${FONTES[c.depois?.fonte ?? ""] ?? "não informada"}`);
            if (c.antes?.valor !== c.depois?.valor) mudou.push(`valor de ${fmtMoeda(c.antes?.valor ?? null)} para ${fmtMoeda(c.depois?.valor ?? null)}`);
            titulo = "Corrigiu os dados da contratação";
            detalhe = [mudou.join("; "), c.motivo ? `Motivo: ${c.motivo}` : ""].filter(Boolean).join(" · ") || undefined;
            break;
          }
          case "EXIGENCIA":
            titulo = "Pediu complemento ao interessado";
            detalhe = d.texto;
            break;
          case "RESPOSTA_EXIGENCIA":
            titulo = `${d.nome ?? "Interessado"} respondeu pelo portal`;
            detalhe = d.texto;
            break;
          case "REMESSA_TCE":
            titulo = `Enviado ao ${d.sistema ?? "Tribunal de Contas"}`;
            detalhe = d.recibo ? `Recibo ${d.recibo}` : undefined;
            break;
          case "ENCERRAMENTO":
            titulo = "Processo concluído e arquivado";
            detalhe = d.despacho ?? undefined;
            break;
          case "DEVOLUCAO":
            titulo = `Devolvido para “${nome(e.paraEstado)}”`;
            detalhe = d.motivo ? `Motivo: ${d.motivo}` : undefined;
            break;
          case "ENVIO":
            titulo = `Enviado para ${e.paraSetor?.nome ?? "—"}`;
            detalhe = d.despacho ?? undefined;
            break;
          case "RECEBIMENTO":
            titulo = `Recebido por ${e.paraSetor?.nome ?? "—"}`;
            break;
          case "ANEXO":
            titulo = `Juntou ${DOCUMENTO_TIPOS[d.tipo ?? ""] ?? "documento"}`;
            detalhe = d.titulo;
            break;
          case "ASSINATURA":
            titulo = `Assinou como ${PAPEL_NOME[d.papel as Papel] ?? d.papel}`;
            detalhe = DOCUMENTO_TIPOS[d.tipo ?? ""] ?? d.tipo;
            break;
          case "DESPACHO":
            titulo = "Observação";
            detalhe = d.texto;
            break;
          // Etapas da contratação registradas pelo motor (dados conforme engine.ts)
          case "MODALIDADE":
            titulo = `Definiu a modalidade: ${MODALIDADES[d.para ?? ""] ?? d.para ?? "—"}`;
            detalhe = d.justificativa;
            break;
          case "PESQUISA_PRECOS": {
            const n = Array.isArray((e.dados as { fontes?: unknown } | null)?.fontes) ? (e.dados as { fontes: unknown[] }).fontes.length : 0;
            titulo = `Registrou a pesquisa de preços (${n === 1 ? "1 fonte" : `${n} fontes`})`;
            detalhe = d.valorEstimado ? `Valor estimado: ${fmtMoeda(d.valorEstimado)}` : d.justificativa;
            break;
          }
          case "EDITAL":
            titulo = `Publicou o edital ${d.numero ?? ""}`.trim();
            detalhe = d.aberturaEm ? `Abertura em ${dataBr(d.aberturaEm)}${d.plataforma ? ` · ${d.plataforma}` : ""}` : undefined;
            break;
          case "IMPUGNACAO":
            titulo = `Registrou impugnação de ${d.autor ?? "—"}`;
            detalhe = (e.dados as { tempestiva?: boolean } | null)?.tempestiva ? "No prazo" : "Fora do prazo";
            break;
          case "RESPOSTA_IMPUGNACAO":
            titulo = `Respondeu a impugnação de ${d.autor ?? "—"}`;
            detalhe = d.resposta;
            break;
          case "RESULTADO_SESSAO":
            titulo = d.situacao === "VENCEDOR" ? `Resultado da sessão: vencedor ${d.fornecedor ?? ""}`.trim() : `Resultado da sessão: ${d.situacao === "DESERTA" ? "deserta" : "fracassada"}`;
            detalhe = d.situacao === "VENCEDOR" && d.valor ? fmtMoeda(d.valor) : undefined;
            break;
          case "RECURSO":
            titulo = `Registrou intenção de recurso de ${d.recorrente ?? "—"}`;
            detalhe = d.razoesAte ? `Razões até ${dataBr(d.razoesAte)} · contrarrazões até ${dataBr(d.contrarrazoesAte)}` : undefined;
            break;
          case "DECISAO_RECURSO":
            titulo = `Decidiu o recurso de ${d.recorrente ?? "—"}: ${(e.dados as { provido?: boolean } | null)?.provido ? "provido" : "não provido"}`;
            detalhe = d.decisao;
            break;
          case "AVISO_DISPENSA":
            titulo = d.publicadoEm ? `Publicou o aviso de dispensa em ${dataBr(d.publicadoEm)}` : "Registrou dispensa sem aviso";
            detalhe = d.justificativaSemAviso;
            break;
          case "RETORNO_BANCARIO":
            titulo = (e.dados as { aceito?: boolean } | null)?.aceito ? "Banco confirmou o pagamento" : "Banco recusou o pagamento";
            detalhe = d.autenticacao ?? d.motivo;
            break;
          default:
            titulo = e.tipo;
        }
        const est = ESTILO[e.tipo] ?? ESTILO.DESPACHO;
        const Icon = est.icon;
        return (
          <li key={e.id} className="relative flex gap-3 text-[14px]">
            <span className={`relative z-10 flex h-[31px] w-[31px] shrink-0 items-center justify-center rounded-full ring-4 ring-white ${est.cor}`}>
              <Icon size={15} strokeWidth={2.4} />
            </span>
            <div className="min-w-0 pt-0.5">
              <div className="font-medium text-ink">{titulo}</div>
              {detalhe && <div className="mt-0.5 text-ink-2">{detalhe}</div>}
              <div className="mt-0.5 text-[12.5px] text-ink-3">
                {e.autor.nome} · {fmtDataHora(e.criadoEm)}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

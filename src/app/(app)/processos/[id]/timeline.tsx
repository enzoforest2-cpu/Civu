import { ArrowDownToLine, ArrowRight, Flag, MessageSquare, PenLine, Paperclip, Send, Undo2, CheckCircle2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { fmtDataHora } from "@/lib/dates";
import { DOCUMENTO_TIPOS, PAPEL_NOME, getEstado, nomeEtapa, type Papel, type WorkflowDef } from "@/lib/workflow";

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
          case "ABERTURA":
            titulo = "Processo aberto";
            break;
          case "MUDANCA_ESTADO":
            titulo = `Avançou para “${nome(e.paraEstado)}”`;
            detalhe = d.despacho ?? undefined;
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

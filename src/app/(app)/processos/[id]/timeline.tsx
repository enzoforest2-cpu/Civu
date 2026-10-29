import { fmtDataHora } from "@/lib/dates";
import { DOCUMENTO_TIPOS, PAPEL_NOME, getEstado, type Papel, type WorkflowDef } from "@/lib/workflow";

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

const COR: Record<string, string> = {
  ABERTURA: "bg-brand",
  MUDANCA_ESTADO: "bg-info",
  ENCERRAMENTO: "bg-ok",
  DEVOLUCAO: "bg-bad",
  ENVIO: "bg-slate-400",
  RECEBIMENTO: "bg-ok",
  ANEXO: "bg-slate-400",
  ASSINATURA: "bg-brand",
  DESPACHO: "bg-slate-400",
};

export function Timeline({ eventos, def }: { eventos: Ev[]; def: WorkflowDef }) {
  const nome = (k: string | null) => (k ? (getEstado(def, k)?.nome ?? k) : "");
  const lista = [...eventos].reverse();
  return (
    <ol className="relative space-y-4 border-l border-line pl-4">
      {lista.map((e) => {
        const d = (e.dados ?? {}) as Record<string, string | undefined>;
        let titulo = "";
        let detalhe: string | undefined;
        switch (e.tipo) {
          case "ABERTURA":
            titulo = `Processo aberto em ${nome(e.paraEstado)}`;
            break;
          case "MUDANCA_ESTADO":
            titulo = `${nome(e.deEstado)} → ${nome(e.paraEstado)}`;
            detalhe = d.despacho;
            break;
          case "ENCERRAMENTO":
            titulo = `Encerrado: ${nome(e.paraEstado)}`;
            detalhe = d.despacho;
            break;
          case "DEVOLUCAO":
            titulo = `Devolvido: ${nome(e.deEstado)} → ${nome(e.paraEstado)}`;
            detalhe = d.motivo ? `Motivo: ${d.motivo}` : undefined;
            break;
          case "ENVIO":
            titulo = `Enviado de ${e.deSetor?.nome ?? "—"} para ${e.paraSetor?.nome ?? "—"}`;
            detalhe = d.despacho;
            break;
          case "RECEBIMENTO":
            titulo = `Recebido por ${e.paraSetor?.nome ?? "—"}`;
            break;
          case "ANEXO":
            titulo = `Documento juntado: ${d.titulo}`;
            detalhe = DOCUMENTO_TIPOS[d.tipo ?? ""] ?? d.tipo;
            break;
          case "ASSINATURA":
            titulo = `Assinatura como ${PAPEL_NOME[d.papel as Papel] ?? d.papel}`;
            detalhe = DOCUMENTO_TIPOS[d.tipo ?? ""] ?? d.tipo;
            break;
          case "DESPACHO":
            titulo = "Despacho";
            detalhe = d.texto;
            break;
          default:
            titulo = e.tipo;
        }
        return (
          <li key={e.id} className="relative text-sm">
            <span className={`absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-white ${COR[e.tipo] ?? "bg-slate-300"}`} />
            <div className="font-medium">{titulo}</div>
            {detalhe && <div className="mt-0.5 text-ink-2">{detalhe}</div>}
            <div className="mt-0.5 text-xs text-ink-3">
              #{e.seq} · {e.autor.nome} · {fmtDataHora(e.criadoEm)}
              {e.paraSetor && e.tipo !== "ENVIO" && e.tipo !== "RECEBIMENTO" ? ` · para ${e.paraSetor.nome}` : ""}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

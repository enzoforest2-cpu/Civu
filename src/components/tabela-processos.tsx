import { Badge, Empty, NumeroProcesso, Prazo, UrgenciaBadge } from "@/components/ui";
import { fmtData } from "@/lib/dates";
import { getEstado, type WorkflowDef } from "@/lib/workflow";

export type LinhaProcesso = {
  id: string;
  numero: string;
  assunto: string;
  urgencia: string;
  estadoAtual: string;
  recebidoEm: Date | null;
  prazoEtapaEm: Date | null;
  encerradoEm: Date | null;
  abertoEm: Date;
  setorAtual: { nome: string; sigla: string } | null;
  tipo: { nome: string; definicao: unknown };
  abertoPor: { nome: string };
};

export function TabelaProcessos({ linhas, vazio = "Nenhum processo encontrado." }: { linhas: LinhaProcesso[]; vazio?: string }) {
  if (linhas.length === 0) return <Empty>{vazio}</Empty>;
  return (
    <table className="tbl">
      <thead>
        <tr>
          <th>Número</th>
          <th>Assunto</th>
          <th>Etapa</th>
          <th>Setor atual</th>
          <th>Recebido</th>
          <th>Prazo da etapa</th>
          <th>Aberto em</th>
        </tr>
      </thead>
      <tbody>
        {linhas.map((p) => {
          const estado = getEstado(p.tipo.definicao as WorkflowDef, p.estadoAtual);
          return (
            <tr key={p.id} className="row-link">
              <td>
                <NumeroProcesso id={p.id} numero={p.numero} />
              </td>
              <td>
                <div className="flex items-center gap-2">
                  <span className="line-clamp-1">{p.assunto}</span>
                  <UrgenciaBadge u={p.urgencia} />
                </div>
                <div className="text-xs text-ink-3">
                  {p.tipo.nome} · {p.abertoPor.nome}
                </div>
              </td>
              <td className="text-ink-2">{estado?.nome ?? p.estadoAtual}</td>
              <td className="text-ink-2">{p.setorAtual?.nome ?? "—"}</td>
              <td>
                {p.encerradoEm ? <span className="text-ink-3">—</span> : p.recebidoEm ? <Badge tone="ok">sim</Badge> : <Badge tone="warn">pendente</Badge>}
              </td>
              <td>
                <Prazo prazo={p.prazoEtapaEm} encerrado={p.encerradoEm} />
              </td>
              <td className="text-ink-2">{fmtData(p.abertoEm)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

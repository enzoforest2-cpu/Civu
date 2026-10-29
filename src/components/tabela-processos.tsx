/* eslint-disable react-hooks/purity -- prazo depende da hora atual; renderizado no servidor a cada requisição */
import { Vazio, NumeroProcesso, Prazo, UrgenciaChip, Chip } from "@/components/ui";
import { TrilhoMini } from "@/components/trilho";
import { fmtData } from "@/lib/dates";
import { caminhoPrincipal, getEstado, nomeEtapa, type WorkflowDef } from "@/lib/workflow";

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
  if (linhas.length === 0) return <Vazio>{vazio}</Vazio>;
  return (
    <div className="-mx-6 overflow-x-auto">
      <table className="lista">
        <thead>
          <tr>
            <th className="pl-6">Processo</th>
            <th>Etapa atual</th>
            <th>Está com</th>
            <th>Prazo da etapa</th>
            <th className="pr-6">Aberto em</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((p) => {
            const def = p.tipo.definicao as WorkflowDef;
            const estado = getEstado(def, p.estadoAtual);
            const caminho = caminhoPrincipal(def);
            const pos = Math.max(0, caminho.indexOf(p.estadoAtual));
            const atrasado = !!p.prazoEtapaEm && p.prazoEtapaEm.getTime() < Date.now() && !p.encerradoEm;
            return (
              <tr key={p.id} className="linha">
                <td className="max-w-[420px] pl-6">
                  <div className="flex items-center gap-2">
                    <NumeroProcesso id={p.id} numero={p.numero} />
                    <UrgenciaChip u={p.urgencia} />
                  </div>
                  <div className="mt-0.5 truncate text-[14.5px] text-ink">{p.assunto}</div>
                  <div className="truncate text-[12.5px] text-ink-3">
                    {p.tipo.nome} · aberto por {p.abertoPor.nome}
                  </div>
                </td>
                <td>
                  <div className="text-[14px] font-medium text-ink">{estado ? nomeEtapa(estado.nome) : p.estadoAtual}</div>
                  <div className="mt-1.5">
                    <TrilhoMini total={caminho.length} posicao={pos} encerrado={!!p.encerradoEm} atrasado={atrasado} />
                  </div>
                </td>
                <td>
                  <div className="text-[14px] text-ink">{p.setorAtual?.nome ?? "—"}</div>
                  {!p.encerradoEm && !p.recebidoEm && (
                    <div className="mt-1">
                      <Chip tone="warn">Ainda não recebeu</Chip>
                    </div>
                  )}
                </td>
                <td>
                  <Prazo prazo={p.prazoEtapaEm} encerrado={p.encerradoEm} />
                </td>
                <td className="tnum pr-6 text-[14px] text-ink-2">{fmtData(p.abertoEm)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

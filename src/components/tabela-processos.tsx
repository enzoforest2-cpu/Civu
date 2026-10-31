/* eslint-disable react-hooks/purity -- prazo depende da hora atual; renderizado no servidor a cada requisição */
import { Vazio, NumeroProcesso, Prazo, UrgenciaChip, Chip } from "@/components/ui";
import { TrilhoMini } from "@/components/trilho";
import { fmtData, fmtMoeda } from "@/lib/dates";
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
  metadados?: unknown;
};

/** Valor do processo de compra: o contratado, quando já há; senão o estimado. */
export function valorDoProcesso(metadados: unknown): number | null {
  const m = (metadados ?? {}) as { contratacao?: { valor?: string | number | null }; valorEstimado?: string | number | null };
  const v = m.contratacao?.valor ?? m.valorEstimado;
  const n = v == null || v === "" ? NaN : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function TabelaProcessos({ linhas, vazio = "Nenhum processo encontrado." }: { linhas: LinhaProcesso[]; vazio?: string }) {
  if (linhas.length === 0) return <Vazio>{vazio}</Vazio>;
  const itens = linhas.map((p) => {
    const def = p.tipo.definicao as WorkflowDef;
    const estado = getEstado(def, p.estadoAtual);
    const caminho = caminhoPrincipal(def);
    return {
      p,
      etapa: estado ? nomeEtapa(estado.nome) : p.estadoAtual,
      total: caminho.length,
      pos: Math.max(0, caminho.indexOf(p.estadoAtual)),
      atrasado: !!p.prazoEtapaEm && p.prazoEtapaEm.getTime() < Date.now() && !p.encerradoEm,
      naoRecebido: !p.encerradoEm && !p.recebidoEm,
      valor: valorDoProcesso(p.metadados),
    };
  });
  return (
    <>
      {/* Celular e telas estreitas: um cartão por processo, com tudo o que a tabela mostra */}
      <ul className="-mx-6 divide-y divide-line md:hidden">
        {itens.map(({ p, etapa, total, pos, atrasado, naoRecebido, valor }) => (
          <li key={p.id} className="px-6 py-4">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <div className="flex items-center gap-2">
                <NumeroProcesso id={p.id} numero={p.numero} />
                <UrgenciaChip u={p.urgencia} />
              </div>
              <Prazo prazo={p.prazoEtapaEm} encerrado={p.encerradoEm} />
            </div>
            <div className="mt-1 text-[15px] leading-snug text-ink">{p.assunto}</div>
            <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-2">
              <div className="col-span-2">
                <dt className="text-[12px] text-ink-3">Etapa</dt>
                <dd className="text-[14px] font-medium text-ink">{etapa}</dd>
                <dd className="mt-1">
                  <TrilhoMini total={total} posicao={pos} encerrado={!!p.encerradoEm} atrasado={atrasado} />
                </dd>
              </div>
              <div>
                <dt className="text-[12px] text-ink-3">Está com</dt>
                <dd className="text-[14px] text-ink">{p.setorAtual?.nome ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-[12px] text-ink-3">Valor</dt>
                <dd className="tnum text-[14px] text-ink">{valor == null ? "—" : fmtMoeda(valor)}</dd>
              </div>
            </dl>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-ink-3">
              {naoRecebido && <Chip tone="warn">Ainda não recebeu</Chip>}
              <span>
                {p.tipo.nome} · aberto em {fmtData(p.abertoEm)}
              </span>
            </div>
          </li>
        ))}
      </ul>

      <div className="-mx-6 hidden overflow-x-auto md:block">
        <table className="lista">
          <thead>
            <tr>
              <th className="pl-6">Processo</th>
              <th>Etapa atual</th>
              <th>Está com</th>
              <th>Prazo da etapa</th>
              <th className="text-right">Valor</th>
              <th className="pr-6">Aberto em</th>
            </tr>
          </thead>
          <tbody>
            {itens.map(({ p, etapa, total, pos, atrasado, naoRecebido, valor }) => (
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
                  <div className="text-[14px] font-medium text-ink">{etapa}</div>
                  <div className="mt-1.5">
                    <TrilhoMini total={total} posicao={pos} encerrado={!!p.encerradoEm} atrasado={atrasado} />
                  </div>
                </td>
                <td>
                  <div className="text-[14px] text-ink">{p.setorAtual?.nome ?? "—"}</div>
                  {naoRecebido && (
                    <div className="mt-1">
                      <Chip tone="warn">Ainda não recebeu</Chip>
                    </div>
                  )}
                </td>
                <td>
                  <Prazo prazo={p.prazoEtapaEm} encerrado={p.encerradoEm} />
                </td>
                <td className="tnum text-right text-[14px] whitespace-nowrap text-ink">{valor == null ? "—" : fmtMoeda(valor)}</td>
                <td className="tnum pr-6 text-[14px] text-ink-2">{fmtData(p.abertoEm)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

import Link from "next/link";
import { requirePortal } from "@/lib/portal";
import { listarMeusProcessos } from "@/lib/portal-processos";
import { getEstado, nomeEtapa, type WorkflowDef } from "@/lib/workflow";
import { fmtData } from "@/lib/dates";
import { Chip, Vazio } from "@/components/ui";

export default async function MeusPedidos() {
  const s = await requirePortal();
  const lista = await listarMeusProcessos(s);
  return (
    <>
      <h1 className="display text-[30px] font-bold text-ink">Meus pedidos</h1>
      <p className="mt-1 text-[15px] text-ink-2">{s.empresaAtiva ? `Pedidos de ${s.empresaAtiva.razaoSocial}.` : "Pedidos feitos em seu nome."}</p>
      <section className="panel mt-6 p-2 sm:p-4">
        {lista.length === 0 ? (
          <div className="p-4">
            <Vazio>{s.empresaAtiva && !s.escoposAtivos.includes("PROCESSOS") ? "Sua representação não inclui processos." : "Nenhum pedido ainda."}</Vazio>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {lista.map((p) => {
              const etapa = getEstado(p.tipo.definicao as WorkflowDef, p.estadoAtual);
              return (
                <li key={p.id}>
                  <Link href={`/portal/pedidos/${p.id}`} className="flex flex-wrap items-center justify-between gap-3 px-3 py-3.5 hover:bg-sunken/60">
                    <span className="min-w-0">
                      <span className="tnum text-[13px] text-ink-3">
                        {p.numero} · {p.tipo.nome} · aberto em {fmtData(p.abertoEm)}
                      </span>
                      <span className="block font-medium text-ink">{p.assunto}</span>
                    </span>
                    {p.encerradoEm ? <Chip tone="ok">Concluído</Chip> : <Chip tone="brand">{etapa ? nomeEtapa(etapa.nome) : p.estadoAtual}</Chip>}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}

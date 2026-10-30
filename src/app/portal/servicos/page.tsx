import Link from "next/link";
import { Plus } from "lucide-react";
import { requirePortal } from "@/lib/portal";
import { minhasOcorrencias, previsao } from "@/modulos/servicos/dados";
import { StatusChip } from "@/modulos/servicos/componentes";
import { enderecoCurto } from "@/modulos/servicos/constantes";
import { IconeServico } from "@/modulos/servicos/icones";
import { fmtData } from "@/lib/dates";
import { Chip, Vazio } from "@/components/ui";

export default async function MeusPedidosServico() {
  const s = await requirePortal();
  const lista = await minhasOcorrencias(s);
  const semEscopo = !!s.empresaAtiva && !s.escoposAtivos.includes("PROCESSOS");
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-[30px] font-bold text-ink">Meus pedidos de serviço</h1>
          <p className="mt-1 text-[15px] text-ink-2">
            {s.empresaAtiva ? `Pedidos feitos em nome de ${s.empresaAtiva.razaoSocial}.` : "Problemas da cidade que você informou à prefeitura."}
          </p>
        </div>
        {!semEscopo && (
          <Link href="/portal/servicos/novo" className="btn btn-primary">
            <Plus size={17} /> Pedir um serviço
          </Link>
        )}
      </div>
      <section className="panel mt-6 p-2 sm:p-4">
        {lista.length === 0 ? (
          <div className="p-4">
            <Vazio>
              {semEscopo
                ? "Sua representação nesta empresa não inclui solicitações."
                : "Você ainda não pediu nenhum serviço. Quando informar um buraco, uma lâmpada queimada ou outro problema, ele aparece aqui com a previsão de atendimento."}
            </Vazio>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {lista.map((o) => {
              const prev = previsao(o.duplicadaDe ? { ...o.duplicadaDe, ordem: o.duplicadaDe.ordem } : o);
              const avaliar = o.status === "CONCLUIDA" && !o.avaliacaoNota;
              return (
                <li key={o.id}>
                  <Link href={`/portal/servicos/${o.id}`} className="flex flex-wrap items-center gap-3 px-3 py-3.5 hover:bg-sunken/60">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sunken text-ink-2">
                      <IconeServico categoria={o.servico.categoria} size={17} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="tnum text-[13px] text-ink-3">
                        {o.protocolo} · aberto em {fmtData(o.abertaEm)}
                      </span>
                      <span className="block font-medium text-ink">{o.servico.nome}</span>
                      <span className="block text-[13.5px] text-ink-2">{enderecoCurto(o)}</span>
                      {prev && <span className="mt-0.5 block text-[13px] text-ink-2">{prev}</span>}
                    </span>
                    <span className="flex flex-col items-end gap-1">
                      <StatusChip status={o.status} publico />
                      {avaliar && <Chip tone="warn">Avalie o atendimento</Chip>}
                    </span>
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

import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listarOrdens, setoresResponsaveis } from "@/modulos/servicos/dados";
import { Aba, StatusOrdemChip } from "@/modulos/servicos/componentes";
import { fmtDia, hojeIso } from "@/modulos/servicos/constantes";
import { Cabecalho, Panel, Vazio } from "@/components/ui";

const SITUACOES: Record<string, string> = {
  abertas: "Programadas e em execução",
  PROGRAMADA: "Programadas",
  EM_EXECUCAO: "Em execução",
  CONCLUIDA: "Concluídas",
  todas: "Todas",
};

export default async function OrdensPage({ searchParams }: { searchParams: Promise<{ setor?: string; status?: string }> }) {
  const u = await requireUser();
  const sp = await searchParams;
  const setores = await setoresResponsaveis(u.municipioId);
  const meu = setores.find((s) => s.id === u.setorId);
  const setorSel = sp.setor === "todas" ? undefined : (setores.find((s) => s.sigla === sp.setor) ?? (sp.setor ? undefined : meu));
  const status = sp.status && SITUACOES[sp.status] ? sp.status : "abertas";
  const lista = await listarOrdens(u.municipioId, { setorId: setorSel?.id, status });
  const hoje = hojeIso();
  const href = (x: { setor?: string; status?: string }) => `/servicos/ordens?setor=${x.setor ?? setorSel?.sigla ?? "todas"}&status=${x.status ?? status}`;

  return (
    <>
      <Cabecalho
        titulo="Ordens de serviço"
        sub="Cada OS reúne uma ou mais ocorrências para uma equipe, numa data. Para criar uma, marque as ocorrências na fila."
        acao={
          <Link href="/servicos" className="btn btn-primary">
            Ir para a fila de ocorrências
          </Link>
        }
      />
      <div className="mb-3 flex flex-wrap gap-2">
        <Aba href={href({ setor: "todas" })} ativa={!setorSel} rotulo="Todas as secretarias" />
        {setores.map((s) => (
          <Aba key={s.id} href={href({ setor: s.sigla })} ativa={setorSel?.id === s.id} rotulo={s.nome} />
        ))}
      </div>
      <div className="mb-6 flex flex-wrap gap-2">
        {Object.entries(SITUACOES).map(([k, r]) => (
          <Link
            key={k}
            href={href({ status: k })}
            aria-current={status === k ? "page" : undefined}
            className={`rounded-lg px-3 py-1.5 text-[13.5px] font-medium ${status === k ? "bg-brand-soft text-brand-ink" : "text-ink-2 hover:bg-sunken"}`}
          >
            {r}
          </Link>
        ))}
      </div>
      <Panel pad={false}>
        {lista.length === 0 ? (
          <div className="p-6">
            <Vazio>Nenhuma ordem de serviço nesta situação.</Vazio>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="lista">
              <thead>
                <tr>
                  <th>OS</th>
                  <th>Data</th>
                  <th>Equipe</th>
                  <th>Ocorrências</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((os) => {
                  const servicos = [...new Set(os.ocorrencias.map((o) => o.servico.nome))];
                  const bairros = [...new Set(os.ocorrencias.map((o) => o.bairro))];
                  const vencida = os.status === "PROGRAMADA" && os.programadaPara && os.programadaPara < hoje;
                  return (
                    <tr key={os.id} className="linha">
                      <td className="whitespace-nowrap">
                        <Link href={`/servicos/ordens/${os.id}`} className="tnum font-semibold text-brand-2 hover:underline">
                          {os.numero}
                        </Link>
                        {!setorSel && <div className="text-[12.5px] text-ink-3">{os.setor.sigla}</div>}
                      </td>
                      <td className="tnum whitespace-nowrap">
                        {fmtDia(os.programadaPara)}
                        {os.programadaPara === hoje && <div className="text-[12.5px] font-semibold text-brand-2">hoje</div>}
                        {vencida && <div className="text-[12.5px] font-semibold text-bad">data passou</div>}
                      </td>
                      <td className="min-w-[180px] text-[14px]">{os.equipe?.nome ?? "—"}</td>
                      <td className="min-w-[240px]">
                        <div className="text-[14px] text-ink">
                          {os.ocorrencias.length} · {servicos.join(", ")}
                        </div>
                        <div className="text-[12.5px] text-ink-3">{bairros.join(", ")}</div>
                      </td>
                      <td>
                        <StatusOrdemChip status={os.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}

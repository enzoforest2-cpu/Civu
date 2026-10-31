import Link from "next/link";
import { ClipboardPlus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { bairrosComOcorrencias, catalogo, contagemPorSetor, fila, setoresResponsaveis, SITUACOES_FILA } from "@/modulos/servicos/dados";
import { Aba, SlaChip, StatusChip } from "@/modulos/servicos/componentes";
import { CANAIS } from "@/modulos/servicos/constantes";
import { fmtData, relativo } from "@/lib/dates";
import { Cabecalho, Panel, Vazio } from "@/components/ui";

type SP = {
  setor?: string;
  servico?: string;
  bairro?: string;
  situacao?: string;
  atrasadas?: string;
};

export default async function FilaOcorrencias({ searchParams }: { searchParams: Promise<SP> }) {
  const u = await requireUser();
  const sp = await searchParams;
  const setores = await setoresResponsaveis(u.municipioId);
  const meu = setores.find((s) => s.id === u.setorId);
  const setorSel = sp.setor === "todas" ? undefined : (setores.find((s) => s.sigla === sp.setor) ?? (sp.setor ? undefined : meu));
  const situacao = sp.situacao && SITUACOES_FILA[sp.situacao] ? sp.situacao : "abertas";
  const [lista, servicos, bairros, cont] = await Promise.all([
    fila(u.municipioId, {
      setorId: setorSel?.id,
      servicoId: sp.servico || undefined,
      bairro: sp.bairro || undefined,
      situacao,
      atrasadas: sp.atrasadas === "1",
    }),
    catalogo(u.municipioId, false),
    bairrosComOcorrencias(u.municipioId),
    contagemPorSetor(u.municipioId),
  ]);
  const servicosDoSetor = setorSel ? servicos.filter((s) => s.setorId === setorSel.id) : servicos;
  const total = [...cont.values()].reduce(
    (a, c) => ({
      abertas: a.abertas + c.abertas,
      atrasadas: a.atrasadas + c.atrasadas,
    }),
    { abertas: 0, atrasadas: 0 },
  );
  const qs = (extra: Partial<SP>) => {
    const p = new URLSearchParams();
    const v = {
      setor: setorSel?.sigla ?? "todas",
      servico: sp.servico,
      bairro: sp.bairro,
      situacao,
      atrasadas: sp.atrasadas,
      ...extra,
    };
    for (const [k, x] of Object.entries(v)) if (x) p.set(k, x);
    return `/servicos?${p.toString()}`;
  };
  const selecionaveis = lista.filter((o) => o.status === "ABERTA" || o.status === "ACEITA");

  return (
    <>
      <Cabecalho
        titulo="Ocorrências urbanas"
        sub="Pedidos de serviço feitos pelo portal, pelo WhatsApp, pelo 156 e no balcão, organizados por secretaria e pelo prazo-alvo de cada serviço."
        acao={
          <Link href="/servicos/indicadores" className="btn btn-quiet">
            Ver indicadores
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2" aria-label="Secretaria">
        <Aba href={qs({ setor: "todas", servico: undefined })} ativa={!setorSel} rotulo="Todas as secretarias" n={total.abertas} />
        {setores.map((s) => {
          const c = cont.get(s.id);
          return <Aba key={s.id} href={qs({ setor: s.sigla, servico: undefined })} ativa={setorSel?.id === s.id} rotulo={s.nome} n={c?.abertas ?? 0} />;
        })}
      </div>

      <form className="panel mb-6 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1.2fr_auto_auto] lg:items-end">
        <input type="hidden" name="setor" value={setorSel?.sigla ?? "todas"} />
        <div>
          <label className="label" htmlFor="servico">
            Serviço
          </label>
          <select id="servico" name="servico" className="input" defaultValue={sp.servico ?? ""}>
            <option value="">Todos os serviços</option>
            {servicosDoSetor.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="bairro">
            Bairro
          </label>
          <select id="bairro" name="bairro" className="input" defaultValue={sp.bairro ?? ""}>
            <option value="">Todos</option>
            {bairros.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="situacao">
            Situação
          </label>
          <select id="situacao" name="situacao" className="input" defaultValue={situacao}>
            {Object.entries(SITUACOES_FILA).map(([k, v]) => (
              <option key={k} value={k}>
                {v.rotulo}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 py-2.5 text-[14px] text-ink">
          <input type="checkbox" name="atrasadas" value="1" defaultChecked={sp.atrasadas === "1"} className="h-4 w-4 accent-[var(--color-bad)]" />
          Só atrasadas no prazo
        </label>
        <button className="btn btn-primary">Filtrar</button>
      </form>

      <p className="mb-3 text-[14px] text-ink-2">
        {lista.length} {lista.length === 1 ? "ocorrência" : "ocorrências"}
        {setorSel ? ` da ${setorSel.nome}` : ""} ·{" "}
        {total.atrasadas > 0 ? <span className="font-semibold text-bad">{total.atrasadas} atrasadas no município</span> : "nenhuma atrasada no município"}
      </p>

      <form action="/servicos/ordens/nova">
        <Panel pad={false}>
          {lista.length === 0 ? (
            <div className="p-6">
              <Vazio>Nenhuma ocorrência com esses filtros. Ajuste a secretaria, o serviço ou a situação.</Vazio>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="lista">
                <thead>
                  <tr>
                    <th className="w-10">
                      <span className="sr-only">Selecionar</span>
                    </th>
                    <th>Pedido</th>
                    <th>Local</th>
                    <th>Registro</th>
                    <th>Situação e prazo</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((o) => {
                    const sel = o.status === "ABERTA" || o.status === "ACEITA";
                    return (
                      <tr key={o.id} className="linha">
                        <td>
                          {sel && (
                            <input
                              type="checkbox"
                              name="ids"
                              value={o.id}
                              aria-label={`Selecionar ${o.protocolo}`}
                              className="h-4 w-4 accent-[var(--color-brand)]"
                            />
                          )}
                        </td>
                        <td className="min-w-[200px]">
                          <Link href={`/servicos/${o.id}`} className="tnum font-semibold text-brand-2 hover:underline">
                            {o.protocolo}
                          </Link>
                          <div className="text-[13.5px] font-medium text-ink">{o.servico.nome}</div>
                          {!setorSel && <div className="text-[12.5px] text-ink-3">{o.setor.nome}</div>}
                        </td>
                        <td className="min-w-[160px]">
                          <div className="text-[13.5px] text-ink">
                            {o.logradouro}
                            {o.numero ? `, ${o.numero}` : ""}
                          </div>
                          <div className="text-[12.5px] text-ink-3">{o.bairro}</div>
                        </td>
                        <td className="tnum whitespace-nowrap text-[13.5px]">
                          {fmtData(o.abertaEm)}
                          <div className="text-[12.5px] text-ink-3">
                            {relativo(o.abertaEm)} · {CANAIS[o.canal] ?? o.canal}
                          </div>
                        </td>
                        <td className="min-w-[170px]">
                          <div className="flex flex-col items-start gap-1">
                            <StatusChip status={o.status} />
                            <SlaChip o={o} />
                          </div>
                          {o.ordem && (
                            <div className="mt-1 text-[12.5px] text-ink-3">
                              <Link href={`/servicos/ordens/${o.ordem.id}`} className="tnum hover:text-brand-2 hover:underline">
                                {o.ordem.numero}
                              </Link>
                              {o.ordem.equipe ? ` · ${o.ordem.equipe.nome}` : ""}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
        {selecionaveis.length > 0 && (
          <div className="sticky bottom-3 z-10 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface/95 px-4 py-3 shadow-sm backdrop-blur">
            <p className="text-[13.5px] text-ink-2">Marque ocorrências da mesma secretaria (de preferência próximas) para reuni-las numa ordem de serviço.</p>
            <button className="btn btn-primary">
              <ClipboardPlus size={17} /> Gerar ordem de serviço
            </button>
          </div>
        )}
      </form>
    </>
  );
}

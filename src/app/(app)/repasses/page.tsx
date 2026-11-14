import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { exigirRota } from "@/lib/acesso";
import { veTudo } from "@/lib/areas";
import { fmtMoeda } from "@/lib/dates";
import { Cabecalho, Panel, Vazio } from "@/components/ui";
import { repassesVisiveis, setoresResponsaveis, type RepasseResumo } from "@/modulos/repasses/dados";
import { TIPOS_REPASSE, percentualExecutado } from "@/modulos/repasses/regras";
import { BarraExecucao, ChipPrazo, ChipSituacao, Numero } from "@/modulos/repasses/componentes";

const ABAS = [
  { chave: "ativos", rotulo: "Vigentes e em execução" },
  { chave: "risco", rotulo: "Em risco" },
  { chave: "prestacao", rotulo: "Prestação de contas" },
  { chave: "captacao", rotulo: "Em captação" },
  { chave: "todos", rotulo: "Todos" },
] as const;

function naAba(aba: string, r: RepasseResumo) {
  if (aba === "todos") return true;
  if (aba === "risco") return r.risco.emRisco;
  if (aba === "prestacao") return ["PRESTACAO_PENDENTE", "COM_PENDENCIA", "PRESTADO"].includes(r.situacao);
  if (aba === "captacao") return r.situacao === "EM_CAPTACAO";
  return r.situacao === "VIGENTE" || r.situacao === "EM_EXECUCAO";
}

export default async function RepassesPage({ searchParams }: { searchParams: Promise<{ situacao?: string; tipo?: string; setor?: string; q?: string }> }) {
  const u = await exigirRota("/repasses");
  const sp = await searchParams;
  const [todos, setores] = await Promise.all([repassesVisiveis(u), setoresResponsaveis(u)]);
  const aba = ABAS.find((a) => a.chave === sp.situacao)?.chave ?? "ativos";
  const tipo = sp.tipo && TIPOS_REPASSE[sp.tipo] ? sp.tipo : "";
  const setoresVisiveis = [...new Map(todos.map((r) => [r.setor.id, r.setor])).values()].sort((a, b) => a.nome.localeCompare(b.nome));
  const setor = setoresVisiveis.some((s) => s.id === sp.setor) ? sp.setor! : "";
  const q = (sp.q ?? "").trim().toLowerCase();
  const filtrado = todos.filter((r) => (!tipo || r.tipo === tipo) && (!setor || r.setor.id === setor) && (!q || [r.objeto, r.concedente, r.rotulo].some((x) => x.toLowerCase().includes(q))));
  const lista = filtrado.filter((r) => naAba(aba, r));
  const contagem = Object.fromEntries(ABAS.map((a) => [a.chave, filtrado.filter((r) => naAba(a.chave, r)).length]));
  const podeCriar = setores.some((s) => s.editavel);

  const ativos = filtrado.filter((r) => naAba("ativos", r));
  const previsto = ativos.reduce((s, r) => s + r.valorPrevisto, 0);
  const recebido = ativos.reduce((s, r) => s + r.valorRecebido, 0);
  const pago = ativos.reduce((s, r) => s + r.execucao.pago, 0);
  const risco = filtrado.filter((r) => r.risco.emRisco);
  const valorRisco = risco.reduce((s, r) => s + r.risco.valorEmRisco, 0);

  const filtros = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    const base = { situacao: aba, tipo, setor, q: sp.q ?? "", ...extra };
    for (const [k, v] of Object.entries(base)) if (v) p.set(k, v);
    return `/repasses?${p.toString()}`;
  };

  return (
    <>
      <Cabecalho
        titulo="Repasses e convênios"
        sub={
          veTudo(u)
            ? "Emendas, convênios e transferências de todas as secretarias: quanto entrou, quanto foi executado nos processos vinculados e o que vence."
            : `Emendas, convênios e transferências da sua área (${u.setor?.nome ?? "seu setor"}): quanto entrou, quanto foi executado e o que vence.`
        }
        acao={
          podeCriar ? (
            <Link href="/repasses/novo" className="btn btn-primary">
              <Plus size={17} aria-hidden /> Novo repasse
            </Link>
          ) : undefined
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Numero valor={fmtMoeda(previsto)} rotulo={`previstos em ${ativos.length} ${ativos.length === 1 ? "repasse vigente" : "repasses vigentes"}`} />
        <Numero valor={fmtMoeda(recebido)} rotulo="já recebidos desses repasses" />
        <Numero valor={`${percentualExecutado(pago, previsto).toLocaleString("pt-BR")}%`} rotulo={`executado: ${fmtMoeda(pago)} pagos nos processos vinculados`} />
        <Numero valor={risco.length} rotulo={risco.length ? `em risco, somando ${fmtMoeda(valorRisco)}` : "repasses em risco"} tone={risco.length ? "bad" : undefined} />
      </div>

      <nav aria-label="Situação dos repasses" className="mb-4 flex flex-wrap gap-2">
        {ABAS.map((a) => (
          <Link
            key={a.chave}
            href={filtros({ situacao: a.chave })}
            aria-current={aba === a.chave ? "page" : undefined}
            className={`inline-flex min-h-[44px] items-center gap-2 rounded-full border px-4 py-2 text-[14px] font-medium transition-colors ${
              aba === a.chave ? "border-ink bg-ink text-white" : "border-line bg-white text-ink-2 hover:border-line-2 hover:text-ink"
            }`}
          >
            {a.rotulo}
            <span className={`tnum rounded-full px-1.5 text-[12.5px] ${aba === a.chave ? "bg-white/20" : "bg-sunken"}`}>{contagem[a.chave]}</span>
          </Link>
        ))}
      </nav>

      <form action="/repasses" className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_220px_260px_auto] lg:items-end">
        <input type="hidden" name="situacao" value={aba} />
        <div className="relative">
          <label className="label" htmlFor="busca">
            Buscar
          </label>
          <Search size={16} className="pointer-events-none absolute bottom-[14px] left-3 text-ink-3" aria-hidden />
          <input id="busca" name="q" defaultValue={sp.q ?? ""} className="input !pl-9" placeholder="Objeto, concedente ou número" />
        </div>
        <div>
          <label className="label" htmlFor="filtro-tipo">
            Tipo
          </label>
          <select id="filtro-tipo" name="tipo" className="input" defaultValue={tipo}>
            <option value="">Todos os tipos</option>
            {Object.entries(TIPOS_REPASSE).map(([k, v]) => (
              <option key={k} value={k}>
                {v.nome}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="filtro-setor">
            Secretaria
          </label>
          <select id="filtro-setor" name="setor" className="input" defaultValue={setor}>
            <option value="">Todas as que você vê</option>
            {setoresVisiveis.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn btn-quiet min-h-[44px]">
          Filtrar
        </button>
      </form>

      <Panel pad={false}>
        {lista.length === 0 ? (
          <div className="p-6">
            <Vazio>
              {todos.length === 0
                ? podeCriar
                  ? "Nenhum repasse cadastrado na sua área. Cadastre emendas, convênios e transferências em “Novo repasse” para acompanhar prazos e execução."
                  : "Nenhum repasse da sua área cadastrado ainda."
                : "Nenhum repasse com esses filtros. Troque a situação ou limpe a busca."}
            </Vazio>
          </div>
        ) : (
          <>
            <ul className="divide-y divide-line md:hidden">
              {lista.map((r) => (
                <li key={r.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <Link href={`/repasses/${r.id}`} className="font-semibold text-brand-2 hover:underline">
                      {r.rotulo}
                    </Link>
                    <ChipSituacao s={r.situacao} />
                  </div>
                  <div className="mt-1 text-[14px] leading-snug text-ink">{r.objeto}</div>
                  <div className="mt-0.5 text-[13px] text-ink-2">
                    {r.setor.nome} · {r.concedente}
                  </div>
                  <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-2">
                    <div>
                      <dt className="text-[12px] text-ink-3">Previsto</dt>
                      <dd className="tnum text-[14px] font-semibold text-ink">{fmtMoeda(r.valorPrevisto)}</dd>
                    </div>
                    <div>
                      <dt className="text-[12px] text-ink-3">Recebido</dt>
                      <dd className="tnum text-[14px] text-ink">{fmtMoeda(r.valorRecebido)}</dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-[12px] text-ink-3">Execução</dt>
                      <dd className="mt-1">
                        <BarraExecucao previsto={r.valorPrevisto} {...r.execucao} compacta />
                      </dd>
                    </div>
                    {r.prazoCritico && (
                      <div className="col-span-2">
                        <dt className="sr-only">Prazo</dt>
                        <dd>
                          <ChipPrazo alerta={r.prazoCritico.alerta} data={r.prazoCritico.data} rotulo={r.prazoCritico.rotulo} />
                        </dd>
                      </div>
                    )}
                  </dl>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto md:block">
              <table className="lista">
                <thead>
                  <tr>
                    <th>Repasse</th>
                    <th>Secretaria</th>
                    <th className="text-right">Previsto e recebido</th>
                    <th>Execução</th>
                    <th>Prazo e situação</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((r) => (
                    <tr key={r.id} className="linha">
                      <td className="min-w-[260px]">
                        <Link href={`/repasses/${r.id}`} className="font-semibold text-brand-2 hover:underline">
                          {r.rotulo}
                        </Link>
                        <div className="text-[14px] leading-snug text-ink">{r.objeto}</div>
                        <div className="text-[13px] text-ink-2">{r.concedente}</div>
                      </td>
                      <td className="min-w-[150px] text-[14px]">{r.setor.nome}</td>
                      <td className="tnum text-right whitespace-nowrap">
                        <div className="font-semibold text-ink">{fmtMoeda(r.valorPrevisto)}</div>
                        <div className="text-[13px] text-ink-2">recebido {fmtMoeda(r.valorRecebido)}</div>
                      </td>
                      <td className="min-w-[190px]">
                        <BarraExecucao previsto={r.valorPrevisto} {...r.execucao} compacta />
                      </td>
                      <td className="min-w-[210px]">
                        <ChipSituacao s={r.situacao} />
                        {r.prazoCritico && (
                          <div className="mt-1.5">
                            <ChipPrazo alerta={r.prazoCritico.alerta} data={r.prazoCritico.data} rotulo={r.prazoCritico.rotulo} />
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Panel>
      <p className="mt-4 text-[13px] text-ink-3">
        Execução = soma do que foi pago nos processos de compra e de pagamento vinculados ao repasse, sobre o valor previsto. Alertas com 30, 15 e 5 dias de antecedência, em dias corridos.
      </p>
    </>
  );
}

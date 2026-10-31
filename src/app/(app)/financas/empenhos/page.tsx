import Link from "next/link";
import { FilePlus2, Search } from "lucide-react";
import { requireUser, temPapel } from "@/lib/auth";
import { fmtMoeda } from "@/lib/dates";
import { Cabecalho, Chip, Panel, Vazio } from "@/components/ui";
import { anoCorrente, execucao, fmtIso, hojeIso, processosParaEmpenho } from "@/modulos/financas/dados";
import { AbasFinancas, SemAcesso, podeVerFinancas } from "@/modulos/financas/ui";
import { GRUPOS_FONTE, TIPOS_EMPENHO, nomeGrupo } from "@/modulos/financas/classificacao";

export const dynamic = "force-dynamic";

const SITUACOES = [
  { chave: "todos", rotulo: "Todos" },
  { chave: "a-liquidar", rotulo: "Com saldo a liquidar" },
  { chave: "a-pagar", rotulo: "Liquidados a pagar" },
  { chave: "vencidos", rotulo: "Vencidos" },
  { chave: "processo", rotulo: "Ligados a processo" },
] as const;

export default async function EmpenhosPage({ searchParams }: { searchParams: Promise<{ situacao?: string; q?: string; fonte?: string; todos?: string }> }) {
  const u = await requireUser();
  if (!podeVerFinancas(u)) return <SemAcesso />;
  const sp = await searchParams;
  const ano = anoCorrente();
  const [ex, procs] = await Promise.all([execucao(u.municipioId, ano), processosParaEmpenho(u.municipioId, ano)]);
  const hoje = hojeIso();
  const situacao = SITUACOES.some((s) => s.chave === sp.situacao) ? sp.situacao! : "todos";
  const vencidoDe = (e: (typeof ex.empenhos)[number]) => e.liquidacoes.some((l) => l.aPagar > 0 && l.vencimento < hoje);
  const q = (sp.q ?? "").toLowerCase().trim();
  const filtro = (e: (typeof ex.empenhos)[number]) =>
    (situacao === "todos" ||
      (situacao === "a-liquidar" && e.aLiquidar > 0) ||
      (situacao === "a-pagar" && e.aPagar > 0) ||
      (situacao === "vencidos" && vencidoDe(e)) ||
      (situacao === "processo" && e.processoIds.length > 0)) &&
    (!sp.fonte || e.grupo === sp.fonte) &&
    (!q || `${e.numero}/${e.ano} ${e.credorNome} ${e.historico} ${e.credorDocumento ?? ""}`.toLowerCase().includes(q));
  const lista = ex.empenhos.filter(filtro).sort((a, b) => b.numero - a.numero);
  const LIMITE = 25;
  const mostrar = sp.todos ? lista : lista.slice(0, LIMITE);
  const cont = (k: string) => ex.empenhos.filter((e) => (k === "todos" ? true : k === "a-liquidar" ? e.aLiquidar > 0 : k === "a-pagar" ? e.aPagar > 0 : k === "vencidos" ? vencidoDe(e) : e.processoIds.length > 0)).length;
  const aguardando = procs.filter((p) => p.aguardando);
  const reservasAbertas = ex.reservasCalc.filter((r) => r.saldo > 0).sort((a, b) => a.data.localeCompare(b.data));
  const numeroProc = new Map(procs.map((p) => [p.id, p.numero]));
  const contab = temPapel(u, "CONTABILIDADE");
  const qs = (o: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ situacao, q: sp.q, fonte: sp.fonte, ...o })) if (v && !(k === "situacao" && v === "todos")) p.set(k, v);
    const s = p.toString();
    return s ? `?${s}` : "";
  };

  return (
    <>
      <Cabecalho
        titulo="Empenhos"
        sub="Reserva, empenho, liquidação e pagamento: cada etapa é registrada por quem tem o papel certo e abate do saldo da etapa anterior."
        acao={
          contab ? (
            <Link href="/financas/empenhos/novo" className="btn btn-primary">
              <FilePlus2 size={17} /> Novo empenho
            </Link>
          ) : undefined
        }
      />
      <AbasFinancas atual="/financas/empenhos" />

      {aguardando.length > 0 && (
        <Panel title="Processos de compra aguardando empenho" className="mb-6" pad={false}>
          <div id="aguardando" className="scroll-mt-24" />
          <ul className="divide-y divide-line">
            {aguardando.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-3.5">
                <div className="min-w-0">
                  <Link href={`/processos/${p.id}`} className="tnum font-semibold text-brand-2 hover:underline">
                    {p.numero}
                  </Link>{" "}
                  <span className="font-medium text-ink">{p.assunto}</span>
                  <div className="text-[12.5px] text-ink-2">
                    {p.estadoNome}
                    {p.contratacao?.fornecedor
                      ? ` · ${p.contratacao.fornecedor} · ${fmtMoeda(Number(p.contratacao.valor))} · ${nomeGrupo(p.contratacao.fonte ?? "")}`
                      : " · dados da contratação ainda não informados por compras"}
                  </div>
                </div>
                {contab && (
                  <Link href={`/financas/empenhos/novo?processo=${p.id}`} className="btn btn-quiet !py-1.5">
                    Empenhar
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        {SITUACOES.map((s) => (
          <Link
            key={s.chave}
            href={`/financas/empenhos${qs({ situacao: s.chave })}`}
            aria-current={situacao === s.chave ? "page" : undefined}
            className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13.5px] font-medium ${
              situacao === s.chave ? "border-ink bg-ink text-white" : "border-line bg-white text-ink-2 hover:text-ink"
            }`}
          >
            {s.rotulo}
            <span className={`tnum rounded-full px-1.5 text-[12px] ${situacao === s.chave ? "bg-white/20" : s.chave === "vencidos" && cont(s.chave) ? "bg-bad-soft text-bad" : "bg-sunken"}`}>
              {cont(s.chave)}
            </span>
          </Link>
        ))}
      </div>

      <form method="get" className="mb-4 flex flex-wrap gap-2">
        {situacao !== "todos" && <input type="hidden" name="situacao" value={situacao} />}
        <div className="relative min-w-[220px] flex-1">
          <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
          <input name="q" defaultValue={sp.q} className="input !pl-9" placeholder="Número, credor, CNPJ ou histórico" aria-label="Buscar empenho" />
        </div>
        <select name="fonte" defaultValue={sp.fonte ?? ""} className="input !w-auto" aria-label="Fonte">
          <option value="">Todas as fontes</option>
          {GRUPOS_FONTE.map((g) => (
            <option key={g} value={g}>
              {nomeGrupo(g)}
            </option>
          ))}
        </select>
        <button className="btn btn-quiet">Buscar</button>
      </form>

      <Panel pad={false}>
        {lista.length === 0 ? (
          <div className="p-6">
            <Vazio>Nenhum empenho nesta situação.</Vazio>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="lista">
              <thead>
                <tr>
                  <th>Empenho</th>
                  <th>Credor e objeto</th>
                  <th className="text-right">Empenhado</th>
                  <th className="text-right">Liquidado</th>
                  <th className="text-right">Pago</th>
                  <th className="text-right">A pagar</th>
                </tr>
              </thead>
              <tbody>
                {mostrar.map((e) => (
                  <tr key={e.id} className="linha">
                    <td className="tnum align-top whitespace-nowrap">
                      <Link href={`/financas/empenhos/${e.id}`} className="font-semibold text-brand-2 hover:underline">
                        {e.numero}/{e.ano}
                      </Link>
                      <div className="text-[12.5px] text-ink-3">{fmtIso(e.data)}</div>
                      <div className="mt-1">
                        <Chip>{TIPOS_EMPENHO[e.tipo]?.nome}</Chip>
                      </div>
                    </td>
                    <td className="min-w-[300px] align-top">
                      <div className="font-medium text-ink">{e.credorNome}</div>
                      <div className="line-clamp-2 text-[13px] text-ink-2">{e.historico}</div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        <span className="text-[12px] text-ink-3">
                          {e.dotacao.acaoNome} · {e.dotacao.natureza} · {e.dotacao.fonte}
                        </span>
                        {e.processoIds.map((pid) => (
                          <Chip key={pid} tone="brand">
                            Processo {numeroProc.get(pid) ?? ""}
                          </Chip>
                        ))}
                        {vencidoDe(e) && <Chip tone="bad">Pagamento vencido</Chip>}
                      </div>
                    </td>
                    <td className="tnum text-right align-top whitespace-nowrap">
                      {fmtMoeda(e.liquido)}
                      {e.valorAnulado > 0 && <div className="text-[12px] text-ink-3">−{fmtMoeda(e.valorAnulado)} anulado</div>}
                    </td>
                    <td className="tnum text-right align-top whitespace-nowrap">{fmtMoeda(e.liquidado)}</td>
                    <td className="tnum text-right align-top whitespace-nowrap">{fmtMoeda(e.pago)}</td>
                    <td className={`tnum text-right align-top font-semibold whitespace-nowrap ${e.aPagar > 0 ? "text-ink" : "text-ink-3"}`}>{fmtMoeda(e.aPagar)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {lista.length > mostrar.length && (
              <div className="border-t border-line px-6 py-3 text-[13.5px] text-ink-2">
                Mostrando os {mostrar.length} mais recentes de {lista.length}.{" "}
                <Link href={`/financas/empenhos${qs({ todos: "1" })}`} className="font-semibold text-brand-2 hover:underline">
                  Mostrar todos
                </Link>
              </div>
            )}
          </div>
        )}
      </Panel>

      <Panel title="Reservas com saldo (pré-empenhos)" className="mt-6" pad={false}>
        {reservasAbertas.length === 0 ? (
          <div className="p-6">
            <Vazio>Nenhuma reserva com saldo aguardando empenho.</Vazio>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {reservasAbertas.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-3.5">
                <div className="min-w-0">
                  <div className="font-medium text-ink">
                    Reserva {r.numero}/{r.ano} · {r.historico}
                  </div>
                  <div className="text-[12.5px] text-ink-2">
                    {fmtIso(r.data)} ·{" "}
                    <Link href={`/financas/orcamento/${r.dotacaoId}`} className="hover:underline">
                      {r.dotacao.acaoNome} · {r.dotacao.natureza} · {r.dotacao.fonte}
                    </Link>
                  </div>
                </div>
                <span className="tnum font-semibold text-warn">{fmtMoeda(r.saldo)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}

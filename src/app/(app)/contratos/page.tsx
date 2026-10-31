import Link from "next/link";
import { AlertTriangle, ArrowUpRight, ClipboardCheck, Plus, Search, TrendingDown, Wallet } from "lucide-react";
import { requireUser, temPapel } from "@/lib/auth";
import { fmtData, fmtMoeda } from "@/lib/dates";
import { Cabecalho, Panel, Vazio } from "@/components/ui";
import { alertasContratos, listarContratos } from "@/modulos/contratos/dados";
import { NATUREZAS_CONTRATO, dataLocal } from "@/modulos/contratos/regras";
import { BarraSaldo, ChipContrato, ChipObra, Numero, pct } from "@/modulos/contratos/componentes";

const ABAS = [
  { chave: "ativos", rotulo: "Em vigor" },
  { chave: "vencer", rotulo: "Vencem em 90 dias" },
  { chave: "obras", rotulo: "Obras" },
  { chave: "encerrados", rotulo: "Encerrados e rescindidos" },
  { chave: "todos", rotulo: "Todos" },
] as const;

const ICONE = { VIGENCIA: AlertTriangle, SALDO: Wallet, ATESTO: ClipboardCheck, OBRA: TrendingDown, ADITIVO: AlertTriangle };

export default async function ContratosPage({ searchParams }: { searchParams: Promise<{ aba?: string; q?: string; alertas?: string }> }) {
  const u = await requireUser();
  const sp = await searchParams;
  const todos = await listarContratos(u.municipioId);
  const alertas = await alertasContratos(u.municipioId, todos);
  const aba = ABAS.find((a) => a.chave === sp.aba)?.chave ?? "ativos";
  const q = (sp.q ?? "").trim().toLowerCase();
  const filtroAba = (c: (typeof todos)[number]) => filtroAbaDe(aba, c);
  const qDig = q.replace(/\D/g, "");
  const lista = todos.filter(
    (c) =>
      filtroAba(c) &&
      (!q || [c.objeto, c.rotulo, c.empresa.razaoSocial, c.empresa.nomeFantasia ?? ""].some((x) => x.toLowerCase().includes(q)) || (qDig.length >= 4 && c.empresa.cnpj.includes(qDig))),
  );
  const ativos = todos.filter((c) => c.fin.ativo);
  const contagem = Object.fromEntries(ABAS.map((a) => [a.chave, todos.filter((c) => filtroAbaDe(a.chave, c)).length]));
  const emAtesto = todos.flatMap((c) => c.notas).filter((n) => n.situacao === "AGUARDANDO_ATESTO");
  const atrasoAtesto = alertas.filter((a) => a.tipo === "ATESTO").length;
  const obrasAtrasadas = todos.filter((c) => c.obra && c.fin.ativo && (c.obra.situacao === "ATRASADA" || c.obra.situacao === "PARALISADA")).length;
  const mostrarTodos = sp.alertas === "todos";

  return (
    <>
      <Cabecalho
        titulo="Contratos"
        sub="Vigência, saldo, aditivos e notas de cada contrato, do atesto do fiscal até o pagamento na ordem cronológica."
        acao={
          temPapel(u, "COMPRAS") ? (
            <Link href="/contratos/novo" className="btn btn-primary">
              <Plus size={17} /> Novo contrato
            </Link>
          ) : undefined
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Numero valor={ativos.length} rotulo={`contratos em vigor, somando ${fmtMoeda(ativos.reduce((s, c) => s + c.fin.valorAtual, 0))}`} />
        <Numero valor={fmtMoeda(ativos.reduce((s, c) => s + c.fin.saldo, 0))} rotulo="de saldo a executar nos contratos em vigor" />
        <Numero
          valor={emAtesto.length}
          rotulo={atrasoAtesto ? `notas aguardando atesto, ${atrasoAtesto} há mais de 5 dias úteis` : "notas aguardando atesto"}
          tone={atrasoAtesto ? "bad" : undefined}
        />
        <Numero valor={obrasAtrasadas} rotulo={obrasAtrasadas === 1 ? "obra atrasada ou paralisada" : "obras atrasadas ou paralisadas"} tone={obrasAtrasadas ? "bad" : undefined} />
      </div>

      <Panel
        title={`Alertas (${alertas.length})`}
        className="mb-6"
        action={
          alertas.length > 5 ? (
            <Link href={mostrarTodos ? "/contratos" : "/contratos?alertas=todos"} className="alvo-toque text-[14px] font-semibold text-brand-2 hover:underline">
              {mostrarTodos ? "Mostrar menos" : "Ver todos"}
            </Link>
          ) : undefined
        }
      >
        {alertas.length === 0 ? (
          <Vazio>Nenhum alerta: vigências, saldos, atestos e obras dentro do esperado.</Vazio>
        ) : (
          <ul className="divide-y divide-line">
            {(mostrarTodos ? alertas : alertas.slice(0, 5)).map((a) => {
              const Icone = ICONE[a.tipo];
              return (
                <li key={a.chave}>
                  <Link href={a.href} className="group flex items-start gap-3 py-3">
                    <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${a.tone === "bad" ? "bg-bad-soft text-bad" : "bg-warn-soft text-warn"}`}>
                      <Icone size={15} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-ink group-hover:text-brand-2">{a.titulo}</span>
                      <span className="block text-[13px] text-ink-2">{a.detalhe}</span>
                    </span>
                    <ArrowUpRight size={16} className="mt-1 shrink-0 text-ink-3 group-hover:text-brand-2" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {ABAS.map((a) => (
            <Link
              key={a.chave}
              href={`/contratos?aba=${a.chave}${q ? `&q=${encodeURIComponent(sp.q ?? "")}` : ""}`}
              aria-current={aba === a.chave ? "page" : undefined}
              className={`inline-flex min-h-[44px] items-center gap-2 rounded-full border px-4 py-2 text-[14px] font-medium transition-colors ${
                aba === a.chave ? "border-ink bg-ink text-white" : "border-line bg-white text-ink-2 hover:border-line-2 hover:text-ink"
              }`}
            >
              {a.rotulo}
              <span className={`tnum rounded-full px-1.5 text-[12.5px] ${aba === a.chave ? "bg-white/20" : "bg-sunken"}`}>{contagem[a.chave]}</span>
            </Link>
          ))}
        </div>
        <form className="relative w-full sm:w-72" action="/contratos">
          <input type="hidden" name="aba" value={aba} />
          <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
          <input name="q" defaultValue={sp.q ?? ""} className="input !py-2 !pl-9" placeholder="Objeto, empresa, CNPJ ou número" aria-label="Buscar contrato" />
        </form>
      </div>

      <Panel pad={false}>
        {lista.length === 0 ? (
          <div className="p-6">
            <Vazio>{q ? `Nenhum contrato encontrado para "${sp.q}".` : "Nenhum contrato nesta situação."}</Vazio>
          </div>
        ) : (
          <>
          {/* Celular: um cartão por contrato */}
          <ul className="divide-y divide-line md:hidden">
            {lista.map((c) => (
              <li key={c.id} className="px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <Link href={`/contratos/${c.id}`} className="alvo-toque tnum font-semibold text-brand-2 hover:underline">
                    {c.rotulo}
                  </Link>
                  <ChipContrato s={c.fin.situacao} />
                </div>
                <div className="mt-1 text-[14px] leading-snug text-ink">{c.objeto}</div>
                <div className="mt-0.5 text-[13px] text-ink-2">
                  {c.empresa.nomeFantasia ?? c.empresa.razaoSocial} · {NATUREZAS_CONTRATO[c.natureza]?.nome}
                </div>
                <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-2">
                  <div>
                    <dt className="text-[12px] text-ink-3">Valor atualizado</dt>
                    <dd className="tnum text-[14px] font-semibold text-ink">{fmtMoeda(c.fin.valorAtual)}</dd>
                  </div>
                  <div>
                    <dt className="text-[12px] text-ink-3">Vigência</dt>
                    <dd className="tnum text-[14px] text-ink">até {fmtData(dataLocal(c.fin.vigenciaFimAtual))}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-[12px] text-ink-3">Execução</dt>
                    <dd className="mt-1">
                      <BarraSaldo fin={c.fin} compacta />
                    </dd>
                    <dd className="tnum mt-1 text-[12.5px] text-ink-3">
                      {pct(c.fin.pctExecutado, 0)} executado · saldo{" "}
                      <span className={c.fin.ativo && c.fin.pctSaldo < 10 ? "font-semibold text-bad" : ""}>{pct(c.fin.pctSaldo, 0)}</span>
                    </dd>
                    {c.obra && (
                      <dd className="mt-1.5">
                        <ChipObra s={c.obra.situacao} />
                      </dd>
                    )}
                  </div>
                </dl>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <table className="lista">
              <thead>
                <tr>
                  <th>Contrato</th>
                  <th>Empresa</th>
                  <th className="text-right">Valor atualizado</th>
                  <th>Execução</th>
                  <th>Vigência</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((c) => (
                  <tr key={c.id} className="linha">
                    <td className="min-w-[280px]">
                      <Link href={`/contratos/${c.id}`} className="alvo-toque tnum font-semibold text-brand-2 hover:underline">
                        {c.rotulo}
                      </Link>
                      <span className="ml-2 text-[12.5px] text-ink-3">{NATUREZAS_CONTRATO[c.natureza]?.nome}</span>
                      <div className="text-[14px] leading-snug text-ink-2">{c.objeto}</div>
                    </td>
                    <td className="min-w-[180px] text-[14px]">{c.empresa.nomeFantasia ?? c.empresa.razaoSocial}</td>
                    <td className="tnum text-right whitespace-nowrap">{fmtMoeda(c.fin.valorAtual)}</td>
                    <td className="min-w-[180px]">
                      <BarraSaldo fin={c.fin} compacta />
                      <div className="tnum mt-1 text-[12.5px] text-ink-3">
                        {pct(c.fin.pctExecutado, 0)} executado · saldo{" "}
                        <span className={c.fin.ativo && c.fin.pctSaldo < 10 ? "font-semibold text-bad" : ""}>{pct(c.fin.pctSaldo, 0)}</span>
                      </div>
                      {c.obra && (
                        <div className="mt-1.5">
                          <ChipObra s={c.obra.situacao} />
                        </div>
                      )}
                    </td>
                    <td className="min-w-[160px]">
                      <ChipContrato s={c.fin.situacao} />
                      <div className="tnum mt-1 text-[12.5px] text-ink-3">até {fmtData(dataLocal(c.fin.vigenciaFimAtual))}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </Panel>
    </>
  );
}

function filtroAbaDe(chave: string, c: { fin: { ativo: boolean; diasParaVencer: number }; obra: unknown }) {
  if (chave === "todos") return true;
  if (chave === "encerrados") return !c.fin.ativo;
  if (chave === "vencer") return c.fin.ativo && c.fin.diasParaVencer <= 90;
  if (chave === "obras") return !!c.obra;
  return c.fin.ativo;
}

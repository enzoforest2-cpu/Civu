import Link from "next/link";
import { Plus } from "lucide-react";
import { exigirRota } from "@/lib/acesso";
import { veTudo } from "@/lib/areas";
import { Cabecalho, Panel, Vazio } from "@/components/ui";
import { obrigacoesVisiveis, setoresResponsaveis, type ObrigacaoResumo } from "@/modulos/repasses/dados";
import { ChipEntregue, ChipExemplo, ChipPrazo, ChipSituacaoObrigacao, Numero } from "@/modulos/repasses/componentes";
import { dataBr } from "@/modulos/repasses/regras";

const ABAS = [
  { chave: "abertas", rotulo: "A entregar" },
  { chave: "vencidas", rotulo: "Vencidas" },
  { chave: "vencer", rotulo: "Vencem em 30 dias" },
  { chave: "entregues", rotulo: "Entregues" },
  { chave: "todas", rotulo: "Todas" },
] as const;

function naAba(aba: string, o: ObrigacaoResumo) {
  if (aba === "todas") return true;
  if (aba === "entregues") return o.situacao === "ENTREGUE" || !!o.ultimaEntrega;
  if (aba === "vencidas") return o.alerta?.nivel === "vencido";
  if (aba === "vencer") return !!o.alerta && o.alerta.nivel !== "vencido" && o.alerta.dias <= 30;
  return !!o.alerta;
}

export default async function ObrigacoesDaAreaPage({ searchParams }: { searchParams: Promise<{ situacao?: string; setor?: string }> }) {
  const u = await exigirRota("/obrigacoes-da-area");
  const sp = await searchParams;
  const [todas, setores] = await Promise.all([obrigacoesVisiveis(u), setoresResponsaveis(u)]);
  const aba = ABAS.find((a) => a.chave === sp.situacao)?.chave ?? "abertas";
  const setoresVisiveis = [...new Map(todas.map((o) => [o.setor.id, o.setor])).values()].sort((a, b) => a.nome.localeCompare(b.nome));
  const setor = setoresVisiveis.some((s) => s.id === sp.setor) ? sp.setor! : "";
  const filtrado = todas.filter((o) => !setor || o.setor.id === setor);
  const lista = filtrado.filter((o) => naAba(aba, o));
  const contagem = Object.fromEntries(ABAS.map((a) => [a.chave, filtrado.filter((o) => naAba(a.chave, o)).length]));
  const podeCriar = setores.some((s) => s.editavel);
  const vencidas = filtrado.filter((o) => o.alerta?.nivel === "vencido").length;
  const em5 = filtrado.filter((o) => o.alerta?.nivel === "5").length;
  const em30 = filtrado.filter((o) => o.alerta && ["15", "30"].includes(o.alerta.nivel)).length;
  const exemplos = filtrado.some((o) => o.exemplo);
  const href = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ situacao: aba, setor, ...extra })) if (v) p.set(k, v);
    return `/obrigacoes-da-area?${p.toString()}`;
  };

  return (
    <>
      <Cabecalho
        titulo="Obrigações da área"
        sub={
          veTudo(u)
            ? "Calendário de entregas recorrentes de cada secretaria: relatórios, prestações de contas e envios a conselhos, tribunais e ministérios."
            : `Calendário de entregas recorrentes da sua área (${u.setor?.nome ?? "seu setor"}): o que entregar, a quem e até quando.`
        }
        acao={
          podeCriar ? (
            <Link href="/obrigacoes-da-area/nova" className="btn btn-primary">
              <Plus size={17} aria-hidden /> Nova obrigação
            </Link>
          ) : undefined
        }
      />

      {exemplos && (
        <div role="note" className="mb-6 rounded-xl border border-warn/40 bg-warn-soft px-4 py-3 text-[14px] text-ink">
          <strong className="font-semibold">Exemplos da demonstração.</strong> As obrigações marcadas como exemplo mostram como o calendário funciona e não afirmam prazo
          legal: confirme o prazo oficial com o órgão destinatário e ajuste a data antes de usar.
        </div>
      )}

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Numero valor={vencidas} rotulo={vencidas === 1 ? "obrigação vencida" : "obrigações vencidas"} tone={vencidas ? "bad" : undefined} />
        <Numero valor={em5} rotulo="vencem em até 5 dias" tone={em5 ? "bad" : undefined} />
        <Numero valor={em30} rotulo="vencem entre 6 e 30 dias" tone={em30 ? "warn" : undefined} />
      </div>

      <nav aria-label="Situação das obrigações" className="mb-4 flex flex-wrap gap-2">
        {ABAS.map((a) => (
          <Link
            key={a.chave}
            href={href({ situacao: a.chave })}
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

      {setoresVisiveis.length > 1 && (
        <form action="/obrigacoes-da-area" className="mb-5 flex flex-wrap items-end gap-3">
          <input type="hidden" name="situacao" value={aba} />
          <div className="w-full sm:w-72">
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
      )}

      <Panel pad={false}>
        {lista.length === 0 ? (
          <div className="p-6">
            <Vazio>
              {todas.length === 0
                ? podeCriar
                  ? "Nenhuma obrigação cadastrada. Cadastre as entregas recorrentes da sua área (relatórios, prestações de contas, envios) para receber os avisos de prazo."
                  : "Nenhuma obrigação da sua área cadastrada ainda."
                : "Nenhuma obrigação nesta situação."}
            </Vazio>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {lista.map((o) => (
              <li key={o.id} className="flex flex-col gap-3 px-5 py-4 sm:px-6 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/obrigacoes-da-area/${o.id}`} className="font-semibold text-brand-2 hover:underline">
                      {o.nome}
                    </Link>
                    {o.exemplo && <ChipExemplo />}
                  </div>
                  <div className="mt-0.5 text-[14px] text-ink">Entregar a: {o.destinatario}</div>
                  <div className="mt-0.5 text-[13px] text-ink-2">
                    {o.setor.nome} · {o.periodicidadeNome}
                    {o.responsavel ? ` · responsável: ${o.responsavel.nome}` : " · sem responsável definido"}
                  </div>
                  {o.ultimaEntrega && (
                    <div className="mt-0.5 text-[13px] text-ink-2">
                      Última entrega em {dataBr(o.ultimaEntrega.entregueEm)} ({o.ultimaEntrega.comprovante})
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-1.5 md:flex-col md:items-end">
                  {o.alerta ? <ChipPrazo alerta={o.alerta} data={o.proximoVencimento} rotulo="Próxima entrega" /> : <ChipEntregue />}
                  {o.situacao !== "ENTREGUE" && <ChipSituacaoObrigacao s={o.situacao} />}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <p className="mt-4 text-[13px] text-ink-3">Alertas com 30, 15 e 5 dias de antecedência e no vencimento, em dias corridos. Ao registrar a entrega, a obrigação recorrente passa ao próximo vencimento.</p>
    </>
  );
}

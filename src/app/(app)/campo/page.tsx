import Link from "next/link";
import { CheckCircle2, MapPin } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { ordensDeCampo } from "@/modulos/servicos/dados";
import { StatusOrdemChip } from "@/modulos/servicos/componentes";
import { Concluir, Iniciar, Materiais } from "@/modulos/servicos/execucao";
import { fmtDia } from "@/modulos/servicos/constantes";
import { IconeServico } from "@/modulos/servicos/icones";
import { fmtDataHora } from "@/lib/dates";
import { Vazio } from "@/components/ui";

export default async function CampoPage({ searchParams }: { searchParams: Promise<{ equipe?: string }> }) {
  const u = await requireUser();
  const { equipe } = await searchParams;
  const r = await ordensDeCampo(u, equipe);
  const hoje = r.hoje ?? "";
  const emExecucao = r.ordens.filter((o) => o.status === "EM_EXECUCAO");
  const atrasadas = r.ordens.filter((o) => o.status === "PROGRAMADA" && o.programadaPara && o.programadaPara < hoje);
  const deHoje = r.ordens.filter((o) => o.status === "PROGRAMADA" && o.programadaPara === hoje);
  const proximas = r.ordens.filter((o) => o.status === "PROGRAMADA" && o.programadaPara && o.programadaPara > hoje);
  const dataHoje = new Date().toLocaleDateString("pt-BR", {
    timeZone: "America/Fortaleza",
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="mx-auto max-w-2xl">
      <p className="text-[14px] text-ink-2 first-letter:uppercase">{dataHoje}</p>
      <h1 className="display mt-1 text-[28px] leading-tight font-bold text-ink">Execução em campo</h1>
      <p className="mt-1 text-[14.5px] text-ink-2">
        {r.minhas
          ? "Ordens de serviço das equipes em que você é encarregado."
          : r.equipes.length
            ? "Ordens de serviço das equipes da sua secretaria."
            : "Você não está ligado a nenhuma equipe de campo."}
      </p>

      {r.equipes.length > 1 && (
        <div className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1">
          <Link
            href="/campo"
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[13.5px] font-medium ${!equipe ? "border-ink bg-ink text-white" : "border-line bg-white text-ink-2"}`}
          >
            Todas
          </Link>
          {r.equipes.map((e) => (
            <Link
              key={e.id}
              href={`/campo?equipe=${e.id}`}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[13.5px] font-medium ${equipe === e.id ? "border-ink bg-ink text-white" : "border-line bg-white text-ink-2"}`}
            >
              {e.nome}
            </Link>
          ))}
        </div>
      )}

      <div className="mt-5 grid grid-cols-3 gap-2 text-center">
        <Numero n={emExecucao.length} rotulo="em execução" />
        <Numero n={deHoje.length + atrasadas.length} rotulo="para fazer hoje" destaque={atrasadas.length > 0} />
        <Numero n={r.concluidasHoje?.length ?? 0} rotulo="concluídas hoje" />
      </div>

      {r.ordens.length === 0 && (r.concluidasHoje?.length ?? 0) === 0 && (
        <div className="mt-6">
          <Vazio>Nenhuma ordem de serviço programada. Quando a secretaria programar uma OS para sua equipe, ela aparece aqui.</Vazio>
        </div>
      )}

      <Secao titulo="Em execução" lista={emExecucao} hoje={hoje} />
      <Secao titulo="Atrasadas (data já passou)" lista={atrasadas} hoje={hoje} alerta />
      <Secao titulo="Para hoje" lista={deHoje} hoje={hoje} />
      <Secao titulo="Próximos dias" lista={proximas} hoje={hoje} resumida />

      {(r.concluidasHoje?.length ?? 0) > 0 && (
        <section className="mt-8">
          <h2 className="text-[13px] font-semibold tracking-wide text-ink-3 uppercase">Concluídas hoje</h2>
          <ul className="mt-2 space-y-2">
            {r.concluidasHoje!.map((os) => (
              <li key={os.id} className="flex items-center gap-2 rounded-xl bg-ok-soft px-4 py-3 text-[14px] text-ink">
                <CheckCircle2 size={18} className="shrink-0 text-ok" />
                <span>
                  <span className="tnum font-semibold">{os.numero}</span> · {os.ocorrencias.length} {os.ocorrencias.length === 1 ? "local" : "locais"} ·{" "}
                  {fmtDataHora(os.concluidaEm)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="mt-10 text-[12.5px] text-ink-3">
        Esta versão precisa de conexão. Trabalho sem internet, com sincronização posterior, e fotos de antes e depois estão previstos para a versão operacional.
      </p>
    </div>
  );
}

function Numero({ n, rotulo, destaque }: { n: number; rotulo: string; destaque?: boolean }) {
  return (
    <div className={`rounded-2xl border px-2 py-3 ${destaque ? "border-bad/30 bg-bad-soft" : "border-line bg-surface"}`}>
      <div className={`tnum display text-[26px] leading-none font-bold ${destaque ? "text-bad" : "text-ink"}`}>{n}</div>
      <div className="mt-1 text-[12px] leading-tight text-ink-2">{rotulo}</div>
    </div>
  );
}

type OsCampo = Awaited<ReturnType<typeof ordensDeCampo>>["ordens"][number];

function Secao({ titulo, lista, hoje, alerta, resumida }: { titulo: string; lista: OsCampo[]; hoje: string; alerta?: boolean; resumida?: boolean }) {
  if (!lista.length) return null;
  return (
    <section className="mt-8">
      <h2 className={`text-[13px] font-semibold tracking-wide uppercase ${alerta ? "text-bad" : "text-ink-3"}`}>{titulo}</h2>
      <div className="mt-2 space-y-4">
        {lista.map((os) => (
          <CartaoOs key={os.id} os={os} hoje={hoje} resumida={resumida} />
        ))}
      </div>
    </section>
  );
}

function CartaoOs({ os, hoje, resumida }: { os: OsCampo; hoje: string; resumida?: boolean }) {
  const podeIniciar = os.status === "PROGRAMADA" && !!os.programadaPara && os.programadaPara <= hoje;
  return (
    <article className="panel overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <div>
          <Link href={`/servicos/ordens/${os.id}`} className="tnum font-semibold text-brand-2 hover:underline">
            {os.numero}
          </Link>
          <div className="text-[13px] text-ink-2">
            {os.equipe?.nome} · {fmtDia(os.programadaPara)}
          </div>
        </div>
        <StatusOrdemChip status={os.status} />
      </header>
      <ol className="divide-y divide-line">
        {os.ocorrencias.map((o, i) => (
          <li key={o.id} className="flex gap-3 px-4 py-3">
            <span className="tnum mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sunken text-[12.5px] font-semibold text-ink-2">
              {i + 1}
            </span>
            <div className="min-w-0">
              <div className="flex items-start gap-1.5 text-[15.5px] font-semibold text-ink">
                <MapPin size={16} className="mt-1 shrink-0 text-brand-2" />
                <span>
                  {o.logradouro}
                  {o.numero ? `, ${o.numero}` : ""} · {o.bairro}
                </span>
              </div>
              {o.referencia && <div className="text-[13.5px] text-ink-2">{o.referencia}</div>}
              {!resumida && (
                <>
                  <div className="mt-1 flex items-center gap-1.5 text-[13px] text-ink-3">
                    <IconeServico categoria={o.servico.categoria} size={14} className="shrink-0" /> {o.servico.nome}
                  </div>
                  <div className="tnum text-[12.5px] text-ink-3">{o.protocolo}</div>
                  <p className="mt-1 text-[14px] text-ink-2">“{o.descricao}”</p>
                </>
              )}
            </div>
          </li>
        ))}
      </ol>
      {!resumida && os.instrucoes && <p className="border-t border-line bg-sunken/60 px-4 py-3 text-[14px] text-ink">{os.instrucoes}</p>}
      {!resumida && (
        <div className="space-y-4 border-t border-line px-4 py-4">
          {podeIniciar && <Iniciar ordemId={os.id} grande />}
          {os.status === "EM_EXECUCAO" && (
            <>
              <details className="group" open={os.materiais.length > 0}>
                <summary className="text-[14px] font-semibold text-ink">
                  Materiais usados ({os.materiais.length}) <span className="text-ink-3 group-open:hidden">· registrar</span>
                </summary>
                <div className="mt-3">
                  <Materiais ordemId={os.id} materiais={os.materiais} editavel />
                </div>
              </details>
              <Concluir ordemId={os.id} grande />
            </>
          )}
        </div>
      )}
    </article>
  );
}

/* eslint-disable react-hooks/purity -- prazos dependem da hora atual; renderizado a cada requisição */
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { obrigacoes, type SituacaoObrigacao } from "@/lib/conformidade";
import { fmtData, relativo } from "@/lib/dates";
import { Cabecalho, Chip, Panel, Vazio } from "@/components/ui";

const SIT: Record<SituacaoObrigacao, { tone: "ok" | "bad" | "warn" | "neutral"; texto: string; plural: string }> = {
  vencida: { tone: "bad", texto: "Prazo vencido", plural: "com prazo vencido" },
  vence: { tone: "warn", texto: "Vence em breve", plural: "vencendo em até 3 dias" },
  pendente: { tone: "neutral", texto: "Pendente", plural: "pendentes no prazo" },
  cumprida: { tone: "ok", texto: "Cumprida", plural: "cumpridas" },
};
const ORDEM: SituacaoObrigacao[] = ["vencida", "vence", "pendente", "cumprida"];

export default async function ObrigacoesPage({ searchParams }: { searchParams: Promise<{ situacao?: string }> }) {
  const u = await requireUser();
  const { situacao } = await searchParams;
  const todas = await obrigacoes(u.municipioId);
  const filtro = ORDEM.includes(situacao as SituacaoObrigacao) ? (situacao as SituacaoObrigacao) : null;
  const lista = filtro ? todas.filter((o) => o.situacao === filtro) : todas.filter((o) => o.situacao !== "cumprida");
  const cont = Object.fromEntries(ORDEM.map((s) => [s, todas.filter((o) => o.situacao === s).length])) as Record<SituacaoObrigacao, number>;

  return (
    <>
      <Cabecalho
        titulo="Obrigações legais"
        sub="Prazos de publicação no PNCP e de remessa ao Tribunal de Contas de cada contratação, calculados a partir do que foi registrado nos processos."
      />

      <div className="mb-6 flex flex-wrap gap-2">
        <Aba href="/obrigacoes" ativa={!filtro} rotulo="Em aberto" n={cont.vencida + cont.vence + cont.pendente} />
        {ORDEM.map((s) => (
          <Aba key={s} href={`/obrigacoes?situacao=${s}`} ativa={filtro === s} rotulo={SIT[s].texto} n={cont[s]} tone={s === "vencida" && cont[s] > 0 ? "bad" : undefined} />
        ))}
      </div>

      <Panel pad={false}>
        {lista.length === 0 ? (
          <div className="p-6">
            <Vazio>{filtro ? `Nenhuma obrigação ${SIT[filtro].plural}.` : "Nenhuma obrigação em aberto. Tudo publicado e enviado."}</Vazio>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="lista">
              <thead>
                <tr>
                  <th>Processo</th>
                  <th>Obrigação</th>
                  <th>Prazo</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((o) => (
                  <tr key={o.processoId + o.chave}>
                    <td className="min-w-[220px]">
                      <Link href={`/processos/${o.processoId}#contratacao`} className="tnum font-semibold text-brand hover:underline">
                        {o.numero}
                      </Link>
                      <div className="text-[13px] text-ink-2">{o.assunto}</div>
                    </td>
                    <td className="min-w-[260px]">
                      <div className="font-medium text-ink">{o.titulo}</div>
                      <div className="text-[12.5px] leading-snug text-ink-3">{o.base}</div>
                    </td>
                    <td className="tnum whitespace-nowrap">
                      {o.situacao === "cumprida" ? (
                        <span className="text-ink-2">Cumprida em {fmtData(o.cumpridaEm)}</span>
                      ) : o.prazo ? (
                        <>
                          {fmtData(o.prazo)}
                          <div className="text-[12.5px] text-ink-3">{relativo(o.prazo)}</div>
                        </>
                      ) : (
                        <span className="text-ink-3">Sem prazo configurado</span>
                      )}
                    </td>
                    <td>
                      <Chip tone={SIT[o.situacao].tone}>{SIT[o.situacao].texto}</Chip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <p className="mt-4 max-w-3xl text-[13px] text-ink-3">
        O envio automático ao PNCP e ao sistema do Tribunal de Contas depende do credenciamento da prefeitura. Até lá, o sistema calcula os prazos, avisa
        antes de vencer e guarda o comprovante ou o recibo de cada envio no histórico do processo.
      </p>
    </>
  );
}

function Aba({ href, ativa, rotulo, n, tone }: { href: string; ativa: boolean; rotulo: string; n: number; tone?: "bad" }) {
  return (
    <Link
      href={href}
      aria-current={ativa ? "page" : undefined}
      className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[14px] font-medium transition-colors ${
        ativa ? "border-ink bg-ink text-white" : "border-line bg-white text-ink-2 hover:border-line-2 hover:text-ink"
      }`}
    >
      {rotulo}
      <span className={`tnum rounded-full px-1.5 text-[12.5px] ${ativa ? "bg-white/20" : tone === "bad" ? "bg-bad-soft text-bad" : "bg-sunken"}`}>{n}</span>
    </Link>
  );
}

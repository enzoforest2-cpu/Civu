import Link from "next/link";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { contratoNotas } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { fmtData, fmtMoeda } from "@/lib/dates";
import { Cabecalho, Chip, Panel, Vazio } from "@/components/ui";
import { situacaoDasNotas } from "@/modulos/contratos/dados";
import { ehFiscalDo, podeEnviarLiquidacao } from "@/modulos/contratos/operacoes";
import { numeroContrato, rotuloMes } from "@/modulos/contratos/regras";
import { AcoesNota } from "@/modulos/contratos/acoes-nota";

export default async function AtestosPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const u = await requireUser();
  const { ver } = await searchParams;
  const notas = (
    await db.query.contratoNotas.findMany({
      where: inArray(contratoNotas.situacao, ["AGUARDANDO_ATESTO", "ATESTADA"]),
      with: { contrato: { with: { empresa: true, fiscal: { columns: { id: true, nome: true } } } }, enviadaPor: { columns: { nome: true } } },
      orderBy: (n, { asc }) => [asc(n.criadoEm)],
    })
  ).filter((n) => n.contrato.municipioId === u.municipioId);
  const minhasTodas = notas.filter((n) => n.contrato.fiscalId === u.id || n.contrato.gestorId === u.id);
  const soMinhas = ver !== "todas" && minhasTodas.length > 0;
  const lista = soMinhas ? minhasTodas : notas;
  const st = await situacaoDasNotas(u.municipioId, lista);
  const atrasadas = lista.filter((n) => (st[n.id]?.diasUteisSemAtesto ?? 0) > 5).length;

  return (
    <>
      <Cabecalho
        titulo="Notas a atestar"
        sub="O fiscal confere a entrega e atesta a nota em até 5 dias úteis. Depois do atesto, a nota segue para liquidação e entra na fila cronológica de pagamentos."
      />
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {minhasTodas.length > 0 && (
          <Link
            href="/contratos/atestos"
            aria-current={soMinhas ? "page" : undefined}
            className={`rounded-full border px-4 py-2 text-[14px] font-medium ${soMinhas ? "border-ink bg-ink text-white" : "border-line bg-white text-ink-2"}`}
          >
            Contratos em que sou fiscal ou gestor ({minhasTodas.length})
          </Link>
        )}
        <Link
          href="/contratos/atestos?ver=todas"
          aria-current={!soMinhas ? "page" : undefined}
          className={`rounded-full border px-4 py-2 text-[14px] font-medium ${!soMinhas ? "border-ink bg-ink text-white" : "border-line bg-white text-ink-2"}`}
        >
          Todas as notas ({notas.length})
        </Link>
        {atrasadas > 0 && <Chip tone="bad">{atrasadas === 1 ? "1 nota passou de 5 dias úteis" : `${atrasadas} notas passaram de 5 dias úteis`}</Chip>}
      </div>
      <Panel pad={false}>
        {lista.length === 0 ? (
          <div className="p-6">
            <Vazio>Nenhuma nota aguardando atesto ou envio à liquidação.</Vazio>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {lista.map((n) => {
              const s = st[n.id];
              return (
                <li key={n.id} className="grid gap-3 px-6 py-4 md:grid-cols-[minmax(0,1fr)_auto]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-semibold text-ink">NF {n.numero}</span>
                      <span className="display tnum text-[16px] font-semibold">{fmtMoeda(n.valor)}</span>
                      <Chip tone={s?.tone === "bad" ? "bad" : n.situacao === "ATESTADA" ? "brand" : "warn"}>
                        {n.situacao === "ATESTADA" ? "Atestada: falta enviar à liquidação" : `Aguardando atesto · ${s?.detalhe?.toLowerCase()}`}
                      </Chip>
                    </div>
                    <div className="mt-1 text-[13.5px] text-ink-2">
                      <Link href={`/contratos/${n.contrato.id}#notas`} className="tnum font-semibold text-brand-2 hover:underline">
                        Contrato {numeroContrato(n.contrato)}
                      </Link>{" "}
                      · {n.contrato.empresa.nomeFantasia ?? n.contrato.empresa.razaoSocial} · competência {rotuloMes(n.competencia)} · recebida em {fmtData(n.criadoEm)}
                      {n.enviadaPor && ` pelo portal (${n.enviadaPor.nome})`}
                    </div>
                    {n.descricao && <div className="text-[13px] text-ink-3">{n.descricao}</div>}
                    <div className="text-[12.5px] text-ink-3">Fiscal: {n.contrato.fiscal?.nome ?? "não designado"}</div>
                  </div>
                  <div className="md:max-w-[300px]">
                    <AcoesNota
                      notaId={n.id}
                      contratoId={n.contrato.id}
                      situacao={n.situacao}
                      podeAtestar={ehFiscalDo(u, n.contrato)}
                      podeEnviar={podeEnviarLiquidacao(u, n.contrato)}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </>
  );
}

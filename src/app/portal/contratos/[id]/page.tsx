import Link from "next/link";
import { ArrowLeft, ShieldAlert, Upload } from "lucide-react";
import { fmtData, fmtMoeda } from "@/lib/dates";
import { nomeFonte } from "@/lib/pagamentos";
import { Chip, Vazio } from "@/components/ui";
import { contratosDaEmpresa, situacaoDasNotas } from "@/modulos/contratos/dados";
import { acessoFornecedor, SemAcesso } from "@/modulos/contratos/portal";
import { TIPOS_ADITIVO, TIPOS_APOSTILAMENTO, dataLocal, num, rotuloMes } from "@/modulos/contratos/regras";
import { BarraSaldo, ChipContrato, CurvaS, Dado, TrilhoNota, pct } from "@/modulos/contratos/componentes";
import { db } from "@/db";

export default async function MeuContratoPage({ params }: { params: Promise<{ id: string }> }) {
  const a = await acessoFornecedor();
  if (!a.ok) return <SemAcesso a={a} />;
  const { id } = await params;
  const c = (await contratosDaEmpresa(a.empresa.id)).find((x) => x.id === id);
  if (!c) {
    // contrato inexistente ou de outra empresa: a mesma resposta, sem revelar qual
    const existe = await db.query.contratos.findFirst({ where: (x, { eq }) => eq(x.id, id), columns: { id: true } });
    return (
      <div className="panel mx-auto max-w-xl p-8 text-center">
        <ShieldAlert size={22} className="mx-auto text-ink-3" />
        <h1 className="display mt-3 text-[22px] font-semibold text-ink">Contrato não disponível</h1>
        <p className="mt-2 text-[14.5px] text-ink-2">
          {existe ? "Este contrato não pertence à empresa que você está representando agora." : "Não encontramos este contrato."}
        </p>
        <Link href="/portal/contratos" className="btn btn-quiet mt-5">
          Meus contratos
        </Link>
      </div>
    );
  }
  const st = await situacaoDasNotas(c.municipioId, c.notas);
  const fin = c.fin;
  const dl = (d: string | null) => fmtData(d ? dataLocal(d) : null);

  return (
    <>
      <Link href="/portal/contratos" className="mb-4 inline-flex items-center gap-1.5 text-[13.5px] font-medium text-ink-2 hover:text-ink">
        <ArrowLeft size={15} /> Meus contratos
      </Link>
      <div className="flex flex-wrap items-center gap-2">
        <span className="tnum text-[13.5px] font-semibold text-ink-3">
          Contrato {c.rotulo} · Prefeitura de {c.municipio.nome}
        </span>
        <ChipContrato s={fin.situacao} />
      </div>
      <h1 className="display mt-2 text-[24px] leading-[1.15] font-bold text-ink sm:text-[30px]">{c.objeto}</h1>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-6">
          <section className="panel p-6">
            <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Dado rotulo="Valor atualizado">
                <span className="display tnum text-[18px] font-semibold">{fmtMoeda(fin.valorAtual)}</span>
              </Dado>
              <Dado rotulo="Saldo">
                <span className={`display tnum text-[18px] font-semibold ${fin.pctSaldo < 10 ? "text-bad" : ""}`}>{fmtMoeda(fin.saldo)}</span>
              </Dado>
              <Dado rotulo="Pode faturar agora">
                <span className="display tnum text-[18px] font-semibold">{fmtMoeda(Math.max(0, fin.saldo - fin.aAtestar))}</span>
              </Dado>
            </div>
            <BarraSaldo fin={fin} />
            {fin.ativo && (
              <Link href={`/portal/contratos/nota?contrato=${c.id}`} className="btn btn-primary mt-5">
                <Upload size={16} /> Enviar nota deste contrato
              </Link>
            )}
          </section>

          <section className="panel p-2 sm:p-4">
            <h2 className="px-3 pt-2 pb-1 text-[16px] font-semibold text-ink">Notas e pagamentos</h2>
            {c.notas.length === 0 ? (
              <div className="p-3">
                <Vazio>Nenhuma nota enviada neste contrato.</Vazio>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {c.notas.map((n) => {
                  const s = st[n.id];
                  return (
                    <li key={n.id} className="px-3 py-3.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span>
                          <span className="font-semibold text-ink">NF {n.numero}</span>{" "}
                          <span className="text-[13px] text-ink-3">· {rotuloMes(n.competencia)}</span>
                        </span>
                        <span className="display tnum font-semibold text-ink">{fmtMoeda(n.valor)}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
                        {s && <TrilhoNota s={s} />}
                        <span className={`text-[13px] ${s?.etapa === "GLOSADA" ? "font-semibold text-bad" : "text-ink-2"}`}>
                          {s?.etapa === "FILA" && s.fila
                            ? `${s.fila.posicao}º na fila de ${s.fila.fonteNome}`
                            : s?.etapa === "PAGO"
                              ? `Pago em ${fmtData(s.pagoEm)}`
                              : s?.etapa === "GLOSADA"
                                ? "Glosada pelo fiscal"
                                : s?.etapa === "ATESTO"
                                  ? `Aguardando atesto · ${s.detalhe?.toLowerCase()}`
                                  : s?.etapa === "ATESTADA"
                                    ? "Atestada, seguindo para liquidação"
                                    : "Em liquidação na contabilidade"}
                        </span>
                      </div>
                      {n.situacao === "GLOSADA" && n.glosaMotivo && (
                        <p className="mt-2 rounded-lg bg-bad-soft px-3 py-2 text-[13.5px] text-ink">
                          <strong className="font-semibold">O que corrigir:</strong> {n.glosaMotivo}{" "}
                          {fin.ativo && (
                            <Link href={`/portal/contratos/nota?contrato=${c.id}`} className="font-semibold text-brand-2 hover:underline">
                              Enviar nota corrigida
                            </Link>
                          )}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {c.obra && (
            <section className="panel p-6">
              <h2 className="mb-3 text-[16px] font-semibold text-ink">Avanço da obra segundo as medições</h2>
              <CurvaS obra={c.obra} />
            </section>
          )}
        </div>

        <aside className="space-y-6">
          <section className="panel p-6">
            <dl className="space-y-3.5">
              <Dado rotulo="Vigência">
                <span className="tnum">
                  {dl(c.vigenciaInicio)} a {dl(fin.vigenciaFimAtual)}
                </span>
              </Dado>
              <Dado rotulo="Valor global original">
                <span className="tnum">{fmtMoeda(fin.global)}</span>
              </Dado>
              <Dado rotulo="Fonte de recurso">{nomeFonte(c.fonte)}</Dado>
              <Dado rotulo="Fiscal do contrato">{c.fiscal?.nome ?? "—"}</Dado>
              {c.setor && <Dado rotulo="Secretaria">{c.setor.nome}</Dado>}
            </dl>
          </section>
          <section className="panel p-6">
            <h2 className="mb-2 text-[15px] font-semibold text-ink">Aditivos e reajustes</h2>
            {c.aditivos.length === 0 && c.apostilamentos.length === 0 ? (
              <p className="text-[14px] text-ink-3">Nenhum.</p>
            ) : (
              <ul className="space-y-3 text-[13.5px]">
                {c.aditivos.map((x) => (
                  <li key={x.id}>
                    <div className="font-semibold text-ink">{x.numero}º aditivo</div>
                    <div className="text-ink-2">{TIPOS_ADITIVO[x.tipo]}</div>
                    <div className="tnum text-ink-2">
                      {num(x.valor) !== 0 && `${num(x.valor) > 0 ? "+" : "−"}${fmtMoeda(Math.abs(num(x.valor)))} `}
                      {x.novaVigenciaFim && `· até ${dl(x.novaVigenciaFim)}`}
                    </div>
                  </li>
                ))}
                {c.apostilamentos.map((x) => (
                  <li key={x.id}>
                    <div className="font-semibold text-ink">{x.numero}º apostilamento</div>
                    <div className="text-ink-2">
                      {TIPOS_APOSTILAMENTO[x.tipo]} {x.indice && `· ${x.indice} ${pct(num(x.percentual), 2)}`}
                    </div>
                    {num(x.valor) > 0 && <div className="tnum text-ink-2">+{fmtMoeda(x.valor)}</div>}
                  </li>
                ))}
              </ul>
            )}
          </section>
          {c.situacao !== "ATIVO" && (
            <Chip tone="neutral">
              {c.situacao === "RESCINDIDO" ? "Rescindido" : "Encerrado"} em {dl(c.encerradoEm)}
            </Chip>
          )}
        </aside>
      </div>
    </>
  );
}

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { exigirRota } from "@/lib/acesso";
import { urlSemAcesso } from "@/lib/areas";
import { fmtDataHora } from "@/lib/dates";
import { Cabecalho, Panel, Vazio } from "@/components/ui";
import { carregarObrigacao, pessoasResponsaveis, setoresResponsaveis } from "@/modulos/repasses/dados";
import { ChipEntregue, ChipExemplo, ChipPrazo, ChipSituacaoObrigacao } from "@/modulos/repasses/componentes";
import { FormEntrega, FormObrigacao } from "@/modulos/repasses/formularios";
import { dataBr, hojeLocal, podeEditarNaArea, podeVerNaArea } from "@/modulos/repasses/regras";

export default async function ObrigacaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await exigirRota(`/obrigacoes-da-area/${id}`);
  const o = await carregarObrigacao(u.municipioId, id);
  if (!o) notFound();
  if (!podeVerNaArea(u, o.area)) redirect(urlSemAcesso(`/obrigacoes-da-area/${id}`));
  const pode = podeEditarNaArea(u, o.area);
  const [setores, pessoas] = pode ? await Promise.all([setoresResponsaveis(u), pessoasResponsaveis(u)]) : [[], []];
  if (o.responsavel && pode && !pessoas.some((p) => p.id === o.responsavel!.id)) pessoas.push({ id: o.responsavel.id, rotulo: o.responsavel.nome });

  return (
    <>
      <Link href="/obrigacoes-da-area" className="mb-4 inline-flex items-center gap-1.5 text-[14px] font-medium text-ink-2 hover:text-ink">
        <ArrowLeft size={15} aria-hidden /> Obrigações da área
      </Link>
      <Cabecalho
        titulo={o.nome}
        sub={
          <span className="flex flex-wrap items-center gap-2">
            <span>
              {o.setor.nome} · entregar a {o.destinatario}
            </span>
            {o.exemplo && <ChipExemplo />}
          </span>
        }
      />
      {o.exemplo && (
        <div role="note" className="mb-6 rounded-xl border border-warn/40 bg-warn-soft px-4 py-3 text-[14px] text-ink">
          <strong className="font-semibold">Exemplo da demonstração.</strong> Esta obrigação não afirma prazo legal: confirme o prazo oficial com o órgão destinatário. Ao
          salvar uma alteração, ela deixa de ser exemplo e passa a ser do município.
        </div>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          {pode && o.situacao !== "ENTREGUE" && (
            <Panel title="Registrar entrega">
              <p className="mb-3 text-[14px] text-ink-2">
                Referente ao vencimento de {dataBr(o.proximoVencimento)}.{" "}
                {o.periodicidade === "UNICA" ? "Por ser entrega única, a obrigação fica cumprida." : "A obrigação passa ao próximo vencimento pela periodicidade."}
              </p>
              <FormEntrega id={o.id} hoje={hojeLocal()} />
            </Panel>
          )}
          <Panel title={`Entregas registradas (${o.entregas.length})`}>
            {o.entregas.length === 0 ? (
              <Vazio>Nenhuma entrega registrada ainda.</Vazio>
            ) : (
              <ul className="divide-y divide-line">
                {o.entregas.map((e) => (
                  <li key={e.id} className="py-3 text-[14px]">
                    <div className="font-medium text-ink">
                      Vencimento de {dataBr(e.vencimento)}: entregue em {dataBr(e.entregueEm)}
                    </div>
                    <div className="text-ink-2">Comprovante: {e.comprovante}</div>
                    <div className="text-[12.5px] text-ink-3">
                      {e.autor ?? "—"} · {fmtDataHora(e.criadoEm)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          {pode && (
            <Panel title="Alterar dados">
              <FormObrigacao
                setores={setores.filter((s) => s.editavel || s.id === o.setor.id).map((s) => ({ id: s.id, rotulo: s.nome }))}
                pessoas={pessoas}
                valores={{
                  id: o.id,
                  setorId: o.setor.id,
                  nome: o.nome,
                  destinatario: o.destinatario,
                  periodicidade: o.periodicidade,
                  proximoVencimento: o.proximoVencimento,
                  responsavelId: o.responsavel?.id ?? null,
                  situacao: o.situacao,
                  observacao: o.observacao,
                }}
              />
            </Panel>
          )}
        </div>
        <aside className="min-w-0">
          <Panel title="Situação">
            <dl className="space-y-3 text-[14px]">
              <div>
                <dt className="text-[13px] text-ink-3">Próximo vencimento</dt>
                <dd className="mt-0.5">{o.alerta ? <ChipPrazo alerta={o.alerta} data={o.proximoVencimento} /> : <ChipEntregue />}</dd>
              </div>
              <div>
                <dt className="text-[13px] text-ink-3">Andamento</dt>
                <dd className="mt-0.5">
                  <ChipSituacaoObrigacao s={o.situacao} />
                </dd>
              </div>
              <div>
                <dt className="text-[13px] text-ink-3">Periodicidade</dt>
                <dd className="text-ink">{o.periodicidadeNome}</dd>
              </div>
              <div>
                <dt className="text-[13px] text-ink-3">Responsável</dt>
                <dd className="text-ink">{o.responsavel?.nome ?? "Ninguém definido"}</dd>
              </div>
              {o.observacao && (
                <div>
                  <dt className="text-[13px] text-ink-3">Observação</dt>
                  <dd className="text-ink">{o.observacao}</dd>
                </div>
              )}
            </dl>
            {!pode && <p className="hint mt-4">Só quem é da área da secretaria responsável ou do Gabinete registra entregas e altera esta obrigação.</p>}
          </Panel>
        </aside>
      </div>
    </>
  );
}

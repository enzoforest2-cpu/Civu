import Link from "next/link";
import { Store } from "lucide-react";
import { requirePortal } from "@/lib/portal";
import { agirComoAction } from "@/app/portal/actions";
import { donoPortalOuMotivo, inscricoesDaEmpresa, pedidosAlvara, situacaoLicenca } from "@/modulos/tributos/dados";
import { QrCodigo, SemAcesso, Titulo } from "@/modulos/tributos/componentes";
import { LICENCA_NOME, REGIME_NOME } from "@/modulos/tributos/regras";
import { pedirAlvaraAction } from "@/modulos/tributos/acoes";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { fmtData } from "@/lib/dates";
import { Chip, Panel, Vazio } from "@/components/ui";
import { urlBase } from "@/modulos/tributos/url";

export default async function AlvaraDaEmpresa({ searchParams }: { searchParams: Promise<{ pedido?: string }> }) {
  const s = await requirePortal();
  const sp = await searchParams;
  if (!s.empresaAtiva) {
    const comLicenca = s.representacoes.filter((r) => r.escopos.includes("LICENCAS"));
    return (
      <>
        <Titulo titulo="Alvará da minha empresa" sub="O alvará é da empresa. Escolha em nome de qual empresa você quer agir." />
        {comLicenca.length === 0 ? (
          <Vazio icon={<Store size={22} className="text-ink-3" />}>
            Você não representa nenhuma empresa no assunto “Licenças e alvarás”. O responsável legal pode conceder esse acesso em “Representação e acessos”.
          </Vazio>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {comLicenca.map((r) => (
              <li key={r.id} className="panel flex items-center justify-between gap-3 p-5">
                <div className="min-w-0">
                  <div className="font-semibold text-ink">{r.empresa.nomeFantasia ?? r.empresa.razaoSocial}</div>
                  <div className="text-[13px] text-ink-3">{r.empresa.razaoSocial}</div>
                </div>
                <form action={agirComoAction}>
                  <input type="hidden" name="empresaId" value={r.empresaId} />
                  <input type="hidden" name="voltar" value="/portal/alvara" />
                  <button className="btn btn-primary">Agir por ela</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </>
    );
  }
  const { dono, motivo } = donoPortalOuMotivo(s, "LICENCAS");
  if (!dono)
    return (
      <>
        <Titulo titulo="Alvará da minha empresa" />
        <SemAcesso motivo={motivo} dica="Quem pode ampliar o acesso é o responsável legal da empresa, em “Representação e acessos”." />
      </>
    );
  const inscricoes = await inscricoesDaEmpresa(dono.id);
  const pedidos = inscricoes.length ? await pedidosAlvara(inscricoes[0].municipioId, dono.id) : [];
  const base = await urlBase();
  return (
    <>
      <Titulo sobre={dono.nome} titulo="Alvará da minha empresa" sub="Validade do alvará e das licenças, com o código que fiscais e clientes usam para conferir." />
      {sp.pedido && (
        <div className="mb-5 rounded-xl border border-ok/30 bg-ok-soft px-4 py-3 text-[14px] text-ok">
          Pedido enviado. Acompanhe em{" "}
          <Link href={`/portal/pedidos/${sp.pedido}`} className="font-semibold underline">
            Meus pedidos
          </Link>
          {s.escoposAtivos.includes("PROCESSOS") ? "" : " (se sua representação incluir processos)"}.
        </div>
      )}
      {inscricoes.length === 0 ? (
        <Vazio>Esta empresa não tem inscrição municipal neste município. A inscrição é feita pelo protocolo com o contrato social e o endereço.</Vazio>
      ) : (
        <div className="space-y-6">
          {inscricoes.map((ins) => {
            const alvaras = ins.licencas.filter((l) => l.tipo === "LOCALIZACAO_FUNCIONAMENTO");
            const atual = alvaras[0];
            const outras = ins.licencas.filter((l) => l.tipo !== "LOCALIZACAO_FUNCIONAMENTO");
            const sit = atual ? situacaoLicenca(atual.validaAte, atual.situacao) : null;
            const aberto = pedidos.find((p) => !p.encerradoEm && (p.metadados as { inscricaoId?: string } | null)?.inscricaoId === ins.id);
            const url = atual ? `${base}/verificar/alvara/${atual.codigoVerificacao}` : "";
            return (
              <section key={ins.id} className="space-y-4">
                <Panel
                  title={`Inscrição municipal ${ins.numero}`}
                  action={<Chip tone="neutral">{REGIME_NOME[ins.regime]}</Chip>}
                >
                  <p className="text-[14px] text-ink-2">
                    {ins.cnaePrincipal} — {ins.cnaeDescricao}
                    <br />
                    {ins.endereco?.logradouro}, {ins.endereco?.numero} · {ins.endereco?.bairro} · {ins.areaUtilizada?.toLocaleString("pt-BR")} m² utilizados
                  </p>
                  {atual && sit ? (
                    <div className={`mt-4 grid gap-5 rounded-xl border p-4 sm:grid-cols-[1fr_auto] ${sit.tone === "bad" ? "border-bad/30 bg-bad-soft" : sit.tone === "warn" ? "border-warn/40 bg-warn-soft" : "border-line bg-sunken"}`}>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[16px] font-semibold text-ink">{LICENCA_NOME[atual.tipo]}</span>
                          <Chip tone={sit.tone}>{sit.texto}</Chip>
                        </div>
                        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-[13.5px]">
                          <dt className="text-ink-3">Número</dt>
                          <dd className="tnum text-ink">{atual.numero}</dd>
                          <dt className="text-ink-3">Emitido em</dt>
                          <dd className="tnum text-ink">{fmtData(atual.emitidaEm)}</dd>
                          <dt className="text-ink-3">Válido até</dt>
                          <dd className="tnum font-semibold text-ink">{fmtData(atual.validaAte + "T12:00:00")}</dd>
                          <dt className="text-ink-3">Código</dt>
                          <dd className="tnum text-ink">{atual.codigoVerificacao}</dd>
                        </dl>
                        <Link href={`/verificar/alvara/${atual.codigoVerificacao}`} className="mt-3 inline-block text-[13.5px] font-semibold text-brand-2 hover:underline">
                          Abrir o alvará para imprimir ou mostrar ao fiscal
                        </Link>
                      </div>
                      <div className="flex flex-col items-center gap-1">
                        <QrCodigo texto={url} tamanho={120} titulo="QR Code de verificação do alvará" />
                        <span className="text-[12px] text-ink-3">Verificação pública</span>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-4 rounded-xl bg-warn-soft px-4 py-3 text-[14px] text-ink">Ainda não há alvará de localização e funcionamento para esta inscrição.</p>
                  )}
                  {aberto ? (
                    <p className="mt-4 text-[14px] text-ink-2">
                      Pedido{" "}
                      <Link href={`/portal/pedidos/${aberto.id}`} className="tnum font-semibold text-brand-2 hover:underline">
                        {aberto.numero}
                      </Link>{" "}
                      em análise desde {fmtData(aberto.abertoEm)}.
                    </p>
                  ) : (
                    (!sit || sit.dias <= 60) && (
                      <details className="mt-4" open={Boolean(sit && sit.dias <= 30)}>
                        <summary className="btn btn-primary">{atual ? "Pedir renovação" : "Pedir alvará"}</summary>
                        <ActionForm action={pedirAlvaraAction} resetOnOk={false} className="mt-4 max-w-xl space-y-3">
                          <input type="hidden" name="inscricaoId" value={ins.id} />
                          <fieldset>
                            <legend className="label">Mudou alguma coisa desde o último alvará (endereço, área, atividade)?</legend>
                            <div className="flex gap-4 text-[14px]">
                              <label className="flex items-center gap-2">
                                <input type="radio" name="mudou" value="nao" defaultChecked className="accent-[var(--color-brand)]" /> Não
                              </label>
                              <label className="flex items-center gap-2">
                                <input type="radio" name="mudou" value="sim" className="accent-[var(--color-brand)]" /> Sim
                              </label>
                            </div>
                          </fieldset>
                          <div>
                            <label className="label" htmlFor={`obs-${ins.id}`}>
                              Observações (opcional)
                            </label>
                            <textarea id={`obs-${ins.id}`} name="observacoes" rows={2} className="input" placeholder="Ex.: ampliamos a área de produção para 280 m²." />
                          </div>
                          <SubmitButton pendingText="Enviando pedido…">Enviar pedido à prefeitura</SubmitButton>
                          <p className="hint">O pedido vira um processo com número de protocolo. A tributação pode pedir complemento por aqui.</p>
                        </ActionForm>
                      </details>
                    )
                  )}
                </Panel>
                {outras.length > 0 && (
                  <Panel title="Outras licenças">
                    <ul className="divide-y divide-line">
                      {outras.map((l) => {
                        const st = situacaoLicenca(l.validaAte, l.situacao);
                        return (
                          <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-[14px]">
                            <span>
                              <span className="font-medium text-ink">{LICENCA_NOME[l.tipo] ?? l.tipo}</span> <span className="tnum text-ink-3">· {l.numero} · até {fmtData(l.validaAte + "T12:00:00")}</span>
                            </span>
                            <Chip tone={st.tone}>{st.texto}</Chip>
                          </li>
                        );
                      })}
                    </ul>
                  </Panel>
                )}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

import Link from "next/link";
import { CircleCheck, FileCheck2, TriangleAlert } from "lucide-react";
import { requirePortal } from "@/lib/portal";
import { certidoesDoDono, donoPortalOuMotivo, situacaoFiscal } from "@/modulos/tributos/dados";
import { SemAcesso, Titulo } from "@/modulos/tributos/componentes";
import { CERTIDAO_NOME, fmtDocumento } from "@/modulos/tributos/regras";
import { emitirCertidaoAction } from "@/modulos/tributos/acoes";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { fmtData, fmtMoeda } from "@/lib/dates";
import { Chip, Panel } from "@/components/ui";

export default async function Certidao() {
  const s = await requirePortal();
  const { dono, motivo } = donoPortalOuMotivo(s, "TRIBUTOS");
  if (!dono) return <SemAcesso motivo={motivo} />;
  const [sit, emitidas] = await Promise.all([situacaoFiscal(dono), certidoesDoDono(dono)]);
  const neg = sit.tipo === "NEGATIVA";
  const efeito = sit.tipo === "POSITIVA_EFEITO_NEGATIVA";
  return (
    <>
      <Titulo sobre={`${dono.nome} · ${fmtDocumento(dono.documento)}`} titulo="Certidão de débitos municipais" sub="Emitida na hora, com código para qualquer pessoa conferir a autenticidade." />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Panel>
          <div className={`flex items-start gap-3 rounded-xl px-4 py-4 ${neg ? "bg-ok-soft" : efeito ? "bg-brand-soft" : "bg-bad-soft"}`}>
            {neg || efeito ? <CircleCheck size={22} className={neg ? "text-ok" : "text-brand-2"} /> : <TriangleAlert size={22} className="text-bad" />}
            <div>
              <div className={`text-[16px] font-semibold ${neg ? "text-ok" : efeito ? "text-brand-ink" : "text-bad"}`}>A certidão sairá como: {CERTIDAO_NOME[sit.tipo].replace("Certidão ", "")}</div>
              <p className="mt-0.5 text-[14px] text-ink-2">
                {neg
                  ? "Não há débitos vencidos nem inscrições em dívida ativa."
                  : efeito
                    ? "Há débitos parcelados e em dia: a certidão tem o mesmo efeito de uma negativa (CTN, art. 206)."
                    : "Há pendências. Você pode emitir a certidão positiva ou regularizar antes e emitir a negativa."}
              </p>
            </div>
          </div>
          {sit.pendencias.length > 0 && (
            <ul className="mt-4 divide-y divide-line">
              {sit.pendencias.map((p, i) => (
                <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-[14px]">
                  <span className="min-w-0 flex-1 text-ink">{p.descricao}</span>
                  <span className="flex items-center gap-2">
                    <Chip tone={p.tipo === "DIVIDA_PARCELADA" ? "brand" : "bad"}>{p.tipo === "DIVIDA_PARCELADA" ? "Suspensa" : p.tipo === "DIVIDA_ATIVA" ? "Dívida ativa" : "Vencida"}</Chip>
                    <span className="tnum font-semibold">{fmtMoeda(p.valor)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {!neg && !efeito && (
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/portal/guias" className="btn btn-quiet">
                Pagar débitos vencidos
              </Link>
              <Link href="/portal/parcelamento" className="btn btn-quiet">
                Parcelar dívida ativa
              </Link>
            </div>
          )}
          <ActionForm action={emitirCertidaoAction} resetOnOk={false} className="mt-6 border-t border-line pt-5">
            <label className="label" htmlFor="finalidade">
              Finalidade (opcional)
            </label>
            <input id="finalidade" name="finalidade" className="input" placeholder="Ex.: financiamento, licitação, cadastro de fornecedor" />
            <SubmitButton className="btn btn-primary mt-3" pendingText="Emitindo…">
              <FileCheck2 size={16} /> Emitir {neg ? "certidão negativa" : efeito ? "certidão positiva com efeitos de negativa" : "certidão positiva"}
            </SubmitButton>
          </ActionForm>
        </Panel>
        <aside>
          <Panel title="Certidões emitidas">
            {emitidas.length === 0 ? (
              <p className="text-[14px] text-ink-3">Nenhuma certidão emitida ainda.</p>
            ) : (
              <ul className="divide-y divide-line">
                {emitidas.map((c) => (
                  <li key={c.id}>
                    <Link href={`/verificar/certidao/${c.codigoVerificacao}`} className="block py-2.5 hover:text-brand-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="tnum text-[13px] font-semibold text-ink">{c.numero}</span>
                        <Chip tone={c.tipo === "POSITIVA" ? "bad" : c.tipo === "NEGATIVA" ? "ok" : "brand"}>{c.tipo === "POSITIVA" ? "Positiva" : c.tipo === "NEGATIVA" ? "Negativa" : "Efeito de negativa"}</Chip>
                      </div>
                      <div className="text-[13px] text-ink-2">
                        Emitida em {fmtData(c.emitidaEm)} · válida até {fmtData(c.validaAte + "T12:00:00")}
                      </div>
                      <div className="tnum text-[12.5px] text-ink-3">Código {c.codigoVerificacao}</div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </aside>
      </div>
    </>
  );
}

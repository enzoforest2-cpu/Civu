import { and, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { representacoes } from "@/db/schema";
import { requirePortal, ESCOPO_NOME, PAPEL_REPRESENTACAO, representacaoValida, type Escopo } from "@/lib/portal";
import { fmtData } from "@/lib/dates";
import { fmtCnpj } from "@/lib/pagamentos";
import { Chip } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { concederRepresentacaoAction, revogarRepresentacaoAction } from "../actions";

/** Quem age em nome de cada empresa, em quais assuntos e até quando. Delegar e revogar ficam registrados. */
export default async function AcessoPage() {
  const s = await requirePortal();
  const empresasIds = s.representacoes.map((r) => r.empresaId);
  const todas = empresasIds.length
    ? await db.query.representacoes.findMany({ where: and(isNull(representacoes.revogadaEm), inArray(representacoes.empresaId, empresasIds)), with: { pessoa: true, empresa: true } })
    : [];
  return (
    <>
      <h1 className="display text-[30px] font-bold text-ink">Representação e acessos</h1>
      <p className="mt-1 max-w-3xl text-[15px] text-ink-2">
        Cada pessoa age por uma empresa só nos assuntos e pelo prazo concedidos. O sistema confere isso no servidor a cada acesso.
      </p>
      {s.representacoes.length === 0 && <p className="panel mt-6 p-6 text-ink-2">Você não representa nenhuma empresa.</p>}
      {s.representacoes.map((minha) => {
        const daEmpresa = todas.filter((r) => r.empresaId === minha.empresaId);
        const souResponsavel = minha.papel === "RESPONSAVEL_LEGAL";
        return (
          <section key={minha.id} className="panel mt-6 p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-[18px] font-semibold text-ink">{minha.empresa.razaoSocial}</h2>
              <span className="tnum text-[13px] text-ink-3">CNPJ {fmtCnpj(minha.empresa.cnpj)}</span>
            </div>
            <ul className="mt-4 divide-y divide-line">
              {daEmpresa.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="font-medium text-ink">
                      {r.pessoa.nome} {r.pessoaId === s.pessoa.id && <span className="text-ink-3">(você)</span>}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <Chip tone="brand">{PAPEL_REPRESENTACAO[r.papel] ?? "Representante"}</Chip>
                      {(r.escopos as Escopo[]).map((e) => (
                        <Chip key={e}>{ESCOPO_NOME[e] ?? e}</Chip>
                      ))}
                      {r.validaAte ? (
                        <Chip tone={representacaoValida(r) ? "neutral" : "bad"}>
                          {representacaoValida(r) ? `Até ${fmtData(String(r.validaAte) + "T12:00:00")}` : "Vencida"}
                        </Chip>
                      ) : (
                        <Chip>Sem prazo</Chip>
                      )}
                    </div>
                  </div>
                  {r.papel !== "RESPONSAVEL_LEGAL" && (souResponsavel || r.pessoaId === s.pessoa.id) && (
                    <ActionForm action={revogarRepresentacaoAction}>
                      <input type="hidden" name="representacaoId" value={r.id} />
                      <SubmitButton className="btn btn-danger !px-3 !py-1.5 text-[13px]" pendingText="Revogando…">
                        {r.pessoaId === s.pessoa.id ? "Renunciar" : "Revogar"}
                      </SubmitButton>
                    </ActionForm>
                  )}
                </li>
              ))}
            </ul>
            {souResponsavel && (
              <details className="mt-4 rounded-xl border border-line open:bg-sunken/50">
                <summary className="px-4 py-3 text-[14px] font-semibold text-brand-2">Conceder representação</summary>
                <ActionForm action={concederRepresentacaoAction} className="grid gap-3 px-4 pb-4 md:grid-cols-2">
                  <input type="hidden" name="empresaId" value={minha.empresaId} />
                  <div>
                    <label className="label" htmlFor={`cpf-${minha.id}`}>
                      CPF da pessoa
                    </label>
                    <input id={`cpf-${minha.id}`} name="cpf" className="input tnum" inputMode="numeric" required />
                  </div>
                  <div>
                    <label className="label" htmlFor={`nome-${minha.id}`}>
                      Nome
                    </label>
                    <input id={`nome-${minha.id}`} name="nome" className="input" />
                  </div>
                  <div>
                    <label className="label" htmlFor={`papel-${minha.id}`}>
                      Papel
                    </label>
                    <select id={`papel-${minha.id}`} name="papel" className="input" defaultValue="PROCURADOR">
                      <option value="PROCURADOR">Procurador</option>
                      <option value="CONTADOR">Contador</option>
                      <option value="SOCIO">Sócio</option>
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor={`val-${minha.id}`}>
                      Válida até <span className="font-normal text-ink-3">(opcional)</span>
                    </label>
                    <input id={`val-${minha.id}`} name="validaAte" type="date" className="input" />
                  </div>
                  <fieldset className="md:col-span-2">
                    <legend className="label">Assuntos</legend>
                    <div className="flex flex-wrap gap-4 text-[14px]">
                      {(Object.keys(ESCOPO_NOME) as Escopo[]).map((e) => (
                        <label key={e} className="inline-flex items-center gap-2">
                          <input type="checkbox" name="escopos" value={e} /> {ESCOPO_NOME[e]}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <div className="md:col-span-2">
                    <SubmitButton className="btn btn-primary" pendingText="Concedendo…">
                      Conceder
                    </SubmitButton>
                  </div>
                </ActionForm>
              </details>
            )}
          </section>
        );
      })}
    </>
  );
}

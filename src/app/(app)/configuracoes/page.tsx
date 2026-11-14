import { exigirRota } from "@/lib/acesso";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { feriados, setores, unidadesGestoras, usuarios } from "@/db/schema";
import { Avatar, Cabecalho, Chip, Panel } from "@/components/ui";
import { PAPEL_NOME, type Papel } from "@/lib/workflow";
import { fmtData } from "@/lib/dates";
import { AREAS, nomeDaArea } from "@/lib/areas";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { pode } from "@/modulos/gestao/permissoes";
import { configurarSetorAction } from "@/modulos/gestao/acoes";

export default async function ConfiguracoesPage() {
  const u = await exigirRota("/configuracoes");
  const administra = pode.configurarSetores(u);
  const [s, us, ugs, fer] = await Promise.all([
    db.query.setores.findMany({ where: eq(setores.municipioId, u.municipioId), orderBy: setores.nome }),
    db.query.usuarios.findMany({ where: eq(usuarios.municipioId, u.municipioId), with: { setor: true }, orderBy: usuarios.nome }),
    db.query.unidadesGestoras.findMany({ where: eq(unidadesGestoras.municipioId, u.municipioId) }),
    db.query.feriados.findMany({ where: eq(feriados.municipioId, u.municipioId), orderBy: feriados.data }),
  ]);
  return (
    <>
      <Cabecalho titulo="Cadastros" sub={`Pessoas, setores e calendário de ${u.municipio.nome}. Pessoas e papéis se ajustam em Governança.`} />

      <Panel title={`Pessoas · ${us.length}`} className="mb-6" pad={false}>
        <div className="overflow-x-auto px-6 pb-2" tabIndex={0} role="region" aria-label="Pessoas (tabela que rola para o lado)">
          <table className="lista">
            <thead>
              <tr>
                <th className="!pl-0">Nome</th>
                <th>Setor</th>
                <th>O que pode fazer</th>
                <th className="!pr-0">CPF</th>
              </tr>
            </thead>
            <tbody>
              {us.map((x) => (
                <tr key={x.id}>
                  <td className="!pl-0">
                    <div className="flex items-center gap-3">
                      <Avatar nome={x.nome} size={34} />
                      <div>
                        <div className="font-medium text-ink">{x.nome}</div>
                        <div className="text-[12.5px] text-ink-3">{x.cargo ?? "—"}</div>
                      </div>
                    </div>
                  </td>
                  <td className="text-ink-2">{x.setor?.nome ?? "—"}</td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {(x.papeis as Papel[]).map((p) => (
                        <Chip key={p} tone={p === "ADMIN" ? "brand" : "neutral"}>
                          {PAPEL_NOME[p]}
                        </Chip>
                      ))}
                    </div>
                  </td>
                  <td className="tnum !pr-0 text-[13px] text-ink-3">
                    ***.{x.cpf.slice(3, 6)}.{x.cpf.slice(6, 9)}-**
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title={`Setores · ${s.length}`} className="lg:col-span-2">
          <p className="mb-3 text-[13.5px] leading-snug text-ink-2">
            A área de cada setor decide o que as pessoas dele veem no menu e nas telas; o órgão orçamentário liga a secretaria ao orçamento da pasta.
            {!administra && " Só o administrador do sistema altera estes vínculos."}
          </p>
          <ul className={administra ? "" : "grid gap-x-8 sm:grid-cols-2"}>
            {s.map((x) => (
              <li key={x.id} className="border-b border-line py-2.5 text-[14px]">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <span className="font-medium text-ink">{x.nome}</span>
                  <span className="tnum shrink-0 text-[12.5px] text-ink-3">prazo padrão {x.slaPadraoDias} d.ú.</span>
                </div>
                {administra ? (
                  <ActionForm action={configurarSetorAction} resetOnOk={false} className="mt-2">
                    <input type="hidden" name="setorId" value={x.id} />
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="min-w-[200px] flex-1">
                        <label className="label" htmlFor={`area-${x.id}`}>
                          Área
                        </label>
                        <select id={`area-${x.id}`} name="area" className="input" defaultValue={x.area ?? ""}>
                          <option value="">Sem área (só telas comuns)</option>
                          {AREAS.map((a) => (
                            <option key={a.chave} value={a.chave}>
                              {a.nome}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="w-[120px]">
                        <label className="label" htmlFor={`orgao-${x.id}`}>
                          Órgão (LOA)
                        </label>
                        <input id={`orgao-${x.id}`} name="orgaoOrcamentario" className="input tnum" inputMode="numeric" placeholder="ex.: 06" defaultValue={x.orgaoOrcamentario ?? ""} />
                      </div>
                      <SubmitButton className="btn btn-quiet min-h-[44px]" pendingText="Salvando…">
                        Salvar
                      </SubmitButton>
                    </div>
                  </ActionForm>
                ) : (
                  <div className="mt-0.5 text-[13px] text-ink-2">
                    Área: {nomeDaArea(x.area)}
                    {x.orgaoOrcamentario && <span className="tnum"> · órgão orçamentário {x.orgaoOrcamentario}</span>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Panel>
        <div className="space-y-6">
          <Panel title="Órgãos">
            <ul className="space-y-2 text-[14px]">
              {ugs.map((x) => (
                <li key={x.id} className="flex justify-between gap-3">
                  <span className="text-ink">{x.nome}</span>
                  <span className="tnum text-ink-3">{x.codigo}</span>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="Feriados (não contam no prazo)">
            <ul className="space-y-2 text-[14px]">
              {fer.map((f) => (
                <li key={f.id} className="flex justify-between gap-3">
                  <span className="text-ink">{f.nome}</span>
                  <span className="tnum text-ink-2">{fmtData(f.data + "T12:00:00Z")}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </>
  );
}

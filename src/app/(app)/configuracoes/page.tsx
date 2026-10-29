import { eq } from "drizzle-orm";
import { db } from "@/db";
import { feriados, setores, unidadesGestoras, usuarios } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { Avatar, Cabecalho, Chip, Panel } from "@/components/ui";
import { PAPEL_NOME, type Papel } from "@/lib/workflow";
import { fmtData } from "@/lib/dates";

export default async function ConfiguracoesPage() {
  const u = await requireUser();
  const [s, us, ugs, fer] = await Promise.all([
    db.query.setores.findMany({ where: eq(setores.municipioId, u.municipioId), orderBy: setores.nome }),
    db.query.usuarios.findMany({ where: eq(usuarios.municipioId, u.municipioId), with: { setor: true }, orderBy: usuarios.nome }),
    db.query.unidadesGestoras.findMany({ where: eq(unidadesGestoras.municipioId, u.municipioId) }),
    db.query.feriados.findMany({ where: eq(feriados.municipioId, u.municipioId), orderBy: feriados.data }),
  ]);
  return (
    <>
      <Cabecalho titulo="Cadastros" sub={`Pessoas, setores e calendário de ${u.municipio.nome}. A edição pela tela chega na próxima versão.`} />

      <Panel title={`Pessoas · ${us.length}`} className="mb-6" pad={false}>
        <div className="overflow-x-auto px-6 pb-2">
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
          <ul className="grid gap-x-8 sm:grid-cols-2">
            {s.map((x) => (
              <li key={x.id} className="flex items-center justify-between gap-3 border-b border-line py-2.5 text-[14px]">
                <span className="text-ink">{x.nome}</span>
                <span className="tnum shrink-0 text-[12.5px] text-ink-3">prazo padrão {x.slaPadraoDias} d.ú.</span>
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

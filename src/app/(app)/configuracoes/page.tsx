import { eq } from "drizzle-orm";
import { db } from "@/db";
import { feriados, setores, unidadesGestoras, usuarios } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { Badge, Card, PageHeader } from "@/components/ui";
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
      <PageHeader
        title="Configurações"
        subtitle={`${u.municipio.nome} · ${u.municipio.uf}. Cadastros base do município (edição entra na próxima iteração; hoje via seed).`}
      />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title={`Setores (${s.length})`}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Sigla</th>
                <th>Nome</th>
                <th>SLA padrão</th>
              </tr>
            </thead>
            <tbody>
              {s.map((x) => (
                <tr key={x.id}>
                  <td className="font-mono text-xs">{x.sigla}</td>
                  <td>{x.nome}</td>
                  <td className="tabular-nums">{x.slaPadraoDias} d.ú.</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card title={`Unidades gestoras (${ugs.length})`}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Código</th>
                <th>Nome</th>
              </tr>
            </thead>
            <tbody>
              {ugs.map((x) => (
                <tr key={x.id}>
                  <td className="font-mono text-xs">{x.codigo}</td>
                  <td>{x.nome}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-6 text-xs font-semibold uppercase tracking-wide text-ink-3">Feriados cadastrados</div>
          <ul className="mt-2 space-y-1 text-sm">
            {fer.map((f) => (
              <li key={f.id} className="flex justify-between">
                <span>{f.nome}</span>
                <span className="tabular-nums text-ink-2">{fmtData(f.data + "T12:00:00Z")}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title={`Usuários (${us.length})`} className="xl:col-span-2">
          <table className="tbl">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Cargo</th>
                <th>Setor</th>
                <th>Papéis</th>
                <th>CPF</th>
              </tr>
            </thead>
            <tbody>
              {us.map((x) => (
                <tr key={x.id}>
                  <td className="font-medium">{x.nome}</td>
                  <td className="text-ink-2">{x.cargo ?? "—"}</td>
                  <td className="text-ink-2">{x.setor?.nome ?? "—"}</td>
                  <td className="space-x-1">
                    {(x.papeis as Papel[]).map((p) => (
                      <Badge key={p}>{PAPEL_NOME[p]}</Badge>
                    ))}
                  </td>
                  <td className="font-mono text-xs text-ink-3">
                    ***.{x.cpf.slice(3, 6)}.{x.cpf.slice(6, 9)}-**
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}

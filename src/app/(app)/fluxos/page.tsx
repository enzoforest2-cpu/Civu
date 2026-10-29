import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tiposProcesso } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { Badge, Card, PageHeader } from "@/components/ui";
import { DOCUMENTO_TIPOS, PAPEL_NOME, type WorkflowDef } from "@/lib/workflow";

export default async function FluxosPage() {
  const u = await requireUser();
  const tipos = await db.query.tiposProcesso.findMany({ where: eq(tiposProcesso.municipioId, u.municipioId) });
  return (
    <>
      <PageHeader
        title="Fluxos"
        subtitle="Cada tipo de processo tem estados, responsáveis, prazos e requisitos. O fluxo é configuração, não código: o município ajusta sem depender do fornecedor."
      />
      <div className="space-y-6">
        {tipos.map((t) => {
          const def = t.definicao as WorkflowDef;
          return (
            <Card
              key={t.id}
              title={
                <span>
                  {t.nome}{" "}
                  <span className="ml-2 font-normal text-ink-3">
                    v{t.versao} · {def.estados.length} estados
                  </span>
                </span>
              }
            >
              {t.descricao && <p className="mb-4 text-sm text-ink-2">{t.descricao}</p>}
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Estado</th>
                    <th>Setor</th>
                    <th>Quem age</th>
                    <th>SLA</th>
                    <th>Requisitos para avançar</th>
                    <th>Avanços / devoluções</th>
                  </tr>
                </thead>
                <tbody>
                  {def.estados.map((e) => (
                    <tr key={e.chave}>
                      <td>
                        <div className="font-medium">{e.nome}</div>
                        {e.descricao && <div className="text-xs text-ink-3">{e.descricao}</div>}
                      </td>
                      <td className="text-ink-2">
                        {e.setor === "LIVRE" ? <Badge tone="info">livre</Badge> : e.setor === null ? <Badge>requisitante</Badge> : e.setor}
                      </td>
                      <td className="text-ink-2">{e.papeis.map((p) => PAPEL_NOME[p]).join(", ")}</td>
                      <td className="tabular-nums text-ink-2">{e.slaDiasUteis ? `${e.slaDiasUteis} d.ú.` : "—"}</td>
                      <td>
                        {e.gates.length === 0 ? (
                          <span className="text-ink-3">—</span>
                        ) : (
                          <ul className="space-y-0.5 text-xs">
                            {e.gates.map((g, i) => (
                              <li key={i}>
                                {g.tipo === "documento" ? (DOCUMENTO_TIPOS[g.documentoTipo] ?? g.documentoTipo) : g.campo}
                                {g.tipo === "documento" && g.assinadoPor?.length ? (
                                  <span className="text-ink-3"> · assinado por {g.assinadoPor.map((p) => PAPEL_NOME[p]).join(" e ")}</span>
                                ) : null}
                                {g.tipo === "documento" && g.assinadoPorQualquer?.length ? (
                                  <span className="text-ink-3"> · assinado por {g.assinadoPorQualquer.map((p) => PAPEL_NOME[p]).join(" ou ")}</span>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td className="text-xs">
                        {e.avancos.map((a) => (
                          <div key={a.para}>→ {a.rotulo}</div>
                        ))}
                        {e.devolucoes.map((a) => (
                          <div key={a.para} className="text-bad">
                            ↩ {a.rotulo}
                          </div>
                        ))}
                        {e.final && <Badge tone="ok">final</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          );
        })}
      </div>
    </>
  );
}

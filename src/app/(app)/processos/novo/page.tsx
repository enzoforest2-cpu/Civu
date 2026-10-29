import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tiposProcesso, unidadesGestoras } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { Cabecalho } from "@/components/ui";
import { NovoProcessoForm } from "./form";
import type { WorkflowDef } from "@/lib/workflow";

export default async function NovoProcessoPage() {
  const u = await requireUser();
  const [tipos, ugs] = await Promise.all([
    db.query.tiposProcesso.findMany({ where: eq(tiposProcesso.municipioId, u.municipioId) }),
    db.query.unidadesGestoras.findMany({ where: eq(unidadesGestoras.municipioId, u.municipioId) }),
  ]);
  const tiposUi = tipos
    .filter((t) => t.ativo)
    .map((t) => ({
      id: t.id,
      chave: t.chave,
      nome: t.nome,
      descricao: t.descricao,
      campos: (t.definicao as WorkflowDef).camposAbertura ?? [],
      primeiroEstado: (t.definicao as WorkflowDef).estados[0]?.nome,
    }));
  return (
    <>
      <Cabecalho titulo="Abrir processo" sub="Preencha o pedido. O protocolo dá o número e o processo começa a andar." />
      <NovoProcessoForm tipos={tiposUi} ugs={ugs.map((x) => ({ id: x.id, nome: x.nome }))} setor={u.setor?.nome ?? "sem setor"} />
    </>
  );
}

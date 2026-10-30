import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db";
import { processos, setores, tiposProcesso, unidadesGestoras } from "@/db/schema";
import { requireUser, temPapel } from "@/lib/auth";
import { FONTES } from "@/lib/workflow";
import { fmtCnpj } from "@/lib/pagamentos";
import { Cabecalho } from "@/components/ui";
import { usuariosDoMunicipio } from "@/modulos/contratos/operacoes";
import { FormContrato } from "@/modulos/contratos/form-contrato";

export default async function NovoContratoPage() {
  const u = await requireUser();
  if (!temPapel(u, "COMPRAS")) redirect("/contratos");
  const [empresas, usuarios, sets, ugs, procs] = await Promise.all([
    db.query.empresas.findMany({ orderBy: (e, { asc }) => [asc(e.razaoSocial)] }),
    usuariosDoMunicipio(u.municipioId),
    db.query.setores.findMany({ where: eq(setores.municipioId, u.municipioId), orderBy: setores.nome }),
    db.query.unidadesGestoras.findMany({ where: eq(unidadesGestoras.municipioId, u.municipioId), orderBy: unidadesGestoras.codigo }),
    db
      .select({ id: processos.id, numero: processos.numero, assunto: processos.assunto })
      .from(processos)
      .innerJoin(tiposProcesso, eq(tiposProcesso.id, processos.tipoId))
      .where(and(eq(processos.municipioId, u.municipioId), eq(tiposProcesso.chave, "COMPRA")))
      .orderBy(processos.numero),
  ]);
  return (
    <>
      <Link href="/contratos" className="mb-4 inline-flex items-center gap-1.5 text-[13.5px] font-medium text-ink-2 hover:text-ink">
        <ArrowLeft size={15} /> Contratos
      </Link>
      <Cabecalho titulo="Novo contrato" sub="Registre o contrato assinado. Vigência, saldo e alertas passam a ser acompanhados a partir daqui." />
      <div className="max-w-4xl">
        <FormContrato
          empresas={empresas.map((e) => ({ id: e.id, rotulo: e.razaoSocial, detalhe: fmtCnpj(e.cnpj) }))}
          usuarios={usuarios.map((x) => ({ id: x.id, rotulo: `${x.nome}${x.cargo ? ` — ${x.cargo}` : ""}` }))}
          setores={sets.map((s) => ({ id: s.id, rotulo: s.nome }))}
          ugs={ugs.map((g) => ({ id: g.id, rotulo: g.nome }))}
          processos={procs.map((p) => ({ id: p.id, rotulo: p.numero, detalhe: p.assunto }))}
          fontes={FONTES}
        />
      </div>
    </>
  );
}

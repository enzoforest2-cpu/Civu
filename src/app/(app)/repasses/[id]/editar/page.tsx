import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { exigirRota } from "@/lib/acesso";
import { urlSemAcesso } from "@/lib/areas";
import { Cabecalho } from "@/components/ui";
import { carregarRepasse, setoresResponsaveis } from "@/modulos/repasses/dados";
import { FormRepasse } from "@/modulos/repasses/formularios";
import { podeEditarNaArea } from "@/modulos/repasses/regras";

export default async function EditarRepassePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await exigirRota(`/repasses/${id}/editar`);
  const r = await carregarRepasse(u.municipioId, id);
  if (!r) notFound();
  if (!podeEditarNaArea(u, r.area)) redirect(urlSemAcesso(`/repasses/${id}/editar`));
  const setores = (await setoresResponsaveis(u)).filter((s) => s.editavel || s.id === r.setor.id);
  return (
    <>
      <Link href={`/repasses/${id}`} className="mb-4 inline-flex items-center gap-1.5 text-[14px] font-medium text-ink-2 hover:text-ink">
        <ArrowLeft size={15} aria-hidden /> {r.rotulo}
      </Link>
      <Cabecalho titulo="Alterar repasse" sub="Cada alteração fica registrada na linha do tempo do repasse, com quem alterou e o que mudou." />
      <div className="max-w-3xl">
        <FormRepasse
          setores={setores.map((s) => ({ id: s.id, rotulo: s.nome }))}
          valores={{
            id: r.id,
            setorId: r.setor.id,
            tipo: r.tipo,
            identificacao: r.identificacao,
            concedente: r.concedente,
            objeto: r.objeto,
            valorPrevisto: r.valorPrevisto,
            valorRecebido: r.valorRecebido,
            assinadoEm: r.assinadoEm,
            vigenciaFim: r.vigenciaFim,
            prazoExecucao: r.prazoExecucao,
            prazoPrestacaoContas: r.prazoPrestacaoContas,
            situacao: r.situacao,
            observacao: r.observacao,
          }}
        />
      </div>
    </>
  );
}

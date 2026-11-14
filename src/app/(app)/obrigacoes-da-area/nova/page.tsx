import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { exigirRota } from "@/lib/acesso";
import { urlSemAcesso } from "@/lib/areas";
import { Cabecalho, Panel } from "@/components/ui";
import { pessoasResponsaveis, setoresResponsaveis } from "@/modulos/repasses/dados";
import { FormObrigacao } from "@/modulos/repasses/formularios";

export default async function NovaObrigacaoPage() {
  const u = await exigirRota("/obrigacoes-da-area/nova");
  const [setores, pessoas] = await Promise.all([setoresResponsaveis(u), pessoasResponsaveis(u)]);
  const editaveis = setores.filter((s) => s.editavel);
  if (!editaveis.length) redirect(urlSemAcesso("/obrigacoes-da-area/nova"));
  return (
    <>
      <Link href="/obrigacoes-da-area" className="mb-4 inline-flex items-center gap-1.5 text-[14px] font-medium text-ink-2 hover:text-ink">
        <ArrowLeft size={15} aria-hidden /> Obrigações da área
      </Link>
      <Cabecalho titulo="Nova obrigação" sub="Uma entrega que a secretaria faz com regularidade. O sistema avisa com 30, 15 e 5 dias de antecedência." />
      <Panel className="max-w-3xl">
        <FormObrigacao setores={editaveis.map((s) => ({ id: s.id, rotulo: s.nome }))} pessoas={pessoas} />
      </Panel>
    </>
  );
}

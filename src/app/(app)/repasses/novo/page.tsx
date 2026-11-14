import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { exigirRota } from "@/lib/acesso";
import { urlSemAcesso } from "@/lib/areas";
import { Cabecalho } from "@/components/ui";
import { setoresResponsaveis } from "@/modulos/repasses/dados";
import { FormRepasse } from "@/modulos/repasses/formularios";

export default async function NovoRepassePage() {
  const u = await exigirRota("/repasses/novo");
  const setores = (await setoresResponsaveis(u)).filter((s) => s.editavel);
  // quem só vê (controle interno, administrador) não cadastra: a tela explica em vez de mostrar um formulário que falharia
  if (!setores.length) redirect(urlSemAcesso("/repasses/novo"));
  return (
    <>
      <Link href="/repasses" className="mb-4 inline-flex items-center gap-1.5 text-[14px] font-medium text-ink-2 hover:text-ink">
        <ArrowLeft size={15} aria-hidden /> Repasses e convênios
      </Link>
      <Cabecalho titulo="Novo repasse" sub="Cadastre a emenda, o convênio ou a transferência. A execução passa a ser acompanhada pelos processos que você vincular a ele." />
      <div className="max-w-3xl">
        <FormRepasse setores={setores.map((s) => ({ id: s.id, rotulo: s.nome }))} />
      </div>
    </>
  );
}

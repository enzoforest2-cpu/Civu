// Cabine de uma secretaria pelo endereço (/secretaria/SESAU). Gabinete, controle interno e administrador abrem qualquer
// uma; o(a) secretário(a) e os servidores, só a da própria pasta. Conferido no servidor: outra pasta → "Sem acesso a esta área".
import { notFound, redirect } from "next/navigation";
import { exigirRota } from "@/lib/acesso";
import { veTudo } from "@/lib/areas";
import { temPapel } from "@/lib/auth";
import { autorizarCabine, carregarCabine, semAcessoCabine } from "@/modulos/gestao/cabine";
import { VisaoCabine } from "@/modulos/gestao/componentes/cabine";

export const metadata = { title: "Cabine da secretaria · Civu" };

export default async function CabinePage({ params }: { params: Promise<{ sigla: string }> }) {
  const { sigla } = await params;
  const u = await exigirRota("/secretaria");
  const a = await autorizarCabine(u, decodeURIComponent(sigla));
  if (!a.ok) {
    if (a.motivo === "inexistente") {
      if (sigla.toUpperCase() === "GAB") redirect("/gabinete"); // a cabine do gabinete é a Sala do prefeito
      notFound();
    }
    redirect(semAcessoCabine(sigla.toUpperCase(), a.area));
  }
  const d = await carregarCabine(u.municipioId, a.cabine);
  return <VisaoCabine cab={a.cabine} d={d} euSouSecretario={temPapel(u, "SECRETARIO") && u.setorId === a.cabine.setor.id} veOutras={veTudo(u)} />;
}

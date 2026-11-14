// Minha secretaria: a cabine da pasta de quem entra (o setor da pessoa, ou a cabine da área dela).
// Gabinete, controle interno e administrador sem cabine própria escolhem aqui a secretaria que querem abrir.
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { exigirRota } from "@/lib/acesso";
import { nomeDaArea, veTudo } from "@/lib/areas";
import { temPapel } from "@/lib/auth";
import { Cabecalho, Vazio } from "@/components/ui";
import { cabineDoUsuario, cabinesDoMunicipio, carregarCabine } from "@/modulos/gestao/cabine";
import { VisaoCabine } from "@/modulos/gestao/componentes/cabine";

export const metadata = { title: "Minha secretaria · Civu" };

export default async function SecretariaPage() {
  const u = await exigirRota("/secretaria");
  const cab = await cabineDoUsuario(u);
  if (cab) {
    const d = await carregarCabine(u.municipioId, cab);
    return <VisaoCabine cab={cab} d={d} euSouSecretario={temPapel(u, "SECRETARIO") && u.setorId === cab.setor.id} veOutras={veTudo(u)} />;
  }
  if (!veTudo(u))
    return (
      <>
        <Cabecalho titulo="Minha secretaria" />
        <Vazio>O seu setor ainda não está ligado a uma secretaria com cabine. Peça ao administrador do sistema para revisar a área e o órgão do setor em Configurações.</Vazio>
      </>
    );
  const cabs = await cabinesDoMunicipio(u.municipioId);
  return (
    <>
      <Cabecalho titulo="Cabines das secretarias" sub="Escolha a secretaria para ver o que depende do(a) secretário(a), os processos, o orçamento, os contratos, as compras e os repasses da pasta." />
      {cabs.length === 0 ? (
        <Vazio>Nenhuma secretaria com cabine. Ligue cada secretaria à sua área e ao órgão orçamentário em Configurações, na seção Setores.</Vazio>
      ) : (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cabs.map((c) => (
            <li key={c.setor.id}>
              <Link href={`/secretaria/${c.setor.sigla}`} className="panel flex min-h-[44px] items-start justify-between gap-3 px-5 py-4 transition-colors hover:border-line-2">
                <span className="min-w-0">
                  <span className="block font-semibold text-ink">{c.setor.nome}</span>
                  <span className="block text-[13.5px] text-ink-2">Área de {nomeDaArea(c.setor.area)}</span>
                </span>
                <ArrowUpRight size={16} aria-hidden className="mt-1 shrink-0 text-ink-3" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

import Link from "next/link";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { requirePortal } from "@/lib/portal";
import { catalogo, municipioDoPortal } from "@/modulos/servicos/dados";
import { BAIRROS_SUGERIDOS, CATEGORIAS } from "@/modulos/servicos/constantes";
import { FormPedido } from "@/modulos/servicos/form-pedido";
import { IconeServico } from "@/modulos/servicos/icones";
import { Vazio } from "@/components/ui";

export default async function PedirServico({ searchParams }: { searchParams: Promise<{ servico?: string }> }) {
  const s = await requirePortal();
  const { servico: chave } = await searchParams;
  if (s.empresaAtiva && !s.escoposAtivos.includes("PROCESSOS"))
    return (
      <div className="panel p-6 text-[15px] text-ink">
        <strong className="font-semibold">Sua representação nesta empresa não inclui solicitações.</strong> Peça ao responsável legal para incluir o assunto
        “Processos e solicitações”, ou troque para agir em nome próprio.
      </div>
    );
  const mun = await municipioDoPortal();
  const lista = mun ? await catalogo(mun) : [];
  const escolhido = chave ? lista.find((c) => c.chave === chave) : undefined;

  if (escolhido) {
    const e = (s.empresaAtiva?.endereco ?? s.pessoa.endereco) as {
      logradouro?: string;
      numero?: string;
      bairro?: string;
    } | null;
    return (
      <div className="mx-auto max-w-2xl">
        <Link href="/portal/servicos/novo" className="inline-flex items-center gap-1 text-[14px] font-medium text-ink-2 hover:text-brand">
          <ArrowLeft size={16} /> Escolher outro serviço
        </Link>
        <div className="mt-4 flex items-start gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
            <IconeServico categoria={escolhido.categoria} size={22} />
          </span>
          <div>
            <h1 className="display text-[26px] leading-tight font-bold text-ink sm:text-[30px]">{escolhido.nome}</h1>
            <p className="mt-1 text-[14.5px] text-ink-2">{escolhido.descricao}</p>
          </div>
        </div>
        <p className="mt-4 rounded-xl bg-sunken px-4 py-3 text-[14px] text-ink-2">
          Responsável: <strong className="font-semibold text-ink">{escolhido.setor.nome}</strong>. Prazo-alvo de atendimento:{" "}
          <strong className="font-semibold text-ink">
            {escolhido.slaDiasUteis} {escolhido.slaDiasUteis === 1 ? "dia útil" : "dias úteis"}
          </strong>
          . Você recebe um protocolo e acompanha cada passo por aqui.
        </p>
        {s.empresaAtiva && (
          <p className="mt-3 text-[13.5px] text-ink-2">
            O pedido será registrado em nome de <strong className="font-semibold text-ink">{s.empresaAtiva.razaoSocial}</strong>.
          </p>
        )}
        <section className="panel mt-6 p-5 sm:p-6">
          <FormPedido servicoId={escolhido.id} exigeFoto={escolhido.exigeFoto} bairros={BAIRROS_SUGERIDOS} endereco={e ?? undefined} />
        </section>
      </div>
    );
  }

  const ordem = Object.keys(CATEGORIAS);
  const ordenados = [...lista].sort((a, b) => ordem.indexOf(a.categoria) - ordem.indexOf(b.categoria) || a.ordem - b.ordem);
  return (
    <>
      <h1 className="display text-[30px] font-bold text-ink">Pedir um serviço</h1>
      <p className="mt-1 max-w-2xl text-[15px] text-ink-2">Escolha o tipo de problema. Em seguida você informa o local e recebe um número de protocolo.</p>
      {chave && !escolhido && (
        <p className="mt-4 rounded-lg bg-warn-soft px-3 py-2 text-[14px] text-ink">Este serviço não está disponível. Escolha outro da lista.</p>
      )}
      {lista.length === 0 ? (
        <div className="mt-6">
          <Vazio>O município ainda não publicou o catálogo de serviços urbanos.</Vazio>
        </div>
      ) : (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {ordenados.map((c) => (
            <Link
              key={c.id}
              href={`/portal/servicos/novo?servico=${c.chave}`}
              className="panel group flex items-center gap-3 p-4 transition-colors hover:border-brand"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
                <IconeServico categoria={c.categoria} size={19} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-semibold tracking-wide text-ink-3 uppercase">{CATEGORIAS[c.categoria] ?? c.categoria}</span>
                <span className="block font-semibold text-ink">{c.nome}</span>
                <span className="mt-0.5 block text-[13px] leading-snug text-ink-2">{c.descricao}</span>
              </span>
              <ChevronRight size={18} className="shrink-0 text-ink-3 group-hover:text-brand" />
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

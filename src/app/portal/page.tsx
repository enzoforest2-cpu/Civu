/* eslint-disable react-hooks/purity -- prazos dependem da hora atual */
import Link from "next/link";
import { ArrowRight, FolderSearch, KeyRound, Landmark, MessageSquareWarning } from "lucide-react";
import { requirePortal } from "@/lib/portal";
import { listarMeusProcessos } from "@/lib/portal-processos";
import { ATALHOS_PORTAL } from "@/lib/modulos";
import { getEstado, nomeEtapa, type WorkflowDef } from "@/lib/workflow";
import { fmtData } from "@/lib/dates";
import { Chip } from "@/components/ui";
import type { Exigencia } from "@/lib/engine";

export default async function PortalInicio() {
  const s = await requirePortal();
  const processos = await listarMeusProcessos(s);
  const abertos = processos.filter((p) => !p.encerradoEm);
  const comPendencia = abertos.filter((p) => (p.metadados as { exigencia?: Exigencia } | null)?.exigencia);
  const contexto = s.empresaAtiva ? "EMPRESA" : "PESSOA";
  const atalhos = [
    ...ATALHOS_PORTAL.filter((a) => a.contexto === "AMBOS" || a.contexto === contexto).map((a) => ({ ...a, Icone: a.icone })),
    { href: "/portal/pedidos", rotulo: "Acompanhar meus pedidos", descricao: "Veja onde está cada pedido e responda o que a prefeitura pedir.", Icone: FolderSearch },
    ...(s.representacoes.length ? [{ href: "/portal/acesso", rotulo: "Representação e acessos", descricao: "Quem age em nome das empresas, em quais assuntos e até quando.", Icone: KeyRound }] : []),
    { href: "/consulta", rotulo: "Informação pública", descricao: "Consulte processos pelo número e a fila de pagamentos.", Icone: Landmark },
  ];
  const primeiroNome = s.pessoa.nome.split(" ")[0];

  return (
    <>
      <p className="text-[15px] text-ink-2">Olá, {primeiroNome}.</p>
      <h1 className="display mt-1 text-[30px] leading-[1.1] font-bold text-ink sm:text-[36px]">
        {s.empresaAtiva ? `O que ${s.empresaAtiva.nomeFantasia ?? s.empresaAtiva.razaoSocial} precisa hoje?` : "O que você precisa hoje?"}
      </h1>

      {comPendencia.length > 0 && (
        <div className="mt-6 space-y-2">
          {comPendencia.map((p) => {
            const ex = (p.metadados as { exigencia: Exigencia }).exigencia;
            return (
              <Link
                key={p.id}
                href={`/portal/pedidos/${p.id}`}
                className="flex items-start gap-3 rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-[14.5px] text-ink hover:border-warn"
              >
                <MessageSquareWarning size={19} className="mt-0.5 shrink-0 text-warn" />
                <span>
                  <strong className="font-semibold">A prefeitura pediu um complemento no pedido {p.numero}</strong> até {fmtData(ex.prazo)}: {ex.texto}
                </span>
              </Link>
            );
          })}
        </div>
      )}

      <section className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {atalhos.map((a) => (
          <Link key={a.href} href={a.href} className="panel group flex items-start gap-3 p-5 transition-colors hover:border-brand">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-2">
              <a.Icone size={19} />
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-1 font-semibold text-ink">
                {a.rotulo} <ArrowRight size={15} className="opacity-0 transition-opacity group-hover:opacity-100" />
              </span>
              <span className="mt-0.5 block text-[14px] leading-snug text-ink-2">{a.descricao}</span>
            </span>
          </Link>
        ))}
      </section>

      <section className="panel mt-8 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-[17px] font-semibold text-ink">Pedidos em andamento</h2>
          <Link href="/portal/pedidos" className="text-[14px] font-semibold text-brand-2 hover:underline">
            Ver todos
          </Link>
        </div>
        {s.empresaAtiva && !s.escoposAtivos.includes("PROCESSOS") ? (
          <p className="mt-3 text-[14px] text-ink-2">Sua representação nesta empresa não inclui processos e solicitações.</p>
        ) : abertos.length === 0 ? (
          <p className="mt-3 text-[14px] text-ink-2">Nenhum pedido em andamento.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {abertos.slice(0, 6).map((p) => {
              const etapa = getEstado(p.tipo.definicao as WorkflowDef, p.estadoAtual);
              return (
                <li key={p.id}>
                  <Link href={`/portal/pedidos/${p.id}`} className="flex flex-wrap items-center justify-between gap-2 py-3 hover:text-brand-2">
                    <span className="min-w-0">
                      <span className="tnum text-[13px] text-ink-3">{p.numero}</span>
                      <span className="block font-medium text-ink">{p.assunto}</span>
                    </span>
                    <Chip tone="brand">{etapa ? nomeEtapa(etapa.nome) : p.estadoAtual}</Chip>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}

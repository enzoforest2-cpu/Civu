import Link from "next/link";
import { ArrowRight, Upload, Wallet } from "lucide-react";
import { fmtData, fmtMoeda } from "@/lib/dates";
import { Vazio } from "@/components/ui";
import { contratosDaEmpresa } from "@/modulos/contratos/dados";
import { acessoFornecedor, SemAcesso } from "@/modulos/contratos/portal";
import { dataLocal } from "@/modulos/contratos/regras";
import { BarraSaldo, ChipContrato, ChipObra } from "@/modulos/contratos/componentes";

export default async function MeusContratosPage() {
  const a = await acessoFornecedor();
  if (!a.ok) return <SemAcesso a={a} />;
  const lista = await contratosDaEmpresa(a.empresa.id);
  const ativos = lista.filter((c) => c.fin.ativo);
  const outros = lista.filter((c) => !c.fin.ativo);
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-[30px] font-bold text-ink">Meus contratos</h1>
          <p className="mt-1 text-[15px] text-ink-2">Contratos de {a.empresa.razaoSocial} com a prefeitura: saldo, vigência e aditivos.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/portal/contratos/nota" className="btn btn-primary">
            <Upload size={16} /> Enviar nota fiscal
          </Link>
          <Link href="/portal/contratos/pagamentos" className="btn btn-quiet">
            <Wallet size={16} /> Meus pagamentos
          </Link>
        </div>
      </div>

      {lista.length === 0 ? (
        <div className="mt-6">
          <Vazio>Nenhum contrato desta empresa com a prefeitura.</Vazio>
        </div>
      ) : (
        <>
          <ul className="mt-6 grid gap-4 md:grid-cols-2">
            {ativos.map((c) => (
              <Cartao key={c.id} c={c} />
            ))}
          </ul>
          {outros.length > 0 && (
            <>
              <h2 className="mt-10 mb-3 text-[16px] font-semibold text-ink-2">Encerrados e rescindidos</h2>
              <ul className="grid gap-4 md:grid-cols-2">
                {outros.map((c) => (
                  <Cartao key={c.id} c={c} />
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </>
  );
}

function Cartao({ c }: { c: Awaited<ReturnType<typeof contratosDaEmpresa>>[number] }) {
  return (
    <li>
      <Link href={`/portal/contratos/${c.id}`} className="panel group flex h-full flex-col p-5 transition-colors hover:border-brand">
        <div className="flex flex-wrap items-center gap-2">
          <span className="tnum text-[13px] font-semibold text-ink-3">
            Contrato {c.rotulo} · {c.municipio.nome}
          </span>
          <ChipContrato s={c.fin.situacao} />
          {c.obra && <ChipObra s={c.obra.situacao} />}
        </div>
        <h3 className="mt-2 leading-snug font-semibold text-ink group-hover:text-brand">{c.objeto}</h3>
        <div className="mt-4 grid grid-cols-2 gap-3 text-[13.5px]">
          <div>
            <div className="text-ink-3">Saldo</div>
            <div className={`display tnum text-[18px] font-semibold ${c.fin.ativo && c.fin.pctSaldo < 10 ? "text-bad" : "text-ink"}`}>{fmtMoeda(c.fin.saldo)}</div>
            <div className="tnum text-[12.5px] text-ink-3">de {fmtMoeda(c.fin.valorAtual)}</div>
          </div>
          <div>
            <div className="text-ink-3">Vigência até</div>
            <div className="display tnum text-[18px] font-semibold text-ink">{fmtData(dataLocal(c.fin.vigenciaFimAtual))}</div>
            <div className="text-[12.5px] text-ink-3">
              {c.aditivos.length ? `${c.aditivos.length} ${c.aditivos.length === 1 ? "aditivo" : "aditivos"}` : "sem aditivos"}
            </div>
          </div>
        </div>
        <div className="mt-3">
          <BarraSaldo fin={c.fin} compacta />
        </div>
        <span className="mt-4 inline-flex items-center gap-1 text-[13.5px] font-semibold text-brand">
          Ver notas e aditivos <ArrowRight size={14} />
        </span>
      </Link>
    </li>
  );
}

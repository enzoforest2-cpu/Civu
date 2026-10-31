import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { fmtMoeda } from "@/lib/dates";
import { Vazio } from "@/components/ui";
import { contratosDaEmpresa } from "@/modulos/contratos/dados";
import { acessoFornecedor, SemAcesso } from "@/modulos/contratos/portal";
import { competenciaDe, rotuloMes } from "@/modulos/contratos/regras";
import { FormNotaPortal } from "@/modulos/contratos/form-nota-portal";

export default async function EnviarNotaPage({ searchParams }: { searchParams: Promise<{ contrato?: string }> }) {
  const a = await acessoFornecedor();
  if (!a.ok) return <SemAcesso a={a} />;
  const { contrato } = await searchParams;
  const ativos = (await contratosDaEmpresa(a.empresa.id)).filter((c) => c.fin.ativo);
  const hoje = new Date();
  const iso = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
  return (
    <>
      <Link href="/portal/contratos" className="mb-4 inline-flex items-center gap-1.5 text-[14px] font-medium text-ink-2 hover:text-ink">
        <ArrowLeft size={15} /> Meus contratos
      </Link>
      <h1 className="display text-[30px] font-bold text-ink">Enviar nota fiscal</h1>
      <p className="mt-1 max-w-2xl text-[15px] text-ink-2">
        A nota vai direto para o fiscal do contrato, que confere a entrega e atesta em até 5 dias úteis. Depois do atesto, você acompanha a liquidação e a posição na fila de
        pagamentos em <Link href="/portal/contratos/pagamentos" className="font-semibold text-brand-2 hover:underline">Meus pagamentos</Link>.
      </p>
      <div className="panel mt-6 max-w-2xl p-6">
        {ativos.length === 0 ? (
          <Vazio>{a.empresa.razaoSocial} não tem contrato em vigor para faturar.</Vazio>
        ) : (
          <FormNotaPortal
            inicial={contrato}
            mesAtual={competenciaDe(hoje)}
            hoje={iso}
            contratos={ativos.map((c) => ({
              id: c.id,
              rotulo: `${c.rotulo} — ${c.objeto.length > 70 ? c.objeto.slice(0, 68) + "…" : c.objeto}`,
              disponivel: fmtMoeda(Math.max(0, c.fin.saldo - c.fin.aAtestar)),
              medicoes: c.medicoes
                .filter((m) => !c.notas.some((n) => n.medicaoId === m.id && n.situacao !== "GLOSADA"))
                .map((m) => ({ id: m.id, rotulo: `Medição ${m.numero} — ${rotuloMes(m.competencia)} — ${fmtMoeda(m.valor)}`, valor: Number(m.valor).toFixed(2).replace(".", ",") })),
            }))}
          />
        )}
      </div>
    </>
  );
}

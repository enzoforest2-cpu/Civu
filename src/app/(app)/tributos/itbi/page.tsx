import Link from "next/link";
import { filaItbi, requireTributos } from "@/modulos/tributos/dados";
import { Titulo } from "@/modulos/tributos/componentes";
import { SITUACAO_ITBI } from "@/modulos/tributos/regras";
import { fmtData, fmtMoeda, relativo } from "@/lib/dates";
import { Chip, Panel, Vazio, type Tone } from "@/components/ui";

const ABAS = [
  { chave: "fila", rotulo: "Esperando avaliação", situacoes: ["EM_AVALIACAO", "CONTESTADO"] },
  { chave: "pagamento", rotulo: "Aguardando pagamento", situacoes: ["AVALIADO"] },
  { chave: "quitados", rotulo: "Quitados", situacoes: ["PAGO"] },
];
const TOM: Record<string, Tone> = { EM_AVALIACAO: "warn", AVALIADO: "brand", PAGO: "ok", CONTESTADO: "bad", CANCELADO: "neutral" };

export default async function FilaItbi({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const u = await requireTributos();
  const sp = await searchParams;
  const aba = ABAS.find((a) => a.chave === sp.aba) ?? ABAS[0];
  const todos = await filaItbi(u.municipioId);
  const lista = todos.filter((i) => aba.situacoes.includes(i.situacao));
  if (aba.chave === "quitados") lista.reverse();
  return (
    <>
      <Titulo titulo="ITBI" sub="Declarações de transmissão de imóveis. A base de cálculo é o maior valor entre o declarado e a referência fiscal, sempre com memória e direito de contestação." />
      <nav className="mb-4 flex flex-wrap gap-2" aria-label="Situação">
        {ABAS.map((a) => {
          const n = todos.filter((i) => a.situacoes.includes(i.situacao)).length;
          const ativo = a.chave === aba.chave;
          return (
            <Link key={a.chave} href={`?aba=${a.chave}`} className={`rounded-full border px-4 py-1.5 text-[13.5px] font-semibold ${ativo ? "border-brand-2 bg-brand-2 text-white" : "border-line-2 bg-surface text-ink-2 hover:bg-sunken"}`}>
              {a.rotulo} <span className="tnum opacity-80">{n}</span>
            </Link>
          );
        })}
      </nav>
      <Panel pad={false}>
        {lista.length === 0 ? (
          <div className="p-6">
            <Vazio>{aba.chave === "fila" ? "Nenhuma declaração esperando avaliação." : "Nada por aqui."}</Vazio>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="lista min-w-[820px]">
              <thead>
                <tr>
                  <th>Declaração</th>
                  <th>Imóvel</th>
                  <th>Comprador</th>
                  <th className="text-right">Declarado</th>
                  <th className="text-right">Base</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((i) => (
                  <tr key={i.id} className="linha">
                    <td>
                      <Link href={`/tributos/itbi/${i.id}`} className="tnum font-semibold text-brand-2 hover:underline">
                        {i.numero}
                      </Link>
                      <div className="text-[12.5px] text-ink-3">
                        {fmtData(i.declaradoEm)} · {relativo(i.declaradoEm)}
                      </div>
                    </td>
                    <td>
                      <div className="text-ink">
                        {i.imovel.logradouro}, {i.imovel.numero}
                        {i.imovel.complemento ? ` — ${i.imovel.complemento}` : ""}
                      </div>
                      <div className="text-[12.5px] text-ink-3">{i.imovel.bairro}</div>
                    </td>
                    <td className="max-w-[200px] truncate">{i.compradorNome}</td>
                    <td className="tnum text-right">{fmtMoeda(i.valorDeclarado)}</td>
                    <td className="tnum text-right">{i.baseCalculo ? fmtMoeda(i.baseCalculo) : "—"}</td>
                    <td>
                      <Chip tone={TOM[i.situacao]}>{SITUACAO_ITBI[i.situacao]}</Chip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}

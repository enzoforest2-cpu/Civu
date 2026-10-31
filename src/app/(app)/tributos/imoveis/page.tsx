import Link from "next/link";
import { Search } from "lucide-react";
import { bairros, listarImoveis, nomeProprietario, requireTributos } from "@/modulos/tributos/dados";
import { Titulo } from "@/modulos/tributos/componentes";
import { USO_NOME } from "@/modulos/tributos/regras";
import { fmtMoeda } from "@/lib/dates";
import { Panel, Vazio } from "@/components/ui";

export default async function Imoveis({ searchParams }: { searchParams: Promise<{ q?: string; bairro?: string; uso?: string; p?: string }> }) {
  const u = await requireTributos();
  const sp = await searchParams;
  const [r, bs] = await Promise.all([listarImoveis(u.municipioId, { q: sp.q?.trim(), bairro: sp.bairro, uso: sp.uso, pagina: Number(sp.p) || 1 }), bairros(u.municipioId)]);
  const qs = (p: number) => {
    const x = new URLSearchParams();
    if (sp.q) x.set("q", sp.q);
    if (sp.bairro) x.set("bairro", sp.bairro);
    if (sp.uso) x.set("uso", sp.uso);
    x.set("p", String(p));
    return `?${x}`;
  };
  return (
    <>
      <Titulo titulo="Cadastro imobiliário" sub={`${r.total.toLocaleString("pt-BR")} imóveis${sp.q || sp.bairro || sp.uso ? " encontrados" : " cadastrados"}. Valor venal pela planta genérica de valores do exercício.`} />
      <form className="panel mb-5 grid gap-3 p-4 sm:grid-cols-[1fr_200px_180px_auto]" method="get">
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
          <input name="q" defaultValue={sp.q} className="input !pl-9" placeholder="Inscrição, rua, proprietário ou CPF/CNPJ" aria-label="Buscar" />
        </div>
        <select name="bairro" defaultValue={sp.bairro ?? ""} className="input" aria-label="Bairro">
          <option value="">Todos os bairros</option>
          {bs.map((b) => (
            <option key={b.bairro}>{b.bairro}</option>
          ))}
        </select>
        <select name="uso" defaultValue={sp.uso ?? ""} className="input" aria-label="Uso">
          <option value="">Todos os usos</option>
          {Object.entries(USO_NOME).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <button className="btn btn-primary">Filtrar</button>
      </form>
      <Panel pad={false}>
        {r.lista.length === 0 ? (
          <div className="p-6">
            <Vazio>Nenhum imóvel com esses filtros.</Vazio>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="lista min-w-[760px]">
              <thead>
                <tr>
                  <th>Inscrição</th>
                  <th>Endereço</th>
                  <th>Uso</th>
                  <th className="text-right">Área constr.</th>
                  <th className="text-right">Valor venal</th>
                  <th>Proprietário</th>
                </tr>
              </thead>
              <tbody>
                {r.lista.map((im) => (
                  <tr key={im.id} className="linha">
                    <td>
                      <Link href={`/tributos/imoveis/${im.id}`} className="tnum font-semibold text-brand-2 hover:underline">
                        {im.inscricao}
                      </Link>
                    </td>
                    <td>
                      <div className="text-ink">
                        {im.logradouro}, {im.numero}
                        {im.complemento ? ` — ${im.complemento}` : ""}
                      </div>
                      <div className="text-[12.5px] text-ink-3">{im.bairro}</div>
                    </td>
                    <td className="text-ink-2">{USO_NOME[im.uso]}</td>
                    <td className="tnum text-right">{im.areaConstruida ? `${im.areaConstruida.toLocaleString("pt-BR")} m²` : "—"}</td>
                    <td className="tnum text-right">{fmtMoeda(im.valorVenal)}</td>
                    <td className="max-w-[220px] truncate text-ink-2">{im.proprietarios.map(nomeProprietario).join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {r.paginas > 1 && (
        <nav className="mt-4 flex items-center justify-between text-[14px]" aria-label="Paginação">
          <span className="text-ink-3">
            Página {r.pagina} de {r.paginas}
          </span>
          <span className="flex gap-2">
            {r.pagina > 1 && (
              <Link href={qs(r.pagina - 1)} className="btn btn-quiet">
                Anterior
              </Link>
            )}
            {r.pagina < r.paginas && (
              <Link href={qs(r.pagina + 1)} className="btn btn-quiet">
                Próxima
              </Link>
            )}
          </span>
        </nav>
      )}
    </>
  );
}

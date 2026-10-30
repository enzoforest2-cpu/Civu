import Link from "next/link";
import { ArrowRight, House, TriangleAlert } from "lucide-react";
import { requirePortal } from "@/lib/portal";
import { donoPortalOuMotivo, meusImoveis } from "@/modulos/tributos/dados";
import { SemAcesso, Titulo } from "@/modulos/tributos/componentes";
import { USO_NOME } from "@/modulos/tributos/regras";
import { fmtData, fmtMoeda } from "@/lib/dates";
import { Chip, Vazio } from "@/components/ui";

export default async function MeusImoveis() {
  const s = await requirePortal();
  const { dono, motivo } = donoPortalOuMotivo(s, "TRIBUTOS");
  if (!dono) return <SemAcesso motivo={motivo} dica="Peça ao responsável legal da empresa para incluir “Tributos e guias” na sua representação." />;
  const lista = await meusImoveis(dono);
  const ano = new Date().getFullYear();
  return (
    <>
      <Titulo
        sobre={dono.tipo === "EMPRESA" ? dono.nome : "Em nome próprio"}
        titulo="Meus imóveis e IPTU"
        sub={`Imóveis em que ${dono.tipo === "EMPRESA" ? "a empresa consta" : "você consta"} como proprietário no cadastro imobiliário, com o IPTU ${ano}.`}
      />
      {lista.length === 0 ? (
        <Vazio icon={<House size={22} className="text-ink-3" />}>
          Nenhum imóvel encontrado no cadastro em seu nome. Se você comprou um imóvel recentemente, a troca de proprietário acontece depois que o ITBI é pago.
        </Vazio>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {lista.map((im) => {
            const r = im.iptuAtual?.resumo;
            return (
              <li key={im.id}>
                <Link href={`/portal/imoveis/${im.id}`} className="panel group block p-5 transition-colors hover:border-brand">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[12.5px] text-ink-3">Inscrição {im.inscricao}</div>
                      <div className="mt-0.5 text-[17px] leading-snug font-semibold text-ink">
                        {im.logradouro}, {im.numero}
                        {im.complemento ? ` — ${im.complemento}` : ""}
                      </div>
                      <div className="text-[14px] text-ink-2">
                        {im.bairro} · {USO_NOME[im.uso]} · {im.areaConstruida > 0 ? `${im.areaConstruida.toLocaleString("pt-BR")} m² construídos` : `${im.areaTerreno.toLocaleString("pt-BR")} m² de terreno`}
                        {im.fracao < 100 && ` · fração de ${im.fracao.toLocaleString("pt-BR")}%`}
                      </div>
                    </div>
                    <ArrowRight size={17} className="mt-1 shrink-0 text-ink-3 group-hover:text-brand" />
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-line pt-3 text-[13.5px]">
                    <span>
                      <span className="text-ink-3">Valor venal </span>
                      <span className="tnum font-semibold text-ink">{fmtMoeda(im.valorVenal)}</span>
                    </span>
                    {im.iptuAtual && (
                      <span>
                        <span className="text-ink-3">IPTU {ano} </span>
                        <span className="tnum font-semibold text-ink">{fmtMoeda(im.iptuAtual.valor)}</span>
                      </span>
                    )}
                    {r && <Chip tone={r.situacao.tone}>{r.situacao.texto}</Chip>}
                  </div>
                  {r?.proxima && !r.quitado && (
                    <p className="mt-2 text-[13.5px] text-ink-2">
                      Próxima parcela: <span className="tnum font-semibold text-ink">{fmtMoeda(r.proxima.valor)}</span> em {fmtData(r.proxima.vencimento + "T12:00:00")}
                    </p>
                  )}
                  {im.dividas.length > 0 && (
                    <p className="mt-2 flex items-start gap-1.5 text-[13.5px] text-bad">
                      <TriangleAlert size={15} className="mt-0.5 shrink-0" />
                      {im.dividas.length === 1 ? "1 débito" : `${im.dividas.length} débitos`} de anos anteriores em dívida ativa
                    </p>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

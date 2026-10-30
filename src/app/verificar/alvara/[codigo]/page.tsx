import { CircleCheck, TriangleAlert } from "lucide-react";
import { carregarLicencaPublica, situacaoLicenca } from "@/modulos/tributos/dados";
import { QrCodigo } from "@/modulos/tributos/componentes";
import { LICENCA_NOME, fmtDocumento } from "@/modulos/tributos/regras";
import { urlBase } from "@/modulos/tributos/url";
import { fmtData, fmtDataHora } from "@/lib/dates";
import { Chip } from "@/components/ui";

export default async function VerificarAlvara({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const l = await carregarLicencaPublica(decodeURIComponent(codigo));
  if (!l)
    return (
      <div role="alert" className="rounded-xl border border-bad/30 bg-bad-soft px-5 py-4 text-[15px] text-bad">
        <strong className="font-semibold">Documento não encontrado.</strong> Não há alvará ou licença com o código {decodeURIComponent(codigo)}. O documento apresentado pode não ser autêntico.
      </div>
    );
  const sit = situacaoLicenca(l.validaAte, l.situacao);
  const url = `${await urlBase()}/verificar/alvara/${l.codigoVerificacao}`;
  const e = l.inscricao.empresa;
  const end = l.inscricao.endereco;
  const valido = sit.dias >= 0 && l.situacao !== "CANCELADA";
  return (
    <>
      <div className={`mb-6 flex items-start gap-3 rounded-xl px-5 py-4 print:hidden ${valido ? "bg-ok-soft text-ok" : "bg-bad-soft text-bad"}`}>
        {valido ? <CircleCheck size={22} className="shrink-0" /> : <TriangleAlert size={22} className="shrink-0" />}
        <div className="text-[15px]">
          <strong className="font-semibold">Documento autêntico</strong>, emitido pela Prefeitura de {l.municipio.nome}.{" "}
          {valido ? `Válido até ${fmtData(l.validaAte + "T12:00:00")}.` : l.situacao === "CANCELADA" ? "Este documento foi cancelado." : `Venceu em ${fmtData(l.validaAte + "T12:00:00")}: a empresa precisa renovar.`}
        </div>
      </div>
      <article className="panel overflow-hidden">
        <header className="border-b border-line bg-sunken px-6 py-5 text-center">
          <div className="text-[12.5px] font-semibold tracking-wide text-ink-3 uppercase">
            Prefeitura Municipal de {l.municipio.nome} – {l.municipio.uf}
          </div>
          <div className="text-[12.5px] text-ink-3">Departamento de Tributação e Fiscalização</div>
          <h1 className="display mt-2 text-[24px] leading-tight font-semibold text-ink sm:text-[28px]">{LICENCA_NOME[l.tipo] ?? l.tipo}</h1>
          <div className="tnum mt-1 text-[15px] font-semibold text-brand">{l.numero}</div>
        </header>
        <div className="grid gap-6 px-6 py-6 sm:grid-cols-[1fr_auto]">
          <dl className="grid min-w-0 gap-x-6 gap-y-3 text-[14.5px] sm:grid-cols-2">
            <div className="sm:col-span-2">
              <dt className="text-[12.5px] text-ink-3">Razão social</dt>
              <dd className="text-[17px] font-semibold text-ink">{e.razaoSocial}</dd>
              {e.nomeFantasia && <dd className="text-ink-2">Nome fantasia: {e.nomeFantasia}</dd>}
            </div>
            <div>
              <dt className="text-[12.5px] text-ink-3">CNPJ</dt>
              <dd className="tnum">{fmtDocumento(e.cnpj)}</dd>
            </div>
            <div>
              <dt className="text-[12.5px] text-ink-3">Inscrição municipal</dt>
              <dd className="tnum">{l.inscricao.numero}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-[12.5px] text-ink-3">Endereço do estabelecimento</dt>
              <dd>
                {end?.logradouro}, {end?.numero} · {end?.bairro} · {l.municipio.nome}/{l.municipio.uf}
                {l.inscricao.areaUtilizada ? ` · ${l.inscricao.areaUtilizada.toLocaleString("pt-BR")} m²` : ""}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-[12.5px] text-ink-3">Atividade autorizada</dt>
              <dd>{l.atividades}</dd>
            </div>
            <div>
              <dt className="text-[12.5px] text-ink-3">Emitido em</dt>
              <dd className="tnum">{fmtDataHora(l.emitidaEm)}</dd>
            </div>
            <div>
              <dt className="text-[12.5px] text-ink-3">Validade</dt>
              <dd className="flex flex-wrap items-center gap-2">
                <span className="tnum font-semibold">{fmtData(l.validaAte + "T12:00:00")}</span>
                <Chip tone={sit.tone}>{sit.texto}</Chip>
              </dd>
            </div>
            {l.observacoes && (
              <div className="sm:col-span-2">
                <dt className="text-[12.5px] text-ink-3">Observações</dt>
                <dd>{l.observacoes}</dd>
              </div>
            )}
          </dl>
          <div className="flex flex-col items-center gap-1.5">
            <QrCodigo texto={url} tamanho={148} titulo="QR Code para verificar este alvará" />
            <div className="tnum text-[13px] font-semibold text-ink">{l.codigoVerificacao}</div>
            <div className="max-w-[160px] text-center text-[11.5px] leading-snug break-all text-ink-3">{url}</div>
          </div>
        </div>
        <footer className="border-t border-line px-6 py-4 text-[12.5px] leading-snug text-ink-3">
          Este alvará deve ficar em local visível no estabelecimento. A autorização vale para a atividade e o endereço acima e pode ser cassada se as condições mudarem. Confira a autenticidade com o
          código ou o QR Code. Documento emitido em ambiente de demonstração da Civu.
        </footer>
      </article>
    </>
  );
}

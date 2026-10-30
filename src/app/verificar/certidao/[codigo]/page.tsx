import { CircleCheck, TriangleAlert } from "lucide-react";
import { carregarCertidaoPublica } from "@/modulos/tributos/dados";
import { QrCodigo } from "@/modulos/tributos/componentes";
import { CERTIDAO_NOME, fmtDocumento, mascararDocumento, type Pendencia } from "@/modulos/tributos/regras";
import { urlBase } from "@/modulos/tributos/url";
import { fmtData, fmtDataHora, fmtMoeda } from "@/lib/dates";

const TEXTO: Record<string, string> = {
  NEGATIVA: "Certificamos que, até a data e hora de emissão, não constam débitos vencidos nem inscrições em dívida ativa em nome do contribuinte acima, relativos a tributos administrados por este município.",
  POSITIVA_EFEITO_NEGATIVA:
    "Certificamos que constam débitos em nome do contribuinte acima com a exigibilidade suspensa (parcelamento em dia), o que confere a esta certidão os mesmos efeitos da certidão negativa, nos termos do art. 206 do Código Tributário Nacional.",
  POSITIVA: "Certificamos que constam, até a data e hora de emissão, os débitos relacionados abaixo em nome do contribuinte acima.",
};

export default async function VerificarCertidao({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const c = await carregarCertidaoPublica(decodeURIComponent(codigo));
  if (!c)
    return (
      <div role="alert" className="rounded-xl border border-bad/30 bg-bad-soft px-5 py-4 text-[15px] text-bad">
        <strong className="font-semibold">Certidão não encontrada.</strong> Não há certidão com o código {decodeURIComponent(codigo)}. O documento apresentado pode não ser autêntico.
      </div>
    );
  // eslint-disable-next-line react-hooks/purity -- validade depende do dia; renderizado no servidor
  const valida = new Date(c.validaAte + "T23:59:59").getTime() >= Date.now();
  const url = `${await urlBase()}/verificar/certidao/${c.codigoVerificacao}`;
  const pend = (c.pendencias as Pendencia[] | null) ?? [];
  const pessoa = c.documento.replace(/\D/g, "").length === 11;
  return (
    <>
      <div className={`mb-6 flex items-start gap-3 rounded-xl px-5 py-4 print:hidden ${valida ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn"}`}>
        {valida ? <CircleCheck size={22} className="shrink-0" /> : <TriangleAlert size={22} className="shrink-0" />}
        <div className="text-[15px]">
          <strong className="font-semibold">Certidão autêntica</strong>, emitida pela Prefeitura de {c.municipio.nome} em {fmtDataHora(c.emitidaEm)}.{" "}
          {valida ? `Válida até ${fmtData(c.validaAte + "T12:00:00")}.` : `Venceu em ${fmtData(c.validaAte + "T12:00:00")}: peça uma nova.`}
        </div>
      </div>
      <article className="panel overflow-hidden">
        <header className="border-b border-line bg-sunken px-6 py-5 text-center">
          <div className="text-[12.5px] font-semibold tracking-wide text-ink-3 uppercase">
            Prefeitura Municipal de {c.municipio.nome} – {c.municipio.uf}
          </div>
          <h1 className="display mt-2 text-[22px] leading-tight font-semibold text-ink sm:text-[26px]">{CERTIDAO_NOME[c.tipo]}</h1>
          <div className="tnum mt-1 text-[15px] font-semibold text-brand">{c.numero}</div>
        </header>
        <div className="grid gap-6 px-6 py-6 sm:grid-cols-[1fr_auto]">
          <div className="min-w-0 space-y-4 text-[14.5px]">
            <div>
              <div className="text-[12.5px] text-ink-3">Contribuinte</div>
              <div className="text-[17px] font-semibold text-ink">{c.nome}</div>
              <div className="tnum text-ink-2">
                {pessoa ? "CPF" : "CNPJ"} {pessoa ? mascararDocumento(c.documento) : fmtDocumento(c.documento)}
              </div>
            </div>
            <p className="leading-relaxed text-ink">{TEXTO[c.tipo]}</p>
            {pend.length > 0 && (
              <ul className="divide-y divide-line rounded-xl border border-line">
                {pend.map((p, i) => (
                  <li key={i} className="flex flex-wrap justify-between gap-2 px-4 py-2 text-[13.5px]">
                    <span className="min-w-0 flex-1">{p.descricao}</span>
                    <span className="tnum font-semibold">{fmtMoeda(p.valor)}</span>
                  </li>
                ))}
              </ul>
            )}
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-[13.5px]">
              <dt className="text-ink-3">Emitida em</dt>
              <dd className="tnum">{fmtDataHora(c.emitidaEm)}</dd>
              <dt className="text-ink-3">Válida até</dt>
              <dd className="tnum font-semibold">{fmtData(c.validaAte + "T12:00:00")}</dd>
              {c.finalidade && (
                <>
                  <dt className="text-ink-3">Finalidade declarada</dt>
                  <dd>{c.finalidade}</dd>
                </>
              )}
            </dl>
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <QrCodigo texto={url} tamanho={148} titulo="QR Code para verificar esta certidão" />
            <div className="tnum text-[13px] font-semibold text-ink">{c.codigoVerificacao}</div>
            <div className="max-w-[160px] text-center text-[11.5px] leading-snug break-all text-ink-3">{url}</div>
          </div>
        </div>
        <footer className="border-t border-line px-6 py-4 text-[12.5px] leading-snug text-ink-3">
          Fica ressalvado o direito de a Fazenda Municipal cobrar débitos que venham a ser apurados depois desta data. Confira a autenticidade com o código ou o QR Code. Documento emitido em ambiente de
          demonstração da Civu.
        </footer>
      </article>
    </>
  );
}

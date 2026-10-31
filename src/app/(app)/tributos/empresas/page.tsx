import Link from "next/link";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { empresas } from "@/db/schema";
import { listarInscricoes, pedidosAlvara, requireTributos, situacaoFiscal, situacaoLicenca } from "@/modulos/tributos/dados";
import { Titulo } from "@/modulos/tributos/componentes";
import { CERTIDAO_NOME, REGIME_NOME, fmtDocumento } from "@/modulos/tributos/regras";
import { emitirAlvaraAction } from "@/modulos/tributos/acoes";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { fmtData } from "@/lib/dates";
import { Chip, Panel, Vazio } from "@/components/ui";

const FILTROS = [
  { chave: "", rotulo: "Todas" },
  { chave: "vencidos", rotulo: "Alvará vencido" },
  { chave: "vencendo", rotulo: "Vence em 30 dias" },
];

export default async function Empresas({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const u = await requireTributos();
  const sp = await searchParams;
  const [inscricoes, pedidos] = await Promise.all([listarInscricoes(u.municipioId), pedidosAlvara(u.municipioId)]);
  const abertos = pedidos.filter((p) => !p.encerradoEm);
  const empresasPedido = abertos.length ? await db.query.empresas.findMany({ where: inArray(empresas.id, abertos.map((p) => p.interessadoEmpresaId ?? "—")) }) : [];
  const fiscal = await Promise.all(
    abertos.map(async (p) => {
      const e = empresasPedido.find((x) => x.id === p.interessadoEmpresaId);
      return e ? situacaoFiscal({ tipo: "EMPRESA", id: e.id, nome: e.razaoSocial, documento: e.cnpj }) : null;
    }),
  );
  const linhas = inscricoes
    .map((i) => {
      const alv = i.licencas.find((l) => l.tipo === "LOCALIZACAO_FUNCIONAMENTO");
      return { i, alv, sit: alv ? situacaoLicenca(alv.validaAte, alv.situacao) : null };
    })
    .filter(({ sit }) => (sp.f === "vencidos" ? !sit || sit.dias < 0 : sp.f === "vencendo" ? sit && sit.dias >= 0 && sit.dias <= 30 : true))
    .sort((a, b) => (a.sit?.dias ?? -9999) - (b.sit?.dias ?? -9999));

  return (
    <>
      <Titulo titulo="Empresas e alvarás" sub="Inscrições municipais ligadas ao cadastro de empresas, regime tributário, alvarás e licenças. Pedidos do portal chegam como processo." />

      <Panel title="Pedidos de alvará em análise" className="mb-6" action={<Chip tone={abertos.length ? "warn" : "ok"}>{abertos.length}</Chip>}>
        {abertos.length === 0 ? (
          <Vazio>Nenhum pedido esperando decisão.</Vazio>
        ) : (
          <ul className="space-y-4">
            {abertos.map((p, k) => {
              const e = empresasPedido.find((x) => x.id === p.interessadoEmpresaId);
              const f = fiscal[k];
              return (
                <li key={p.id} className="rounded-xl border border-line p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/processos/${p.id}`} className="tnum text-[13px] font-semibold text-brand-2 hover:underline">
                        Processo {p.numero}
                      </Link>
                      <div className="font-semibold text-ink">{p.assunto}</div>
                      <div className="text-[13px] text-ink-2">
                        {e?.razaoSocial} · {e ? fmtDocumento(e.cnpj) : ""} · aberto em {fmtData(p.abertoEm)}
                      </div>
                    </div>
                    {f && <Chip tone={f.tipo === "POSITIVA" ? "bad" : "ok"}>{f.tipo === "POSITIVA" ? `${f.pendencias.length} pendência(s) fiscal(is)` : CERTIDAO_NOME[f.tipo].replace("Certidão ", "Situação: ")}</Chip>}
                  </div>
                  {p.descricao && <p className="mt-2 text-[13.5px] whitespace-pre-line text-ink-2">{p.descricao}</p>}
                  <details className="mt-3">
                    <summary className="btn btn-quiet">Decidir e emitir alvará</summary>
                    <ActionForm action={emitirAlvaraAction} className="mt-3 grid gap-3 sm:grid-cols-[1fr_160px]">
                      <input type="hidden" name="processoId" value={p.id} />
                      <div className="sm:col-span-2">
                        <label className="label" htmlFor={`d-${p.id}`}>
                          Despacho de decisão
                        </label>
                        <textarea
                          id={`d-${p.id}`}
                          name="decisao"
                          rows={2}
                          className="input"
                          defaultValue="Documentação conferida, atividade compatível com o zoneamento e sem impedimentos cadastrais. Defiro o alvará."
                        />
                      </div>
                      <div>
                        <label className="label" htmlFor={`m-${p.id}`}>
                          Validade
                        </label>
                        <select id={`m-${p.id}`} name="meses" defaultValue="12" className="input">
                          <option value="6">6 meses</option>
                          <option value="12">12 meses</option>
                          <option value="24">24 meses</option>
                        </select>
                      </div>
                      <div className="flex items-end">
                        <SubmitButton className="btn btn-primary w-full" pendingText="Emitindo…">
                          Deferir e emitir
                        </SubmitButton>
                      </div>
                      <p className="hint sm:col-span-2">Junta o despacho ao processo, encerra como deferido e publica o alvará com código de verificação. Para indeferir, use a página do processo.</p>
                    </ActionForm>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <nav className="mb-4 flex flex-wrap gap-2" aria-label="Filtro">
        {FILTROS.map((f) => (
          <Link
            key={f.chave}
            href={f.chave ? `?f=${f.chave}` : "?"}
            className={`rounded-full border px-4 py-1.5 text-[13.5px] font-semibold ${(sp.f ?? "") === f.chave ? "border-brand-2 bg-brand-2 text-white" : "border-line-2 bg-surface text-ink-2 hover:bg-sunken"}`}
          >
            {f.rotulo}
          </Link>
        ))}
      </nav>
      <Panel pad={false}>
        {linhas.length === 0 ? (
          <div className="p-6">
            <Vazio>Nenhuma inscrição neste filtro.</Vazio>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="lista min-w-[860px]">
              <thead>
                <tr>
                  <th>Inscrição</th>
                  <th>Empresa</th>
                  <th>Atividade (CNAE)</th>
                  <th>Regime</th>
                  <th>Alvará</th>
                  <th>Validade</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map(({ i, alv, sit }) => (
                  <tr key={i.id}>
                    <td className="tnum font-semibold">{i.numero}</td>
                    <td>
                      <div className="text-ink">{i.empresa.nomeFantasia ?? i.empresa.razaoSocial}</div>
                      <div className="tnum text-[12.5px] text-ink-3">{fmtDocumento(i.empresa.cnpj)}</div>
                    </td>
                    <td className="max-w-[260px]">
                      <div className="tnum text-[13px]">{i.cnaePrincipal}</div>
                      <div className="truncate text-[12.5px] text-ink-3">{i.cnaeDescricao}</div>
                    </td>
                    <td>{REGIME_NOME[i.regime]}</td>
                    <td>
                      {alv ? (
                        <Link href={`/verificar/alvara/${alv.codigoVerificacao}`} className="tnum text-brand-2 hover:underline">
                          {alv.numero}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      {sit ? (
                        <span className="flex flex-col items-start gap-1">
                          <span className="tnum text-[13px]">{fmtData(alv!.validaAte + "T12:00:00")}</span>
                          <Chip tone={sit.tone}>{sit.texto}</Chip>
                        </span>
                      ) : (
                        <Chip tone="bad">Sem alvará</Chip>
                      )}
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

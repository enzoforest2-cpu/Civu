// Minha secretaria: ponto de partida do(a) secretário(a) depois do login.
// Versão de base (Parte 1 do "Comando da prefeitura"): o que está com a secretaria e os atalhos da pasta.
// A cabine completa (orçamento, contratos, compras e repasses da pasta) entra na Parte 2.
import Link from "next/link";
import { and, eq, isNull, lt, sql } from "drizzle-orm";
import { ArrowUpRight, FileSignature, FolderOpen, Inbox, PieChart } from "lucide-react";
import { db } from "@/db";
import { processos, usuarios } from "@/db/schema";
import { exigirRota } from "@/lib/acesso";
import { nomeDaArea, podeVerRota } from "@/lib/areas";
import { Cabecalho, Panel, Vazio } from "@/components/ui";

export const metadata = { title: "Minha secretaria · Civu" };

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export default async function SecretariaPage() {
  const u = await exigirRota("/secretaria");
  if (!u.setor) {
    return (
      <>
        <Cabecalho titulo="Minha secretaria" />
        <Vazio>Você ainda não está ligado a uma secretaria. Peça ao administrador do sistema para ajustar o seu cadastro.</Vazio>
      </>
    );
  }
  const setorId = u.setor.id;
  const doSetor = sql`${processos.abertoPorId} in (select ${usuarios.id} from ${usuarios} where ${usuarios.setorId} = ${setorId})`;
  const [[naSecretaria], [daSecretaria], foraDaSecretaria] = await Promise.all([
    db
      .select({
        total: sql<number>`count(*)::int`,
        atrasados: sql<number>`count(*) filter (where ${processos.prazoEtapaEm} < now())::int`,
        aReceber: sql<number>`count(*) filter (where ${processos.recebidoEm} is null)::int`,
      })
      .from(processos)
      .where(and(eq(processos.municipioId, u.municipioId), eq(processos.setorAtualId, setorId), isNull(processos.encerradoEm))),
    db
      .select({
        total: sql<number>`count(*)::int`,
        atrasados: sql<number>`count(*) filter (where ${processos.prazoEtapaEm} < now())::int`,
      })
      .from(processos)
      .where(and(eq(processos.municipioId, u.municipioId), isNull(processos.encerradoEm), doSetor)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(processos)
      .where(and(eq(processos.municipioId, u.municipioId), isNull(processos.encerradoEm), doSetor, sql`${processos.setorAtualId} is distinct from ${setorId}`, lt(processos.prazoEtapaEm, new Date()))),
  ]);

  const atalhos = [
    { href: "/caixa", rotulo: "Minha caixa", texto: "Processos que chegaram à secretaria para receber e despachar.", icone: Inbox },
    { href: `/processos?setor=${setorId}&situacao=abertos`, rotulo: "Processos na secretaria", texto: "Tudo o que está com a secretaria agora, por etapa e prazo.", icone: FolderOpen },
    { href: "/contratos", rotulo: "Contratos", texto: "Contratos vigentes, vencimentos e notas aguardando atesto.", icone: FileSignature },
    { href: "/financas/orcamento", rotulo: "Orçamento", texto: "Dotações, empenhos e saldo do orçamento.", icone: PieChart },
  ].filter((a) => podeVerRota(u, a.href));

  return (
    <>
      <Cabecalho titulo="Minha secretaria" sub={`${u.setor.nome} · área de ${nomeDaArea(u.setor.area)}`} />

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <Numero
          href={`/processos?setor=${setorId}&situacao=abertos`}
          valor={naSecretaria.total}
          rotulo="na secretaria agora"
          detalhe={naSecretaria.aReceber ? `${plural(naSecretaria.aReceber, "aguarda", "aguardam")} recebimento` : "todos recebidos"}
        />
        <Numero
          href={`/processos?setor=${setorId}&situacao=atrasados`}
          valor={naSecretaria.atrasados}
          rotulo={naSecretaria.atrasados === 1 ? "atrasado na secretaria" : "atrasados na secretaria"}
          detalhe="com o prazo da etapa vencido"
          alerta={naSecretaria.atrasados > 0}
        />
        <Numero
          valor={daSecretaria.total}
          rotulo={daSecretaria.total === 1 ? "pedido da secretaria em andamento" : "pedidos da secretaria em andamento"}
          detalhe={foraDaSecretaria[0].n ? `${plural(foraDaSecretaria[0].n, "atrasado", "atrasados")} em outros setores` : "nenhum atrasado em outros setores"}
          alerta={foraDaSecretaria[0].n > 0}
        />
      </div>

      <Panel title="Atalhos da pasta">
        <ul className="grid gap-3 sm:grid-cols-2">
          {atalhos.map((a) => (
            <li key={a.href}>
              <Link href={a.href} className="flex min-h-[44px] items-start gap-3 rounded-xl border border-line p-4 transition-colors hover:border-line-2 hover:bg-sunken">
                <a.icone size={20} aria-hidden className="mt-0.5 shrink-0 text-brand-2" />
                <span className="min-w-0">
                  <span className="flex items-center gap-1 font-semibold text-ink">
                    {a.rotulo} <ArrowUpRight size={15} aria-hidden className="text-ink-3" />
                  </span>
                  <span className="mt-0.5 block text-[14px] text-ink-2">{a.texto}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Panel>
    </>
  );
}

function Numero({ valor, rotulo, detalhe, href, alerta = false }: { valor: number; rotulo: string; detalhe: string; href?: string; alerta?: boolean }) {
  const corpo = (
    <>
      <div className={`display tnum text-[30px] leading-none font-semibold ${alerta ? "text-bad" : "text-ink"}`}>{valor}</div>
      <div className="mt-1.5 font-medium text-ink">{rotulo}</div>
      <div className="mt-0.5 text-[13.5px] text-ink-2">{detalhe}</div>
    </>
  );
  return href ? (
    <Link href={href} className="panel block min-h-[44px] px-5 py-4 transition-colors hover:border-line-2">
      {corpo}
    </Link>
  ) : (
    <div className="panel px-5 py-4">{corpo}</div>
  );
}

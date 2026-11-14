import Link from "next/link";
import { Lock } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { AREA_NOME, areaDoUsuario, ehArea, paginaInicial } from "@/lib/areas";
import { ITENS_GESTAO } from "@/lib/modulos";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  return { title: (await searchParams).tipo === "processo" ? "Sem acesso a este processo · Civu" : "Sem acesso a esta área · Civu" };
}

const NOME_INICIO = { "/gabinete": "a Sala do prefeito", "/secretaria": "Minha secretaria", "/painel": "o seu painel" } as const;

/** Nome da tela pelo menu (o item de prefixo mais longo), para não mostrar o endereço. */
function nomeDaTela(caminho: string): string | null {
  const itens = ITENS_GESTAO.filter((i) => caminho === i.href || caminho.startsWith(i.href + "/")).sort((a, b) => b.href.length - a.href.length);
  return itens[0]?.rotulo ?? null;
}

export default async function SemAcessoPage({ searchParams }: { searchParams: Promise<{ area?: string; de?: string; tipo?: string }> }) {
  const u = await requireUser();
  const sp = await searchParams;
  if (sp.tipo === "processo") return <SemAcessoProcesso inicio={paginaInicial(u)} />;
  const area = ehArea(sp.area) ? sp.area : null;
  const de = typeof sp.de === "string" && sp.de.startsWith("/") && !sp.de.startsWith("//") ? sp.de : null;
  const tela = de ? nomeDaTela(de) : null;
  const minha = areaDoUsuario(u);
  const inicio = paginaInicial(u);

  return (
    <div className="mx-auto max-w-2xl py-6 sm:py-10">
      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-warn-soft text-warn" aria-hidden>
        <Lock size={22} />
      </div>
      <h1 className="display text-[28px] leading-[1.1] font-semibold text-ink sm:text-[34px]">Sem acesso a esta área</h1>
      <p className="mt-4 text-[16px] leading-relaxed text-ink-2">
        {tela ? (
          <>
            A tela <strong className="font-semibold text-ink">{tela}</strong>
          </>
        ) : (
          "A tela que você tentou abrir"
        )}{" "}
        {area ? (
          <>
            é da área de <strong className="font-semibold text-ink">{AREA_NOME[area]}</strong>.
          </>
        ) : (
          "não está liberada para o seu perfil."
        )}{" "}
        {u.setor ? (
          minha ? (
            <>
              O seu setor, {u.setor.nome}, é da área de {AREA_NOME[minha]}, e cada pessoa vê a própria área e as telas comuns a todos.
            </>
          ) : (
            <>O seu setor, {u.setor.nome}, ainda não tem área definida, por isso só as telas comuns a todos estão liberadas.</>
          )
        ) : (
          <>Você ainda não está ligado a um setor, por isso só as telas comuns a todos estão liberadas.</>
        )}
      </p>
      <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
        Se você precisa destas informações no seu trabalho, peça-as ao setor responsável ou peça ao administrador do sistema que revise a área do seu setor.
      </p>
      <div className="mt-7 flex flex-wrap gap-3">
        <Link href={inicio} className="btn btn-primary min-h-[44px]">
          Voltar para {NOME_INICIO[inicio]}
        </Link>
        <Link href="/caixa" className="btn btn-quiet min-h-[44px]">
          Abrir minha caixa
        </Link>
      </div>
    </div>
  );
}

/** Processo de outra pasta aberto pelo número ou por um link (regra em src/lib/acesso-processo.ts). */
function SemAcessoProcesso({ inicio }: { inicio: keyof typeof NOME_INICIO }) {
  return (
    <div className="mx-auto max-w-2xl py-6 sm:py-10">
      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-warn-soft text-warn" aria-hidden>
        <Lock size={22} />
      </div>
      <h1 className="display text-[28px] leading-[1.1] font-semibold text-ink sm:text-[34px]">Sem acesso a este processo</h1>
      <p className="mt-4 text-[16px] leading-relaxed text-ink-2">
        Este processo não é da sua pasta e não passa pelo seu setor. Cada servidor abre os processos de que participa: os pedidos da própria secretaria, os que estão ou já
        passaram pelo seu setor e os que chegam a ele pelo fluxo. O Gabinete e o Controle Interno abrem todos.
      </p>
      <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
        Se você precisa dele no seu trabalho, peça ao setor que está com o processo que o envie ao seu, ou acompanhe o andamento pela consulta pública.
      </p>
      <div className="mt-7 flex flex-wrap gap-3">
        <Link href={inicio} className="btn btn-primary min-h-[44px]">
          Voltar para {NOME_INICIO[inicio]}
        </Link>
        <Link href="/processos" className="btn btn-quiet min-h-[44px]">
          Ver os processos que você abre
        </Link>
        <Link href="/consulta" className="btn btn-quiet min-h-[44px]">
          Consulta pública
        </Link>
      </div>
    </div>
  );
}

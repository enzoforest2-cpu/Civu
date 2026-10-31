import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, ShieldCheck, UserRound } from "lucide-react";
import { getSessaoPortal, listarPessoasDemonstracao, PAPEL_REPRESENTACAO } from "@/lib/portal";
import { entrarGovbrAction, entrarSenhaAction } from "@/app/portal/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { MarcaCompleta } from "@/components/marca";

export const dynamic = "force-dynamic";

/** Entrada dos portais Civu Cidadão e Civu Empresas. */
export default async function EntrarPage() {
  if (await getSessaoPortal()) redirect("/portal");
  const demo = await listarPessoasDemonstracao();
  return (
    <main className="min-h-screen bg-bg">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
          <MarcaCompleta altura={26} />
          <Link href="/login" className="alvo-toque shrink-0 text-[14px] font-semibold whitespace-nowrap text-brand-2 hover:underline">
            Sou servidor
          </Link>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <h1 className="display text-[34px] leading-[1.1] font-bold text-ink sm:text-[40px]">Sua cidade, mais perto.</h1>
        <p className="mt-2 max-w-2xl text-[15.5px] text-ink-2">
          Peça serviços, acompanhe processos, consulte tributos e, se você representa uma empresa, cuide dela no mesmo lugar.
        </p>

        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <section className="panel p-6">
            <div className="flex items-center gap-2 text-[16px] font-semibold text-ink">
              <ShieldCheck size={19} className="text-brand-2" /> Entrar com gov.br
            </div>
            <p className="mt-1 rounded-lg bg-warn-soft px-3 py-2 text-[14px] text-ink">
              <strong className="font-semibold">Ambiente de demonstração.</strong> A entrada gov.br é simulada: escolha uma pessoa fictícia. A integração real depende
              da adesão do município à Rede gov.br.
            </p>
            <ul className="mt-4 space-y-2">
              {demo.map((p) => (
                <li key={p.id}>
                  <form action={entrarGovbrAction}>
                    <input type="hidden" name="pessoaId" value={p.id} />
                    <button className="flex w-full items-start gap-3 rounded-xl border border-line px-4 py-3 text-left transition-colors hover:border-brand hover:bg-brand-soft/40">
                      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-2">
                        {p.representacoes.length ? <Building2 size={17} /> : <UserRound size={17} />}
                      </span>
                      <span className="min-w-0">
                        <span className="block font-semibold text-ink">{p.nome}</span>
                        <span className="block text-[13px] text-ink-2">
                          {p.representacoes.length
                            ? p.representacoes.map((r) => `${PAPEL_REPRESENTACAO[r.papel] ?? r.papel} de ${r.empresa.nomeFantasia ?? r.empresa.razaoSocial}`).join(" · ")
                            : "Cidadã(o)"}
                          {p.nivelGovbr ? ` · conta ${p.nivelGovbr}` : ""}
                        </span>
                      </span>
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </section>

          <section className="panel p-6">
            <div className="text-[16px] font-semibold text-ink">CPF e senha</div>
            <p className="mt-1 text-[14px] text-ink-2">Para serviços que não exigem identidade validada pelo gov.br.</p>
            <ActionForm action={entrarSenhaAction} className="mt-4 space-y-3" resetOnOk={false}>
              <div>
                <label className="label" htmlFor="cpf">
                  CPF
                </label>
                <input id="cpf" name="cpf" className="input tnum" inputMode="numeric" autoComplete="username" required />
              </div>
              <div>
                <label className="label" htmlFor="senha">
                  Senha
                </label>
                <input id="senha" name="senha" type="password" className="input" autoComplete="current-password" required />
              </div>
              <SubmitButton className="btn btn-primary w-full" pendingText="Entrando…">
                Entrar
              </SubmitButton>
            </ActionForm>
          </section>
        </div>
      </div>
    </main>
  );
}

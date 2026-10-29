import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { loginAction } from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const u = await getSessionUser();
  if (u) redirect("/painel");
  return (
    <main className="flex min-h-screen">
      <aside className="hidden w-[46%] flex-col justify-between bg-side p-12 text-side-ink lg:flex">
        <div className="text-lg font-semibold tracking-tight text-white">Trâmite</div>
        <div>
          <h1 className="max-w-md text-3xl font-semibold leading-tight text-white">Toda demanda vira um processo que só avança com o que a lei exige.</h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-side-ink/80">
            Protocolo único, tramitação entre setores com prazo e dono, documentos assinados e trilha de auditoria — do DFD ao pagamento.
          </p>
        </div>
        <div className="text-xs text-side-ink/60">Lei 4.320 · LRF · Lei 14.133 · Decreto 10.540 (SIAFIC) · Lei 14.129</div>
      </aside>
      <section className="flex flex-1 items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <div className="text-lg font-semibold tracking-tight">Trâmite</div>
          </div>
          <h2 className="text-xl font-semibold">Entrar</h2>
          <p className="mt-1 text-sm text-ink-2">Use seu CPF e senha. Em produção, o acesso será pelo gov.br.</p>
          <ActionForm action={loginAction} className="mt-6 space-y-4" resetOnOk={false}>
            <div>
              <label className="label" htmlFor="cpf">
                CPF
              </label>
              <input id="cpf" name="cpf" className="input" inputMode="numeric" autoComplete="username" placeholder="000.000.000-00" required />
            </div>
            <div>
              <label className="label" htmlFor="senha">
                Senha
              </label>
              <input id="senha" name="senha" type="password" className="input" autoComplete="current-password" required />
            </div>
            <SubmitButton className="btn btn-primary w-full justify-center" pendingText="Entrando…">
              Entrar
            </SubmitButton>
          </ActionForm>
          <div className="mt-8 rounded-lg border border-line bg-white p-4 text-xs text-ink-2">
            <div className="mb-2 font-semibold text-ink">
              Ambiente de demonstração (senha <span className="kbd">123456</span>)
            </div>
            <ul className="space-y-1 font-mono">
              <li>111.111.111-11 — Prefeita (ordenadora, admin)</li>
              <li>333.333.333-33 — Compras</li>
              <li>444.444.444-44 — Contabilidade</li>
              <li>555.555.555-55 — Controle interno</li>
              <li>666.666.666-66 — Procuradoria</li>
              <li>999.999.999-99 — Requisitante (UBS)</li>
            </ul>
          </div>
        </div>
      </section>
    </main>
  );
}

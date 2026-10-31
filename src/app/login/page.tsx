import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { loginAction } from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Marca, MarcaCompleta } from "@/components/marca";

export const dynamic = "force-dynamic";

const PARADAS = ["Pedido", "Autorização", "Compras", "Orçamento", "Contrato", "Pagamento"];

export default async function LoginPage() {
  const u = await getSessionUser();
  if (u) redirect("/painel");
  return (
    <main className="flex min-h-screen bg-surface">
      <aside className="relative hidden w-[52%] flex-col justify-between overflow-hidden bg-brand-2 p-14 text-white lg:flex">
        <div className="flex items-center gap-3">
          <MarcaCompleta altura={34} inversa />
        </div>

        <div>
          <p className="display max-w-xl text-[46px] leading-[1.05] font-semibold">Cada pedido da prefeitura, do protocolo ao pagamento, com prazo e responsável.</p>
          {/* o trilho como ilustração */}
          <ol className="mt-14 flex items-start" aria-hidden>
            {PARADAS.map((p, i) => {
              const atual = i === 3;
              const passou = i < 3;
              return (
                <li key={p} className="relative flex flex-1 flex-col items-start">
                  {i < PARADAS.length - 1 && <span className={`absolute top-[13px] left-0 h-[3px] w-full ${passou ? "bg-white" : "bg-white/25"}`} />}
                  <span
                    className={`relative z-10 h-[29px] w-[29px] rounded-full ${atual ? "border-[3px] border-white bg-brand-2" : passou ? "bg-white" : "border-2 border-white/35 bg-brand-2"}`}
                  >
                    {atual && <span className="absolute inset-[6px] rounded-full bg-white" />}
                  </span>
                  <span className={`mt-3 text-[14px] ${atual ? "font-semibold text-white" : passou ? "text-white/90" : "text-white/80"}`}>{p}</span>
                </li>
              );
            })}
          </ol>
        </div>

        <p className="max-w-md text-[14px] text-white/85">Segue a Lei 14.133, a Lei 4.320, a LRF e o Decreto 10.540. Toda movimentação fica registrada e não pode ser apagada.</p>
      </aside>

      <section className="flex flex-1 items-center justify-center p-8">
        <div className="w-full max-w-[380px]">
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            <MarcaCompleta altura={32} />
          </div>
          <h1 className="display text-[30px] font-semibold text-ink">Entrar</h1>
          <p className="mt-1.5 text-[14.5px] text-ink-2">Use seu CPF e sua senha de servidor.</p>
          <ActionForm action={loginAction} className="mt-8 space-y-5" resetOnOk={false}>
            <div>
              <label className="label" htmlFor="cpf">
                CPF
              </label>
              <input id="cpf" name="cpf" className="input !py-3" inputMode="numeric" autoComplete="username" placeholder="000.000.000-00" required />
            </div>
            <div>
              <label className="label" htmlFor="senha">
                Senha
              </label>
              <input id="senha" name="senha" type="password" className="input !py-3" autoComplete="current-password" required />
            </div>
            <SubmitButton className="btn btn-primary btn-lg w-full" pendingText="Entrando…">
              Entrar
            </SubmitButton>
          </ActionForm>

          <details className="mt-10 rounded-xl border border-line bg-sunken/60 text-[14px] text-ink-2">
            <summary className="px-4 py-3 font-semibold text-ink">Acessos de demonstração</summary>
            <div className="px-4 pb-4">
              <p className="mb-2">
                Senha de todos: <strong className="text-ink">123456</strong>
              </p>
              <ul className="tnum space-y-1">
                <li>111.111.111-11 — Prefeita (vê tudo)</li>
                <li>999.999.999-99 — Coordenadora de UBS</li>
                <li>333.333.333-33 — Compras</li>
                <li>444.444.444-44 — Contabilidade</li>
                <li>555.555.555-55 — Controladoria</li>
                <li>666.666.666-66 — Procuradoria</li>
              </ul>
            </div>
          </details>
        </div>
      </section>
    </main>
  );
}

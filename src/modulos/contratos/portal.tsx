import "server-only";
// Acesso do fornecedor no Civu Empresas: só a empresa ativa, e só com o assunto "Contratos e pagamentos".
import Link from "next/link";
import { KeyRound } from "lucide-react";
import { requirePortal, type SessaoPortal } from "@/lib/portal";
import type { Empresa } from "@/db/schema";

export type AcessoFornecedor = { ok: true; s: SessaoPortal; empresa: Empresa } | { ok: false; s: SessaoPortal; motivo: "SEM_EMPRESA" | "SEM_ESCOPO" };

export async function acessoFornecedor(): Promise<AcessoFornecedor> {
  const s = await requirePortal();
  if (!s.empresaAtiva) return { ok: false, s, motivo: "SEM_EMPRESA" };
  if (!s.escoposAtivos.includes("CONTRATOS")) return { ok: false, s, motivo: "SEM_ESCOPO" };
  return { ok: true, s, empresa: s.empresaAtiva };
}

export function SemAcesso({ a }: { a: Extract<AcessoFornecedor, { ok: false }> }) {
  return (
    <div className="panel mx-auto max-w-xl p-8 text-center">
      <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-sunken text-ink-2">
        <KeyRound size={20} />
      </span>
      <h1 className="display mt-4 text-[24px] font-semibold text-ink">
        {a.motivo === "SEM_EMPRESA" ? "Escolha a empresa fornecedora" : "Sua representação não inclui contratos"}
      </h1>
      <p className="mt-2 text-[14.5px] text-ink-2">
        {a.motivo === "SEM_EMPRESA"
          ? "Contratos e pagamentos aparecem quando você age em nome de uma empresa. Use o seletor “Agindo como”, no alto da página."
          : `Você representa ${a.s.empresaAtiva?.razaoSocial}, mas sem o assunto “Contratos e pagamentos”. O responsável legal pode incluir esse assunto na sua representação.`}
      </p>
      <Link href="/portal/acesso" className="btn btn-quiet mt-5">
        Ver representação e acessos
      </Link>
    </div>
  );
}

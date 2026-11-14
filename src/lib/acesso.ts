import "server-only";
// Guarda de acesso por área para páginas da gestão (a regra fica em src/lib/areas.ts).
// Página bloqueada leva à tela "Sem acesso a esta área" (/sem-acesso), que diz o que aconteceu e oferece o
// caminho de volta: nunca devolve a pessoa ao painel em silêncio.
// Em server actions, use `exigirAreaNaAcao` (lança erro com mensagem, que a ação devolve na tela).
import { redirect } from "next/navigation";
import { requireUser, type SessaoUsuario } from "./auth";
import { AREA_NOME, podeVerArea, podeVerRota, urlSemAcesso, type Area } from "./areas";

/**
 * Exige login e acesso à tela `caminho` (ex.: "/tributos/imoveis"); sem acesso, abre "Sem acesso a esta área".
 * `extra`: condição a mais da própria tela (ex.: papel exigido), com o mesmo desfecho.
 */
export async function exigirRota(caminho: string, extra?: (u: SessaoUsuario) => boolean): Promise<SessaoUsuario> {
  const u = await requireUser();
  if (!podeVerRota(u, caminho) || (extra && !extra(u))) redirect(urlSemAcesso(caminho));
  return u;
}

export class ErroArea extends Error {}

/**
 * Para server actions: a pessoa precisa ver alguma das áreas indicadas. Lança `Erro` (a classe de erro do
 * módulo, para que a ação devolva a mensagem na tela) com uma explicação em linguagem simples.
 */
export function exigirAreaNaAcao(u: SessaoUsuario, areas: Area[], Erro: new (mensagem: string) => Error = ErroArea): void {
  if (!areas.some((a) => podeVerArea(u, a)))
    throw new Erro(`Esta ação é da área de ${areas.map((a) => AREA_NOME[a]).join(" ou ")}, e o seu setor não tem acesso a ela.`);
}

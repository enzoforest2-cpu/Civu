import Link from "next/link";
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { Check, Minus, ShieldAlert, ShieldCheck } from "lucide-react";
import { db } from "@/db";
import { setores as tSetores, tiposProcesso, usuarios as tUsuarios } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { CPF_ATENDIMENTO_DIGITAL } from "@/lib/engine";
import { fmtDataHora } from "@/lib/dates";
import { PAPEIS, PAPEL_NOME, nomeEtapa, type Papel, type WorkflowDef } from "@/lib/workflow";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Avatar, Cabecalho, Chip, Panel, Vazio } from "@/components/ui";
import { ACOES_MATRIZ, pode } from "@/modulos/gestao/permissoes";
import { trilha, ultimaVerificacao } from "@/modulos/gestao/auditoria";
import { alternarUsuarioAction, atualizarAcessoAction, verificarIntegridadeAction } from "@/modulos/gestao/acoes";

export const metadata = { title: "Governança · Civu" };

const ABAS = [
  { chave: "matriz", rotulo: "Permissões" },
  { chave: "usuarios", rotulo: "Usuários e papéis" },
  { chave: "trilha", rotulo: "Trilha de auditoria" },
  { chave: "integridade", rotulo: "Integridade" },
] as const;
type Aba = (typeof ABAS)[number]["chave"];

const PAPEIS_VISIVEIS = PAPEIS.filter((p) => p !== "ADMIN");
const cpfMascara = (c: string) => (c.length === 11 ? `***.${c.slice(3, 6)}.${c.slice(6, 9)}-**` : c);

type SP = { aba?: string; q?: string; fonte?: string; de?: string; ate?: string };

export default async function GovernancaPage({ searchParams }: { searchParams: Promise<SP> }) {
  const u = await requireUser();
  if (!pode.verGovernanca(u)) redirect("/painel");
  const sp = await searchParams;
  const aba: Aba = (ABAS.find((a) => a.chave === sp.aba)?.chave ?? "matriz") as Aba;

  return (
    <>
      <Cabecalho
        titulo="Governança"
        sub="Quem pode fazer o quê, quem tem acesso, o que aconteceu e se o histórico continua íntegro. Ocultar um botão não protege: cada permissão é conferida no servidor."
      />
      <nav className="mb-6 flex gap-2 overflow-x-auto pb-1" aria-label="Seções de governança">
        {ABAS.map((a) => (
          <Link
            key={a.chave}
            href={`/governanca?aba=${a.chave}`}
            aria-current={aba === a.chave ? "page" : undefined}
            className={`shrink-0 rounded-full border px-4 py-2 text-[14px] font-medium transition-colors ${
              aba === a.chave ? "border-ink bg-ink text-white" : "border-line bg-white text-ink-2 hover:border-line-2 hover:text-ink"
            }`}
          >
            {a.rotulo}
          </Link>
        ))}
      </nav>
      {aba === "matriz" && <Matriz municipioId={u.municipioId} />}
      {aba === "usuarios" && <Usuarios municipioId={u.municipioId} admin={pode.administrarUsuarios(u)} euId={u.id} />}
      {aba === "trilha" && <Trilha municipioId={u.municipioId} sp={sp} />}
      {aba === "integridade" && <Integridade municipioId={u.municipioId} podeVerificar={pode.verificarIntegridade(u)} />}
    </>
  );
}

function Marca({ sim }: { sim: boolean }) {
  return sim ? (
    <span className="relative inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand-soft text-brand-2" title="Permitido">
      <Check size={14} strokeWidth={3} />
      <span className="sr-only">Permitido</span>
    </span>
  ) : (
    <span className="relative inline-flex h-6 w-6 items-center justify-center text-line-2" title="Não permitido">
      <Minus size={14} />
      <span className="sr-only">Não permitido</span>
    </span>
  );
}

async function Matriz({ municipioId }: { municipioId: string }) {
  const tipos = await db.query.tiposProcesso.findMany({ where: eq(tiposProcesso.municipioId, municipioId), orderBy: asc(tiposProcesso.nome) });
  const ativos = tipos.filter((t) => t.ativo);
  return (
    <div className="space-y-6">
      <Panel title="Ações da plataforma" pad={false}>
        <div className="overflow-x-auto">
          <table className="lista">
            <thead>
              <tr>
                <th className="min-w-[260px]">Ação</th>
                {PAPEIS.map((p) => (
                  <th key={p} className="text-center !text-[12px] leading-tight whitespace-normal" style={{ minWidth: 78 }}>
                    {PAPEL_NOME[p]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ACOES_MATRIZ.map((a) => (
                <tr key={a.acao}>
                  <td>
                    <div className="text-[12px] font-semibold tracking-wide text-ink-3 uppercase">{a.grupo}</div>
                    <div className="text-ink">{a.acao}</div>
                    {a.limite && <div className="text-[12.5px] text-ink-3">{a.limite}</div>}
                  </td>
                  {PAPEIS.map((p) => (
                    <td key={p} className="text-center">
                      <Marca sim={a.papeis === "TODOS" || a.papeis.includes(p) || p === "ADMIN"} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-6 pt-3 pb-5 text-[12.5px] leading-snug text-ink-3">
          Atenção: nesta versão o papel de administrador passa em todas as checagens do servidor, inclusive nas etapas dos fluxos. O documento de produto pede que o administrador
          configure acessos sem acessar tudo por padrão; separar essas competências é uma pendência registrada para a próxima versão. Ninguém, nem o administrador, apaga trilhas.
        </p>
      </Panel>

      {ativos.map((t) => {
        const def = t.definicao as WorkflowDef;
        return (
          <Panel key={t.id} title={`Quem age em cada etapa: ${t.nome}`} pad={false}>
            <div className="overflow-x-auto">
              <table className="lista">
                <thead>
                  <tr>
                    <th className="min-w-[220px]">Etapa</th>
                    <th>Setor</th>
                    {PAPEIS_VISIVEIS.map((p) => (
                      <th key={p} className="text-center !text-[12px] leading-tight whitespace-normal" style={{ minWidth: 74 }}>
                        {PAPEL_NOME[p]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {def.estados
                    .filter((e) => !e.final)
                    .map((e) => (
                      <tr key={e.chave}>
                        <td className="text-ink">{nomeEtapa(e.nome)}</td>
                        <td className="text-[13px] whitespace-nowrap text-ink-2">{e.setor === "LIVRE" ? "Livre" : e.setor === null ? "Requisitante" : e.setor}</td>
                        {PAPEIS_VISIVEIS.map((p) => (
                          <td key={p} className="text-center">
                            <Marca sim={e.papeis.includes(p as Papel)} />
                          </td>
                        ))}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <p className="px-6 pb-4 text-[12.5px] text-ink-3">O administrador pode agir em qualquer etapa para correções, e cada ação dele fica na trilha do processo.</p>
          </Panel>
        );
      })}
    </div>
  );
}

async function Usuarios({ municipioId, admin, euId }: { municipioId: string; admin: boolean; euId: string }) {
  const [lista, setores] = await Promise.all([
    db.query.usuarios.findMany({ where: eq(tUsuarios.municipioId, municipioId), with: { setor: true }, orderBy: asc(tUsuarios.nome) }),
    db.query.setores.findMany({ where: eq(tSetores.municipioId, municipioId), orderBy: asc(tSetores.nome) }),
  ]);
  const humanos = lista.filter((x) => x.cpf !== CPF_ATENDIMENTO_DIGITAL);
  return (
    <Panel title={`${humanos.length} usuários · ${humanos.filter((x) => x.ativo).length} ativos`}>
      {!admin && <p className="mb-3 text-[13.5px] text-ink-3">Consulta. Só o administrador ativa, desativa ou troca setor e papéis.</p>}
      <ul className="divide-y divide-line">
        {humanos.map((x) => {
          const editavel = admin && x.id !== euId;
          return (
            <li key={x.id} className={`py-4 ${x.ativo ? "" : "opacity-70"}`}>
              <div className="flex flex-wrap items-start gap-3">
                <Avatar nome={x.nome} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink">{x.nome}</span>
                    {!x.ativo && <Chip tone="bad">Desativado</Chip>}
                    {x.id === euId && <Chip tone="brand">Você</Chip>}
                  </div>
                  <div className="text-[13px] text-ink-3">
                    <span className="tnum">{cpfMascara(x.cpf)}</span> · {x.cargo ?? "Sem cargo"} · {x.setor?.nome ?? "Sem setor"}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {(x.papeis as Papel[]).map((p) => (
                      <Chip key={p} tone={p === "ADMIN" ? "warn" : "neutral"}>
                        {PAPEL_NOME[p] ?? p}
                      </Chip>
                    ))}
                  </div>
                </div>
                {editavel && (
                  <ActionForm action={alternarUsuarioAction} resetOnOk={false}>
                    <input type="hidden" name="usuarioId" value={x.id} />
                    <SubmitButton className={`btn !py-1.5 text-[13px] ${x.ativo ? "btn-danger" : "btn-quiet"}`}>{x.ativo ? "Desativar" : "Reativar"}</SubmitButton>
                  </ActionForm>
                )}
              </div>
              {editavel && (
                <details className="mt-3 ml-0 sm:ml-12">
                  <summary className="cursor-pointer text-[13.5px] font-semibold text-brand-2">Alterar setor e papéis</summary>
                  <ActionForm action={atualizarAcessoAction} resetOnOk={false} className="mt-3 space-y-3 rounded-xl bg-sunken p-4">
                    <input type="hidden" name="usuarioId" value={x.id} />
                    <div>
                      <label className="label" htmlFor={`setor-${x.id}`}>
                        Setor
                      </label>
                      <select id={`setor-${x.id}`} name="setorId" defaultValue={x.setorId ?? ""} className="input sm:max-w-sm">
                        {setores.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.nome}
                          </option>
                        ))}
                      </select>
                    </div>
                    <fieldset>
                      <legend className="label">Papéis</legend>
                      <div className="grid grid-cols-[minmax(0,1fr)] gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                        {PAPEIS.map((p) => (
                          <label key={p} className="inline-flex items-center gap-2 text-[13.5px] text-ink-2">
                            <input type="checkbox" name="papeis" value={p} defaultChecked={x.papeis.includes(p)} className="h-4 w-4 accent-[var(--color-brand)]" />
                            {PAPEL_NOME[p]}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <div>
                      <label className="label" htmlFor={`just-${x.id}`}>
                        Motivo da alteração
                      </label>
                      <input id={`just-${x.id}`} name="justificativa" className="input" placeholder="Ex.: Portaria 112/2026 — designação como fiscal de contrato" />
                    </div>
                    <SubmitButton>Salvar alteração</SubmitButton>
                  </ActionForm>
                </details>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function parseData(s?: string, fim = false) {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return new Date(`${s}T${fim ? "23:59:59" : "00:00:00"}-03:00`);
}

async function Trilha({ municipioId, sp }: { municipioId: string; sp: SP }) {
  const fonte = sp.fonte === "PROCESSO" || sp.fonte === "ADMINISTRATIVA" ? sp.fonte : undefined;
  const itens = await trilha(municipioId, { q: sp.q, fonte, de: parseData(sp.de), ate: parseData(sp.ate, true), limite: 50 });
  return (
    <>
      <form action="/governanca" className="panel mb-4 grid grid-cols-[minmax(0,1fr)] gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
        <input type="hidden" name="aba" value="trilha" />
        <div>
          <label className="label" htmlFor="t-q">
            Pesquisar
          </label>
          <input id="t-q" name="q" defaultValue={sp.q ?? ""} className="input" placeholder="Número, nome, ação ou palavra" />
        </div>
        <div>
          <label className="label" htmlFor="t-fonte">
            Origem
          </label>
          <select id="t-fonte" name="fonte" defaultValue={fonte ?? ""} className="input">
            <option value="">Tudo</option>
            <option value="PROCESSO">Eventos de processos</option>
            <option value="ADMINISTRATIVA">Administrativa</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="t-de">
            De
          </label>
          <input id="t-de" name="de" type="date" defaultValue={sp.de ?? ""} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="t-ate">
            Até
          </label>
          <input id="t-ate" name="ate" type="date" defaultValue={sp.ate ?? ""} className="input" />
        </div>
        <button className="btn btn-primary">Pesquisar</button>
      </form>
      <Panel pad={false}>
        {itens.length === 0 ? (
          <div className="p-6">
            <Vazio>Nenhum registro encontrado com esses filtros.</Vazio>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="lista">
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Quem</th>
                  <th>Ação</th>
                  <th>Objeto</th>
                  <th>Detalhe</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((i) => (
                  <tr key={i.fonte + i.id}>
                    <td className="tnum whitespace-nowrap">{fmtDataHora(i.quando)}</td>
                    <td className="whitespace-nowrap">{i.autor}</td>
                    <td className="whitespace-nowrap">
                      <div className="text-ink">{i.acao}</div>
                      <div className="text-[12px] text-ink-3">{i.fonte === "PROCESSO" ? "Processo" : "Administrativa"}</div>
                    </td>
                    <td className="min-w-[220px]">
                      {i.href ? (
                        <Link href={i.href} className="text-brand-2 hover:underline">
                          {i.objeto}
                        </Link>
                      ) : (
                        <span className="text-ink">{i.objeto}</span>
                      )}
                    </td>
                    <td className="min-w-[220px] text-[13px] text-ink-2">
                      {i.detalhe ?? "—"}
                      {i.hash && <div className="tnum text-[12px] text-ink-3" title={i.hash}>hash {i.hash.slice(0, 12)}…</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <p className="mt-3 text-[12.5px] text-ink-3">Mostrando até 50 registros, mais recentes primeiro. Nada aqui pode ser editado ou apagado; correções entram como novos registros.</p>
    </>
  );
}

async function Integridade({ municipioId, podeVerificar }: { municipioId: string; podeVerificar: boolean }) {
  const ult = await ultimaVerificacao(municipioId);
  const ok = ult && ult.falhas.length === 0;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Panel title="Cadeia de hash dos processos">
        <p className="text-[14px] leading-relaxed text-ink-2">
          Cada evento de processo guarda o hash do evento anterior. A verificação recalcula a cadeia de todos os processos do município e aponta o primeiro evento que não confere, se
          houver.
        </p>
        {podeVerificar ? (
          <ActionForm action={verificarIntegridadeAction} resetOnOk={false} className="mt-4">
            <SubmitButton pendingText="Verificando todos os processos…">
              <ShieldCheck size={16} /> Verificar agora
            </SubmitButton>
          </ActionForm>
        ) : (
          <p className="mt-4 text-[13px] text-ink-3">Somente o controle interno ou o administrador podem executar a verificação.</p>
        )}
        <p className="mt-4 text-[12.5px] leading-snug text-ink-3">
          O encadeamento revela alterações, mas sozinho não impede que um administrador do banco de dados altere registros. Por isso a verificação deve ser feita com regularidade e
          o resultado fica na auditoria.
        </p>
      </Panel>
      <Panel title="Última verificação">
        {!ult ? (
          <Vazio>Nenhuma verificação registrada ainda.</Vazio>
        ) : (
          <div>
            <div className={`flex items-center gap-3 rounded-xl p-4 ${ok ? "bg-ok-soft" : "bg-bad-soft"}`}>
              {ok ? <ShieldCheck size={26} className="text-ok" /> : <ShieldAlert size={26} className="text-bad" />}
              <div>
                <div className={`font-semibold ${ok ? "text-ok" : "text-bad"}`}>{ok ? "Cadeia íntegra" : `${ult.falhas.length} processo(s) com cadeia quebrada`}</div>
                <div className="text-[13px] text-ink-2">
                  {fmtDataHora(ult.em)} por {ult.autor}
                </div>
              </div>
            </div>
            <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
              <div className="rounded-xl bg-sunken p-3">
                <dt className="text-[12px] text-ink-3">Processos</dt>
                <dd className="display tnum text-[22px] font-semibold">{ult.processos}</dd>
              </div>
              <div className="rounded-xl bg-sunken p-3">
                <dt className="text-[12px] text-ink-3">Eventos</dt>
                <dd className="display tnum text-[22px] font-semibold">{ult.eventos}</dd>
              </div>
              <div className="rounded-xl bg-sunken p-3">
                <dt className="text-[12px] text-ink-3">Íntegros</dt>
                <dd className="display tnum text-[22px] font-semibold">{ult.integros}</dd>
              </div>
            </dl>
            {ult.falhas.length > 0 && (
              <ul className="mt-4 space-y-1 text-[13.5px]">
                {ult.falhas.map((f) => (
                  <li key={f.processoId}>
                    <Link href={`/processos/${f.processoId}`} className="tnum font-semibold text-brand-2 hover:underline">
                      {f.numero}
                    </Link>{" "}
                    <span className="text-bad">não confere a partir do evento {f.seq}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Panel>
    </div>
  );
}

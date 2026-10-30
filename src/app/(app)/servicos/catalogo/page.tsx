import { requireUser, temPapel } from "@/lib/auth";
import { catalogo, equipes as listarEquipes, todosSetores } from "@/modulos/servicos/dados";
import { criarEquipeAction, salvarServicoAction } from "@/modulos/servicos/acoes";
import { CATEGORIAS } from "@/modulos/servicos/constantes";
import { IconeServico } from "@/modulos/servicos/icones";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Cabecalho, Chip, Panel, Vazio } from "@/components/ui";

type Setor = { id: string; nome: string };

export default async function CatalogoServicos() {
  const u = await requireUser();
  const [cat, eqs, setores] = await Promise.all([catalogo(u.municipioId, false), listarEquipes(u.municipioId), todosSetores(u.municipioId)]);
  const configura = temPapel(u, "ADMIN", "SECRETARIO");
  const editavel = (setorId: string) => configura && (temPapel(u, "ADMIN") || u.setorId === setorId);

  return (
    <>
      <Cabecalho
        titulo="Catálogo de serviços e equipes"
        sub="O que o cidadão pode pedir, qual secretaria responde por cada serviço e em quanto tempo. As mudanças valem para os próximos pedidos."
      />

      <Panel title="Serviços oferecidos" pad={false}>
        {cat.length === 0 ? (
          <div className="p-6">
            <Vazio>Nenhum serviço cadastrado.</Vazio>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {cat.map((c) => (
              <li key={c.id} className="px-6 py-4">
                <details className="group">
                  <summary className="flex flex-wrap items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
                      <IconeServico categoria={c.categoria} size={17} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-ink">{c.nome}</span>
                      <span className="block text-[13px] text-ink-2">
                        {c.setor.nome} · {CATEGORIAS[c.categoria] ?? c.categoria}
                      </span>
                    </span>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <Chip tone="brand">
                        {c.slaDiasUteis} {c.slaDiasUteis === 1 ? "dia útil" : "dias úteis"}
                      </Chip>
                      {c.exigeFoto && <Chip>Pede foto</Chip>}
                      {!c.ativo && <Chip tone="warn">Fora do portal</Chip>}
                      {editavel(c.setorId) && <span className="text-[13px] font-semibold text-brand group-open:hidden">Editar</span>}
                    </span>
                  </summary>
                  {editavel(c.setorId) && (
                    <div className="mt-4 rounded-xl bg-sunken/60 p-4">
                      <FormServico setores={setores} valor={c} />
                    </div>
                  )}
                </details>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {configura && (
        <Panel title="Incluir serviço" className="mt-6">
          <FormServico setores={setores} />
        </Panel>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Panel title="Equipes de campo" pad={false}>
          {eqs.length === 0 ? (
            <div className="p-6">
              <Vazio>Nenhuma equipe cadastrada.</Vazio>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="lista">
                <thead>
                  <tr>
                    <th>Equipe</th>
                    <th>Secretaria</th>
                    <th>Membros e recursos</th>
                  </tr>
                </thead>
                <tbody>
                  {eqs.map((e) => (
                    <tr key={e.id}>
                      <td className="min-w-[180px]">
                        <div className="font-medium text-ink">{e.nome}</div>
                        {e.encarregado && <div className="text-[12.5px] text-ink-3">Usa a tela de campo: {e.encarregado.nome}</div>}
                      </td>
                      <td className="text-[13.5px] whitespace-nowrap">{e.setor.sigla}</td>
                      <td className="min-w-[260px] text-[13.5px] text-ink-2">{e.membros ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
        <Panel title="Nova equipe">
          <ActionForm action={criarEquipeAction}>
            <label className="label" htmlFor="eq-nome">
              Nome
            </label>
            <input id="eq-nome" name="nome" className="input" required placeholder="Ex.: Limpeza Urbana – Turma B" />
            <label className="label mt-3" htmlFor="eq-setor">
              Secretaria
            </label>
            <select id="eq-setor" name="setorId" className="input" defaultValue={u.setorId ?? ""} required>
              {setores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </select>
            <label className="label mt-3" htmlFor="eq-membros">
              Membros e recursos
            </label>
            <textarea id="eq-membros" name="membros" className="input" rows={3} placeholder="Nomes, funções e veículos" />
            <SubmitButton className="btn btn-primary mt-3" pendingText="Salvando…">
              Cadastrar equipe
            </SubmitButton>
          </ActionForm>
        </Panel>
      </div>
    </>
  );
}

function FormServico({
  setores,
  valor,
}: {
  setores: Setor[];
  valor?: { id: string; nome: string; descricao: string | null; categoria: string; setorId: string; slaDiasUteis: number; exigeFoto: boolean; ativo: boolean };
}) {
  const p = valor?.id ?? "novo";
  return (
    <ActionForm action={salvarServicoAction} resetOnOk={!valor}>
      {valor && <input type="hidden" name="id" value={valor.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor={`nome-${p}`}>
            Nome para o cidadão
          </label>
          <input id={`nome-${p}`} name="nome" className="input" required defaultValue={valor?.nome} />
        </div>
        <div>
          <label className="label" htmlFor={`cat-${p}`}>
            Categoria
          </label>
          <select id={`cat-${p}`} name="categoria" className="input" defaultValue={valor?.categoria ?? "VIAS"}>
            {Object.entries(CATEGORIAS).map(([k, r]) => (
              <option key={k} value={k}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor={`desc-${p}`}>
            Explicação curta
          </label>
          <input id={`desc-${p}`} name="descricao" className="input" defaultValue={valor?.descricao ?? ""} placeholder="Quando pedir este serviço" />
        </div>
        <div>
          <label className="label" htmlFor={`setor-${p}`}>
            Secretaria responsável
          </label>
          <select id={`setor-${p}`} name="setorId" className="input" defaultValue={valor?.setorId ?? ""} required>
            {setores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor={`sla-${p}`}>
            Prazo-alvo (dias úteis)
          </label>
          <input id={`sla-${p}`} name="sla" type="number" min={1} max={120} className="input" required defaultValue={valor?.slaDiasUteis ?? 10} />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-5 text-[14px] text-ink">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="exigeFoto" defaultChecked={valor?.exigeFoto ?? false} className="h-4 w-4 accent-[var(--color-brand)]" /> Pede foto
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="ativo" defaultChecked={valor?.ativo ?? true} className="h-4 w-4 accent-[var(--color-brand)]" /> Disponível no portal
        </label>
      </div>
      <SubmitButton className="btn btn-primary mt-4" pendingText="Salvando…">
        {valor ? "Salvar alterações" : "Incluir no catálogo"}
      </SubmitButton>
    </ActionForm>
  );
}

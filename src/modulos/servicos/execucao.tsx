// Blocos de execução de uma OS (iniciar, materiais, concluir), usados na tela da OS e na tela de campo.
import { Play, Trash2 } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import type { MaterialUsado } from "@/db/schema";
import { ordemAction } from "./acoes";

export function Iniciar({ ordemId, grande = false }: { ordemId: string; grande?: boolean }) {
  return (
    <ActionForm action={ordemAction}>
      <input type="hidden" name="ordemId" value={ordemId} />
      <input type="hidden" name="acao" value="iniciar" />
      <SubmitButton className={`btn btn-primary ${grande ? "btn-lg w-full" : ""}`} pendingText="Iniciando…">
        <Play size={17} /> Iniciar execução
      </SubmitButton>
    </ActionForm>
  );
}

export function Materiais({ ordemId, materiais, editavel }: { ordemId: string; materiais: MaterialUsado[]; editavel: boolean }) {
  return (
    <div>
      {materiais.length === 0 ? (
        <p className="text-[14px] text-ink-3">Nenhum material registrado.</p>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {materiais.map((m, i) => (
            <li key={i} className="flex items-center justify-between gap-3 px-3 py-2 text-[14px]">
              <span className="min-w-0 text-ink">{m.item}</span>
              <span className="flex items-center gap-2">
                <span className="tnum whitespace-nowrap text-ink-2">{m.quantidade}</span>
                {editavel && (
                  <ActionForm action={ordemAction}>
                    <input type="hidden" name="ordemId" value={ordemId} />
                    <input type="hidden" name="acao" value="remover-material" />
                    <input type="hidden" name="indice" value={i} />
                    <SubmitButton className="rounded-md p-1.5 text-ink-3 hover:bg-bad-soft hover:text-bad" pendingText="…">
                      <Trash2 size={15} />
                      <span className="sr-only">Remover {m.item}</span>
                    </SubmitButton>
                  </ActionForm>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {editavel && (
        <ActionForm action={ordemAction} className="mt-3">
          <input type="hidden" name="ordemId" value={ordemId} />
          <input type="hidden" name="acao" value="material" />
          <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-2">
            <div>
              <label className="sr-only" htmlFor={`item-${ordemId}`}>
                Material
              </label>
              <input id={`item-${ordemId}`} name="item" className="input" placeholder="Material (ex.: lâmpada LED 100 W)" required />
            </div>
            <div>
              <label className="sr-only" htmlFor={`qtd-${ordemId}`}>
                Quantidade
              </label>
              <input id={`qtd-${ordemId}`} name="quantidade" className="input" placeholder="Qtd." required />
            </div>
          </div>
          <SubmitButton className="btn btn-quiet mt-2" pendingText="Registrando…">
            Adicionar material
          </SubmitButton>
        </ActionForm>
      )}
    </div>
  );
}

export function Concluir({ ordemId, grande = false }: { ordemId: string; grande?: boolean }) {
  return (
    <ActionForm action={ordemAction} resetOnOk={false}>
      <input type="hidden" name="ordemId" value={ordemId} />
      <input type="hidden" name="acao" value="concluir" />
      <label className="label" htmlFor={`obs-${ordemId}`}>
        O que foi feito
      </label>
      <textarea
        id={`obs-${ordemId}`}
        name="observacao"
        className="input"
        rows={3}
        required
        minLength={5}
        placeholder="Ex.: serviço feito em todos os endereços da OS; local limpo e sinalização retirada."
      />
      <p className="hint">O cidadão lê este resumo no portal. A foto do serviço feito chega na próxima versão.</p>
      <SubmitButton className={`btn btn-primary mt-2 ${grande ? "btn-lg w-full" : ""}`} pendingText="Concluindo…">
        Concluir OS
      </SubmitButton>
    </ActionForm>
  );
}

// Ações do fiscal sobre uma nota: atestar, glosar e enviar à liquidação. As permissões são checadas de novo no servidor.
import { ActionForm, SubmitButton } from "@/components/action-form";
import { atestarAction, glosarAction, liquidacaoAction } from "./acoes";

export function AcoesNota({
  notaId,
  contratoId,
  situacao,
  podeAtestar,
  podeEnviar,
}: {
  notaId: string;
  contratoId: string;
  situacao: string;
  podeAtestar: boolean;
  podeEnviar: boolean;
}) {
  if (situacao === "AGUARDANDO_ATESTO" && podeAtestar)
    return (
      <div className="flex flex-col gap-2">
        <ActionForm action={atestarAction} className="flex flex-wrap gap-2">
          <input type="hidden" name="notaId" value={notaId} />
          <input type="hidden" name="contratoId" value={contratoId} />
          <SubmitButton className="btn btn-primary !px-3 !py-1.5 text-[13px]" name="enviar" value="1" pendingText="Atestando…">
            Atestar e enviar à liquidação
          </SubmitButton>
          <SubmitButton className="btn btn-quiet !px-3 !py-1.5 text-[13px]" pendingText="Atestando…">
            Só atestar
          </SubmitButton>
        </ActionForm>
        <details className="rounded-lg border border-line open:bg-sunken/50">
          <summary className="px-3 py-1.5 text-[13px] font-semibold text-bad">Glosar (devolver ao fornecedor)</summary>
          <ActionForm action={glosarAction} className="space-y-2 px-3 pb-3">
            <input type="hidden" name="notaId" value={notaId} />
            <input type="hidden" name="contratoId" value={contratoId} />
            <label className="label !mb-1 !text-[12.5px]" htmlFor={`motivo-${notaId}`}>
              O que o fornecedor precisa corrigir
            </label>
            <textarea id={`motivo-${notaId}`} name="motivo" rows={2} className="input text-[14px]" required minLength={15} />
            <SubmitButton className="btn btn-danger !px-3 !py-1.5 text-[13px]" pendingText="Glosando…">
              Glosar nota
            </SubmitButton>
          </ActionForm>
        </details>
      </div>
    );
  if (situacao === "ATESTADA" && podeEnviar)
    return (
      <ActionForm action={liquidacaoAction}>
        <input type="hidden" name="notaId" value={notaId} />
        <input type="hidden" name="contratoId" value={contratoId} />
        <SubmitButton className="btn btn-primary !px-3 !py-1.5 text-[13px]" pendingText="Abrindo processo…">
          Enviar à liquidação
        </SubmitButton>
      </ActionForm>
    );
  return null;
}

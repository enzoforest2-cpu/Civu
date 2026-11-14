"use client";
// Formulários do módulo de repasses e obrigações. A validação e a autorização ficam no servidor (operacoes.ts);
// aqui só o que ajuda a preencher. Valores em reais aceitam o jeito brasileiro (250.000,00), lidos com `numeroBr`.
import { ActionForm, SubmitButton } from "@/components/action-form";
import { criarObrigacaoAction, criarRepasseAction, desvincularProcessoAction, editarObrigacaoAction, editarRepasseAction, registrarEntregaAction, vincularProcessoAction } from "./acoes";
import { PERIODICIDADES, SITUACOES_OBRIGACAO, SITUACOES_REPASSE, TIPOS_REPASSE } from "./regras";

type Opcao = { id: string; rotulo: string };

export type ValoresRepasse = {
  id?: string;
  setorId?: string;
  tipo?: string;
  identificacao?: string | null;
  concedente?: string;
  objeto?: string;
  valorPrevisto?: number;
  valorRecebido?: number;
  assinadoEm?: string | null;
  vigenciaFim?: string | null;
  prazoExecucao?: string | null;
  prazoPrestacaoContas?: string | null;
  situacao?: string;
  observacao?: string | null;
};

const reais = (v: number | undefined) => (v == null ? "" : v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

function Campo({ id, rotulo, dica, children, largo }: { id: string; rotulo: string; dica?: string; children: React.ReactNode; largo?: boolean }) {
  return (
    <div className={largo ? "sm:col-span-2" : ""}>
      <label className="label" htmlFor={id}>
        {rotulo}
      </label>
      {children}
      {dica && (
        <p className="hint" id={`${id}-dica`}>
          {dica}
        </p>
      )}
    </div>
  );
}

export function FormRepasse({ setores, valores = {} }: { setores: Opcao[]; valores?: ValoresRepasse }) {
  const editando = !!valores.id;
  return (
    <ActionForm action={editando ? editarRepasseAction : criarRepasseAction} resetOnOk={false} className="space-y-6">
      {editando && <input type="hidden" name="id" value={valores.id} />}
      <section className="panel p-5 sm:p-6">
        <h2 className="mb-4 text-[16px] font-semibold text-ink">O repasse</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo id="tipo" rotulo="Tipo">
            <select id="tipo" name="tipo" className="input" required defaultValue={valores.tipo ?? ""}>
              <option value="" disabled>
                Escolha
              </option>
              {Object.entries(TIPOS_REPASSE).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.nome}
                </option>
              ))}
            </select>
          </Campo>
          <Campo id="identificacao" rotulo="Número do instrumento ou da emenda (opcional)" dica="Como o concedente identifica: número do convênio, da proposta ou da emenda.">
            <input id="identificacao" name="identificacao" className="input" maxLength={60} defaultValue={valores.identificacao ?? ""} aria-describedby="identificacao-dica" />
          </Campo>
          <Campo id="concedente" rotulo="Concedente (quem repassa)" largo>
            <input id="concedente" name="concedente" className="input" required minLength={3} maxLength={160} defaultValue={valores.concedente ?? ""} placeholder="Ex.: Fundo Nacional de Saúde" />
          </Campo>
          <Campo id="objeto" rotulo="Objeto (para que é o recurso)" largo>
            <textarea id="objeto" name="objeto" className="input" rows={2} required minLength={5} maxLength={300} defaultValue={valores.objeto ?? ""} />
          </Campo>
          <Campo id="setorId" rotulo="Secretaria responsável" dica="A área desta secretaria decide quem vê e quem altera o repasse." largo>
            <select id="setorId" name="setorId" className="input" required defaultValue={valores.setorId ?? (setores.length === 1 ? setores[0].id : "")} aria-describedby="setorId-dica">
              <option value="" disabled>
                Escolha
              </option>
              {setores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.rotulo}
                </option>
              ))}
            </select>
          </Campo>
          <Campo id="situacao" rotulo="Situação" largo>
            <select id="situacao" name="situacao" className="input" required defaultValue={valores.situacao ?? "VIGENTE"}>
              {Object.entries(SITUACOES_REPASSE).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.nome}
                </option>
              ))}
            </select>
          </Campo>
        </div>
      </section>

      <section className="panel p-5 sm:p-6">
        <h2 className="mb-4 text-[16px] font-semibold text-ink">Valores</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo id="valorPrevisto" rotulo="Valor previsto (R$)" dica="Ex.: 250.000,00">
            <input id="valorPrevisto" name="valorPrevisto" className="input tnum" inputMode="decimal" required defaultValue={reais(valores.valorPrevisto)} aria-describedby="valorPrevisto-dica" />
          </Campo>
          <Campo id="valorRecebido" rotulo="Valor já recebido (R$)" dica="O que já entrou na conta do município. Deixe em branco se nada entrou.">
            <input id="valorRecebido" name="valorRecebido" className="input tnum" inputMode="decimal" defaultValue={reais(valores.valorRecebido)} aria-describedby="valorRecebido-dica" />
          </Campo>
        </div>
        <p className="hint mt-3">O que foi contratado, liquidado e pago não se digita: vem dos processos vinculados ao repasse.</p>
      </section>

      <section className="panel p-5 sm:p-6">
        <h2 className="text-[16px] font-semibold text-ink">Datas e prazos</h2>
        <p className="mt-1 mb-4 text-[14px] text-ink-2">O sistema avisa com 30, 15 e 5 dias de antecedência, em dias corridos, e quando o prazo vence.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo id="assinadoEm" rotulo="Assinatura ou publicação">
            <input id="assinadoEm" name="assinadoEm" type="date" className="input tnum" defaultValue={valores.assinadoEm ?? ""} />
          </Campo>
          <Campo id="vigenciaFim" rotulo="Fim da vigência">
            <input id="vigenciaFim" name="vigenciaFim" type="date" className="input tnum" defaultValue={valores.vigenciaFim ?? ""} />
          </Campo>
          <Campo id="prazoExecucao" rotulo="Prazo de execução">
            <input id="prazoExecucao" name="prazoExecucao" type="date" className="input tnum" defaultValue={valores.prazoExecucao ?? ""} />
          </Campo>
          <Campo id="prazoPrestacaoContas" rotulo="Prazo da prestação de contas">
            <input id="prazoPrestacaoContas" name="prazoPrestacaoContas" type="date" className="input tnum" defaultValue={valores.prazoPrestacaoContas ?? ""} />
          </Campo>
          <Campo id="observacao" rotulo="Observação (opcional)" largo>
            <textarea id="observacao" name="observacao" className="input" rows={3} maxLength={600} defaultValue={valores.observacao ?? ""} />
          </Campo>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-end gap-3">
        <SubmitButton className="btn btn-primary btn-lg" pendingText="Salvando…">
          {editando ? "Salvar alterações" : "Cadastrar repasse"}
        </SubmitButton>
      </div>
    </ActionForm>
  );
}

export function FormVincular({ repasseId, processos }: { repasseId: string; processos: { id: string; rotulo: string; daArea: boolean }[] }) {
  const daArea = processos.filter((p) => p.daArea);
  const outros = processos.filter((p) => !p.daArea);
  return (
    <ActionForm action={vincularProcessoAction} className="space-y-3">
      <input type="hidden" name="repasseId" value={repasseId} />
      <div>
        <label className="label" htmlFor="processoId">
          Processo de compra ou de pagamento
        </label>
        <select id="processoId" name="processoId" className="input" required defaultValue="">
          <option value="" disabled>
            Escolha o processo
          </option>
          {daArea.length > 0 && (
            <optgroup label="Abertos pela área do repasse">
              {daArea.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.rotulo}
                </option>
              ))}
            </optgroup>
          )}
          {outros.length > 0 && (
            <optgroup label="Abertos por outros setores">
              {outros.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.rotulo}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="motivo-vinculo">
          Observação (opcional)
        </label>
        <input id="motivo-vinculo" name="motivo" className="input" maxLength={200} placeholder="Ex.: despesa prevista no plano de trabalho, item 3" />
      </div>
      <SubmitButton className="btn btn-primary" pendingText="Vinculando…">
        Vincular processo
      </SubmitButton>
    </ActionForm>
  );
}

export function FormDesvincular({ repasseId, processoId, numero }: { repasseId: string; processoId: string; numero: string }) {
  return (
    <ActionForm action={desvincularProcessoAction} className="mt-2 space-y-2">
      <input type="hidden" name="repasseId" value={repasseId} />
      <input type="hidden" name="processoId" value={processoId} />
      <label className="label" htmlFor={`motivo-${processoId}`}>
        Por que desvincular o processo {numero}?
      </label>
      <input id={`motivo-${processoId}`} name="motivo" className="input" required minLength={10} maxLength={300} />
      <SubmitButton className="btn btn-quiet" pendingText="Desvinculando…">
        Desvincular
      </SubmitButton>
    </ActionForm>
  );
}

export type ValoresObrigacao = {
  id?: string;
  setorId?: string;
  nome?: string;
  destinatario?: string;
  periodicidade?: string;
  proximoVencimento?: string;
  responsavelId?: string | null;
  situacao?: string;
  observacao?: string | null;
};

export function FormObrigacao({ setores, pessoas, valores = {} }: { setores: Opcao[]; pessoas: Opcao[]; valores?: ValoresObrigacao }) {
  const editando = !!valores.id;
  return (
    <ActionForm action={editando ? editarObrigacaoAction : criarObrigacaoAction} resetOnOk={false} className="space-y-4">
      {editando && <input type="hidden" name="id" value={valores.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo id="nome" rotulo="O que se entrega" largo>
          <input id="nome" name="nome" className="input" required minLength={3} maxLength={160} defaultValue={valores.nome ?? ""} placeholder="Ex.: Relatório de gestão do fundo municipal" />
        </Campo>
        <Campo id="destinatario" rotulo="A quem se entrega" largo>
          <input id="destinatario" name="destinatario" className="input" required minLength={3} maxLength={160} defaultValue={valores.destinatario ?? ""} placeholder="Ex.: Conselho municipal, Tribunal de Contas, ministério" />
        </Campo>
        <Campo id="setorId" rotulo="Secretaria responsável">
          <select id="setorId" name="setorId" className="input" required defaultValue={valores.setorId ?? (setores.length === 1 ? setores[0].id : "")}>
            <option value="" disabled>
              Escolha
            </option>
            {setores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.rotulo}
              </option>
            ))}
          </select>
        </Campo>
        <Campo id="responsavelId" rotulo="Pessoa responsável (opcional)">
          <select id="responsavelId" name="responsavelId" className="input" defaultValue={valores.responsavelId ?? ""}>
            <option value="">Ninguém definido</option>
            {pessoas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.rotulo}
              </option>
            ))}
          </select>
        </Campo>
        <Campo id="periodicidade" rotulo="Periodicidade">
          <select id="periodicidade" name="periodicidade" className="input" required defaultValue={valores.periodicidade ?? "MENSAL"}>
            {Object.entries(PERIODICIDADES).map(([k, v]) => (
              <option key={k} value={k}>
                {v.nome}
              </option>
            ))}
          </select>
        </Campo>
        <Campo id="proximoVencimento" rotulo="Próximo vencimento" dica="Use o prazo oficial do órgão que recebe. Na dúvida, confirme com ele.">
          <input id="proximoVencimento" name="proximoVencimento" type="date" className="input tnum" required defaultValue={valores.proximoVencimento ?? ""} aria-describedby="proximoVencimento-dica" />
        </Campo>
        <Campo id="situacao" rotulo="Situação">
          <select id="situacao" name="situacao" className="input" defaultValue={valores.situacao ?? "PENDENTE"}>
            {Object.entries(SITUACOES_OBRIGACAO).map(([k, v]) => (
              <option key={k} value={k}>
                {v.nome}
              </option>
            ))}
          </select>
        </Campo>
        <Campo id="observacao" rotulo="Observação (opcional)" largo>
          <textarea id="observacao" name="observacao" className="input" rows={2} maxLength={600} defaultValue={valores.observacao ?? ""} />
        </Campo>
      </div>
      <div className="flex justify-end">
        <SubmitButton className="btn btn-primary" pendingText="Salvando…">
          {editando ? "Salvar alterações" : "Cadastrar obrigação"}
        </SubmitButton>
      </div>
    </ActionForm>
  );
}

export function FormEntrega({ id, hoje }: { id: string; hoje: string }) {
  return (
    <ActionForm action={registrarEntregaAction} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <div className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
        <div>
          <label className="label" htmlFor={`entregueEm-${id}`}>
            Entregue em
          </label>
          <input id={`entregueEm-${id}`} name="entregueEm" type="date" className="input tnum" required defaultValue={hoje} max={hoje} />
        </div>
        <div>
          <label className="label" htmlFor={`comprovante-${id}`}>
            Comprovante
          </label>
          <input id={`comprovante-${id}`} name="comprovante" className="input" required minLength={3} maxLength={160} placeholder="Número do recibo, do protocolo ou do envio" />
        </div>
      </div>
      <SubmitButton className="btn btn-primary" pendingText="Registrando…">
        Registrar entrega
      </SubmitButton>
    </ActionForm>
  );
}

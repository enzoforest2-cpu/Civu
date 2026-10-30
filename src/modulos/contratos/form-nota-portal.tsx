"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { enviarNotaPortalAction } from "./acoes";

type ContratoOpcao = { id: string; rotulo: string; disponivel: string; medicoes: { id: string; rotulo: string; valor: string }[] };

/** Envio de nota fiscal pelo fornecedor (registro simulado, sem integração com NF-e/NFS-e). */
export function FormNotaPortal({ contratos, inicial, mesAtual, hoje }: { contratos: ContratoOpcao[]; inicial?: string; mesAtual: string; hoje: string }) {
  const [id, setId] = useState(inicial && contratos.some((c) => c.id === inicial) ? inicial : (contratos[0]?.id ?? ""));
  const [valor, setValor] = useState("");
  const [numero, setNumero] = useState("");
  const [descricao, setDescricao] = useState("");
  const c = contratos.find((x) => x.id === id);
  return (
    <ActionForm action={enviarNotaPortalAction} className="space-y-4">
      <div>
        <label className="label" htmlFor="contratoId">
          Contrato
        </label>
        <select id="contratoId" name="contratoId" className="input" value={id} onChange={(e) => setId(e.target.value)} required>
          {contratos.map((x) => (
            <option key={x.id} value={x.id}>
              {x.rotulo}
            </option>
          ))}
        </select>
        {c && <p className="hint">Você pode faturar até {c.disponivel} neste contrato (saldo menos notas ainda em atesto).</p>}
      </div>
      {c && c.medicoes.length > 0 && (
        <div>
          <label className="label" htmlFor="medicaoId">
            Medição a que a nota se refere
          </label>
          <select
            id="medicaoId"
            name="medicaoId"
            className="input"
            defaultValue=""
            onChange={(e) => {
              const m = c.medicoes.find((x) => x.id === e.target.value);
              if (m) setValor(m.valor);
            }}
          >
            <option value="">Nenhuma</option>
            {c.medicoes.map((m) => (
              <option key={m.id} value={m.id}>
                {m.rotulo}
              </option>
            ))}
          </select>
          <p className="hint">Em obras, a nota deve ter o mesmo valor do boletim de medição conferido pelo fiscal.</p>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="numero">
            Número da nota fiscal
          </label>
          <input id="numero" name="numero" className="input tnum" required inputMode="numeric" value={numero} onChange={(e) => setNumero(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="valor">
            Valor (R$)
          </label>
          <input id="valor" name="valor" className="input tnum" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor="competencia">
            Mês de referência
          </label>
          <input id="competencia" name="competencia" type="month" className="input" defaultValue={mesAtual} required />
        </div>
        <div>
          <label className="label" htmlFor="emitidaEm">
            Data de emissão
          </label>
          <input id="emitidaEm" name="emitidaEm" type="date" className="input" max={hoje} defaultValue={hoje} required />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="descricao">
          O que foi entregue (opcional)
        </label>
        <textarea id="descricao" name="descricao" rows={2} className="input" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: 40 sacos de cimento entregues no almoxarifado em 12/10" />
      </div>
      <div className="rounded-lg bg-sunken px-3 py-2 text-[13px] text-ink-2">
        Demonstração: a nota é registrada sem consulta à Receita (NF-e) nem ao sistema de NFS-e do município, e não é preciso anexar o arquivo XML ou PDF.
      </div>
      <SubmitButton className="btn btn-primary btn-lg" pendingText="Enviando…">
        Enviar nota ao fiscal
      </SubmitButton>
    </ActionForm>
  );
}

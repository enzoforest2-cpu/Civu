"use client";

import { useState } from "react";
import { Camera, LocateFixed } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { pedirServicoAction } from "./acoes";

/** Formulário de pedido de serviço no portal. Coordenadas vêm do próprio aparelho, se a pessoa quiser; nenhum serviço externo é chamado. */
export function FormPedido({
  servicoId,
  exigeFoto,
  bairros,
  endereco,
}: {
  servicoId: string;
  exigeFoto: boolean;
  bairros: string[];
  endereco?: { logradouro?: string; numero?: string; bairro?: string };
}) {
  const [coord, setCoord] = useState<{ lat: string; lng: string }>({ lat: "", lng: "" });
  const [aviso, setAviso] = useState("");
  const [end, setEnd] = useState({ logradouro: "", numero: "", bairro: "" });

  function localizar() {
    if (!navigator.geolocation) return setAviso("Este aparelho não informa a localização. Preencha só o endereço.");
    setAviso("Buscando a localização do aparelho…");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setCoord({ lat: p.coords.latitude.toFixed(6), lng: p.coords.longitude.toFixed(6) });
        setAviso("Localização do aparelho anotada. Confira também o endereço.");
      },
      () => setAviso("Não foi possível obter a localização. Preencha só o endereço."),
      { timeout: 8000 },
    );
  }

  return (
    <ActionForm action={pedirServicoAction} className="space-y-5" resetOnOk={false}>
      <input type="hidden" name="servicoId" value={servicoId} />
      <div>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <span className="label !mb-0">Onde está o problema?</span>
          {endereco?.logradouro && (
            <button
              type="button"
              className="text-[13px] font-semibold text-brand hover:underline"
              onClick={() => setEnd({ logradouro: endereco.logradouro ?? "", numero: endereco.numero ?? "", bairro: endereco.bairro ?? "" })}
            >
              Usar meu endereço
            </button>
          )}
        </div>
        <div className="mt-2 grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px]">
          <div>
            <label className="sr-only" htmlFor="logradouro">
              Rua, avenida ou local
            </label>
            <input
              id="logradouro"
              name="logradouro"
              className="input"
              placeholder="Rua, avenida, praça ou estrada"
              required
              minLength={3}
              value={end.logradouro}
              onChange={(e) => setEnd({ ...end, logradouro: e.target.value })}
            />
          </div>
          <div>
            <label className="sr-only" htmlFor="numero">
              Número
            </label>
            <input
              id="numero"
              name="numero"
              className="input"
              placeholder="Número"
              value={end.numero}
              onChange={(e) => setEnd({ ...end, numero: e.target.value })}
            />
          </div>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="bairro">
              Bairro ou localidade
            </label>
            <input
              id="bairro"
              name="bairro"
              className="input"
              list="bairros"
              required
              value={end.bairro}
              onChange={(e) => setEnd({ ...end, bairro: e.target.value })}
            />
            <datalist id="bairros">
              {bairros.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="label" htmlFor="referencia">
              Ponto de referência <span className="font-normal text-ink-3">(opcional)</span>
            </label>
            <input id="referencia" name="referencia" className="input" placeholder="Ex.: em frente à escola" />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" onClick={localizar} className="btn btn-quiet !py-2 text-[13.5px]">
            <LocateFixed size={16} /> Usar a localização do celular
          </button>
          {coord.lat && (
            <span className="tnum text-[13px] text-ink-2">
              {coord.lat}, {coord.lng}
            </span>
          )}
        </div>
        {aviso && <p className="hint">{aviso}</p>}
        <input type="hidden" name="lat" value={coord.lat} />
        <input type="hidden" name="lng" value={coord.lng} />
      </div>

      <div>
        <label className="label" htmlFor="descricao">
          O que está acontecendo?
        </label>
        <textarea
          id="descricao"
          name="descricao"
          className="input"
          rows={4}
          required
          minLength={10}
          placeholder="Descreva o problema e qualquer detalhe que ajude a equipe a encontrar o local."
        />
      </div>

      <div className="rounded-xl border border-dashed border-line-2 bg-sunken/50 p-4 text-[14px] text-ink-2">
        <div className="flex items-center gap-2 font-semibold text-ink">
          <Camera size={17} className="text-ink-3" /> Foto do local
        </div>
        <p className="mt-1">
          Anexar foto chega na próxima versão.
          {exigeFoto
            ? " Este serviço costuma precisar de foto: por enquanto, capriche na descrição e no ponto de referência; a equipe fotografa na vistoria."
            : ""}
        </p>
      </div>

      <SubmitButton className="btn btn-primary btn-lg w-full sm:w-auto" pendingText="Registrando…">
        Registrar pedido
      </SubmitButton>
    </ActionForm>
  );
}

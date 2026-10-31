"use client";

import { useEffect, useRef } from "react";
import { Check } from "lucide-react";

export type Estacao = { chave: string; nome: string; setor?: string | null; opcional?: boolean };

/**
 * O trilho do processo: cada etapa é uma estação; o processo "anda" da esquerda para a direita.
 * Estações já passadas ficam preenchidas, a atual fica destacada, as próximas ficam em contorno.
 * Etapas opcionais (ex.: crédito adicional) só aparecem se o processo passou por elas.
 */
export function Trilho({ estacoes, atual, encerrado, visitadas }: { estacoes: Estacao[]; atual: string; encerrado: boolean; visitadas: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const visiveis = estacoes.filter((e) => !e.opcional || visitadas.includes(e.chave) || e.chave === atual);
  const idx = visiveis.findIndex((e) => e.chave === atual);

  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>("[data-atual='1']");
    if (el && ref.current) {
      const box = ref.current;
      // rola só o trilho (sem mexer na página) para deixar a etapa atual no centro
      box.scrollLeft = el.offsetLeft - box.clientWidth / 2 + el.clientWidth / 2;
    }
  }, [atual]);

  const principais = visiveis.filter((e) => !e.opcional);
  const posPrincipal = principais.findIndex((e) => e.chave === atual);
  return (
    <div className="relative">
      <div className="mb-3 text-[12.5px] text-ink-3">
        {encerrado ? `Todas as ${principais.length} etapas concluídas` : posPrincipal >= 0 ? `Etapa ${posPrincipal + 1} de ${principais.length}` : "Etapa extra, fora do caminho normal"}
      </div>
      <div aria-hidden className="pointer-events-none absolute top-8 right-0 bottom-2 z-20 w-16 bg-gradient-to-l from-white to-transparent" />
      <div ref={ref} tabIndex={0} role="region" aria-label="Etapas do processo" className="snap-x overflow-x-auto scroll-smooth rounded-lg pr-12 pb-2 [scrollbar-width:thin]">
      <ol className="relative flex">
        {visiveis.map((e, i) => {
          const passou = encerrado || i < idx;
          const aqui = !encerrado && i === idx;
          const ultimo = i === visiveis.length - 1;
          return (
            <li key={e.chave} data-atual={aqui ? "1" : undefined} aria-current={aqui ? "step" : undefined} className="relative flex w-[118px] shrink-0 snap-center flex-col items-center text-center">
              {/* linha até a próxima estação */}
              {!ultimo && <span aria-hidden className={`absolute top-[15px] left-1/2 h-[3px] w-full ${passou ? "bg-brand" : "bg-line"}`} />}
              <span
                className={`relative z-10 flex items-center justify-center rounded-full ${
                  aqui
                    ? "estacao-atual h-[33px] w-[33px] border-[3px] border-brand bg-white"
                    : passou
                      ? "h-[33px] w-[33px] bg-brand text-white"
                      : "h-[33px] w-[33px] border-2 border-line-2 bg-white"
                }`}
              >
                {passou && <Check size={16} strokeWidth={3} />}
                {aqui && <span className="h-[13px] w-[13px] rounded-full bg-brand" />}
              </span>
              <span className={`mt-2.5 px-1.5 text-[12.5px] leading-snug ${aqui ? "font-semibold text-ink" : passou ? "text-ink-2" : "text-ink-3"}`}>{e.nome}</span>
              {passou && <span className="sr-only">, concluída</span>}
              {aqui && <span className="mt-1 text-[12px] font-semibold text-brand-2">Está aqui</span>}
              {e.setor && !aqui && <span className="mt-0.5 text-[12px] text-ink-3">{e.setor}</span>}
            </li>
          );
        })}
      </ol>
      </div>
    </div>
  );
}

/** Versão compacta para listas: barra segmentada + "etapa X de Y". */
export function TrilhoMini({ total, posicao, encerrado, atrasado }: { total: number; posicao: number; encerrado: boolean; atrasado?: boolean }) {
  const feitos = encerrado ? total : posicao;
  return (
    <div className="flex items-center gap-2" role="img" aria-label={encerrado ? "Concluído" : `Etapa ${posicao + 1} de ${total}`}>
      <div className="flex gap-[3px]">
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={`h-[6px] w-[7px] rounded-full ${i < feitos ? "bg-brand" : i === feitos && !encerrado ? (atrasado ? "bg-bad" : "bg-brand/45") : "bg-line"}`}
          />
        ))}
      </div>
    </div>
  );
}

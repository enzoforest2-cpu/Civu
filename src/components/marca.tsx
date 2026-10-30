/**
 * Marca da Civu: o símbolo "C" (uma entrada aberta) e o nome em minúsculas.
 * Adaptação para interface do estudo de identidade; arquivos finais e registro da marca ainda pendentes.
 */
export function Marca({ size = 30, inversa = false }: { size?: number; inversa?: boolean }) {
  const cor = inversa ? "#ffffff" : "#168779";
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden>
      <path d="M78 6H38C19 6 6 20 6 39v24c0 19 13 31 32 31h40l14-14-14-14H42c-5 0-8-3-8-8V44c0-5 3-8 8-8h36l14-15z" fill={cor} />
    </svg>
  );
}

/** Símbolo + nome "civu". `inversa` para fundos escuros ou na cor da marca. */
export function MarcaCompleta({ altura = 28, inversa = false }: { altura?: number; inversa?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2" style={{ height: altura }}>
      <Marca size={altura} inversa={inversa} />
      <span className="display font-extrabold leading-none tracking-[-0.04em]" style={{ fontSize: altura * 0.95, color: inversa ? "#ffffff" : "#172d36" }}>
        civu
      </span>
    </span>
  );
}

/** Marca do Trâmite: três estações ligadas por um trilho; a última é a atual. `inversa` para fundos na cor da marca. */
export function Marca({ size = 30, inversa = false }: { size?: number; inversa?: boolean }) {
  const fundo = inversa ? "#ffffff" : "#3d3af0";
  const traco = inversa ? "#3d3af0" : "#ffffff";
  return (
    <svg width={size} height={size} viewBox="0 0 30 30" aria-hidden>
      <rect width="30" height="30" rx="9" fill={fundo} />
      <path d="M7 19 L15 11 L23 19" fill="none" stroke={traco} strokeOpacity="0.55" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="7" cy="19" r="2.6" fill={traco} />
      <circle cx="15" cy="11" r="2.6" fill={traco} />
      <circle cx="23" cy="19" r="3.6" fill={fundo} stroke={traco} strokeWidth="2.2" />
    </svg>
  );
}

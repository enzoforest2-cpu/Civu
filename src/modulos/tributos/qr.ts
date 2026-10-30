// Gerador de QR Code (modo byte, correção M, versões 1 a 10) sem dependências, para o verificador público
// de alvarás e certidões. Segue a norma ISO/IEC 18004; máscara fixa (os leitores aceitam qualquer máscara).
const ECC_POR_BLOCO = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
const BLOCOS = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];

function modulosBrutos(v: number) {
  let r = (16 * v + 128) * v + 64;
  if (v >= 2) {
    const n = Math.floor(v / 7) + 2;
    r -= (25 * n - 10) * n - 55;
    if (v >= 7) r -= 36;
  }
  return r;
}
const capacidade = (v: number) => Math.floor(modulosBrutos(v) / 8) - ECC_POR_BLOCO[v] * BLOCOS[v];

function mul(x: number, y: number) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}
function divisor(grau: number) {
  const r = new Array<number>(grau).fill(0);
  r[grau - 1] = 1;
  let raiz = 1;
  for (let i = 0; i < grau; i++) {
    for (let j = 0; j < r.length; j++) {
      r[j] = mul(r[j], raiz);
      if (j + 1 < r.length) r[j] ^= r[j + 1];
    }
    raiz = mul(raiz, 0x02);
  }
  return r;
}
function resto(dados: number[], div: number[]) {
  const r = new Array<number>(div.length).fill(0);
  for (const b of dados) {
    const f = b ^ (r.shift() as number);
    r.push(0);
    div.forEach((c, i) => (r[i] ^= mul(c, f)));
  }
  return r;
}

/** Matriz de módulos (true = escuro) para o texto. */
export function qrMatriz(texto: string): boolean[][] {
  const bytes = Array.from(new TextEncoder().encode(texto));
  let v = 1;
  while (v <= 10 && 4 + (v < 10 ? 8 : 16) + bytes.length * 8 > capacidade(v) * 8) v++;
  if (v > 10) throw new Error("Texto longo demais para o QR Code.");
  const tam = v * 4 + 17;

  // dados
  const bits: number[] = [];
  const put = (val: number, n: number) => {
    for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1);
  };
  put(0b0100, 4);
  put(bytes.length, v < 10 ? 8 : 16);
  bytes.forEach((b) => put(b, 8));
  const cap = capacidade(v) * 8;
  put(0, Math.min(4, cap - bits.length));
  put(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < cap; pad ^= 0xec ^ 0x11) put(pad, 8);
  const dados: number[] = [];
  for (let i = 0; i < bits.length; i += 8) dados.push(parseInt(bits.slice(i, i + 8).join(""), 2));

  // blocos com correção e intercalação
  const nb = BLOCOS[v];
  const ecc = ECC_POR_BLOCO[v];
  const brutos = Math.floor(modulosBrutos(v) / 8);
  const curtos = nb - (brutos % nb);
  const tamCurto = Math.floor(brutos / nb);
  const div = divisor(ecc);
  const blocos: number[][] = [];
  for (let i = 0, k = 0; i < nb; i++) {
    const d = dados.slice(k, k + tamCurto - ecc + (i < curtos ? 0 : 1));
    k += d.length;
    const e = resto(d, div);
    if (i < curtos) d.push(0);
    blocos.push(d.concat(e));
  }
  const final: number[] = [];
  for (let i = 0; i < blocos[0].length; i++)
    blocos.forEach((b, j) => {
      if (i !== tamCurto - ecc || j >= curtos) final.push(b[i]);
    });

  // padrões de função
  const m: boolean[][] = Array.from({ length: tam }, () => new Array<boolean>(tam).fill(false));
  const f: boolean[][] = Array.from({ length: tam }, () => new Array<boolean>(tam).fill(false));
  const set = (x: number, y: number, escuro: boolean) => {
    m[y][x] = escuro;
    f[y][x] = true;
  };
  for (let i = 0; i < tam; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  const localizador = (cx: number, cy: number) => {
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx,
          y = cy + dy;
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        if (x >= 0 && x < tam && y >= 0 && y < tam) set(x, y, d !== 2 && d !== 4);
      }
  };
  localizador(3, 3);
  localizador(tam - 4, 3);
  localizador(3, tam - 4);
  if (v > 1) {
    const n = Math.floor(v / 7) + 2;
    const passo = Math.ceil((v * 4 + 4) / (n * 2 - 2)) * 2;
    const pos = [6];
    for (let p = tam - 7; pos.length < n; p -= passo) pos.splice(1, 0, p);
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(pos[i] + dx, pos[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
  }
  const MASCARA = 0;
  const formato = () => {
    const d = (0 << 3) | MASCARA; // nível M = 00
    let r = d;
    for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
    const b = ((d << 10) | r) ^ 0x5412;
    const bit = (i: number) => ((b >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6));
    set(8, 8, bit(7));
    set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(tam - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, tam - 15 + i, bit(i));
    set(8, tam - 8, true);
  };
  formato();
  if (v >= 7) {
    let r = v;
    for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25);
    const b = (v << 12) | r;
    for (let i = 0; i < 18; i++) {
      const bit = ((b >>> i) & 1) === 1;
      const a = tam - 11 + (i % 3),
        c = Math.floor(i / 3);
      set(a, c, bit);
      set(c, a, bit);
    }
  }

  // codewords em zigue-zague
  let i = 0;
  for (let dir = tam - 1; dir >= 1; dir -= 2) {
    if (dir === 6) dir = 5;
    for (let vert = 0; vert < tam; vert++)
      for (let j = 0; j < 2; j++) {
        const x = dir - j;
        const subindo = ((dir + 1) & 2) === 0;
        const y = subindo ? tam - 1 - vert : vert;
        if (!f[y][x] && i < final.length * 8) {
          m[y][x] = ((final[i >>> 3] >>> (7 - (i & 7))) & 1) === 1;
          i++;
        }
      }
  }
  // máscara 0: (x + y) % 2 == 0
  for (let y = 0; y < tam; y++) for (let x = 0; x < tam; x++) if (!f[y][x] && (x + y) % 2 === 0) m[y][x] = !m[y][x];
  return m;
}

/** Caminho SVG (um quadrado por módulo escuro) com margem de 4 módulos. */
export function qrSvgPath(texto: string) {
  const m = qrMatriz(texto);
  let d = "";
  m.forEach((linha, y) => linha.forEach((on, x) => on && (d += `M${x + 4} ${y + 4}h1v1h-1z`)));
  return { d, tamanho: m.length + 8 };
}

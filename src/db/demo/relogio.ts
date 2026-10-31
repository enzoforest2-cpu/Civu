// Relógio simulado para gerar processos de demonstração com histórico: o motor grava eventos, documentos,
// assinaturas e prazos com `new Date()`; com o relógio ligado, "agora" é a data passada que o gerador escolher.
// Só para scripts de carga da demonstração (nunca no servidor do Next). Cada leitura do relógio avança 1 segundo,
// para que os eventos de uma mesma etapa fiquem em ordem e sem horários repetidos.
const DataReal = Date;
let atual: number | null = null;

class DataSimulada extends DataReal {
  constructor(...a: unknown[]) {
    if (a.length === 0 && atual !== null) {
      super(atual);
      atual += 1000;
    } else {
      super(...(a as [string]));
    }
  }
  static now() {
    if (atual === null) return DataReal.now();
    const t = atual;
    atual += 1000;
    return t;
  }
}

/** Liga o relógio simulado em `ms` (ou mantém a hora atual simulada se ela já passou de `ms`: o tempo não volta). */
export function irPara(ms: number) {
  atual = Math.max(atual ?? 0, ms);
  (globalThis as { Date: DateConstructor }).Date = DataSimulada as unknown as DateConstructor;
}

/** Acerta o relógio simulado em `ms`, mesmo que seja antes da hora simulada atual (início de outro processo). */
export function acertar(ms: number) {
  atual = ms;
  (globalThis as { Date: DateConstructor }).Date = DataSimulada as unknown as DateConstructor;
}

/** Desliga o relógio simulado: volta a hora real. */
export function voltarAoPresente() {
  atual = null;
  (globalThis as { Date: DateConstructor }).Date = DataReal;
}

/** Hora real, mesmo com o relógio simulado ligado. */
export const agoraReal = () => DataReal.now();

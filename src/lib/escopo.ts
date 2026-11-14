// Módulos desligados do produto publicado. Desde 13/11/2026 (decisão do Enzo: a Civu volta a ser o sistema único
// do município) a lista está vazia: serviços urbanos, tributos, obras, sala do prefeito, receita e índices,
// integrações, transparência e o portal do cidadão completo estão religados. O mecanismo continua: um prefixo
// nesta lista tira o item do menu e dos atalhos do portal, e src/proxy.ts redireciona a rota.
export const FORA_DO_ESCOPO: readonly string[] = [];

export function foraDoEscopo(caminho: string): boolean {
  return FORA_DO_ESCOPO.some((p) => caminho === p || caminho.startsWith(p + "/") || caminho.startsWith(p + "?"));
}

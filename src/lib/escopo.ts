// Escopo do produto publicado: o sistema de protocolo e o fluxo da contratação, do pedido ao pagamento.
// Os módulos da visão completa da Civu (serviços urbanos, tributos, obras públicas, painel do prefeito,
// receita e índices fiscais, integrações) continuam no código e no ramo `civu-completo`, mas ficam fora
// do menu e das rotas. Para religar um módulo, tire o prefixo desta lista.
export const FORA_DO_ESCOPO = [
  "/servicos",
  "/campo",
  "/tributos",
  "/verificar",
  "/obras",
  "/contratos/obras",
  "/gabinete",
  "/integracoes",
  "/financas/receita",
  "/financas/indices",
  "/transparencia",
  "/portal/servicos",
  "/portal/imoveis",
  "/portal/guias",
  "/portal/itbi",
  "/portal/certidao",
  "/portal/alvara",
  "/portal/parcelamento",
] as const;

export function foraDoEscopo(caminho: string): boolean {
  return FORA_DO_ESCOPO.some((p) => caminho === p || caminho.startsWith(p + "/") || caminho.startsWith(p + "?"));
}

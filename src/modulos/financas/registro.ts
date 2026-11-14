// Itens de menu do módulo de finanças (orçamento e execução financeira).
import { BarChart3, FileSignature, Gauge, Landmark, PieChart, TrendingUp, Wallet } from "lucide-react";
import type { ItemGestao } from "@/lib/modulos";

// Quem vê cada item é decidido pela área (src/lib/areas.ts): Fazenda vê tudo; as secretarias, o orçamento.
export const gestao: ItemGestao[] = [
  { href: "/financas", rotulo: "Visão financeira", icone: Landmark, grupo: "financas", ordem: 60 },
  { href: "/financas/orcamento", rotulo: "Orçamento", icone: PieChart, grupo: "financas", ordem: 61 },
  { href: "/financas/empenhos", rotulo: "Empenhos", icone: FileSignature, grupo: "financas", ordem: 62 },
  { href: "/financas/receita", rotulo: "Receita", icone: TrendingUp, grupo: "financas", ordem: 63 },
  { href: "/financas/caixa", rotulo: "Caixa e projeção", icone: Wallet, grupo: "financas", ordem: 64 },
  { href: "/financas/indices", rotulo: "Índices legais", icone: Gauge, grupo: "financas", ordem: 65 },
  { href: "/transparencia/orcamento", rotulo: "Orçamento aberto", icone: BarChart3, grupo: "publico", ordem: 30 },
];

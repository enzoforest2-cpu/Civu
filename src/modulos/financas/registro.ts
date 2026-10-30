// Itens de menu do módulo de finanças (orçamento e execução financeira).
import { BarChart3, FileSignature, Gauge, Landmark, PieChart, TrendingUp, Wallet } from "lucide-react";
import type { ItemGestao } from "@/lib/modulos";

const papeis: ItemGestao["papeis"] = ["ORDENADOR", "CONTABILIDADE", "TESOURARIA", "CONTROLE_INTERNO", "SECRETARIO"];

export const gestao: ItemGestao[] = [
  { href: "/financas", rotulo: "Visão financeira", icone: Landmark, grupo: "financas", ordem: 60, papeis },
  { href: "/financas/orcamento", rotulo: "Orçamento", icone: PieChart, grupo: "financas", ordem: 61, papeis },
  { href: "/financas/empenhos", rotulo: "Empenhos", icone: FileSignature, grupo: "financas", ordem: 62, papeis },
  { href: "/financas/receita", rotulo: "Receita", icone: TrendingUp, grupo: "financas", ordem: 63, papeis },
  { href: "/financas/caixa", rotulo: "Caixa e projeção", icone: Wallet, grupo: "financas", ordem: 64, papeis },
  { href: "/financas/indices", rotulo: "Índices legais", icone: Gauge, grupo: "financas", ordem: 65, papeis },
  { href: "/transparencia/orcamento", rotulo: "Orçamento aberto", icone: BarChart3, grupo: "publico", ordem: 30 },
];

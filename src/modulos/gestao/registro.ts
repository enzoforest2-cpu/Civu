// Menu do módulo Gestão (painel do prefeito, automações, integrações, governança e ajuda).
import { Bot, Cable, CircleHelp, Landmark, ShieldHalf } from "lucide-react";
import type { ItemGestao } from "@/lib/modulos";

export const gestao: ItemGestao[] = [
  { href: "/gabinete", rotulo: "Painel do prefeito", icone: Landmark, grupo: "visao", ordem: 5, papeis: ["ORDENADOR", "SECRETARIO", "CONTROLE_INTERNO"] },
  { href: "/automacoes", rotulo: "Automações", icone: Bot, grupo: "inteligencia", ordem: 10, papeis: ["ORDENADOR", "SECRETARIO", "CONTROLE_INTERNO", "PROTOCOLO"] },
  { href: "/integracoes", rotulo: "Integrações", icone: Cable, grupo: "admin", ordem: 20, papeis: ["CONTROLE_INTERNO", "CONTABILIDADE", "COMPRAS", "TESOURARIA"] },
  { href: "/governanca", rotulo: "Governança", icone: ShieldHalf, grupo: "admin", ordem: 30, papeis: ["CONTROLE_INTERNO"] },
  { href: "/ajuda", rotulo: "Ajuda", icone: CircleHelp, grupo: "admin", ordem: 90 },
];

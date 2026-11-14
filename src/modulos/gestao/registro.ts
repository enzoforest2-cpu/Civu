// Menu do módulo Gestão (sala do prefeito, automações, integrações, governança e ajuda).
import { Bot, Cable, CircleHelp, Landmark, ShieldHalf } from "lucide-react";
import type { ItemGestao } from "@/lib/modulos";

export const gestao: ItemGestao[] = [
  { href: "/gabinete", rotulo: "Sala do prefeito", icone: Landmark, grupo: "visao", ordem: 5 },
  { href: "/automacoes", rotulo: "Automações", icone: Bot, grupo: "inteligencia", ordem: 10, papeis: ["ORDENADOR", "SECRETARIO", "CONTROLE_INTERNO", "PROTOCOLO", "ADMIN"] },
  { href: "/integracoes", rotulo: "Integrações", icone: Cable, grupo: "admin", ordem: 20, papeis: ["CONTROLE_INTERNO", "CONTABILIDADE", "COMPRAS", "TESOURARIA", "ADMIN"] },
  { href: "/governanca", rotulo: "Governança", icone: ShieldHalf, grupo: "admin", ordem: 30, papeis: ["CONTROLE_INTERNO", "ADMIN"] },
  { href: "/ajuda", rotulo: "Ajuda", icone: CircleHelp, grupo: "admin", ordem: 90 },
];

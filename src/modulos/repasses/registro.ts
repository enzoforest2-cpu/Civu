// Menu do módulo de repasses, emendas e convênios e das obrigações de entrega de cada área.
// Quem vê: a regra de área das rotas (src/lib/areas.ts): Gabinete, Controle Interno e as secretarias com pasta.
import { CalendarClock, HandCoins } from "lucide-react";
import type { ItemGestao } from "@/lib/modulos";

export const gestao: ItemGestao[] = [
  { href: "/repasses", rotulo: "Repasses e convênios", icone: HandCoins, grupo: "financas", ordem: 58 },
  { href: "/obrigacoes-da-area", rotulo: "Obrigações da área", icone: CalendarClock, grupo: "financas", ordem: 59 },
];

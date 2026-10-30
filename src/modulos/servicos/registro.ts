// Menu da gestão e atalhos do portal do módulo de serviços urbanos.
import { BarChart3, ClipboardList, Construction, HardHat, ListChecks, Megaphone } from "lucide-react";
import type { AtalhoPortal, ItemGestao } from "@/lib/modulos";

export const gestao: ItemGestao[] = [
  { href: "/servicos", rotulo: "Ocorrências urbanas", icone: Megaphone, grupo: "obras", ordem: 10 },
  { href: "/servicos/ordens", rotulo: "Ordens de serviço", icone: ClipboardList, grupo: "obras", ordem: 12 },
  { href: "/campo", rotulo: "Execução em campo", icone: HardHat, grupo: "obras", ordem: 14 },
  { href: "/servicos/indicadores", rotulo: "Indicadores de serviços", icone: BarChart3, grupo: "obras", ordem: 16 },
  { href: "/servicos/catalogo", rotulo: "Catálogo e equipes", icone: ListChecks, grupo: "admin", ordem: 20 },
];

export const portal: AtalhoPortal[] = [
  {
    href: "/portal/servicos/novo",
    rotulo: "Pedir um serviço",
    descricao: "Buraco na rua, lâmpada queimada, poda, entulho, boca de lobo e outros problemas da cidade.",
    icone: Construction,
    contexto: "AMBOS",
    ordem: 10,
  },
  {
    href: "/portal/servicos",
    rotulo: "Meus pedidos de serviço",
    descricao: "Veja a previsão, quando a equipe vai ao local e avalie o atendimento.",
    icone: ClipboardList,
    contexto: "AMBOS",
    ordem: 11,
  },
];

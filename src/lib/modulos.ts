// Registro dos módulos da Civu: menu da gestão (agrupado) e atalhos dos portais.
// Cada módulo declara seus itens em src/modulos/<modulo>/registro.ts e é importado aqui.
import type { LucideIcon } from "lucide-react";
import { BookOpen, FolderOpen, Globe, Inbox, LayoutGrid, ListOrdered, Settings2, ShieldCheck } from "lucide-react";
import type { Papel } from "./workflow";

export type ItemGestao = { href: string; rotulo: string; icone: LucideIcon; papeis?: Papel[]; grupo: ChaveGrupo; ordem?: number };

export type ChaveGrupo = "visao" | "atendimento" | "financas" | "compras" | "obras" | "pessoas" | "inteligencia" | "admin" | "publico";

export const GRUPOS: { chave: ChaveGrupo; rotulo: string }[] = [
  { chave: "visao", rotulo: "Visão da gestão" },
  { chave: "atendimento", rotulo: "Atendimento e processos" },
  { chave: "financas", rotulo: "Finanças e tributos" },
  { chave: "compras", rotulo: "Compras e contratos" },
  { chave: "obras", rotulo: "Obras e território" },
  { chave: "pessoas", rotulo: "Pessoas e serviços públicos" },
  { chave: "inteligencia", rotulo: "Inteligência e automação" },
  { chave: "admin", rotulo: "Administração e integrações" },
  { chave: "publico", rotulo: "Páginas públicas" },
];

/** Atalho por intenção nos portais. `contexto`: em nome próprio, em nome de empresa ou ambos. */
export type AtalhoPortal = {
  href: string;
  rotulo: string;
  descricao: string;
  icone: LucideIcon;
  contexto: "PESSOA" | "EMPRESA" | "AMBOS";
  ordem?: number;
};

const NUCLEO: ItemGestao[] = [
  { href: "/painel", rotulo: "Painel", icone: LayoutGrid, grupo: "visao", ordem: 10 },
  { href: "/caixa", rotulo: "Minha caixa", icone: Inbox, grupo: "atendimento", ordem: 10 },
  { href: "/processos", rotulo: "Processos", icone: FolderOpen, grupo: "atendimento", ordem: 20 },
  { href: "/fluxos", rotulo: "Fluxos", icone: BookOpen, grupo: "atendimento", ordem: 90 },
  { href: "/obrigacoes", rotulo: "Obrigações legais", icone: ShieldCheck, grupo: "compras", ordem: 50 },
  { href: "/configuracoes", rotulo: "Cadastros", icone: Settings2, grupo: "admin", ordem: 10 },
  { href: "/consulta", rotulo: "Consulta pública", icone: Globe, grupo: "publico", ordem: 10 },
  { href: "/fila-de-pagamentos", rotulo: "Fila de pagamentos", icone: ListOrdered, grupo: "publico", ordem: 20 },
];

const ATALHOS_NUCLEO: AtalhoPortal[] = [];

// ---- módulos (cada um acrescenta uma linha de import e uma entrada nas listas abaixo) ----
// import * as servicos from "@/modulos/servicos/registro";
import * as contratos from "@/modulos/contratos/registro";

const MODULOS: { gestao?: ItemGestao[]; portal?: AtalhoPortal[] }[] = [
  // servicos,
  contratos,
];

export const ITENS_GESTAO: ItemGestao[] = [...NUCLEO, ...MODULOS.flatMap((m) => m.gestao ?? [])].sort((a, b) => (a.ordem ?? 50) - (b.ordem ?? 50));
export const ATALHOS_PORTAL: AtalhoPortal[] = [...ATALHOS_NUCLEO, ...MODULOS.flatMap((m) => m.portal ?? [])].sort((a, b) => (a.ordem ?? 50) - (b.ordem ?? 50));

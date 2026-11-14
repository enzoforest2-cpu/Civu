// Menu da gestão e atalhos do portal do módulo de tributos.
import { ArrowLeftRight, Building2, ChartLine, FileCheck2, Gavel, House, Landmark, Receipt, Store } from "lucide-react";
import type { AtalhoPortal, ItemGestao } from "@/lib/modulos";

// Área da Fazenda (src/lib/areas.ts): quem é da Fazenda vê os tributos, seja qual for o papel.
export const gestao: ItemGestao[] = [
  { href: "/tributos", rotulo: "Tributos", icone: Landmark, grupo: "financas", ordem: 30 },
  { href: "/tributos/imoveis", rotulo: "Cadastro imobiliário", icone: House, grupo: "financas", ordem: 31 },
  { href: "/tributos/itbi", rotulo: "ITBI", icone: ArrowLeftRight, grupo: "financas", ordem: 32 },
  { href: "/tributos/empresas", rotulo: "Empresas e alvarás", icone: Building2, grupo: "financas", ordem: 33 },
  { href: "/tributos/divida-ativa", rotulo: "Dívida ativa", icone: Gavel, grupo: "financas", ordem: 34 },
  { href: "/tributos/observatorio", rotulo: "Observatório imobiliário", icone: ChartLine, grupo: "obras", ordem: 40 },
];

export const portal: AtalhoPortal[] = [
  { href: "/portal/imoveis", rotulo: "Meus imóveis e IPTU", descricao: "Valor venal, parcelas do IPTU e situação de cada imóvel.", icone: House, contexto: "AMBOS", ordem: 20 },
  { href: "/portal/guias", rotulo: "Emitir guia", descricao: "Boleto ou PIX de IPTU, ITBI, ISS, taxas e parcelamentos.", icone: Receipt, contexto: "AMBOS", ordem: 21 },
  { href: "/portal/itbi", rotulo: "Pedir ITBI", descricao: "Declare a compra de um imóvel e acompanhe a avaliação.", icone: ArrowLeftRight, contexto: "AMBOS", ordem: 22 },
  { href: "/portal/certidao", rotulo: "Certidão negativa", descricao: "Emita a certidão de débitos municipais com código de verificação.", icone: FileCheck2, contexto: "AMBOS", ordem: 23 },
  { href: "/portal/alvara", rotulo: "Alvará da minha empresa", descricao: "Validade do alvará e das licenças; peça a renovação.", icone: Store, contexto: "EMPRESA", ordem: 24 },
];

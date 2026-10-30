// Menu da gestão e atalhos do Civu Empresas do módulo de contratos, obras e portal do fornecedor.
import { Building2, ClipboardCheck, FileSignature, HardHat, Upload, Wallet } from "lucide-react";
import type { AtalhoPortal, ItemGestao } from "@/lib/modulos";

export const gestao: ItemGestao[] = [
  { href: "/contratos", rotulo: "Contratos", icone: FileSignature, grupo: "compras", ordem: 30 },
  { href: "/contratos/atestos", rotulo: "Notas a atestar", icone: ClipboardCheck, grupo: "compras", ordem: 35, papeis: ["FISCAL", "CONTABILIDADE", "COMPRAS", "SECRETARIO"] },
  { href: "/contratos/obras", rotulo: "Obras", icone: HardHat, grupo: "obras", ordem: 10 },
  { href: "/obras", rotulo: "Obras públicas", icone: Building2, grupo: "publico", ordem: 30 },
];

export const portal: AtalhoPortal[] = [
  { href: "/portal/contratos", rotulo: "Meus contratos", descricao: "Saldo, vigência e aditivos de cada contrato com a prefeitura.", icone: FileSignature, contexto: "EMPRESA", ordem: 10 },
  { href: "/portal/contratos/nota", rotulo: "Enviar nota fiscal", descricao: "Envie a nota ou a medição para o fiscal atestar.", icone: Upload, contexto: "EMPRESA", ordem: 11 },
  { href: "/portal/contratos/pagamentos", rotulo: "Meus pagamentos", descricao: "Veja onde está cada pagamento: atesto, liquidação, fila ou pago.", icone: Wallet, contexto: "EMPRESA", ordem: 12 },
];

import { Construction, Droplets, Leaf, Lightbulb, PawPrint, Signpost, Trash2, Wrench, type LucideProps } from "lucide-react";

const POR_CATEGORIA = {
  VIAS: Construction,
  ILUMINACAO: Lightbulb,
  ARBORIZACAO: Leaf,
  LIMPEZA: Trash2,
  DRENAGEM: Droplets,
  SINALIZACAO: Signpost,
  ZOONOSES: PawPrint,
} as const;

export function IconeServico({ categoria, ...p }: { categoria: string } & LucideProps) {
  const I = POR_CATEGORIA[categoria as keyof typeof POR_CATEGORIA] ?? Wrench;
  return <I {...p} aria-hidden />;
}

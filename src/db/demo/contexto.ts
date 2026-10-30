import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "../schema";

/** O que o seed base entrega para os dados de demonstração de cada módulo. */
export type DemoCtx = {
  db: NodePgDatabase<typeof schema>;
  municipioId: string;
  ano: number;
  /** id da unidade gestora pelo código ("01" prefeitura, "02" fundo de saúde) */
  ugs: Record<string, string>;
  /** id do setor pela sigla (PROT, GAB, SAD, CPL, CONT, FIN, JUR, CI, OBRAS, SAUDE…) */
  setores: Record<string, string>;
  /** id do usuário pelo CPF */
  usuarios: Record<string, string>;
  /** id do tipo de processo pela chave (COMPRA, REQUERIMENTO…) */
  tipos: Record<string, string>;
  /** id da pessoa de demonstração: ana, carlos, juliana, roberto, marta */
  pessoas: Record<string, string>;
  /** id da empresa de demonstração: mendes, mendesmei, padaria, hidrobombas, cariri */
  empresas: Record<string, string>;
  /** data de n dias atrás */
  dia: (n: number) => Date;
};

export type ModuloDemo = { nome: string; aplicar: (ctx: DemoCtx) => Promise<void> };

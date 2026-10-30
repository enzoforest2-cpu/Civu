// Registro dos dados de demonstração por módulo. Cada módulo exporta um ModuloDemo
// em src/modulos/<modulo>/demo.ts e é acrescentado aqui.
// Aumente DEMO_VERSAO sempre que mudar dados de demonstração: o deploy recria a base de exemplo.
import type { ModuloDemo } from "./contexto";
import { portalDemo } from "./portal";
import { contratosDemo } from "@/modulos/contratos/demo";

export const DEMO_VERSAO = 3;

export const MODULOS_DEMO: ModuloDemo[] = [portalDemo, contratosDemo];

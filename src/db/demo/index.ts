// Registro dos dados de demonstração por módulo. Cada módulo exporta um ModuloDemo
// em src/modulos/<modulo>/demo.ts e é acrescentado aqui.
// Aumente DEMO_VERSAO sempre que mudar dados de demonstração: o deploy recria a base de exemplo.
import type { ModuloDemo } from "./contexto";
import { portalDemo } from "./portal";
import { servicosDemo } from "../../modulos/servicos/demo";
import { contratosDemo } from "../../modulos/contratos/demo";
import { financasDemo } from "../../modulos/financas/demo";
import { tributosDemo } from "../../modulos/tributos/demo";
import { gestaoDemo } from "../../modulos/gestao/demo";
import { contratacaoDemo } from "./contratacao";

export const DEMO_VERSAO = 11;

export const MODULOS_DEMO: ModuloDemo[] = [portalDemo, servicosDemo, contratosDemo, financasDemo, tributosDemo, gestaoDemo, contratacaoDemo];

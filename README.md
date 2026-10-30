# Civu — Gestão municipal integrada

A cidade conectada: prefeitura, cidadãos e empresas no mesmo lugar. Protocolo e processos com prazo e responsável, despesa do pedido ao pagamento com as regras da Lei 14.133, portais para cidadãos e empresas, serviços urbanos, contratos e obras, orçamento e finanças, tributos e imóveis, e painel do prefeito.

Publicado em https://tramite-mocha.vercel.app (dados fictícios do município de demonstração Vale das Araucárias/RS).

## Módulos

| Área | O que faz | Onde |
| --- | --- | --- |
| Núcleo de processos | Protocolo, tramitação, prazos em dias úteis, exigências, devoluções, assinatura com senha, histórico encadeado por hash, fluxo de compra com 18 etapas e travas, alerta de fracionamento, fila cronológica | `src/lib`, `/processos`, `/caixa`, `/painel` |
| Portais Cidadão e Empresas | Entrada gov.br (simulada) ou CPF e senha, representação de empresas com escopo e validade, pedidos e exigências | `src/lib/portal.ts`, `/entrar`, `/portal` |
| Serviços urbanos | Catálogo, pedido do cidadão, triagem, ordens de serviço, tela de campo, indicadores | `src/modulos/servicos` |
| Contratos e obras | Saldo, aditivos, atesto e glosa, medições, curva S, portal do fornecedor, obras públicas | `src/modulos/contratos` |
| Orçamento e finanças | LOA, créditos, reserva, empenho, liquidação, pagamento, caixa por fonte, índices | `src/modulos/financas` |
| Tributos e imóveis | Cadastro imobiliário, IPTU, ITBI, alvarás, dívida ativa, certidões verificáveis, observatório imobiliário | `src/modulos/tributos` |
| Gestão | Painel do prefeito, automações, central de integrações, governança, ajuda | `src/modulos/gestao` |

Integrações externas (gov.br, PNCP, TCE, bancos, NF-e, WhatsApp) estão simuladas e aparecem assim nas telas.

## Rodar localmente

Pré-requisitos: Node 20+ e Docker (ou um Postgres 16).

```bash
cp .env.example .env
docker compose up -d     # Postgres 16 em localhost:5432
npm install
npm run db:setup         # aplica as migrações e carrega o município de demonstração
npm run dev              # http://localhost:3000
```

Servidores de demonstração (senha `123456`), em `/login`:

| CPF | Pessoa | Papel |
| --- | --- | --- |
| 111.111.111-11 | Maria Albuquerque | Prefeita (ordenadora e administradora) |
| 222.222.222-22 | João Protocolo | Protocolo |
| 333.333.333-33 | Ana Compras | Compras |
| 444.444.444-44 | Carlos Contador | Contabilidade |
| 777.777.777-77 | Lúcia Tesoureira | Tesouraria |
| 999.999.999-99 | Fernanda | Requisitante |
| 404.040.404-04 | Vanderlei | Encarregado de campo (tela `/campo`) |

Cidadãos e empresas entram em `/entrar` escolhendo uma pessoa de demonstração (Ana, Carlos, Juliana, Roberto, Marta).

## Banco de dados e publicação

- `src/db/deploy.ts` roda a cada build na Vercel: aplica migrações pendentes e, quando `DEMO_VERSAO` (em `src/db/demo/index.ts`) muda, recria o município de demonstração.
- Cada módulo tem seu esquema em `src/db/schema/<modulo>.ts`, menu em `src/modulos/<modulo>/registro.ts` e dados de demonstração em `src/modulos/<modulo>/demo.ts`.
- As tabelas ficam no schema Postgres `tramite`, nome técnico herdado do projeto de origem.

```bash
npm run db:generate   # nova migração depois de alterar src/db/schema
npm run db:reset      # apaga e recria tudo (desenvolvimento)
npm run test:engine   # teste de ponta a ponta do motor de processos
```

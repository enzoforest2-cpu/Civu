# Trâmite — Sistema de gestão administrativa municipal (MVP fase 1)

Protocolo único, tramitação entre setores com prazo e dono, motor de workflow configurável, documentos assinados e trilha de auditoria encadeada por hash — do DFD ao pagamento.

Este é o MVP da fase 1 descrito no esboço: **protocolo + motor de workflow + painel do gestor**. O módulo contábil (SIAFIC), compras com IA e integrações (PNCP, TCE) entram nas fases seguintes.

## Publicar na Vercel (banco no Supabase)

O banco de demonstração já está criado no projeto **spherum** do Supabase, isolado no schema `tramite` (as tabelas do Spherum não são tocadas).

1. Em [vercel.com/new](https://vercel.com/new), importe o repositório `tramite`.
2. Em *Environment Variables*, adicione `DATABASE_URL` com a string do **Transaction pooler** do Supabase (spherum → *Connect* → *Transaction pooler*, porta 6543), trocando `[YOUR-PASSWORD]` pela senha do banco.
3. Clique em *Deploy*. A região das funções já está configurada para São Paulo (`gru1`, em `vercel.json`).

Para recriar o banco do zero em outro Postgres: `DATABASE_URL=... npm run db:setup`.

## Rodar localmente

Pré-requisitos: Node 20+, Docker (ou um Postgres 16 acessível).

```bash
cp .env.example .env            # ajuste DATABASE_URL se necessário
docker compose up -d            # Postgres 16 em localhost:5432
npm install
npm run db:setup                # aplica as migrations e carrega o município de exemplo
npm run dev                     # http://localhost:3000
```

Usuários de demonstração (senha `123456`), município fictício São Benedito do Norte/CE:

| CPF | Nome | Papéis | Setor |
| --- | --- | --- | --- |
| 111.111.111-11 | Maria Albuquerque | Ordenadora, Admin | Gabinete |
| 222.222.222-22 | João Protocolo | Protocolo | Protocolo Geral |
| 333.333.333-33 | Ana Compras | Compras | Compras e Licitações |
| 444.444.444-44 | Carlos Contador | Contabilidade | Contabilidade e Orçamento |
| 555.555.555-55 | Rita Controladora | Controle interno | Controladoria |
| 666.666.666-66 | Pedro Procurador | Jurídico | Procuradoria |
| 777.777.777-77 | Lúcia Tesoureira | Tesouraria | Tesouraria |
| 888.888.888-88 | Dr. Marcos | Secretário, Requisitante, Fiscal | Saúde |
| 999.999.999-99 | Fernanda | Requisitante | Saúde (UBS) |

Roteiro de teste sugerido: entre como **Fernanda** → *Abrir processo* (Contratação) → junte um documento do tipo **DFD** e assine → *Enviar para autorização*. Entre como **Maria** → *Minha caixa* → confirme o recebimento → junte o **Despacho de autorização**, assine como Ordenadora → *Autorizar e enviar a compras*. E assim por diante; o sistema bloqueia cada avanço até os requisitos da etapa estarem cumpridos.

Outros comandos:

```bash
npm run db:reset      # apaga tudo, recria o esquema e recarrega o exemplo
npm run test:engine   # teste de ponta a ponta do motor (gates, devolução, cadeia de hash)
npm run db:generate   # gera uma nova migration após alterar src/db/schema.ts
```

## O que está implementado

- **Protocolo**: número único `ano/sequencial` por município (com lock), capa, abertura com campos dinâmicos definidos pelo fluxo (DFD no caso de compra).
- **Motor de workflow** (`src/lib/workflow.ts` + `src/lib/engine.ts`): estados, setor responsável, papéis que podem agir, SLA em dias úteis (com feriados do município), *gates* por documento e assinatura, avanços e devoluções com motivo, tramitação livre entre setores, confirmação de recebimento.
- **Fluxo de contratação** com 18 estados (demanda → autorização → instrução → dotação → crédito adicional → reserva → controle interno → jurídico → contratação → homologação → contrato → empenho → execução → liquidação → fila cronológica → pagamento → arquivo) e **fluxo de requerimento** livre.
- **Documentos** versionados com hash SHA-256 e **assinatura** por papel com reautenticação por senha (produção: gov.br / ICP-Brasil).
- **Livro de eventos** append-only encadeado por hash: trilha de auditoria (Decreto 10.540, art. 12) e fonte dos indicadores; a página do processo verifica a integridade da cadeia.
- **Painel**: processos por setor e por etapa, prazos estourados, enviados sem recebimento, devoluções por motivo, tempo médio em cada etapa, tempo médio até encerrar.
- **Minha caixa** (por setor), **lista com filtros**, **detalhe do processo** com ações contextuais, **fluxos** (leitura da configuração), **configurações** (cadastros base), **consulta pública** por número sem dados pessoais.
- Multi-tenant por município; usuários por CPF; papéis segregados.

## O que vem depois (fases 2–4)

- Cadastro editável de setores, usuários, feriados e fluxos (hoje via seed); editor visual de workflow.
- Upload de PDF/imagens, PDF/A assinado, carimbo de tempo; login gov.br.
- Compras: catálogo, PCA, ETP/TR com IA, pesquisa de preços automática, dispensa eletrônica, contratos e fiscais, publicação no PNCP.
- Integração com o sistema contábil (reserva, empenho, saldo) e remessa ao TCE; depois SIAFIC próprio.
- Notificações e consulta por WhatsApp; RLS no Postgres (Supabase) para isolamento por tenant no banco.

## Estrutura

```
src/db/schema.ts        esquema (Drizzle ORM, Postgres)
src/db/seed.ts          município de exemplo
src/lib/workflow.ts     tipos e definições de fluxo (dado, não código)
src/lib/engine.ts       execução: abrir, avançar, devolver, tramitar, receber, juntar, assinar
src/lib/metricas.ts     painel
src/lib/auth.ts         sessão por cookie, papéis
src/app/actions.ts      server actions
src/app/(app)/...       telas autenticadas
src/app/consulta        consulta pública
```

Stack: Next.js 16 (App Router), React 19, Tailwind 4, Drizzle ORM, Postgres 16.

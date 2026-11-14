@AGENTS.md

# Civu — instruções para quem trabalha neste repositório

Civu é um sistema de gestão municipal para prefeituras brasileiras: prefeitura, cidadãos e empresas no mesmo lugar. Este repositório se chamava "Trâmite" e o nome técnico ainda aparece em alguns lugares (schema do banco `tramite`). O dono do produto é o Enzo; fale com ele sempre em português do Brasil.

Produção: https://tramite-mocha.vercel.app (projeto Vercel `tramite`, região `gru1`). Dados 100% fictícios do município de demonstração **Vale das Araucárias/RS**.

## Escopo publicado

Desde 13/11/2026 a Civu volta a ser o **sistema único do município** (especificação em `docs/especificacoes/comando-da-prefeitura.md`): protocolo e contratação, finanças, contratos, tributos, serviços urbanos, obras, sala do prefeito, integrações, transparência e portal do cidadão completo estão ligados. A lista `FORA_DO_ESCOPO` em `src/lib/escopo.ts` está vazia, mas o mecanismo continua (um prefixo nela tira o item do menu e `src/proxy.ts` redireciona a rota).

### Áreas e acesso por perfil

- Cada setor pertence a uma **área** (coluna `area` em `setores`; `orgao_orcamentario` liga a secretaria ao órgão da LOA). As áreas e as regras ficam em `src/lib/areas.ts`; o administrador muda o vínculo em /configuracoes.
- `podeVerArea(usuario, area)` e `podeVerRota(usuario, caminho)` decidem o menu (`itensDoMenu` em `src/lib/modulos.ts`) e as páginas (`exigirRota` em `src/lib/acesso.ts`); server actions usam `exigirAreaNaAcao`. Tela bloqueada abre "Sem acesso a esta área" (/sem-acesso), nunca volta ao painel em silêncio. Tela nova de área: acrescente a regra em `ROTAS_DE_AREA` e chame `exigirRota` na página.
- Gabinete, Controle Interno e o papel ADMIN veem todas as áreas. **Ver não é agir:** o ADMIN administra (cadastros, usuários, fluxos, automações, integrações) mas não passa em `podeAgir`, `temPapel` nem nas checagens de ação em processo; a única exceção é reencaminhar processo parado numa etapa que saiu do fluxo. Para checagem de administração, liste `"ADMIN"` explicitamente.
- Página inicial: gabinete → `/gabinete` (Sala do prefeito); secretário(a) → `/secretaria` (Minha secretaria); demais → `/painel`.

## Divisão de trabalho

A interface (telas, layout, visual) está sendo feita em outra conversa. Antes de mexer em qualquer arquivo de página ou componente visual, faça `git pull` e confirme com o Enzo se a tarefa é sua. Prefira trabalhar em lógica, dados, integrações, segurança e testes. Sempre `git pull --rebase` antes de começar e antes de enviar.

## Stack

- Next.js 16 (App Router, server actions, `proxy` no lugar de middleware) e React 19. **Leia `node_modules/next/dist/docs/` antes de usar uma API do Next de que não tenha certeza** (ver AGENTS.md).
- Tailwind v4 com tokens em `src/app/globals.css` (`@theme`). Fontes Manrope (títulos) e IBM Plex Sans (texto). Cores da marca: verde cívico `#168779`, azul institucional `#172D36`, verde suave `#E5F3EE`, branco quente `#F7F9F8`.
- Drizzle ORM + Postgres (Supabase em produção). Ícones `lucide-react`. Sem biblioteca de componentes: classes prontas `.panel`, `.input`, `.label`, `.btn .btn-primary .btn-quiet .btn-danger .btn-lg`, `.chip`, `.display`, `.tnum`, `table.lista`.

## Estrutura

```
src/lib/            núcleo: workflow.ts (fluxos e papéis), engine.ts (motor de processos),
                    auth.ts (sessão de servidor), portal.ts (sessão de cidadão/empresa e representação),
                    conformidade.ts (limite de dispensa, fracionamento, prazos PNCP/TCE),
                    pagamentos.ts (fila cronológica), modulos.ts (registro de menus e atalhos),
                    areas.ts (áreas e quem vê o quê), acesso.ts (guarda das páginas por área)
src/app/(app)/      telas da gestão (exigem login de servidor)
src/app/portal/     Civu Cidadão / Civu Empresas (exigem login no portal)
src/app/<rota>      páginas públicas: /consulta, /fila-de-pagamentos, /obras, /transparencia, /verificar, /entrar, /login
src/modulos/<m>/    módulos: servicos, contratos, financas, tributos, gestao
src/db/schema/      core.ts, portal.ts e um arquivo por módulo; index.ts exporta todos
src/db/seed.ts      município, setores, usuários, fluxos, processos, pessoas e empresas de demonstração
src/db/demo/        registro dos dados de demonstração por módulo (DEMO_VERSAO)
src/db/deploy.ts    roda no build da Vercel: migrações + recarga da demonstração quando a versão muda
drizzle/            migrações SQL geradas
```

### Como um módulo se encaixa

1. Tabelas em `src/db/schema/<modulo>.ts` com `tramite.table(...)`, exportadas em `src/db/schema/index.ts`.
2. Lógica em `src/modulos/<modulo>/` (consultas em `dados.ts`, server actions em `acoes.ts`).
3. Menu e atalhos do portal em `src/modulos/<modulo>/registro.ts`, importado em `src/lib/modulos.ts`.
4. Demonstração em `src/modulos/<modulo>/demo.ts` (`ModuloDemo`), registrada em `src/db/demo/index.ts`.
5. Indicadores para o painel do prefeito: `src/modulos/gestao/indicadores.ts` explica como plugar um provedor (hoje nenhum módulo está plugado; é a lacuna mais urgente).

## Regras do domínio que não podem quebrar

- **Processos só mudam pelo motor** (`src/lib/engine.ts`): `abrirProcesso`, `avancar`, `devolver`, `tramitar`, `receber`, `juntarDocumento`, `assinarDocumento`, `abrirExigencia` etc. Nunca escreva direto na tabela `eventos`: ela é só de acréscimo e encadeada por hash (`verificarCadeia`).
- Prazos são em **dias úteis** com feriados do município (`src/lib/dates.ts`).
- Fluxo de compra (Lei 14.133): limites de dispensa 2026 em `LIMITES_DISPENSA` (R$ 65.492,11 comum / R$ 130.984,20 engenharia); o alerta de fracionamento avisa, não bloqueia; pagamento fora da ordem cronológica exige justificativa pública (art. 141).
- **Autorização sempre no servidor.** No portal use `requirePortal()`, `exigirEscopo()` e `donoAtual()`; trocar o perfil na tela não basta. Representação tem papel (responsável legal, sócio, procurador, contador), escopos (PROCESSOS, TRIBUTOS, CONTRATOS, LICENCAS), validade e revogação.
- Integrações externas (gov.br, PNCP, TCE-RS LicitaCon, bancos/PIX, NF-e/NFS-e, SICONFI, e-SUS, WhatsApp) são **simuladas** e precisam continuar rotuladas assim na tela até existirem de verdade. O login gov.br simulado só aceita pessoas com `demonstracao = true`.

## Banco de dados

- Produção fica no projeto Supabase **spherum**, que pertence a outro produto do Enzo. A Civu usa só o schema `tramite`. **Nunca crie, altere ou apague nada fora do schema `tramite`.**
- Conexão por `DATABASE_URL` ou `POSTGRES_URL` (esta vem da integração Supabase na Vercel). Nunca imprima nem decifre credenciais.
- Mudou o schema? `npm run db:generate` gera a migração em `drizzle/`; o build da Vercel aplica.
- Mudou dados de demonstração? Aumente `DEMO_VERSAO` em `src/db/demo/index.ts`; o próximo deploy apaga as tabelas do schema `tramite` e recarrega a demonstração. A carga em produção leva alguns minutos.

## Comandos

```bash
npm run dev            # desenvolvimento
npm run db:setup       # migrações + demonstração num banco vazio (DATABASE_URL)
npm run db:reset       # apaga e recria tudo (só desenvolvimento)
npm run test:engine    # teste de ponta a ponta do motor
npx tsc --noEmit -p .  # tipos
npx next build         # precisa passar antes de enviar
```

Acessos de demonstração (senha `123456`): servidores em `/login`, por exemplo 11111111111 (prefeita), 22222222222 (protocolo), 33333333333 (compras), 44444444444 (contabilidade), 77777777777 (tesouraria), 99999999999 (requisitante), 40404040404 (equipe de campo). Secretários(as): 88888888888 (Saúde), 10101010101 (Educação), 12121212121 (Administração), 16161616161 (Infraestrutura), 17171717171 (Assistência Social, SEMAS), 19191919191 (Fazenda, SEFAZ). Servidores das secretarias novas: 18181818181 (CRAS, SEMAS) e 20202020202 (assessoria da Fazenda, SEFAZ). Cidadãos e empresas em `/entrar`: Ana (cidadã), Carlos (Mendes Materiais), Juliana (contadora), Roberto (Hidrobombas), Marta (Cariri Médica).

## Padrões de texto e interface

- Tudo em português do Brasil, linguagem simples para o cidadão e precisa para o servidor. Sem emojis. Datas dd/mm/aaaa; dinheiro com `fmtMoeda` (`src/lib/dates.ts`).
- Funciona em 375px de largura. Estados vazios explicam o que fazer. Nunca use lorem ipsum.
- Mensagens de commit em português.

## Onde o produto está (30/10/2026)

Uma análise completa (o que existe, o que falta, mercado, preço) foi publicada para o Enzo. Resumo do que mais falta, em ordem:

1. Painel do prefeito (`/gabinete`) recebendo indicadores de finanças, tributos, obras, serviços e contratos, mais economia com memória de cálculo.
2. Anexos de verdade (PDF e foto): hoje documentos são só texto.
3. Permissões por atribuição: desde 13/11/2026 o ADMIN não age em processo e cada pessoa vê a sua área (ver "Áreas e acesso por perfil"); ainda falta o recorte dos dados pela pasta (qualquer servidor abre qualquer processo).
4. Notificação ao cidadão e retorno de integrações (banco, PNCP) dentro do fluxo; "enviado ao banco" diferente de "pago".
5. Página pública sem login (hoje `/` redireciona para `/login`).
6. Para editais: PNCP real, LicitaCon (e-Validador), gov.br e ICP-Brasil reais, ouvidoria e e-SIC, API REST, 2FA, backup, exportação completa, banco próprio fora do Spherum.

Decisões ainda abertas com o Enzo: substituir ou integrar o ERP da prefeitura; preço; primeiro estado (RS ou MA); papel de tributação.

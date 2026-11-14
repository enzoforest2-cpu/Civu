# Civu — Comando da prefeitura (especificação)

Data: 13/11/2026. Decisão do Enzo: a Civu volta a ser o **sistema único do município**. O prefeito e cada secretário entram e veem a própria área; tudo no mesmo lugar. Esta especificação cobre a primeira entrega dessa visão sobre o que já existe (protocolo, contratação, finanças, contratos, tributos, serviços, obras, gestão).

Regras que continuam valendo: CLAUDE.md inteiro (processos só pelo motor; autorização no servidor; integrações externas rotuladas como simuladas; dados 100% fictícios; pt-BR; 375 px; sem códigos internos na tela; contraste AA — tokens atuais do globals.css; axe sem ocorrências).

## Parte 1 — Base: áreas, acesso por perfil e módulos religados

1. **Religar os módulos.** `FORA_DO_ESCOPO` fica vazia (o mecanismo continua existindo). Todas as rotas religadas precisam abrir sem erro, com h1, sem rolagem lateral a 390 px e sem ocorrências do axe; corrigir o que estiver quebrado ou defasado (essas telas ficaram fora das auditorias recentes).
2. **Área como conceito de primeira classe.** Novo arquivo `src/lib/areas.ts`: cada setor do município pertence a uma área temática. Áreas: Gabinete, Administração, Fazenda (finanças, contabilidade, tesouraria, tributos), Compras, Saúde, Educação, Assistência Social, Infraestrutura e Obras, Controle Interno, Procuradoria, Protocolo. O vínculo setor→área fica no banco (coluna `area` em `setores`, com migração) e é configurável em /configuracoes.
3. **Demonstração:** acrescentar Secretaria de Assistência Social (SEMAS) e Secretaria da Fazenda (SEFAZ) com secretário(a) e ao menos um servidor cada; garantir secretário(a) em SESAU, SEDUC, SEINFRA, SEMAD. CPFs de demonstração novos documentados no CLAUDE.md. `DEMO_VERSAO` 13.
4. **Acesso por perfil (servidor decide, não a tela):**
   - Página inicial depois do login: prefeito/gabinete → Sala do prefeito (`/gabinete`); secretário(a) → Minha secretaria (`/secretaria`); demais → `/painel` (Seu trabalho).
   - Menu por perfil: cada pessoa vê os grupos da sua área e os comuns (Minha caixa, Processos, Ajuda). Prefeito, controle interno e administrador veem tudo. Fazenda vê finanças e tributos; Infraestrutura vê serviços, campo e obras; Compras vê compras e contratos; secretarias finalísticas veem a própria cabine, processos, contratos e orçamento da pasta.
   - Função única `podeVerArea(usuario, area)` em `src/lib/areas.ts`, usada no menu e nas páginas/server actions das áreas. Acesso direto por URL a área não permitida → página "Sem acesso a esta área" (não redirecionar em silêncio).
   - O papel ADMIN deixa de agir nos processos: administra (configurações, usuários, fluxos) mas não passa em `podeAgir` só por ser ADMIN. A prefeita da demonstração continua agindo por ser ORDENADOR. Ajustar testes.

## Parte 2 — Cabine da secretaria (`/secretaria`)

Uma página por secretaria, a mesma estrutura para todas, alimentada pelos dados que já existem. O(a) secretário(a) abre a sua; prefeito, controle e administrador abrem qualquer uma em `/secretaria/[sigla]`.

Blocos, nesta ordem:
1. **Frase de situação** (como a do painel): o que depende da pessoa hoje, o que está atrasado na pasta, quanto do orçamento foi executado.
2. **Depende de você:** documentos para assinar e processos aguardando aprovação do(a) secretário(a), com ação direta.
3. **Processos da pasta:** em andamento por etapa, atrasados, parados fora da secretaria (onde estão e há quantos dias).
4. **Orçamento da pasta:** dotação atualizada, reservado, empenhado, liquidado, pago e saldo, por ação/elemento (do módulo de finanças, filtrado pelo órgão da secretaria). Ligar setor↔órgão orçamentário (campo no setor ou tabela de vínculo).
5. **Contratos da pasta:** vigentes, vencendo em 90 dias, saldo, notas aguardando atesto.
6. **Compras em andamento da pasta:** do pedido ao contrato, com a etapa e o prazo.
7. **Repasses e obrigações da área** (Parte 3).
8. **Blocos próprios da área, quando o módulo existe:** Infraestrutura → chamados e ordens de serviço, obras; Fazenda → arrecadação, inadimplência, dívida ativa, caixa; Compras → fila de contratações e prazos médios; Controle → trilha de auditoria e achados. Saúde, Educação e Assistência ainda não têm módulo finalístico: mostrar só os blocos gerais e os repasses/obrigações, sem inventar indicador clínico ou escolar.

Cada número leva à sua origem (lista filtrada). Estados vazios explicam o que fazer.

## Parte 3 — Repasses, emendas e obrigações

Novo módulo `repasses` (schema próprio no padrão dos módulos, com migração):
- **Repasses e convênios:** tipo (emenda individual, emenda de bancada, transferência especial, convênio, fundo a fundo, programa), concedente, objeto, valor previsto e recebido, secretaria responsável, datas (assinatura, vigência, prazo de execução, prazo de prestação de contas), situação (em captação, vigente, em execução, prestação de contas pendente, prestado, com pendência), processos de compra vinculados e percentual executado (soma do que foi pago nos processos vinculados).
- **Obrigações da área:** calendário de entregas recorrentes por secretaria (nome, a quem se entrega, periodicidade, próximo vencimento, responsável, situação, comprovante). Cadastro livre pelo município; a demonstração traz exemplos rotulados como exemplo, sem afirmar prazo legal ("confirme o prazo oficial").
- Telas: `/repasses` (lista, filtros, detalhe com linha do tempo e vínculo a processos) e `/obrigacoes-da-area` ou aba dentro da cabine; criar/editar por quem é da área ou do gabinete; alertas de prazo (30, 15, 5 dias, vencido).
- Vincular processo de compra a um repasse na abertura ou depois (campo opcional); o repasse mostra seus processos e quanto já foi contratado, liquidado e pago.

## Parte 4 — Sala do prefeito (`/gabinete`)

1. **Indicadores plugados:** provedores de finanças (execução, caixa), tributos (arrecadado × previsto, inadimplência), contratos e obras (vencendo, atraso físico × financeiro), serviços (chamados, prazo), repasses (prazo de execução e de prestação de contas em risco, valor em risco) registrados em `EXTERNOS`.
2. **Mapa das secretarias:** um cartão por secretaria com semáforo (atrasos, execução orçamentária, repasses em risco, pendências de assinatura do(a) secretário(a)) e link para a cabine.
3. **Decisões do prefeito** (já existe): manter, e acrescentar repasses e obrigações com prazo crítico.
4. Cada indicador diz origem, responsável e se é realizado ou projetado (regra já existente).

## Aceite geral

- `npx tsc --noEmit -p .`, eslint nos tocados, `npm run test:regras`, `npm run db:reset && npm run test:engine && npx tsx src/db/test-fluxo.ts`, `npx next build`.
- Testes novos: `podeVerArea` (matriz perfil × área), ADMIN não age em processo, cabine filtra por secretaria (secretário de uma pasta não lê dados de outra por URL), repasse soma execução dos processos vinculados.
- Auditoria de interface (axe, 1440 e 390) nas telas novas e religadas: 0 ocorrências, sem rolagem lateral, alvos de toque de 44 px.
- Capturas das telas novas conferidas a olho.

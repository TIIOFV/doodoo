> **Fase 2:** [redesign e auditoria funcional](phase-2-report.md) · [resultados consolidados](phase-2/validation-summary.json) · [plano de homologação independente](phase-2-homologation-plan.md). Supabase compartilhado com Iris tratado como produção; validação de integração exclusivamente simulada.

﻿# Auditoria e correção UI/UX — Doo Doo

Execução local em 16/11/2026. Next 16.4.2, React 19.3.0 e Tailwind 4, conforme dependências instaladas. Foram consultadas as guias locais do Next sobre componentes cliente, CSS e ESLint.

## Evidências e causas

| Achado | Evidência | Causa e tratamento |
| --- | --- | --- |
| P0: header cobre o título do modal da Agenda em desktop | Reproduzido em 1440×900; `before/agenda-modal-1440.png` | Overlay dentro de ancestral com backdrop-filter/overflow. Todos os 14 diálogos passaram ao portal compartilhado no body. |
| P0: navegação inferior cobre o formulário em mobile | Reproduzido em 320×568; `before/agenda-modal-320.png` | Contexto de empilhamento e modal sem geometria comum. Portal, altura dinâmica, header/footer fixos e corpo rolável. |
| P1: tarefa fecha antes da resposta da gravação | Reproduzido no teste com resposta atrasada | Fechamento otimista removido; o formulário fecha após sucesso e conserva os campos em caso de erro. |
| P1: data e sete dias apertados na Agenda mobile | Observado na inspeção visual | Data ocupa uma linha; dias usam toda a largura; setas ficam em linha separada em telas pequenas. |
| P1: estilos de marca/dark não ligados ao tema | Confirmado no código original; sem captura de CSS computado anterior | Definidos token Tailwind `--color-brand-panel` e variant `dark` para `data-theme`. Cores computadas finais registradas em `after/matrix.json`. |
| P1: foco, labels e ações de diálogos inconsistentes | Confirmado estaticamente no código original | Infraestrutura comum, foco inicial/contido/devolvido, Escape, fundo inerte, bloqueio reversível de rolagem, labels e nomes acessíveis. Comportamento final testado no navegador. |
| Segurança: fallback de identidade por nome/primeiro perfil em Tarefas | Encontrado estaticamente; não foi explorado contra o backend | Removido. Exige perfil vinculado à sessão. Testado estado sem perfil; nenhuma alteração de RLS, papéis ou permissões. |
| P1: criação de notas sem aguardar resultado | Confirmado no fluxo original | Aguarda a gravação; mantém o formulário e anuncia erro quando a operação falha. |

As capturas iniciais feitas no servidor de desenvolvimento ficaram em carregamento e foram descartadas como evidência. A baseline válida foi capturada do build original, servido localmente na porta 3100. O servidor de desenvolvimento existente na porta 3000 foi preservado.

## Arquivos modificados

| Arquivo | Alteração |
| --- | --- |
| `app/dashboard/ModalShell.tsx` | Portal centralizado, título/descrição associados, foco, Tab/Shift+Tab, Escape, retorno de foco, pilha de diálogos, inert e scroll lock. |
| `app/dashboard/useDialogAction.ts` | Proteção de ações assíncronas contra submissões repetidas e feedback de falha. |
| `app/dashboard/layout.tsx` | Header no fluxo, área útil/safe-area, navegação ativa, controles nomeados e feedback anunciado. |
| `app/globals.css` | Tokens/variant Tailwind 4, contraste de ações, foco visível, modal compartilhado, reduced-motion e composer adaptado à largura do painel. |
| `app/contexts/ThemeContext.tsx` | Uma fonte de tema, valores válidos e sincronização de armazenamento via useSyncExternalStore. |
| `app/layout.tsx` | Viewport com safe-area e preferência por redimensionamento do conteúdo com teclado. |
| `app/page.tsx` | Usa o tema compartilhado e anuncia erros de login. |
| `app/dashboard/page.tsx` | Modal de resumo compartilhado e ações de cards por teclado. |
| `app/dashboard/tarefas/page.tsx` | Dois diálogos, labels, foco, identidade vinculada à sessão, formulário preservado durante gravação e proteção contra repetição. |
| `app/dashboard/agenda/page.tsx` | Dois diálogos, labels, data/dias responsivos e dimensionamento flex. |
| `app/dashboard/notas/page.tsx` | Três diálogos, labels, nomes de ações, erro de gravação preservando conteúdo e dimensionamento do editor. |
| `app/dashboard/conversas/page.tsx` | Quatro diálogos, composer em painéis estreitos, emoji contido, labels e proteção dos formulários. |
| `app/dashboard/configuracoes/page.tsx` | Dois diálogos, labels e overlay de limpeza migrado para portal com progresso acessível. A limpeza não foi executada. |
| `package.json` | `lint` usa ESLint CLI; adicionado `typecheck`. Sem novas dependências. |
| `scripts/*.mjs` | Fixtures locais, screenshots, matriz visual, diálogos e regressões de interação. |

## Matriz executada

As sete rotas são `/`, `/dashboard`, `/dashboard/tarefas`, `/dashboard/conversas`, `/dashboard/agenda`, `/dashboard/notas` e `/dashboard/configuracoes`.

As oito resoluções são 320×568, 375×568, 390×844, 768×1024, 1024×768, 1280×800, 1440×900 e 1920×1080. As dez paletas são light, dark, ocean, nature, sunset, amethyst, aurora, solar, coral e graphite.

| Cobertura | Verificação | Evidência |
| --- | --- | --- |
| Sete rotas × oito resoluções × dez temas | Largura do documento, erros JS, tema aplicado e cores computadas das utilities | `after/matrix.json` |
| Estados de Tarefas, thread/membros do Chat, editor de Notas, dia da Agenda e cinco tabs de Configurações | Reflow do documento e screenshots em resoluções selecionadas | `after/matrix.json`, `after/state-*.png` |
| 14 diálogos × 320×568/1440×900 × dez temas | Geometria, header/footer, foco, Tab/Shift+Tab, Escape, backdrop e retorno de foco | `after/modals.json`, `after/*modal*.png` e demais capturas de diálogos |
| Seis regressões funcionais isoladas | Validação/criação de tarefa, submissão repetida/busy, erro de nota, diálogos simultâneos, perfil ausente, chat/envio/upload e navegação da Agenda | `after/interactions.json` |
| Reflow equivalente a zoom 200% em desktop 1280×800 | Viewport CSS 640×400 com escala 2; seis rotas do dashboard | `after/matrix.json` |
| Viewport curta de chat | Composer em 320×360 | `after/chat-short-viewport.png` |

O teste equivalente de reflow não substitui zoom nativo do navegador. As verificações de largura do documento não certificam, sozinhas, a ausência de todo corte interno; por isso foram complementadas por diálogos, estados internos e inspeção de screenshots.

## Reproduzir a validação

```powershell
npm run build
npm run typecheck
npm run lint
node node_modules/next/dist/bin/next start -p 3100
# Em outro terminal, com Chrome instalado:
node scripts/ui-interactions.mjs
node scripts/ui-modals.mjs
node scripts/ui-matrix.mjs
```

O Playwright foi obtido temporariamente com `npx --yes --package=@playwright/test playwright --version`, sem alteração do package.json/lockfile. O resolvedor procura a instalação local, `PLAYWRIGHT_MODULE` ou o cache temporário do npm. Os scripts de navegador usam o Chrome instalado.

Os testes interceptam HTTP do Supabase, fornecem uma sessão fictícia no contexto do navegador e bloqueiam WebSockets e outros acessos externos. Os mocks ficam exclusivamente nos scripts; a aplicação não recebeu bypass de autenticação. Mensagens, uploads e gravações de teste não chegam ao backend. As fixtures foram ampliadas durante a execução para cobrir o menu Chat e um grupo separado; dados de exemplo entre capturas podem variar.

## Validação estática e limites

Build e TypeScript passam. O comando original `next lint` falhava por interpretar `lint` como diretório; foi substituído pela CLI do ESLint. Permanecem falhas preexistentes de lint, principalmente `any`, efeitos e navegação via location. Os relatórios `eslint-before.json` e `eslint-final.json` identificam cada arquivo, linha e regra. Nenhuma regra foi desativada.

Não houve commit/push, alteração de `.env`, migração, mudança de schema, RLS ou execução administrativa em produção.

Permanecem para homologação em ambiente autorizado: autenticação/SSO reais, políticas RLS, CRUD administrativo com contas reais de teste, realtime entre clientes, entrega de anexos e integrações externas. Safari/iOS, instalação PWA, teclado virtual físico, zoom nativo 200%, alto volume de dados e uma avaliação completa WCAG 2.2 AA exigem validação adicional. O overlay de limpeza foi migrado e compilado, mas a operação destrutiva não foi disparada. Fontes externas foram bloqueadas nos testes, com uso da fonte de fallback.

Os resultados numéricos finais e a lista de falhas de lint ficam em `validation-summary.json`.

## Resultados finais

| Tela | Casos de resolução/tema | Estados adicionais | Resultado |
| --- | ---: | ---: | --- |
| Login | 80 | 0 | Sem overflow horizontal do documento ou erro JS |
| Visão Geral | 80 | 0 | Sem overflow horizontal do documento ou erro JS |
| Tarefas | 80 | 8, detalhe selecionado | Sem overflow horizontal do documento ou erro JS |
| Chat | 80 | 16, thread e membros | Sem overflow horizontal do documento ou erro JS |
| Agenda | 80 | 8, modo diário | Sem overflow horizontal do documento ou erro JS |
| Notas | 80 | 8, editor | Sem overflow horizontal do documento ou erro JS |
| Configurações | 80 | 40, cinco tabs | Sem overflow horizontal do documento ou erro JS |

Também passaram seis casos de reflow em 640×400/DPR 2, equivalentes à área CSS de uma janela 1280×800 em 200%. Isso não substitui o teste de zoom nativo.

Os 14 diálogos foram abertos em 320×568 e 1440×900. Os 28 casos passaram em foco inicial, contenção/ciclo de Tab e Shift+Tab, Escape, retorno de foco, fundo inerte, clique externo permitido/bloqueado e header/footer visíveis. A geometria e as cores dos mesmos diálogos foram verificadas nas dez paletas, totalizando 280 combinações. As verificações de teclado foram feitas na paleta light.

As seis regressões de interação passaram: tarefa obrigatória/submissão única/salvamento pendente; falha de nota preservando formulário; pilha de diálogos; ausência de perfil; composer/envio simulado/erro de upload; navegação diária/semanal da Agenda.

O lint final mantém 60 erros e 36 avisos, ante 62 erros e 44 avisos na baseline. Os arquivos novos de modal/hook/tema e scripts não acrescentam erros. Não foi feita limpeza ampla de tipagem/efeitos preexistentes durante a revisão visual.

## Reprodução e artefatos

É necessário Chrome instalado e Playwright temporário disponível. A execução desta auditoria não adicionou Playwright às dependências do aplicativo.

```powershell
npx --yes --package=@playwright/test playwright --version
npm run build
node node_modules/next/dist/bin/next start -p 3100
```

Com o servidor acima aberto, execute em outro terminal:

```powershell
npm run typecheck
npm run lint
node scripts/ui-matrix.mjs
node scripts/ui-modals.mjs
node scripts/ui-interactions.mjs
```

Os três scripts retornam erro quando uma regressão é detectada. `PLAYWRIGHT_MODULE` pode apontar para um diretório de instalação existente do Playwright. A fixture lê somente a URL pública em `.env.local` para determinar a chave de armazenamento da sessão simulada; não imprime nem altera o arquivo.

- [Agenda desktop antes](before/agenda-modal-1440.png) e [depois](after/agenda-modal-1440.png).
- [Agenda mobile antes](before/agenda-modal-320.png) e [depois](after/agenda-modal-320.png).
- [Nova Demanda em 320×568](after/task-modal-320.png).
- [Matriz completa, com CSS computado](after/matrix.json).
- [Regressões de diálogos](after/modals.json) e [interações](after/interactions.json).
- [Resumo numérico e lint por arquivo](validation-summary.json).

As imagens light/dark em `after/` foram recapturadas com animações desabilitadas no screenshot para evitar registrar cores intermediárias durante a troca de paleta. `after/visual-samples.json` registra essa recaptura. O teste de layout não prova, isoladamente, a ausência de todo conteúdo interno cortado; houve inspeção visual dos exemplos indicados, e grandes volumes de dados permanecem uma pendência de homologação.

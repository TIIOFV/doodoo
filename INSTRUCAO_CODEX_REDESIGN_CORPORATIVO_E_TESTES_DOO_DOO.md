# MISSÃO CODEX — DOO DOO: REDESIGN CORPORATIVO + AUDITORIA FUNCIONAL END-TO-END

> Este documento é uma ordem de implementação. Trabalhe no repositório LOCAL ATUAL, e não no ZIP antigo. O relatório de auditoria prévia está em `docs/ui-audit/README.md`. A inspeção anterior foi feita com Supabase simulado; não presuma que o banco, RLS, autenticação ou realtime reais tenham sido validados.

## OBJETIVO E RESULTADO ESPERADO

Transformar o Doo Doo em uma aplicação corporativa SaaS moderna, sofisticada, consistente, rápida e realmente utilizável em desktop e mobile, **sem remover ou quebrar funcionalidades existentes**. Além de modernizar a aparência, executar uma auditoria real de cada aba, interação, persistência e autorização. Corrigir problemas identificados, acrescentar testes de regressão e fornecer evidências.

**Não é apenas um pedido de sugestões ou mockups: implemente, execute, inspecione no navegador, corrija, teste novamente e documente.** Não informe que a funcionalidade foi validada no Supabase real quando somente um mock foi usado.

## REGRAS ABSOLUTAS

1. Leia o projeto e `docs/ui-audit/README.md` antes de alterar algo. Examine o `git diff`, `package.json`, componentes, CSS, rotas, modelos e acesso ao Supabase. Preserve todas as alterações legítimas da auditoria anterior.
2. **Não faça commit/push automaticamente.** Não execute migrations, truncate, delete em massa ou seed em produção. Não exponha `.env`, tokens ou dados pessoais nos relatórios ou screenshots.
3. Preserve rotas, autenticação, permissões, dados, CRUD, realtime, chat, anexos, agenda, notas, rotinas, checklists, notificações e 10 temas existentes. Se for preciso mudar comportamento, documente e teste.
4. Testes com escrita/exclusão somente em ambiente seguro (Supabase local/staging e contas/dados descartáveis). Se não houver ambiente autorizado, faça testes de leitura + mocks e rotule os testes de integração real como **BLOQUEADOS / NÃO TESTADOS**, nunca como aprovados.
5. Não disfarce bugs com `overflow-hidden`, `z-index` arbitrário, `setTimeout` para corrigir sincronização, `any` indiscriminado, `!important` espalhado ou captura silenciosa de erros.
6. Trabalhe incrementalmente: inventário → design system → telas → testes funcionais → correções → reteste. Não faça uma reescrita indiscriminada.

## 1. INSPEÇÃO INICIAL E LINHA DE BASE

- Identifique a versão exata de Next.js, React, Tailwind CSS, TypeScript e Supabase; confira roteamento, diretórios, bibliotecas e componentes compartilhados.
- Execute comandos existentes de lint, typecheck, testes e build e registre os resultados **antes** de editar. O relatório anterior mencionou 60 erros de lint preexistentes (baseline 62). Classifique-os por risco; não declare o lint limpo sem corrigir de fato.
- Abra com Chrome/Playwright todas as páginas, em autenticação compatível com o ambiente de teste. Capture screenshots antes e documente console warnings, erros, problemas de rede e layout.
- Compare a auditoria anterior ao código atual e verifique se a implementação de portais, foco, lock de scroll e proteção contra submissão duplicada realmente permaneceu integrada em todos os fluxos.
- Faça um inventário de telas, rotas, recursos, chamadas ao Supabase, perfis de acesso, erros esperados e componentes UI duplicados.

## 2. DIREÇÃO VISUAL: ENTERPRISE SaaS MODERNO

**Referência estética:** produtividade corporativa contemporânea, clareza de Linear/Notion/Atlassian/Untitled UI, sem copiar interfaces ou ativos protegidos. Refinamento editorial, superfícies simples, boa hierarquia e legibilidade. Evite excesso de glassmorphism, blur intenso, gradientes em todos os elementos, sombras pesadas, ícones aleatórios e cartões exageradamente arredondados.

### Tokens e consistência

- Preserve o azul Doo Doo como marca. Tema claro padrão sugerido: fundo `#F8FAFC`, superfícies `#FFFFFF`, texto `#0F172A`, secundário `#64748B`, bordas `#E2E8F0`, primária `#2563EB`, sucesso `#16A34A`, alerta `#D97706`, erro `#DC2626`.
- Tema escuro equivalente, sem preto puro obrigatório: fundo próximo a `#0B1220`, cards `#111827`, bordas `#253046`, texto `#F1F5F9`.
- Os 10 temas devem continuar acessíveis, mas mudando essencialmente tokens de marca/acento, sem sacrificar legibilidade do conteúdo. Preserve a preferência após reload, confira hydration e contraste.
- Escala de spacing coerente (4, 8, 12, 16, 24, 32), tipografia de interface 14–16px, auxiliares normalmente >=12px, títulos 20–28px e pesos sem exageros. Use uma fonte consistente com fallback e `font-display: swap` quando apropriado.
- Raio padrão de campos/botões 10–12px, cards 12–18px; elevação sutil apenas onde necessária. Não reproduza `rounded-[2.5rem]` indiscriminadamente.
- Estados `hover`, `focus-visible`, `active`, `disabled`, `loading`, `empty`, `success`, `warning`, `error`, `read-only` visíveis e acessíveis, incluindo feedback de operação.
- Ícones Lucide com tamanho e semântica constantes. Datas, status e moedas com formato `pt-BR` quando pertinente.

### Arquitetura UI

- Centralize design tokens no CSS/Tailwind já usado pelo projeto; construa/refatore componentes reutilizáveis (`Button`, `TextField`, `Select`, `Textarea`, `Card`, `Badge`, `Modal/Dialog`, `ConfirmDialog`, `Toast`, `EmptyState`, `Skeleton`, `Tabs`, `SearchInput`, `DataTable` ou equivalentes) SEM criar abstrações inúteis.
- Utilize o componente de diálogo com portal já implementado; nenhuma página deve recriar modais com `fixed inset-0` dentro de stacking contexts. Garanta foco inicial, focus trap, retorno do foco, Escape, backdrop, scroll interno e footer fixo quando necessário.
- Sidebar desktop estável (aprox. 248–272px), header compacto (aprox. 64–72px), conteúdo com largura adequada e rolagem previsível. Navegação colapsada com tooltips e estados ativos claros. Mobile com navegação inferior que não cobre CTA/input nem teclado virtual.
- Campos e botões touch-friendly (alvos ~44px); tabelas responsivas (colunas priorizadas, cards mobile quando apropriado), skeletons sem CLS significativo, microinterações discretas, suporte a `prefers-reduced-motion`.
- Não altere semântica nem informações essenciais por estética. Para mudanças relevantes de layout, salve screenshots de comparação.

## 3. REDESIGN E AUDITORIA FUNCIONAL POR ABA

Para CADA aba, valide: carregar, vazio, carregando, erro, permissão negada, CRUD aplicável, persistência após refresh, paginação/filtro, teclado, modal, mobile, tema claro/escuro e consistência de feedback.

### Login / sessão

- Login correto e inválido, loading, erros claros, logout, sessão expirada, refresh da página, redirecionamentos e rota protegida.
- Não permitir ver conteúdo de outro usuário durante hydration/loading. Nunca usar perfil fictício/primeiro perfil como fallback.

### Visão Geral (`/dashboard`)

- Cards representam contagens reais; status, tarefas atrasadas e atividades refletem banco e permissões. Links e atalhos direcionam à aba correta, filtros e tarefa selecionada, quando previstos.
- Estados vazios, loading, erros, data/hora e navegação desktop/mobile.
- Redesign: hierarquia KPI → ações rápidas → atividade recente. Evite hero/banner desproporcional que roube espaço útil.

### Tarefas (`/dashboard/tarefas`)

- Criar demanda: título obrigatório, categoria, prioridade, responsável, prazo, hora, rotina, checklist, botão Salvar bloqueado durante request, fechamento SÓ após sucesso real, erro preservando formulário, duplo clique/Enter sem duplicata.
- Listar, pesquisar, filtrar Meu Dia/Todas/Urgentes/Rotinas/Concluídas, alternar Minhas/Delegadas e filtrar por responsável sem perder contexto.
- Visualizar/editar tarefa e etapas, status, prioridade, atribuição, marcações, alertas, histórico e comentários; atualizar outra sessão em realtime; tratar rollback ou refetch quando persistência falhar.
- Conclusão de rotina: verificar clone +7 dias exatamente uma vez, fuso/datas, transições, não duplicar após duplo clique ou eventos concorrentes.
- Verificar horários `00:00` e `00:30` (no ZIP antigo havia uso de `hour || 23`, que substitui meia-noite por 23h); vencimento e data de hoje.
- Redesign: lista legível, estados sem excesso de badges, detalhes em painel ou drawer responsivo, modal de criação mais amplo com colunas só quando couber, ações primárias sempre disponíveis.

### Chat (`/dashboard/conversas`)

- Carregar conversas e participantes; chat privado/grupo, envio e recebimento de texto, anexo/imagem conforme recursos existentes, downloads, prévia, arquivos grandes, falha de rede, retry e indicadores.
- Realtime com dois usuários, ordenação de mensagens, múltiplas mensagens rápidas, scroll inteligente sem saltar quando usuário lê histórico, badge de não lidas, lidoPor/read receipts, presença online/offline, reconexão e unsubscribe sem vazamento.
- Criar/editar grupos, adicionar/remover membros e permissões; impedir canais duplicados (inclusive canal Geral) no bootstrap concorrente.
- Mobile: lista ↔ conversa, teclado virtual, composer preso à área visível, anexos e back navigation funcionando.
- Redesign: menu de conversas claro, visual de mensagens elegante, separadores de data, barra do compositor organizada, ações acessíveis.

### Agenda (`/dashboard/agenda`)

- Visões existentes (dia/semana/mês), mudar intervalo, navegar hoje/anterior/próximo, criar/editar/excluir evento quando autorizado, participantes e aceite/recusa se previstos.
- Verificar data local, timezone, DST quando pertinente, eventos no limite de dia/mês, horários e eventos concorrentes; evitar perda de aceites de dois usuários.
- Modal totalmente à frente do cabeçalho, footer acessível e sem navegação inferior por cima. Mobile não deve comprimir calendário nem ocultar ações.
- Redesign: calendário limpo, prioridade ao evento, legenda discreta, lista de compromissos acessível no celular.

### Anotações (`/dashboard/notas`)

- Criar, editar, salvar, listar, pesquisar, organizar por pasta/cor, excluir e confirmar; refresh preserva alterações. Testar salvamento rápido, duplo clique, falha de conexão e conflito de edições.
- Exclusão de pasta com notas deve informar explicitamente se exclui ou move notas; testar operação em staging. Não aceitar perda silenciosa de conteúdo.
- Redesign: lista/card com prévia, editor legível, ações previsíveis, boa tipografia para texto longo.

### Configurações (`/dashboard/configuracoes`)

- Perfil/avatar, preferências, temas, acessibilidade, notificações, permissões, gestão de usuários, status, cargos e setores de acordo com funcionalidades já existentes.
- Testar administrador/gestor/coordenador/colaborador, além de contas de setores diferentes. Esconder controle na UI NÃO substitui RLS efetiva.
- **Revisar criação de usuário:** no ZIP anterior, `supabase.auth.signUp()` era chamado do navegador do admin, com risco de alterar sessão; também havia fallback `crypto.randomUUID()` se `authData.user` fosse ausente, potencialmente criando perfil sem usuário Auth. Usar fluxo seguro (servidor/Edge Function com privilégio restrito, se aprovado) e jamais expor service role no cliente. Corrigir somente após entender a arquitetura e testar.
- Verificar formulário com falhas parciais, duplicidade de email, conta bloqueada, acesso a registros alheios, efeitos de refresh.
- Redesign: tabs claras por assunto, tabelas compactas, edição previsível, feedback administrativo explícito.

## 4. AUDITORIA TRANSVERSAL: DADOS, BUGS E SEGURANÇA

- Confirme RLS real em staging e por papel: cada conta só lê/muda o que deve, inclusive ao chamar Supabase diretamente. Teste acesso fora do setor, manipulação de IDs e operações não permitidas; reporte riscos, não faça exploração fora do ambiente próprio.
- Supabase: para cada `insert/update/delete`, valide `{data,error}` e persistência; use rollback/refetch ou outra estratégia consistente. Não confundir UI otimista com sucesso confirmado.
- Prevenir clique duplo, race conditions, estados obsoletos, duplicatas realtime, re-render infinito, handlers mortos, listeners sem cleanup, updates após unmount, dependências incorretas em `useEffect`, IDs temporários remanescentes e dados inconsistentes após erro.
- Verifique buscas, filtros e paginação com vazio, nomes acentuados, longos, caracteres especiais e grandes volumes.
- Valide navigation/back/forward, deep links, recarregar em rota interna, 404, not-found, error boundaries, permissão negada, logout enquanto modal aberto.
- Auditoria de acessibilidade: labels, contraste WCAG AA, teclado, foco, roles, leitura por leitor de tela (ferramentas disponíveis), zoom 200%/400% e tamanho mínimo de clique.
- Compare performance em desenvolvimento/build de produção quando possível: renderizações desnecessárias, query count, N+1, assinaturas duplicadas, scroll jank e bundle excessivo.

## 5. TESTE AUTOMATIZADO E MANUAL COM EVIDÊNCIAS

### Matriz visual

- Rotas: Login, Visão Geral, Tarefas, Chat, Agenda, Anotações, Configurações.
- Viewports mínimos: 320×568, 375×667, 390×844, 768×1024, 1024×768, 1280×800, 1440×900, 1920×1080.
- Modos: claro, escuro e cobertura dos outros 8 temas; pelo menos os fluxos críticos completos em claro/escuro e verificação geométrica/contraste nos 10 temas.
- Estados: vazio, carregando, com dados, erro, modal, dropdown, editor, teclado virtual quando possível.
- Zero overflow horizontal não intencional, elementos clicáveis ocultos, overlays atrás de headers, CTA fora do viewport, textos ilegíveis, console errors ou hydration warnings introduzidos.

### Fluxos E2E obrigatórios

1. Login → Visão Geral → Tarefas → criar/editar/concluir/excluir item descartável → refresh → validar banco.
2. Tarefa delegada por A → aparece para B → B atualiza → A recebe atualização; testar autorização e realtime.
3. Chat A ↔ B: enviar texto/arquivo se previsto → reconectar → receber e atualizar não lidas/leitura.
4. Agenda: criar evento → visualizar em dia/semana/mês → participante aceita → atualizar entre duas sessões → excluir com permissão.
5. Notas: criar → editar → pesquisar → refresh → excluir com confirmação.
6. Configurações: mudar tema e perfil → refresh → persistir; testar restrições por cargo; cadastro de usuário em staging com sessão admin preservada.
7. Logout → rota interna protegida não exibe dados → login com outro usuário não reaproveita dados do anterior.
8. Offline/timeout/restrição RLS nas ações relevantes → erro visível + sem falso positivo, sem duplicação e sem perda silenciosa.

Use Playwright com fixtures isoladas, mock estável para testes visuais e integração real SOMENTE em staging seguro. Se não houver credenciais/staging para dois usuários, liste exatamente os testes bloqueados e os requisitos para concluí-los. Nunca coloque credenciais no repositório ou no relatório.

### Qualidade técnica

- `npm run build`, TypeScript, lint e testes definidos no `package.json`, usando o gerenciador correspondente.
- Categorize lint: introduzido versus preexistente. Corrija erros nas áreas tocadas. Não silencie globalmente as regras.
- Execute testes após cada etapa e consolide no final. Adicione testes E2E/regressão rastreáveis, com asserts úteis, sem fixtures frágeis.

## 6. ORDEM DE EXECUÇÃO E ENTREGÁVEIS

### Fase A — Diagnóstico

Escreva `docs/ui-audit/phase-2-baseline.md`: capturas iniciais, arquivo/linha, impacto visual/funcional, prioridade P0/P1/P2, causa-raiz e status de teste real vs simulado. Informe primeiro riscos críticos (autenticação, RLS, perda de dados, sessão, duplicação).

### Fase B — Design system e shell

Crie tokens/componentes coerentes, ajuste estrutura global, preserve 10 temas e faça snapshots de antes/depois. Não prossiga com redesign de telas se a navegação/diálogos estiver quebrada.

### Fase C — Cada aba, de ponta a ponta

Atualize uma aba de cada vez; rode testes, compare screenshots e confirme fluxos. Corrija bugs funcionais na mesma área antes de avançar.

### Fase D — Integração, segurança e regressão

Execute a matriz visual e os fluxos E2E. Confirme por logs e pelo banco em staging quando disponível. Não declare sucesso por screenshots ou logs de mocks.

### Fase E — Relatório final

Salve `docs/ui-audit/phase-2-report.md` contendo:

- Resumo executivo e comparação visual.
- Lista de arquivos editados e motivo.
- Tabela de TODOS os fluxos por rota: **PASSOU REAL / PASSOU MOCK / FALHOU / BLOQUEADO / NÃO EXECUTADO**, com evidência e link para screenshot/log.
- Erros encontrados e consertos, incluindo riscos de dados e sessão.
- Matriz de resoluções/temas.
- Saída do build/typecheck/lint antes e depois.
- Comandos para reproduzir a validação, sem segredos.
- Pendências de homologação manual: Safari/iOS, PWA offline, teclado físico, zoom nativo, autenticação/RLS/realtime reais se não testados.
- Checklist final assinado por resultado real de cada aba, não apenas por compilação.

## CRITÉRIOS DE ACEITE — NÃO DECLARAR CONCLUÍDO SEM ISTO

1. Visual corporativo coeso, moderno, legível e responsivo em todas as abas, mantendo identidade Doo Doo e 10 temas.
2. Nenhum modal cortado ou encoberto; navegação e inputs funcionais no mobile; sem overflow acidental.
3. Cada aba testada com dados e casos de erro, sem falso sucesso de operações não persistidas.
4. Autenticação/usuários/permissões sem bypass; testes reais de RLS/realtime somente marcados OK se efetivamente executados.
5. Rotas, notificações, filtros, CRUD e operações críticas sem regressões conhecidas; falhas reportadas claramente.
6. Sem novos erros de TS/build/lint, tests automatizados reproduzíveis e screenshots relevantes.
7. **Nada de commit, push, publicação ou alteração destrutiva sem autorização expressa.**

**Comece agora examinando o repositório atual e o relatório da primeira auditoria. Em seguida faça o inventário, implemente as correções em fases, execute os testes e entregue o relatório. Não pare na análise.**

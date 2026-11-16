# Fase 2 — redesign corporativo e auditoria funcional do Doo Doo

Data: 16/11/2026. Implementação local, sem commit, push ou deploy.

## Resultado e limites

As sete telas receberam modernização e correções funcionais. O navegador utilizado foi Chrome real, automatizado com Playwright, contra build local. **Todos os testes de Supabase foram simulados. Nenhuma integração real foi aprovada.** O projeto configurado é compartilhado com Iris Gestão em produção; não houve criação de usuários remotos, CRUD externo, alteração de Auth, migrations, RLS, funções, triggers, schemas ou configurações.

As fases de diagnóstico, implementação e validação local têm evidências abaixo. A aceitação de integração, segurança de servidor e homologação manual permanece parcial/BLOQUEADA; este relatório não certifica o sistema para produção.

- Matriz: **646 verificações**, zero overflow horizontal e zero `pageerror` nas amostras. São 560 combinações de sete rotas × oito resoluções × dez temas, 80 estados internos e seis verificações de reflow equivalente a 200%.
- Diálogos: **28 casos**, com dez temas por caso; portal, cabeçalho/rodapé visíveis, foco inicial, Tab/Shift+Tab e wrap, fundo inerte, Escape, backdrop e retorno do foco aprovados.
- Capturas finais adicionais: 21 telas, nas larguras 320, 390 e 1440, aguardando conteúdo específico de cada rota; sem erro de execução ou overflow nessas capturas.
- Regressões de domínio: seis verificações locais de meia-noite, 00:30, datas/horas inválidas, prazo concluído, pesquisa com acentos e ID determinístico de rotina.
- Qualidade: build e TypeScript aprovados; lint passou de **60 erros/36 avisos** para **zero erros/14 avisos**. Os 14 avisos restantes são `@next/next/no-img-element`; imagens de avatar/anexos continuam nativas. Nenhuma regra foi desativada para obter esse resultado.

Resultados funcionais completos, inclusive retestes e limitações de cobertura, estão na tabela ao final. A quantidade de cenários não equivale à quantidade de funcionalidades certificadas.

## Design implementado

Superfícies neutras claras/escuras, bordas discretas, sombras reduzidas, tipografia e espaçamento consistentes, raios menores e tokens semânticos. Os dez temas foram preservados, com seleção identificável por nome. Sidebar expandida/recolhida, header compacto e navegação móvel incluindo Anotações e Perfil. Componentes comuns de painel, input, botão, carregamento, estado vazio e aviso reduzem estilos divergentes. O composer do chat se adapta ao espaço disponível. Diálogos mantêm portal, foco e scroll da auditoria anterior.

Foram inspecionadas visualmente capturas de desktop e mobile, incluindo dashboard, lista de tarefas, notas, chat aberto e formulário de tarefa. A matriz automatizada verifica geometria e aplicação de tokens; **não constitui certificação WCAG AA ou medição completa de contraste**.

## Relatório por aba

| Aba | Bugs encontrados e correções realizadas | Validação simulada aprovada | Integração real / pendências |
| --- | --- | --- | --- |
| Login | Páginas protegidas eram montadas ocultas sem sessão; permissões filtravam navegação sem impedir URL direta; troca/logout podia conservar contexto. Shell agora aguarda sessão, perfil e permissão, observa Auth e remonta por identidade. Login inválido tem erro visível. Logout usa escopo local para preservar outras sessões do projeto compartilhado. | Ausência de consultas das páginas protegidas sem sessão; credencial inválida/válida; logout e retorno à URL protegida; URL negada por cargo. | Auth, refresh/expiração real, bloqueio de usuário, SSO e sessões do Iris: BLOQUEADOS. UI não substitui RLS. |
| Visão Geral | Prazo 00:00 era interpretado incorretamente; resumo podia ficar desatualizado; link de tarefa não era consumido no destino. Parser compartilhado, atualização por eventos e consumo do taskId corrigidos. | Resumo abre tarefa correta por deep link; matriz com dados e modal Minha Fila; casos locais de prazo. | Contadores e realtime reais: BLOQUEADOS. Falha inicial de todas as consultas e transição offline completa: NÃO EXECUTADAS de ponta a ponta. |
| Tarefas | Updates/deletes podiam aparentar sucesso sem persistir; edição de checklist/comentários podia sobrescrever alterações; rotina podia duplicar; dedupe por título era inseguro. Retorno confirmado, lock por registro, leitura atual e atualização condicional, ID estável, exclusão após confirmação, preservação de editores em falha. Status fica indisponível durante gravação concorrente. Rotina calcula +7 dias com virada de ano e permite retentar criação da próxima ocorrência. | CRUD com checklist e refresh, exclusão negada, status negado, delegação A/B e checklist via realtime simulado, conclusão concorrente com única próxima ocorrência, deep link. | RLS, contratos JSONB/UUID, atomicidade da rotina e conflitos reais: BLOQUEADOS. Comentários/reminder têm correção de código, mas fluxo dedicado de regressão NÃO EXECUTADO. |
| Chat | Mensagens iguais eram conciliadas por texto; falha perdia draft; resposta de canal anterior podia contaminar o atual; confirmação podia remover a própria mensagem. IDs estáveis, conciliação por ID, retry, draft por canal, guardas de canal, merge condicional de metadata e scroll respeitando leitura do histórico. Resolução de DM precede upload; grupo evita duplicação local após insert. Remoção negada mantém conversa e confirmação. | Texto com falha/reenvio, textos iguais com IDs diferentes, A/B com leitura e entrega via websocket simulado, criação de grupo com falha recuperável, remoção negada, anexo no canal selecionado e refresh. | Storage real, expiração/download de URL assinada, reconexão real, notificações de navegador e SSO: BLOQUEADOS. Reconexão, adicionar/remover membros concorrentes, mídia/emoji/resposta e excluir mensagem não receberam regressão dedicada nesta fase. |
| Agenda | Exclusão e aceite podiam mostrar estado falso; não havia atualização entre sessões; faltava edição e validação do intervalo. Escritas confirmadas, assinatura com cleanup, detalhe atualizado, edição pelo organizador preservando aceites e validação fim > início. Falha no convite de chat é distinguida do evento já salvo. | Criar/refresh, horário inválido, editar mantendo participante, delete negado seguido de delete confirmado; aceite simultâneo com coluna de versão simulada. Dia e diálogos na matriz visual. | Persistência, RLS e simultaneidade reais: BLOQUEADAS. Sem updated_at confiável, aceite não tem garantia atômica. Semana/mês aparecem na UI, mas não tiveram assert funcional dedicado. |
| Anotações | Um debounce único perdia título/conteúdo; erro de autosave era silencioso. Fila por nota, patches mesclados, gravação serial, versão confirmada, rascunho local por usuário, estado salvo/erro, retry e mesclagem explícita em conflito. Delete usa proprietário e confirmação. Pesquisa normaliza acentos. | Edição rápida de dois campos + refresh, falha/retry, conflito de duas sessões sem apagar draft, criar/pesquisar/refresh/excluir e isolamento privado no mock. | Persistência/RLS/CAS real: BLOQUEADAS. Caderno excluído remotamente com draft pendente, quota do localStorage e perda abrupta do dispositivo: NÃO EXECUTADOS. |
| Configurações | Signup substituía sessão do admin e permitia UUID fictício; retry podia criar Auth outra vez; operações sem linha confirmada aparentavam sucesso. Cliente público de cadastro isolado, ID Auth obrigatório e retry da identidade pendente; consultas administrativas limitadas pela UI; operações confirmadas; bloqueio/exclusão do próprio perfil impedidos; falhas de auditoria separadas. Avatar realmente enviado; nome profissional é somente leitura para evitar referências quebradas por nome. Privacidade tem rollback. Progresso artificial de exportação removido. | Cadastro preservando admin após refresh, falha parcial de perfil com um único signup, resposta Auth sem ID negada, privacidade/tema/avatar com refresh, controles ocultos para colaborador, criar/excluir categoria com persistência simulada. | Administração/RLS/Auth reais: BLOQUEADOS. Exportação ZIP, purga, transcrição, alteração de papéis/exceções e exclusão administrativa não foram executadas em fluxos dedicados nesta fase. Não usar estas ações contra o projeto compartilhado para validar. |

## Antes e depois

O “antes” abaixo usa as capturas preservadas da **auditoria anterior**, já disponíveis ao iniciar a Fase 2. As primeiras capturas em `phase-2/before` incluem telas ainda carregando e não servem como comparação completa com dados; foram mantidas como evidência dessa limitação. As capturas finais aguardam conteúdo específico da rota. Fixtures e horário podem diferir; não são screenshots de dados reais.

| Tela | Antes — referência da auditoria anterior | Depois desktop | Depois mobile |
| --- | --- | --- | --- |
| Login | [antes](after/login-1440-light.png) | [depois](phase-2/after/login-1440.png) | [320](phase-2/after/login-320.png) |
| Visão Geral | [antes](after/dashboard-1440-light.png) | [depois](phase-2/after/dashboard-1440.png) | [320](phase-2/after/dashboard-320.png) |
| Tarefas | [antes](after/tarefas-1440-light.png) | [depois](phase-2/after/tarefas-1440.png) | [320](phase-2/after/tarefas-320.png) |
| Chat | [antes](after/conversas-1440-light.png) | [depois](phase-2/after/conversas-1440.png) | [thread 320](phase-2/after/state-conversas-thread-320.png) |
| Agenda | [antes](after/agenda-1440-light.png) | [depois](phase-2/after/agenda-1440.png) | [320](phase-2/after/agenda-320.png) |
| Anotações | [antes](after/notas-1440-light.png) | [depois](phase-2/after/notas-1440.png) | [320](phase-2/after/notas-320.png) |
| Configurações | [antes](after/configuracoes-1440-light.png) | [depois](phase-2/after/configuracoes-1440.png) | [320](phase-2/after/configuracoes-320.png) |

Galeria adicional em `phase-2/after`: claro/escuro, estados internos e 28 screenshots de diálogos. Capturas de modal resultam de interação de teclado e podem mostrar scroll interno no campo focado.

## Evidências e método

- [Baseline](phase-2-baseline.md), [lint antes](phase-2-eslint-before.json), [lint final](phase-2-eslint-final.json), [build final](phase-2-build-final.log), [TypeScript final](phase-2-typecheck-final.log).
- [Matriz](phase-2/after/matrix.json), [diálogos](phase-2/after/modals.json), [capturas finais](phase-2/after/results.json), [domínio](phase-2/domain-tests.json), [fluxos](phase-2/flows.json).
- Resoluções: 320×568, 375×667, 390×844, 768×1024, 1024×768, 1280×800, 1440×900 e 1920×1080. Temas: light, dark, ocean, nature, sunset, amethyst, aurora, solar, coral e graphite.
- Fixture visual estável e sandbox funcional têm objetivos diferentes. A visual não prova persistência. A funcional mantém tabelas apenas na memória, aplica filtros simulados e transporta eventos Phoenix via websocket interceptado; refresh reconsulta essa memória. **Não valida SQL, RLS, Auth, Storage ou realtime Supabase reais.**
- HTTP Supabase é interceptado antes da navegação; websockets não chamam `connectToServer`. Outros destinos externos são abortados. Sessões/tokens de teste são fictícios; não se imprimem variáveis secretas nem credenciais.
- Houve falhas intermediárias de teste por servidor local antigo, seletores ambíguos e protocolo Phoenix do mock. Foram corrigidas e retestadas; não são apresentadas como falhas do backend real. Bugs reais de frontend encontrados durante o reteste foram corrigidos no repositório.
- A matriz/diálogos foi concluída antes dos últimos ajustes de bloqueio durante save, readonly do nome e feedback de erro de grupo. Estes ajustes não alteraram tokens ou geometria; capturas finais e regressões relevantes foram executadas sobre o build atualizado.

## Arquivos e responsabilidades

| Arquivos | Motivo |
| --- | --- |
| app/globals.css; app/layout.tsx; app/components/ui.tsx | Tokens, tipografia, componentes e base visual |
| app/contexts/ThemeContext.tsx; app/dashboard/ModalShell.tsx | Preservação e integração dos temas/diálogos da auditoria anterior |
| app/page.tsx; app/dashboard/layout.tsx | Login, sessão, autorização de rota, navegação e notificações por usuário |
| app/dashboard/page.tsx | Resumo, prazo, atualização e navegação |
| app/dashboard/tarefas/page.tsx | CRUD confirmado, checklist, delegação, rotina e editor |
| app/dashboard/conversas/page.tsx | Mensagens, drafts, canais, anexos e sincronização cliente |
| app/dashboard/agenda/page.tsx | CRUD, edição, aceites e atualização |
| app/dashboard/notas/page.tsx; useNoteDrafts.ts | Autosave, conflitos e drafts recuperáveis |
| app/dashboard/configuracoes/page.tsx; app/lib/supabase.ts | Perfil, administração e cliente de cadastro isolado |
| app/dashboard/useRecordActions.ts; useDialogAction.ts | Controle de operações concorrentes/submissões duplicadas |
| app/lib/domain.ts; models.ts; useHydrated.ts; useSignOut.ts | Datas, identidade de ocorrências, tipos e comportamento comum |
| scripts/phase-2-*.mjs; docs/ui-audit | Fixtures, verificações reproduzíveis, imagens, logs e relatórios |
| package.json | Script typecheck da auditoria, sem nova dependência de produção |

As alterações legítimas que já estavam no workspace foram preservadas; o diff em relação a HEAD também contém trabalho anterior. Não houve modificação em `.env.local`, configuração remota ou repositório do Iris.

## Pendências para aceite integral

**BLOQUEADO por segurança:** qualquer teste real que escreva no banco compartilhado, crie usuários ou altere permissões/infraestrutura. RLS e autenticação real não podem ser aprovadas com mock. O [plano de homologação independente](phase-2-homologation-plan.md) identifica Auth, SSO, tabelas, Storage, realtime e dependências desconhecidas com o Iris antes de qualquer proposta estrutural.

**Limites de concorrência:** rotina ainda usa duas operações, sem transação; determinismo não garante conclusão conjunta. Agenda precisa de versão confiável ou operação atômica. Arrays de membros/leitores e identidade por nome exigem revisão do contrato real. O mock não prova compatibilidade de filtros JSONB, tipos UUID, índices ou políticas.

**NÃO EXECUTADO:** Safari/iOS e Android físicos, teclado virtual real, PWA/service worker offline, zoom nativo 200%/400%, leitor de tela, auditoria completa de contraste e performance/LCP em rede real. Reflow a 200% é equivalência de viewport CSS, não zoom nativo. Os fluxos não cobertos estão identificados por aba acima.

**Riscos funcionais residuais:** URL de mídia assinada pode expirar e precisa de política de renovação validada; upload bem-sucedido seguido de falha da mensagem pode deixar objeto órfão; cadastro Auth bem-sucedido com perfil pendente pode exigir recuperação administrativa após fechar/reabrir o formulário; exclusões em várias tabelas e purgas existentes não são transacionais. Não foram alterados schemas para contornar esses limites.

## Reproduzir sem acessar serviços externos

Pré-requisitos: dependências locais instaladas, Chrome e Playwright local/cache resolvido por `scripts/playwright-path.mjs`. Os scripts usam somente a URL pública local para identificar qual host interceptar; não exibem a configuração. Não executar ferramentas de migração/seed remotas.

```powershell
npm run build
node node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3200
# Em outro terminal, sem reconstruir enquanto o servidor estiver ativo:
node scripts/phase-2-domain.mjs
node scripts/phase-2-flows.mjs
node scripts/phase-2-matrix.mjs
node scripts/phase-2-modals.mjs
node scripts/phase-2-visual.mjs after
npm run typecheck
npm run lint
```

Interromper e reiniciar o servidor local após novo build para evitar chunks/manifests antigos. O servidor do usuário na porta 3000 foi preservado. Os testes simulados descartam a memória ao encerrar o processo e não requerem limpeza do Supabase.

## Resultados funcionais consolidados

25/25 cenários aprovados com mocks no consolidado; o reteste específico de Chat substitui a falha intermediária e está preservado separadamente. Nenhum PASSOU REAL de integração.

| Área | Cenário executado | Resultado | Evidência |
| --- | --- | --- | --- |
| Login / acesso | protected route does not mount hidden child queries | PASSOU MOCK | [log](phase-2-flows.log) |
| Login / acesso | invalid login, valid login, logout and protected back navigation | PASSOU MOCK | [log](phase-2-flows.log) |
| Login / acesso | direct URL denied by role | PASSOU MOCK | [log](phase-2-flows.log) |
| Tarefas | create, edit, checklist, complete, refresh and delete | PASSOU MOCK | [log](phase-2-flows.log) |
| Tarefas | denied task deletion preserves UI and confirmation | PASSOU MOCK | [log](phase-2-flows.log) |
| Anotações | rapid title/content edits persist both fields across reload | PASSOU MOCK | [log](phase-2-flows.log) |
| Anotações | failed autosave retains draft and retry persists | PASSOU MOCK | [log](phase-2-flows.log) |
| Configurações | signup preserves administrative identity after reload | PASSOU MOCK | [log](phase-2-flows.log) |
| Agenda | create event persists across refresh | PASSOU MOCK | [log](phase-2-flows.log) |
| Chat | failed send retains draft and sends duplicate text with distinct IDs | PASSOU MOCK | [log](phase-2-flows-chat.log) |
| Tarefas | delegation and checklist synchronize between two simulated users | PASSOU MOCK | [log](phase-2-flows.log) |
| Tarefas | concurrent routine completion creates one next occurrence seven days later | PASSOU MOCK | [log](phase-2-flows.log) |
| Tarefas | failed status update does not claim completion | PASSOU MOCK | [log](phase-2-flows.log) |
| Anotações | conflicting edits preserve both the confirmed version and the losing draft | PASSOU MOCK | [log](phase-2-flows.log) |
| Anotações | create, accent-insensitive search, refresh, delete and private isolation | PASSOU MOCK | [log](phase-2-flows.log) |
| Configurações | partial registration retry reuses Auth identity and missing Auth ID fails closed | PASSOU MOCK | [log](phase-2-flows.log) |
| Configurações | privacy and theme persistence with restricted administration controls | PASSOU MOCK | [log](phase-2-flows.log) |
| Chat | two simulated users receive messages and synchronize read receipts | PASSOU MOCK | [log](phase-2-flows-chat.log) |
| Agenda | invalid time, edit with attendance preserved and denied deletion | PASSOU MOCK | [log](phase-2-flows.log) |
| Agenda | concurrent attendance with version and realtime preserves two participants | PASSOU MOCK | [log](phase-2-flows.log) |
| Visão Geral | queue navigation consumes task deep link | PASSOU MOCK | [log](phase-2-flows.log) |
| Configurações | avatar update persists and professional name is read only | PASSOU MOCK | [log](phase-2-flows.log) |
| Configurações | category create persists across refresh and confirmed delete | PASSOU MOCK | [log](phase-2-flows.log) |
| Chat | group creation failure is visible and leaving denied group preserves membership | PASSOU MOCK | [log](phase-2-flows-chat.log) |
| Chat | attachment persists in selected channel and is reconciled after refresh | PASSOU MOCK | [log](phase-2-flows-chat.log) |

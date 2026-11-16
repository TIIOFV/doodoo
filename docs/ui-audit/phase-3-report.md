# Fase 3 — homologação segura e riscos funcionais

Data: 16/11/2026. Implementação e validação exclusivamente locais. Sem commit, push ou deploy.

## Resultado e limite de segurança

Os relatórios da Fase 2 foram lidos integralmente. O projeto atual foi mantido como **PRODUÇÃO compartilhada com Iris Gestão**. Não houve conexão de integração ao Supabase real, escrita/exclusão remota, criação de Auth, alteração de RLS/Storage, aplicação de SQL ou criação de recursos externos.

Foram preparados inventário, configuração, scripts de preflight, cinco migrations candidatas, fixtures e procedimento de revisão para um Supabase independente. **Esses SQLs não foram aplicados nem compilados em PostgreSQL.** O schema é inferido do código e precisa ser confrontado com metadados autorizados e revisado antes de uso.

Foram implementadas correções locais de dados, permissões, recuperação e navegação. A atomicidade no banco está **PREPARADA/BLOQUEADA**, com comportamento de cliente validado contra RPCs simulados. Não foi certificada no Supabase compartilhado e não foi ativada nele.

## Diário & Atualizações — pedido adicional

Cada mensagem nova agora recebe UUID e ID do autor autenticado. O autor pode usar **Editar mensagem**, salvar/cancelar e **Excluir mensagem** com confirmação. A mensagem editada mostra “Editada”. O envio não apaga o texto antes de confirmação; falhas de edição preservam o editor e falhas de exclusão preservam a confirmação. Edição concorrente não sobrescreve silenciosamente uma versão diferente.

As ações foram testadas no caminho REST atual e no contrato RPC isolado. **Mensagens antigas sem `authorId` permanecem somente leitura.** Um nome igual ao usuário não comprova autoria histórica; não foi feito backfill nem alteração desses registros no banco compartilhado. Regularização de autoria exige análise e autorização próprias, sem atribuição automática por nome.

[Desktop](phase-3/diary-desktop.png) · [Mobile](phase-3/diary-mobile.png) · [Testes REST do diário](phase-3/legacy/additional-diary.json).

## Correções por área

| Área | Correção implementada | Verificação / limite |
| --- | --- | --- |
| Login e shell | Configuração isolada validada antes de criar o cliente; SSO de saída e aceitação de fragmentos desativados em modos isolados; tratamento de falha ao obter sessão; assinaturas/notificações vinculadas à identidade atual e às abas permitidas. | Usuário bloqueado não monta dados; troca A→B não exibe notas/outbox de A; SSO isolado bloqueado. Auth/RLS reais continuam bloqueados. |
| Visão Geral | Falhas nas consultas de notas/permissões deixam de ser ignoradas; erro de indicadores é limpo após atualização bem-sucedida. | Falha inicial visível e recuperação por refresh; regressão do deep link. |
| Tarefas | Diário editável/excluível pelo autor, com controle de versão do texto; lembretes identificados por autor/UUID; contrato atômico para rotina e checklist. A próxima ocorrência preserva o criador original. | CRUD e diário; erro/retry; conflitos entre sessões; lembrete; falha de rede; rollback e idempotência simulados. No modo compartilhado, a rotina anterior ainda usa duas operações: essa limitação permanece até homologação/aplicação autorizada do RPC. |
| Agenda | RPC de aceite vinculado ao ator, sem depender do timestamp do cliente; fallback REST compara a lista quando não há updated_at; normalização de hora retornada como HH:mm:ss. | Aceite concorrente sem coluna de versão no mock; dia, semana e seleção de data em outro mês. Contrato JSONB e atomicidade real dependem do novo banco. |
| Chat | Outbox por usuário, salvo antes do envio e conciliado por ID; refresh recupera pendências; resposta perdida após commit não duplica mensagem; retry de arquivo reaproveita upload. Caminho do objeto é preservado, acesso assinado é renovado ao abrir e TTL novo é de 15 minutos. Falha de prévia não perde o arquivo: a mensagem guarda o caminho. | Texto/arquivo/imagem, falhas, refresh, entrega/leitura, reconexão, resposta antiga de canal, pesquisa, emoji, resposta e exclusão passaram com mocks. Download foi aberto no Chrome contra Storage simulado. |
| Grupos | Membros são relidos e atualizados condicionalmente; convites simultâneos preservam ambas as inclusões; guardas impedem deixar grupo sem administrador. Saída verifica a versão da lista. | Adicionar/remover e convites concorrentes testados. Alterações de privilégio no servidor dependem de RLS real. |
| Anotações | Cache de drafts aceita apenas campos conhecidos; notas removidas/indisponíveis podem ser recuperadas como uma nova nota privada; exclusão de pasta remove da UI apenas IDs confirmados e limpa seleção removida. | Recuperação de rascunho órfão, quota, falha de autosave, reinício de contexto e exclusão com zero linhas/retentativa. Não há garantia contra perda física do armazenamento do dispositivo. |
| Configurações | Cadastro Auth pendente pode ser retomado após refresh sem nova senha/signup; só ID/e-mail são guardados, nunca senha/token. Permissões globais/exceções limitadas a administrador, com atualização condicional. Cargo/setor próprios e administração de administradores por gestores são bloqueados na UI. Logs globais só são consultados pelo admin. | Cadastro parcial/recovery; cargo/exceção/perfil/categorias; exportação ZIP/TXT; retenção e delete. Não constitui validação de segurança do banco atual. |
| Retenção e integridade | Retornos com zero linhas não anunciam exclusão; contagens confirmadas são mostradas. Em modo isolado, exclusão de canal é uma única operação usando as FKs candidatas, em vez de apagar filhos separadamente. | Zero linhas, canal negado sem apagar filhos, cascade simulado, purga de grupo preservando canal/outro histórico e limite de sete dias. CASCADE real depende da baseline candidata. |
| Manifesto PWA | Corrigidos arquivo inexistente, rota inicial inexistente e ícones ausentes. Manifesto válido e alias antigo compatível; PNGs gerados localmente a partir da marca vetorial existente. | Manifesto, alias, dimensões dos dois ícones e rota inicial protegida verificados no navegador. Não foi adicionado service worker ou cache de dados autenticados. |

A Fase 2 mencionava mês como modo da Agenda. O código oferece Dia/Semana e seleção de data. O teste de mês nesta fase verifica a seleção de uma data em outro mês; **não certifica uma grade mensal inexistente**. Uma grade mensal permanece uma funcionalidade a especificar, caso seja critério de aceite.

## Preparação de homologação

[Pacote e ordem de revisão](../homologation/README.md) · [Inventário local](../homologation/inventory.json) · [Manifesto com hashes](../homologation/migration-manifest.json) · [Template sem credenciais](../../config/homologation.env.example).

As migrations estão em `supabase/homologation/migrations`, fora do diretório automático padrão da CLI:

1. Baseline candidata: dez tabelas, constraints, FKs, índices e versionamento; RLS inicialmente negando acesso.
2. RPCs com lock de linha e checagem de ator para rotina, aceite e diário.
3. Policies/guardas candidatas para identidade, setor, cargo, canal e autoria.
4. Storage privado e publicação realtime restrita às tabelas Doo Doo.
5. Intenções de limpeza de Storage gravadas junto à exclusão de mensagens/canais.

Os SQLs exigem marcador explícito de revisão. A primeira etapa recusa um projeto que já contenha tabelas públicas ou usuários Auth; as seguintes exigem a marca da baseline candidata. **Não executar no projeto compartilhado.** Guardas evitam erros operacionais comuns, mas não substituem revisão e confirmação do projeto.

Fixtures descrevem três atores sintéticos, sem senhas. Seed e limpeza são propostas SQL separadas, com IDs explícitos. Não inserem em Auth, não fazem reset e não removem tabelas. Contas, estrutura e dados reais de homologação ainda não existem. Dados dinâmicos e ocorrências derivadas precisam de ledger próprio; o cleanup do seed não tenta apagar tudo.

`phase-3-check-config.mjs` é somente leitura: recusa o destino compartilhado, referências inconsistentes, credenciais administrativas e SSO ativo. Não imprime valores. Resultado consistente não significa projeto remoto confirmado nem autorização para operar.

## Dependências e riscos com Iris

- Banco, Auth, sessões, quotas, Storage e realtime são compartilhados no projeto atual; o prefixo `doodoo_` não prova isolamento.
- SSO encaminha tokens ao Iris. A independência de logout entre produtos que recebem os mesmos tokens não foi provada; o escopo local do logout não substitui esse ensaio.
- FKs, triggers, funções, policies, grants, publicações e consumidores reais do Iris não foram introspectados. O inventário foi obtido do código local.
- Os candidatos criam somente objetos Doo Doo no projeto independente. Sua aplicação ao banco compartilhado é proibida, mesmo que os nomes pareçam exclusivos.
- Identidade por nome continua presente em responsáveis, leitores e aceites. O candidato adota nomes únicos/imutáveis; compatibilidade e eventual evolução para IDs precisam de revisão. Nenhuma alteração estrutural foi proposta para aplicar ao Iris.

## Método de teste e evidências

O launcher fixa `https://doodoo-test.invalid` e chave fictícia, sobrescrevendo somente o ambiente do processo. `.env.local` foi preservado. Builds usam `.next-phase3` e `.next-phase3-legacy`, nas portas locais 3300/3301, mantendo o servidor do usuário separado.

O Chrome é real; **Supabase é simulado em todas as execuções**. As rotas de HTTP/websocket são interceptadas antes da navegação e não conectam ao servidor Supabase. A memória do fixture modela registros, falhas e eventos Phoenix. O mock não executa SQL e não prova RLS, assinaturas JWT, transações PostgreSQL, Storage ou realtime reais.

[Regressão](phase-3/flows.json) · [Adicionais consolidados](phase-3/additional-consolidated.json) · [Diário REST](phase-3/legacy/additional-diary.json) · [Diálogos](phase-3/modals/modals.json) · [Visual](phase-3/visual/results.json) · [Testes locais](phase-3/local-tests.json) · [Datas](phase-3/domain-tests.json).

[Build](phase-3/build.log) · [Build REST](phase-3/build-legacy.log) · [TypeScript](phase-3/typecheck.log) · [Lint](phase-3/eslint.json).

- 25/25 cenários de regressão anteriores: **PASSOU MOCK**.
- 36/36 cenários adicionais consolidados: **PASSOU MOCK**; retestes por área preservados.
- 4/4 cenários do diário no modo REST: **PASSOU MOCK**.
- 15 verificações locais e 6 regressões de datas aprovadas; SQL analisado apenas por varredura estática.
- 21 capturas sem overflow ou pageerror e 28 casos de diálogos / 280 verificações de tema aprovados.
- Build e TypeScript: **PASSOU LOCAL**. Lint: **0 erros / 14 avisos** de imagens nativas, sem desligar regras. Apenas diretórios gerados de build foram adicionados aos ignores.
- **Zero integrações reais aprovadas; cinco migrations somente preparadas.**

[Resumo estruturado](phase-3/validation-summary.json).

A validação visual cobriu as sete telas em 320, 390 e 1440 px. Os 28 casos de diálogos verificaram dez temas, portal, foco, Tab/Shift+Tab, Escape, backdrop e visibilidade. O design corporativo da Fase 2 foi preservado. O teste geométrico não constitui certificação WCAG AA.

Capturas/diálogos foram feitos antes dos últimos ajustes de retorno zero e seleção da nota excluída; essas mudanças não alteram tokens ou geometria dos diálogos. Os fluxos afetados foram retestados no build atualizado. Algumas falhas intermediárias foram de sincronização/seletores dos testes, como comparar a prévia do canal anterior com o conteúdo da conversa; foram corrigidas sem esconder erros do aplicativo.

## O que ainda está bloqueado ou pendente

| Item | Estado e procedimento seguro |
| --- | --- |
| Criar projeto independente e aplicar SQL | **BLOQUEADO: exige autorização.** Revisar baseline, policies/definers e tipos inferidos antes de aplicar somente no projeto novo. |
| Compilação SQL, rollback real e concorrência PostgreSQL | **BLOQUEADO.** Testes de mocks são modelo de comportamento. Executar funções, falha após update/antes de insert, chamadas simultâneas e checagens de constraints em ambiente isolado autorizado. |
| Auth/RLS/Storage/realtime reais | **BLOQUEADO.** Criar atores sintéticos no Auth independente, validar diretamente com SDK público e comparar UI/banco, incluindo tentativas negadas. Nenhuma integração real recebeu PASSOU. |
| Atomicidade no ambiente compartilhado | **NÃO ATIVADA.** O caminho legado permanece compatível; a rotina ainda pode ficar concluída sem próxima ocorrência se a segunda operação falhar. A solução SQL só pode ser validada/aplicada no ambiente separado após autorização. |
| Limpeza física de objetos Storage | **PENDENTE.** Outbox do navegador permite recuperar arquivo após falha de mensagem. A migration 005 prepara intenções transacionais, mas não há worker ativo. Implementar/revisar consumidor de servidor com menor privilégio, lease/retry, validação de caminhos e referências antes da remoção. Não usar service role no browser. |
| Interrupção entre upload e registro da mensagem | **PENDENTE de reconciliação no servidor.** A perda abrupta nessa janela pode deixar objeto sem mensagem. Não prometer transação distribuída entre banco e Storage. |
| Mensagens/arquivos legados | **PENDENTE de revisão.** Sem ID do autor, diário é somente leitura; sem storagePath, URL antiga não pode ser renovada de forma confiável. Não inferir proprietário/caminho para edição ou exclusão. |
| Safari/iOS/Android físicos e teclado virtual real | **BLOQUEADO pelo ambiente disponível.** Chrome/viewport não substitui esses dispositivos. Requer ensaio manual autorizado. |
| PWA offline, push do sistema e instalação em dispositivo | **NÃO CERTIFICADOS.** Manifesto/assets estão corrigidos; o projeto não registra service worker. Falha de rede em operação foi simulada, sem alegar cache offline funcional. Não foram pedidos nem concedidos acessos de notificações do sistema. |
| Zoom nativo 200%/400%, leitor de tela, contraste completo e performance em rede real | **NÃO EXECUTADOS.** Dependem de ensaio específico; controles de teclado dos diálogos e screenshots não substituem essas verificações. |
| Perda física de armazenamento/dispositivo | **NÃO GARANTIDA.** Testou-se quota e reinício de contexto com estado preservado; perda física do dispositivo exige sincronização/backup que não existe no cache local. |

O pacote está pronto para **revisão**, não para aplicação automática ou liberação de produção. A eliminação dos riscos de servidor depende dessas etapas autorizadas.

## Reprodução

Os comandos completos estão no [pacote de homologação](../homologation/README.md). Scripts NPM novos: `audit:homologation:prepare`, `test:phase3:local`, `test:phase3:domain`, `test:phase3:regression` e `test:phase3:extended`. Testes de navegador exigem o servidor de mock iniciado pelo launcher próprio; nenhum comando aplica migrations ou cria recursos externos.

## Matriz funcional consolidada

| Área | Cenário adicional | Resultado | Evidência |
| --- | --- | --- | --- |
| Diário de tarefas | create, edit, refresh, cancel deletion and delete own update | PASSOU MOCK | [registro](phase-3/additional.json) |
| Diário de tarefas | denied edit preserves editor and denied deletion preserves confirmation | PASSOU MOCK | [registro](phase-3/additional.json) |
| Diário de tarefas | other authors and unverifiable legacy updates are read only | PASSOU MOCK | [registro](phase-3/additional.json) |
| Diário de tarefas | concurrent edits reject stale text without losing either version | PASSOU MOCK | [registro](phase-3/additional.json) |
| Tarefas | atomic routine failure rolls back completion and retry preserves original creator | PASSOU MOCK | [registro](phase-3/additional.json) |
| Tarefas | missing RPC fails closed without legacy writes | PASSOU MOCK | [registro](phase-3/additional.json) |
| Tarefas | reminder appends once and network-aborted status does not persist | PASSOU MOCK | [registro](phase-3/additional.json) |
| Agenda | two participants accept without updated_at using one RPC each | PASSOU MOCK | [registro](phase-3/additional.json) |
| Agenda | day, week and month selection retain event identity | PASSOU MOCK | [registro](phase-3/additional.json) |
| Visão Geral | initial query failure is visible and reload recovers | PASSOU MOCK | [registro](phase-3/additional.json) |
| Anotações | deleted remote note draft can be recovered as a new private note | PASSOU MOCK | [registro](phase-3/additional-notes.json) |
| Anotações | storage quota and failed autosave keep the editor honest | PASSOU MOCK | [registro](phase-3/additional-notes.json) |
| Anotações | browser context restart recovers pending draft without storing credentials in artifacts | PASSOU MOCK | [registro](phase-3/additional-notes.json) |
| Chat | failed outbox survives reload and retries the same ID once | PASSOU MOCK | [registro](phase-3/additional.json) |
| Chat | lost acknowledgement reconciles confirmed row on reload | PASSOU MOCK | [registro](phase-3/additional.json) |
| Chat | emoji, reply, message search and delete preserve other messages | PASSOU MOCK | [registro](phase-3/additional.json) |
| Chat | image and attachment failures recover without deleting referenced objects | PASSOU MOCK | [registro](phase-3/additional.json) |
| Chat | member mutations merge latest state and retain last administrator | PASSOU MOCK | [registro](phase-3/additional.json) |
| Configurações | pending Auth identity survives refresh and profile retry does not sign up again | PASSOU MOCK | [registro](phase-3/additional-settings.json) |
| Configurações | role changes persist and own privilege controls are disabled | PASSOU MOCK | [registro](phase-3/additional-settings.json) |
| Configurações | permission role change and individual exception persist | PASSOU MOCK | [registro](phase-3/additional-settings.json) |
| Configurações | delete disposable profile preserves shared Auth identity in mock | PASSOU MOCK | [registro](phase-3/additional-settings.json) |
| Configurações | transcript and ZIP export contain fixture content and deleted markers | PASSOU MOCK | [registro](phase-3/additional-settings.json) |
| Configurações | global retention purges old fixture messages and preserves recent ones | PASSOU MOCK | [registro](phase-3/additional-settings.json) |
| Sessão/permissões | blocked identity mounts no task data and isolated SSO is disabled | PASSOU MOCK | [registro](phase-3/additional.json) |
| Chat | reconnection fetches messages missed while socket was disconnected | PASSOU MOCK | [registro](phase-3/additional.json) |
| Chat | delayed response from prior channel cannot contaminate current thread | PASSOU MOCK | [registro](phase-3/additional.json) |
| Chat | concurrent group invitations preserve both added members | PASSOU MOCK | [registro](phase-3/additional.json) |
| Chat | image upload persists media path and file message retry reuses upload | PASSOU MOCK | [registro](phase-3/additional.json) |
| Configurações | manager cannot change global permissions or administrator role | PASSOU MOCK | [registro](phase-3/additional-settings.json) |
| Configurações | channel deletion is one operation and rolls back children when denied | PASSOU MOCK | [registro](phase-3/additional-settings.json) |
| Configurações | group history purge preserves channel and other channel messages | PASSOU MOCK | [registro](phase-3/additional-settings.json) |
| Sessão/permissões | logout and second user login do not display prior outbox or notes | PASSOU MOCK | [registro](phase-3/additional.json) |
| Anotações | folder deletion with zero confirmed rows preserves notes and retry deletes only that folder | PASSOU MOCK | [registro](phase-3/additional-notes.json) |
| Configurações | retention returning zero rows does not claim deletion | PASSOU MOCK | [registro](phase-3/additional-settings.json) |
| Manifesto/assets | manifest, legacy alias, icons and protected start route are valid | PASSOU MOCK | [registro](phase-3/additional-pwa.json) |

Os 25 cenários anteriores e quatro cenários REST estão detalhados nos JSONs separados, sem misturar modos nem somar resultados como integrações reais.

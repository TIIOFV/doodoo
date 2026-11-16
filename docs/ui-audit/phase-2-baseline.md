# Fase 2 — baseline e limites de segurança

Data: 16/11/2026. Instrução de redesign e relatório anterior lidos integralmente. As alterações legítimas da fase 1 foram preservadas. Supabase conectado é compartilhado com Iris Gestão e deve ser tratado como PRODUÇÃO, conforme confirmação explícita do proprietário. A autorização anterior para escritas reais foi revogada antes de qualquer operação externa desta fase.

Nenhum teste real de escrita, Auth, RLS, schema ou realtime será executado. Todos os testes de navegador interceptam Supabase e bloqueiam demais conexões externas. Não se utiliza service role. Integrações reais: BLOQUEADAS por segurança.

Versões instaladas: Next 16.4.2; React 19.3.0; Tailwind 4.3.3; TypeScript 5.9.3; supabase-js 2.118.0. App Router, componentes cliente, acesso direto ao SDK público. Não existem migrations/schema versionados ou backend administrativo no inventário local.

## Prioridades funcionais

| Prioridade | Aba/arquivo e referência inicial | Risco encontrado na leitura | Tratamento previsto |
| --- | --- | --- | --- |
| P0 | dashboard/layout.tsx, bloco de sessão expirada (~243) | children montados em display:none sem autenticação; permissões só filtram menu; nenhuma reação a troca/logout de sessão | Não montar páginas sem sessão/perfil/rota permitida; observar Auth e remontar por identidade |
| P0 | configuracoes/page.tsx, handleCreateUser (~301) | signUp no cliente compartilhado; UUID fictício quando Auth não retorna usuário | Cliente público isolado sem persistência de sessão; exigir ID Auth; tratar falha parcial sem novo signup |
| P1 | notas/page.tsx, handleUpdateNote (~158) | Um único timer para todas as notas e apenas último patch; perde título/conteúdo; não anuncia falhas nem conflito | Draft por nota, gravação serializada, estado salvo/erro/retry, retenção local por usuário e controle de versão |
| P1 | tarefas/page.tsx, handlers (~340–580) | Updates/delete ignoram erros; checklist/comentário podem desaparecer após refresh; rotina pode clonar mais de uma vez | Confirmar retorno, evitar sucesso falso, lock por registro, conclusão condicional e registrar limite transacional |
| P1 | tarefas/page.tsx (~47); dashboard/page.tsx (~30) | hour || 23 e minute || 59 interpretam 00:00 e 00:30 incorretamente | Parser de data/hora compartilhado e regressões |
| P1 | conversas/page.tsx, fetch/send/bootstrap | Resposta de canal anterior pode aparecer no atual; dedupe por texto perde mensagens repetidas; falha de envio apaga draft; bootstrap pode duplicar Geral | Verificar canal ativo, reconciliar por ID, preservar/retry, checar erros e registrar limite concorrente |
| P1 | agenda/page.tsx, accept/delete | Delete anuncia sucesso mesmo se negado; detalhe pode manter aceite falso; sem realtime | Gravações confirmadas, estado derivado único e assinatura com cleanup |
| P1 | dashboard/page.tsx, link taskId | Deep link gerado sem consumo na tela de tarefas; resumo sem atualização | Consumir URL e sincronizar resumo |
| P1 | dashboard/layout.tsx, notificações | Cache global pode mostrar notificações de outro usuário; JSON inválido derruba layout | Cache por usuário validado e limpeza por identidade |

Esses itens são achados estáticos iniciais; reproduções com fixtures e resultados finais serão separados no relatório. Não são evidências sobre RLS/estrutura reais.

## Inventário de dependências compartilhadas

- app/lib/supabase.ts: URL e chave pública configuradas; todas as abas usam o mesmo cliente/projeto.
- Auth e sessões compartilhadas; login recebe hash SSO e shell encaminha token ao Iris via NEXT_PUBLIC_IRIS_URL. Fluxo preservado, sem executar navegação externa nos testes.
- Tabelas referidas: doodoo_perfis, doodoo_permissoes, doodoo_tarefas, doodoo_tarefas_categorias, doodoo_mensagens, doodoo_canais, doodoo_chat_notas, doodoo_agenda, doodoo_notas, doodoo_logs.
- Storage: chat_midia; realtime: public/postgres_changes. RLS, triggers, funções, policies de Storage, limites e dependências do Iris não estão versionados; impacto real é DESCONHECIDO.
- Papéis locais: administrador, gestor, coordenador, supervisor, analista, colaborador. Filtragem do cliente não substitui RLS.

## Baseline de execução

TypeScript/build aprovados antes das alterações. Lint inicial: 60 erros/36 avisos; detalhes em phase-2-eslint-before.json. Capturas reais do Chrome com backend simulado em phase-2/before (7 rotas, desktop e mobile). Nenhum dado pessoal real é capturado. Regressões da fase 1 serão reaproveitadas e ampliadas para persistência simulada e múltiplos contextos.

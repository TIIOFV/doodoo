# Plano de homologação independente — Doo Doo

## Situação e limite obrigatório

O projeto Supabase configurado no Doo Doo também atende o Iris Gestão em produção. Nenhum projeto remoto foi criado, nenhuma operação real de Auth/CRUD foi testada e nenhuma migration, policy ou configuração foi executada nesta auditoria. Este documento é uma proposta para revisão, não um procedimento já executado.

## Dependências identificadas no código local

| Dependência | Impacto potencial no Iris | Tratamento necessário |
| --- | --- | --- |
| URL/chave pública Supabase comuns | Banco, limites de uso e serviços compartilhados | Nova URL e novas chaves públicas, em configuração exclusiva de homologação |
| Supabase Auth e sessões | Signup, logout global, bloqueio e mudanças em Auth podem afetar usuários do Iris | Auth independente; não copiar usuários, hashes de senha, sessões ou tokens de produção |
| SSO por fragmento e NEXT_PUBLIC_IRIS_URL | Tokens do projeto atual são encaminhados ao Iris | Bloquear navegação ao Iris de produção em homologação; definir contrato SSO próprio antes de integrar projetos diferentes |
| public.doodoo_* | Nomes próprios não provam ausência de triggers/FKs/functions compartilhadas | Inventário de metadados e dependências por responsável autorizado, com revisão antes de qualquer proposta SQL |
| Bucket chat_midia | Objetos, políticas, quotas e links assinados podem ser compartilhados | Bucket e políticas independentes, fixtures próprias, sem cópia de arquivos de produção |
| public/postgres_changes | Publicações, RLS e conexões realtime usam infraestrutura comum | Validar publicações e isolamento somente no novo projeto |
| Identidade por nome em responsáveis, leitores, membros e aceites | Renomear pessoas pode invalidar referências funcionais | Manter contrato atual; avaliar migração para IDs apenas após inventário e testes isolados |

Tabelas referidas: doodoo_perfis, doodoo_permissoes, doodoo_tarefas, doodoo_tarefas_categorias, doodoo_mensagens, doodoo_canais, doodoo_chat_notas, doodoo_agenda, doodoo_notas e doodoo_logs. A presença de prefixo não certifica independência. RLS, triggers, funções, views, FKs, grants e consumidores externos não estão suficientemente versionados para concluir o impacto no Iris.

## Procedimento proposto

1. Criar um projeto Supabase exclusivo, por exemplo `doo-doo-homologacao`, com proprietário, região, custos e acesso definidos. Esta criação externa ainda precisa ser autorizada.
2. Solicitar ao responsável pelo banco um inventário somente de metadados relevantes ao Doo Doo: tipos de colunas, PK/FK, índices, defaults, policies, triggers, funções chamadas, grants, Storage e publicações. Revisar dependências transitivas e referências ao Iris. Não exportar dados pessoais nem Auth.
3. Versionar uma baseline mínima revisada. Conferir especialmente se IDs são UUID, se etapas/chat/metadata/membros são JSONB e se notas e Agenda têm updated_at com atualização confiável. Não presumir o contrato usado pelo mock como prova do schema real.
4. Aplicar a baseline somente no projeto novo após revisão. Configurar RLS por usuário/setor/papel, políticas de Storage, callbacks e origem localhost/homologação. Chaves administrativas devem ficar exclusivamente em servidor seguro, se necessárias; nunca em NEXT_PUBLIC ou cliente.
5. Configurar ambiente local específico e confirmar o projeto de destino por identificador público antes de cada execução. Automatizar bloqueio de testes reais quando o destino for o projeto compartilhado. Não sobrescrever a configuração compartilhada.
6. Criar duas contas descartáveis no Auth independente e perfis de setores/papéis diferentes. Popular apenas fixtures identificáveis; registrar IDs e escopo para limpeza referencial posterior.
7. Executar a matriz real: login inválido/válido, refresh de sessão, preservação do administrador ao cadastrar, URL direta, usuário bloqueado, alteração de cargo, CRUD de cada aba, delegação A/B, checklists, notificações, anexos e URLs expiradas, Agenda, notas concorrentes e realtime com reconexão. Verificar tanto UI quanto registros reais e tentativas negadas por RLS diretamente pelo SDK público.
8. Validar concorrência e falhas parciais. A conclusão de rotina e criação da ocorrência seguinte ainda são duas operações; ID determinístico reduz duplicação, mas não fornece transação. Aceites de Agenda sem updated_at não têm proteção atômica suficiente. Projetar transações/funções específicas somente após revisão do schema isolado, sem levar propostas diretamente à produção.
9. Limpar exclusivamente os registros/objetos/contas criados pelo ensaio, em ordem referencial. Preservar logs de resultado sem credenciais. Não executar reset nem excluir tabelas.
10. Só considerar migração ou publicação após revisão funcional, segurança, acessibilidade e autorização expressa. Nenhum commit, push ou deploy foi realizado nesta fase.

## Testes reais bloqueados no projeto atual

Auth/signup/refresh/logout remoto; CRUD e persistência real; autorização RLS; isolamento por setor; conflitos transacionais; armazenamento e expiração de links; realtime e reconexão; SSO entre Doo Doo e Iris. Todos permanecem BLOQUEADOS por segurança, mesmo quando o cenário correspondente passa no mock.

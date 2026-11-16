# Homologação independente do Doo Doo — pacote de revisão da Fase 3

## Estado

**PREPARADO LOCALMENTE; NÃO APLICADO; NÃO APROVADO PARA PRODUÇÃO.** Nenhum projeto, usuário, bucket, role ou função foi criado remotamente. Não houve SQL remoto, introspecção do Supabase compartilhado, migration, commit, push ou deploy.

O Supabase configurado atende o Iris Gestão em produção. Esse destino está excluído desta preparação. A baseline abaixo é uma **candidata inferida do código**, não um dump nem uma reprodução certificada do banco compartilhado. A revisão SQL e a execução em PostgreSQL/Supabase independente continuam bloqueadas até autorização.

## Inventário e dependências

[inventory.json](inventory.json) lista dependências instaladas, chamadas por arquivo, nomes das variáveis públicas e hashes do código. O inventário atual contém dez tabelas `doodoo_*`, bucket `chat_midia`, eventos `public/postgres_changes` e Auth/SSO do projeto comum. A proposta acrescenta uma tabela exclusiva para intenções de limpeza de arquivos.

O prefixo das tabelas não prova independência. Tipos, RLS, grants, funções, triggers, índices, FKs, publicações e consumidores reais do Iris não foram consultados. Qualquer incorporação de schema oficial depende de um inventário de metadados conduzido pelo responsável autorizado, com análise das dependências transitivas, sem copiar dados pessoais ou Auth.

[Plano anterior de separação](../ui-audit/phase-2-homologation-plan.md). SSO por fragmento foi desativado no modo isolado para impedir envio/aceitação de tokens entre os projetos. Não apontar a homologação ao Iris de produção.

## Migrations candidatas, fora da pasta automática da CLI

| Arquivo em `supabase/homologation/migrations` | Conteúdo para revisão |
| --- | --- |
| 001_candidate_baseline.sql | Dez tabelas próprias, tipos propostos, FK de Auth, constraints, índices, versão `updated_at` e RLS inicialmente negando tudo. Recusa projeto com tabelas públicas ou usuários Auth preexistentes. |
| 002_atomic_operations.sql | RPCs de rotina, aceite e edição/exclusão de diário. Bloqueiam a linha, verificam ator/permissão e fazem alterações na transação da chamada. Rotina preserva o criador e usa unicidade de origem para idempotência. |
| 003_candidate_policies.sql | Policies e guardas por identidade/setor/canal, autoria de comentários, imutabilidade de campos e administração. SQL candidato: regras de negócio e bypass de funções definer exigem revisão independente. |
| 004_candidate_storage_realtime.sql | Bucket privado de 10 MB, caminhos por canal/usuário, políticas propostas de Storage e publicação apenas das tabelas Doo Doo. Nenhuma configuração foi aplicada. |
| 005_candidate_storage_cleanup_outbox.sql | Intenção de limpeza de arquivos gravada na transação de exclusão da mensagem/canal. Não exclui objetos físicos nem inicia worker. |

[Manifesto com hashes](migration-manifest.json). `node scripts/phase-3-prepare.mjs` apenas verifica marcadores/padrões proibidos e escreve o manifesto. **Não é compilador SQL, teste de RLS nem ferramenta de aplicação.** Não existe comando de `db push`, reset ou aplicação automática neste pacote.

Todos os SQLs exigem o marcador de revisão `doodoo.allow_isolated_setup=reviewed-independent-project`. As etapas seguintes também verificam a marca da baseline. Essas guardas ajudam a prevenir enganos; um administrador poderia alterá-las. Elas não substituem a confirmação do destino e autorização humana. Não fornecer este marcador ao projeto compartilhado.

## Configuração e testes sem serviços reais

[Template](../../config/homologation.env.example) não contém credenciais. Não sobrescrever `.env.local`. O preflight `node scripts/phase-3-check-config.mjs caminho-do-arquivo` é somente leitura e compara o destino candidato ao host compartilhado configurado localmente. Rejeita o mesmo projeto, referência de bloqueio incorreta, modo incorreto, SSO ativo, chave secreta/service role e variáveis administrativas. Não imprime valores. Consistência local não prova existência, isolamento remoto ou autorização.

A ativação de `NEXT_PUBLIC_DOO_ATOMIC_WRITES` exige modo isolado e destino correspondente à referência declarada. O modo `shared`, padrão atual, recusa ativar os novos RPCs. Não existe fallback de um RPC habilitado que falhou para gravações independentes. A ativação em homologação só deve ocorrer após revisão/aplicação autorizada e validação dos contratos.

Para testar agora, os launchers de mock fixam URL `https://doodoo-test.invalid`, chave pública fictícia e SSO vazio, com precedência sobre `.env.local`. Os fixtures interceptam HTTP e websocket e só encaminham os assets ao servidor local permitido. Nenhum token/chave real é necessário. O build fica separado do `.next` do usuário.

```powershell
node scripts/phase-3-local.mjs build
node scripts/phase-3-local.mjs start
# Outro terminal:
node scripts/phase-3-local-tests.mjs
node scripts/phase-3-flows.mjs
node scripts/phase-3-additional.mjs
node scripts/phase-3-visual.mjs
node scripts/phase-3-modals.mjs
```

O modo REST anterior também pode ser validado contra o host fictício:

```powershell
node scripts/phase-3-local.mjs build --legacy
node scripts/phase-3-local.mjs start --legacy
# Outro terminal: apenas o diário, sem ativar RPCs.
$env:DOO_TEST_ORIGIN='http://127.0.0.1:3301'
node scripts/phase-3-additional.mjs diary
Remove-Item Env:DOO_TEST_ORIGIN
```

Reiniciar somente o servidor correspondente após reconstruir seu diretório. O launcher não aceita destinos remotos nem executa migrations.

## Fixtures e limpeza

[actors.json](../../supabase/homologation/fixtures/actors.json) descreve três atores sintéticos, dois no mesmo setor e um em outro, sem senhas. Contas Auth reais ainda não existem. As contas com `example.invalid` precisam de mecanismo de confirmação/local mail revisado no projeto novo; não enviam e-mail útil por definição.

`seed.review.sql` referencia IDs Auth a serem fornecidos após criação autorizada no projeto independente. Não insere em `auth.users`, não reaproveita contas do Iris e não sobrescreve registros em conflito. A execução exige autorização adicional. O seed precisa ser executado pelo responsável do projeto novo, com Auth já criado e baseline revista.

`cleanup.review.sql` contém apenas IDs fixos das fixtures. Não remove Auth, perfis, estruturas, permissões globais nem objetos Storage. Dados criados pelos testes de integração, ocorrências derivadas e objetos precisam de ledger por execução e revisão referencial própria. Não adotar filtros amplos por prefixo, tabela inteira ou data para limpar fixtures de homologação.

## Worker de limpeza de Storage — ainda pendente

Banco e Storage não compartilham uma transação de exclusão física. A migration 005 registra a intenção no banco para evitar perda do trabalho de limpeza após purgas/cascades. **O worker não foi implementado/ativado e a remoção física não está certificada.**

Contrato a revisar no ambiente independente: consumidor exclusivamente de servidor com menor privilégio possível; claim de lote usando lock e lease; aguardar `not_before`; validar bucket e prefixo canal/dono; verificar se outra mensagem não excluída referencia o caminho; remover apenas o caminho do job; marcar concluído somente após confirmação; retries idempotentes com limite e fila de erro; log sem URLs assinadas; nenhuma chave administrativa no browser. Aplicar credenciais/privilégios do consumidor somente após revisão e autorização específicas. Caminhos antigos sem `storagePath` precisam de inventário próprio; não inferir exclusões a partir de URLs arbitrárias.

A interrupção entre upload e criação/registro local da mensagem também exige reconciliação no servidor. A fila do navegador recupera falhas de envio e evita reupload ao retentar, mas não elimina essa janela de interrupção física.

## Ordem para autorização futura

1. Revisar contrato e políticas, especialmente identidade por nome, papéis administrativos, leitura de perfis, retenção, gerais/setoriais e funções `SECURITY DEFINER`.
2. Autorizar criação de projeto independente; confirmar seu identificador público e exclusão do projeto compartilhado.
3. Obter metadados relevantes por responsável autorizado e resolver divergências com a baseline candidata. Não executar candidatos sobre o banco atual.
4. Autorizar aplicação somente no projeto novo e executar SQL/rollback/RLS sem dados oficiais. Erros de sintaxe ou contrato nesta etapa são bloqueadores; a varredura estática atual não os elimina.
5. Configurar Auth/callbacks/Storage/realtime, criar atores sintéticos e registrar o ledger. Nenhum reset.
6. Executar os testes reais de concorrência, falha de transação, RLS diretamente pelo SDK público, Auth, Storage, expiração e reconexão; comparar UI e banco.
7. Revisar worker/retention e executar limpeza limitada ao ledger, preservando Auth compartilhado e toda infraestrutura do Iris.

Nenhuma dessas autorizações está implícita na preparação local ou nos resultados de mocks.

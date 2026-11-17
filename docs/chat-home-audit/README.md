# Auditoria de uso do chat e atualização da visão geral

Implementação local de 17/11/2026. Os testes interceptam Auth, REST, Storage e Realtime com dados sintéticos no servidor isolado `127.0.0.1:3300`. Não são testes autenticados contra o Supabase compartilhado, nem comprovam a configuração do servidor usado por `localhost:3000`. Nenhuma política, tabela, conta ou mensagem real foi alterada.

## O que a auditoria encontrou e corrigiu

| Área | Problema | Comportamento atual |
| --- | --- | --- |
| Presença | O heartbeat de 60 segundos era maior que o limite de 35 segundos para aparecer ausente; offline começava aos 65 segundos. | Heartbeat de 25 segundos; expiração em 100 segundos, com atualização visual periódica. Ausência depende da atividade, e não da idade intermediária do heartbeat. |
| Status manual | Movimentar o mouse desfazia Ausente; o temporizador podia substituir Ocupado/Indisponível. A abertura também escrevia Online antes de restaurar a preferência. | Preferência e estado automático separados. Ausência automática após três minutos só quando a preferência é Online; atividade restaura Online. Status manual persiste por usuário neste navegador e é compartilhado entre suas abas. |
| Navegação | Sair do chat interrompia a presença mesmo com o portal aberto. | Presença pertence ao layout do portal. Abas visíveis coordenam atividade; uma aba oculta não transforma outra aba ativa em ausente. |
| Gravação de presença | Falhas de atualização eram ignoradas. | Escritas serializadas, confirmação de linha retornada, aviso de falha e botão de retry. Requisições são canceladas na saída; ocultação é diferenciada de descarregar a página para evitar iniciar um PATCH durante recarga no WebKit. |
| Digitação | Throttle baseado apenas em renderizações podia deixar de renovar o sinal durante textos longos; rascunhos restaurados podiam disparar sinais sem edição. | Eventos reais de entrada iniciam o sinal; renovação a cada segundo durante atividade, pausa de 1,8 segundo encerra e lease de cinco segundos remove sinais órfãos. Limpar, enviar, desfocar, ocultar ou trocar de conversa encerra o indicador. |
| Conexão de digitação | Um erro em qualquer conversa alterava o estado de todas. | Autenticação Realtime antes do subscribe, conexão por conversa, erro isolado, retry explícito e limpeza no reconnect. Alterações de nomes e previews não recriam assinaturas. |
| Nova conversa direta | A sala só era criada ao enviar a primeira mensagem, impossibilitando digitação antes dela. | Abrir um novo contato inicializa a sala pelo ID determinístico existente, sem mensagem automática. Falha mantém a conversa temporária e permite tentar ao enviar. |
| Lista de conversas | Conversas diretas sem mensagens recentes eram retiradas da lista. | Salas autorizadas continuam descobertas; atualização periódica e ao retornar revalida participantes e evita duplicar salas diretas legadas. |
| Remoção de participantes | A UI podia continuar aberta após perda de acesso. | Atualizações recebidas removem a sala da UI. Como RLS pode impedir o evento da remoção de chegar ao removido, a revalidação ao retornar e a cada 30 segundos visíveis também fecha a sala e suas assinaturas. Isto não substitui revogação no backend. |

O indicador só transmite `userId` e `typing`; nomes vêm dos membros conhecidos, sem conteúdo do rascunho. O opt-out em Configurações continua disponível. Canais permanecem privados: não há fallback para Broadcast público. O estado mostrado como Online é atividade recente no portal, não garantia de que alguém está lendo a conversa.

## Dependência do backend para o “digitando”

O cliente não consegue conceder acesso a um canal privado. Conforme a [documentação oficial de autorização Realtime](https://supabase.com/docs/guides/realtime/authorization), `realtime.messages` precisa autorizar Broadcast com RLS para os membros. `CHANNEL_ERROR`/`TIMED_OUT` não comprovam sozinhos a ausência de políticas; rede, sessão e configuração também podem falhar.

O projeto remoto não foi consultado nem modificado nesta etapa. [typing-diagnostics.readonly.sql](./typing-diagnostics.readonly.sql) prepara uma inspeção somente de leitura. [typing-private.review.sql](../chat-workspace/typing-private.review.sql) é a proposta de políticas, **não executada nem compilada contra o schema remoto**. Antes de aplicar, revisar tipos, RLS das tabelas consultadas, grants e todas as políticas existentes; políticas permissivas antigas podem ampliar o acesso. Não alterar o modo público/privado global do projeto sem revisar os outros consumidores.

O teste de autorização usa um servidor simulado que aceita/nega salas. É evidência do comportamento do cliente ao receber essas respostas, não evidência de que o SQL autoriza ou bloqueia corretamente usuários reais.

## Visão geral

A tela inicial ganhou hierarquia mais compacta, transição discreta, indicadores de tarefas abertas/atrasadas/concluídas e agenda de hoje, lista priorizada de entregas, alternância Minha fila/Delegadas, próximos encontros ainda não encerrados, anotações recentes sempre disponíveis quando autorizadas e acessos rápidos. Datas e horários usam o fuso do navegador. Contadores refletem o setor e os dados acessíveis ao usuário.

Os cartões levam às listas corretas; tarefas individuais abrem seus detalhes. Falhas parciais mostram a seção indisponível, preservam as outras áreas e oferecem retry. Ausência de permissão evita consultar e apresentar o módulo. Realtime, retorno à página e atualização manual renovam o resumo sem substituir a tela por um loader. A evolução do relógio atualiza prazos/compromissos na tela.

Layout conferido em 1440, 390 e 320 pixels e nos temas Natureza/Escuro, com títulos quebrando linha e movimento reduzido respeitado. As capturas estão nesta pasta. Teste WebKit no Windows não equivale a teste no iPhone físico/PWA instalado.

## Validação e limites

- `node scripts/chat-presence-overview-tests.mjs`: dez cenários, resultados em `chromium-results.json`.
- `DOO_TEST_ENGINE=webkit`: mesmos dez cenários, resultados em `webkit-results.json`. O Playwright WebKit está no diretório temporário de testes, sem dependência nova no projeto.
- `node scripts/chat-workspace-tests.mjs`: seis regressões de urgência, ciência, reenvio, filtros, busca, navegação e teclado, com serviços simulados.
- `node scripts/phase-3-flows.mjs chat`: quatro regressões de mensagens, recibos, grupos e anexos.
- TypeScript, lint dos arquivos desta etapa e build local isolado. O lint geral também foi verificado e ainda aponta três pendências das telas Agenda/Anotações: relógio impuro e sincronizações de estado em effects; não foram alteradas nesta etapa.

Mantidos os contratos existentes de outbox, metadata, recibos, anexos privados, grupos e confirmação de urgência. A janela de consulta de mensagens continua em sete dias; esta etapa não implementa busca histórica/paginação nem modifica retenção. Recibos e convites ainda usam nomes em alguns campos legados. Confirmação de leitura desabilitada não permite persistir um marcador privado de leitura com o schema atual. Rate limits de urgência e validações do cliente não substituem controles do servidor.

Presença é aproximada: suspensão do iOS, falta de rede ou encerramento abrupto expiram pelo TTL. Preferência manual é local ao navegador; coordenação entre dispositivos e gravações concorrentes de sessões independentes ainda depende do backend. Não há push com navegador fechado. Autorização/RLS, Storage, Realtime e concorrência reais seguem pendentes de homologação autorizada. Sem commit, push ou deploy.

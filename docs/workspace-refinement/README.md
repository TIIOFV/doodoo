# Refinamento do portal e compatibilidade móvel

## Chat

O indicador de digitação aparece no cabeçalho e na lista lateral, com nomes obtidos dos membros conhecidos. Envia somente ID e estado temporário, nunca o rascunho, e desaparece após uma pausa, envio, limpeza do texto, troca de conversa ou expiração. Existe opção para desativar o próprio indicador nas configurações deste navegador.

Usa Broadcast com `private: true`, sem fallback público. A ativação no projeto real depende da revisão das políticas Realtime. O candidato [typing-private.review.sql](../chat-workspace/typing-private.review.sql) não foi executado e deve ser comparado com o schema e com todas as políticas existentes; permissões permissivas preexistentes podem autorizar mais que o candidato. Não altera a configuração global de canais públicos do projeto. Referência: [Supabase Realtime Authorization](https://supabase.com/docs/guides/realtime/authorization).

O avatar da conversa deixa espaço para o indicador de presença. Os testes verificam que o centro da bolinha está pintado e acessível na tela, sem ser coberto pelo cabeçalho. Os títulos da conversa podem quebrar de linha.

## Som e configurações

Dois toques curtos, em volume baixo, podem ser escolhidos, testados e desligados em **Configurações → Privacidade**. O intervalo mínimo entre avisos sonoros é de cinco segundos. Não há repetição contínua nem fila de sons bloqueados para tocar depois. As preferências são locais, separadas por usuário; não modificam cargos ou permissões.

O áudio é preparado a partir de uma interação do usuário, de acordo com as restrições dos navegadores. Referência: [MDN: Web Audio best practices](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices). O comportamento final depende também de volume, modo silencioso e permissões do aparelho.

O painel de configurações recebeu seções mais compactas, tema acessível também no celular, títulos com quebra de linha e preferências de som e digitação. As áreas administrativas existentes mantêm os seus fluxos e restrições.

## Notas e prazo das tarefas

As notas têm editor mais amplo, modo foco, organização por título ou data, contagem de palavras, exportação privada em texto e título que se ajusta ao conteúdo e à largura disponível. O salvamento automático, rascunhos e recuperação de conflitos continuam ativos. A data e a ordenação são atualizadas após um salvamento confirmado.

O criador de uma tarefa, identificado por `usuario_id`, encontra **Alterar prazo de entrega** no painel de acompanhamento. Data e horário são editados juntos, preservados após falha e sincronizados com quem recebe a tarefa. O cliente verifica novamente o criador na versão consultada antes de salvar; o teste não substitui a revisão das permissões RLS reais.

## iOS, área útil e títulos

O shell usa a altura e o deslocamento do VisualViewport no celular e respeita as áreas seguras. A barra inferior participa do layout, evitando reserva dupla e sobreposição de conteúdo; fica oculta com o teclado ou dentro da conversa. Os modais usam a área visível do viewport, com rolagem interna e controles acessíveis. Títulos longos quebram de linha e campos móveis usam fonte de pelo menos 16px para reduzir zoom involuntário.

O caso relatado foi o app instalado no iPhone, com e sem teclado. Os testes usam Chromium e WebKit com viewport e interação móveis, incluindo uma redução sintética da área visível e modais. **Não equivalem a uma validação física da instalação PWA no iPhone**; barras do sistema, teclado nativo e modo instalado ainda precisam ser conferidos no aparelho.

## Verificações

- `node scripts/workspace-refinement-tests.mjs`: digitação privada entre duas sessões, expiração/opt-out, presença, prazo, falha/retry, notas, exportação, preferências, layouts móveis, títulos e teclado.
- `DOO_TEST_ENGINE=webkit`: executa os mesmos cenários no WebKit; o navegador foi instalado apenas no diretório temporário de testes. No Windows, configure `PLAYWRIGHT_BROWSERS_PATH` para esse diretório antes de executar.
- `node scripts/notification-sound-tests.mjs`: ausência de autoplay/fila, silêncio, volume, prévia, limitação de rajadas e isolamento das preferências.
- Regressões de notas, configurações e rascunhos também foram executadas. Os relatórios de dados fictícios e as capturas estão neste diretório.

Os testes interceptam os serviços de dados e não enviam mensagens ou alteram registros no Supabase real. Nenhuma migração, publicação ou envio externo foi realizado.

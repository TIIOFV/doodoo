# Tarefas: visualização ampliada e diário

Ao abrir uma tarefa, os detalhes substituem toda a área da fila. Os filtros laterais continuam disponíveis no computador. **Fechar tarefa** e **Voltar à lista** restauram a fila, preservando busca, filtros e posição de rolagem. O foco retorna ao cartão ou à pesquisa se a tarefa já saiu do filtro (por exemplo, após ser concluída).

A tela organiza o conteúdo em duas abas:

- **Visão geral:** status, prioridade, responsável, prazo, organização pessoal, instruções e progresso das etapas. O formulário de nova etapa aparece sob demanda.
- **Diário e atualizações:** conversa em linha do tempo, autoria, data, dificuldade, solicitação de atualização e publicação. Mensagens antigas continuam legíveis; apenas autores identificados podem editar ou excluir as próprias mensagens.

As cores acompanham o tema do portal. Controles de etapas ficam acessíveis no toque e no teclado. Abas permitem navegação por setas, e o prazo vencido recebe destaque próprio.

A revisão visual dá prioridade à **descrição da tarefa**, com texto de 16px, contraste principal e cartão próprio. No computador, os controles ficam em um painel lateral compacto, ao lado da descrição e das etapas. No celular, os cartões formam uma coluna, começando pela descrição. O cabeçalho tem altura reduzida, fundo com a cor do tema e metadados discretos.

A abertura e o fechamento combinam saída e entrada com opacidade e deslocamento suaves. As abas têm indicador deslizante e os conteúdos aparecem com uma transição curta. A preferência por movimento reduzido desativa essas animações. O teste de interface verifica as duas direções da transição, o modo sem movimento e o destaque tipográfico da descrição, além dos fluxos funcionais anteriores.

## Avisos no portal

Uma assinatura global acompanha as tarefas enquanto o usuário está em qualquer página autorizada do dashboard:

- Atribuições avisam o responsável.
- Novas mensagens avisam o responsável e quem delegou, excluindo o próprio autor.
- Dificuldades e solicitações de atualização usam o mesmo fluxo, com destaque de atenção.
- Cada aviso aponta para a tarefa e, no caso de mensagens, abre diretamente a aba do diário, inclusive quando a página de tarefas já está aberta.
- Edições, exclusões, mudanças de checklist e eventos repetidos não geram avisos de nova mensagem.

Os pontos de leitura são separados por usuário e setor no armazenamento do navegador. No primeiro acesso, o histórico existente estabelece uma referência, sem gerar uma avalanche de avisos antigos. Retornos, foco, reconexões e retorno da conexão consultam novamente as tarefas para recuperar mensagens posteriores à referência. Isso exige que o navegador preserve seu armazenamento. Os avisos guardados no sino continuam limitados aos 30 mais recentes, conforme o comportamento existente.

**Limites:** este fluxo é de avisos dentro do portal. Não implementa push, e-mail, uma caixa de entrada no servidor nem sincronização entre dispositivos. Uma primeira visita em outro navegador não recupera avisos históricos. O Realtime de `doodoo_tarefas` e as permissões de leitura precisam funcionar no Supabase de destino. Nenhuma migração ou escrita remota foi executada; a entrega é local.

## Validação reproduzível

`node scripts/task-notification-tests.mjs` verifica o roteamento, ausência de autoaviso, isolamento por participante/setor, lotes de mensagens, eventos repetidos e links.

`node scripts/task-workspace-tests.mjs` usa dois ou mais usuários simulados, intercepta os serviços externos e exercita ampliação/retorno, checklist, edição, navegação por teclado, avisos nos dois sentidos, dificuldades, cobranças, rascunho após falha, recuperação após ausência e atribuição sem aviso para terceiros. Também captura as telas de 320, 390, 1024, 1440 e 1912 pixels nos temas Natureza e Escuro, verificando ausência de transbordamento horizontal. Resultados em `results.json`.

O servidor para esses testes é exclusivamente local e usa o domínio fictício `doodoo-test.invalid`:

```powershell
node scripts/phase-3-local.mjs build
node scripts/phase-3-local.mjs start
```

Com o servidor ativo, execute os scripts de teste em outro terminal. Os testes de regressão existentes de tarefas e diário foram adaptados aos novos controles e abas. As simulações validam o cliente e não comprovam políticas, publicação Realtime ou entrega no Supabase real.

## Correção do carregamento no desenvolvimento

O servidor de desenvolvimento foi observado entregando o CSS global anterior com a estrutura nova. Os estilos das tarefas agora são importados diretamente pela página em `app/dashboard/tarefas/task-workspace.css`, sob o escopo `.task-workspace`. O botão de fechar tem posição independente no canto superior direito. A validação visual verifica suas coordenadas e a posição do painel de acompanhamento ao lado da descrição.

Para testar também o modo de desenvolvimento com dados simulados, execute `node scripts/phase-3-local.mjs dev`. A simulação permite apenas o WebSocket local de atualização do Next; os serviços de dados continuam interceptados. O indicador de desenvolvimento é ocultado somente na automação para não cobrir os controles do aplicativo.

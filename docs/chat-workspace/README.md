# Chat e chamadas urgentes

A página agora tem filtros Todas / Não lidas / Grupos, busca sem diferenciação de acentos, identificação mais discreta da conversa ativa, cabeçalho compacto, melhor separação das mensagens e um botão para voltar às mensagens recentes quando o usuário está lendo acima. A busca de mensagens é limpa ao trocar de conversa. Ações de resposta e exclusão ficam disponíveis por teclado e toque. O estado de conexão exibido acompanha a assinatura Realtime.

## Enviar uma urgência

Marque **Enviar como urgente**, escreva o motivo e envie normalmente. A mensagem é persistida no fluxo existente, com `metadata.urgent = true`; falhas e reenvios continuam usando a outbox e o mesmo ID.

Participantes da conversa recebem um cartão destacado com autor, texto e **Abrir conversa**, mesmo quando estão em outra página do portal. O cartão faz um pequeno movimento lateral, sem deslocar a tela inteira nem tomar o foco da digitação. Movimento reduzido desativa a animação. O título da aba também indica a urgência enquanto o cartão está aberto. **Dispensar** fecha o cartão; a mensagem e o aviso no sino permanecem disponíveis.

Ao abrir, a navegação aponta à conversa e à mensagem, que recebe destaque. O destinatário pode clicar **Ciente**. Essa confirmação usa IDs de usuário em `metadata.acknowledgedBy`, preserva os outros campos de metadata e é independente da configuração de recibos de leitura. Edições concorrentes usam o mecanismo existente de leitura/comparação/escrita.

O remetente tem um intervalo de um minuto por conversa, no mesmo navegador, entre novos envios urgentes. O destinatário também limita a exibição a uma chamada por autor/conversa por minuto, ignora eventos repetidos e mantém uma fila curta. A supressão visual não elimina a mensagem nem seu registro no sino.

## Limites e validação

O fluxo depende de sessão ativa, acesso à conversa e Realtime funcionando no projeto de destino. Não é push de sistema: não avisa com o navegador fechado nem recupera cartões perdidos enquanto desconectado. A mensagem urgente permanece no histórico carregado pelo chat. Os limites de frequência são proteções do cliente, não uma restrição de segurança no servidor. Para enforcement entre dispositivos, push ou prioridade formal com escalonamento, seria necessário revisar o backend e adicionar controles próprios.

Não foram executadas alterações remotas. A entrega usa os campos JSON existentes; o comportamento real das políticas de mensagens e da confirmação por destinatários ainda precisa ser validado no Supabase de destino.

`node scripts/chat-workspace-tests.mjs` valida dois ou mais usuários simulados: aviso fora do chat, abertura da mensagem, ciência sincronizada, intervalo de envio, preservação de rascunho e reenvio, exclusão de terceiros, movimento reduzido, busca sem acentos, filtros, retorno às mensagens recentes e resposta por teclado. Também produz capturas em 320, 390, 1024 e 1440 pixels. `results.json` contém os resultados. O servidor isolado é iniciado com `node scripts/phase-3-local.mjs build` e `node scripts/phase-3-local.mjs start`.

As regressões existentes de envio, recibos, grupos e anexos continuam sendo executadas por `phase-3-flows.mjs chat` e `phase-3-additional.mjs chat`. Estes testes interceptam os serviços externos e não comprovam a entrega remota.

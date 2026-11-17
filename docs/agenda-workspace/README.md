# Agenda: organização e calendário

A agenda possui visões Dia, Semana e Mês, botão Hoje, seleção de data e navegação proporcional à visão ativa. A visão mensal começa na segunda-feira e exibe seis semanas, incluindo as datas adjacentes. O avanço mensal parte do primeiro dia do mês seguinte para evitar saltos ao navegar a partir de dias como 31 de janeiro.

Os compromissos são ordenados por data e horário, agrupados por dia e identificados por visibilidade. A pesquisa ignora acentos e inclui título, pauta, local e organizador. Os filtros são Todos, Pessoais, Do setor, Da empresa e A confirmar. Marcadores e contagens usam somente os eventos acessíveis ao usuário; não expõem eventos privados de outras pessoas.

No computador, a lateral mostra o resumo do período filtrado e o próximo compromisso acessível. No celular, os controles se reorganizam e o calendário mensal apresenta datas e contagens, sem tentar encaixar títulos longos em células pequenas. Selecione uma data para abrir sua lista. As transições respeitam movimento reduzido e as cores acompanham os temas do portal.

## Edição e participação

A data do formulário é independente da navegação: cancelar a criação ou edição não muda o dia selecionado. Salvar navega para a data gravada. Data, início e fim são obrigatórios; o fim precisa ser posterior ao início. Compromissos visíveis com horários sobrepostos geram aviso, mas não impedem uma sobreposição intencional.

Detalhes de eventos acompanham as atualizações recebidas: confirmações aparecem em tempo real e excluir um evento em outra sessão fecha seus detalhes. A confirmação de presença também está disponível no painel de detalhes. A edição preserva os participantes existentes; falhas mantêm o formulário para nova tentativa.

O evento é salvo primeiro e depois o convite é publicado no canal selecionado. As opções incluem apenas grupos compatíveis com a visibilidade e com a participação do usuário. Quando há vários grupos do setor, é necessário escolher explicitamente. Uma falha no chat é informada sem apagar ou duplicar o evento salvo. O cartão de convite no chat é uma cópia das informações; sua confirmação própria continua separada da lista de presenças da agenda.

## Validação e limites

`node scripts/agenda-workspace-tests.mjs` usa dados simulados e serviços interceptados para verificar navegação, viradas de mês, ordenação, busca, filtros, cancelamento de formulário, sobreposição, criação, edição, exclusão entre sessões, confirmação, falhas de persistência e publicação do convite. Captura a interface entre 320 e 1912 pixels nos temas Natureza e Escuro. Resultados em `results.json` e `invitation-results.json`.

Os testes de regressão existentes de agenda também foram executados; os relatórios estão neste diretório. O servidor de teste é iniciado com `node scripts/phase-3-local.mjs dev`, ou com `build` seguido de `start` para a versão compilada. O ambiente usa o domínio fictício `doodoo-test.invalid`.

Não houve execução de SQL, publicação ou alteração de eventos remotos. Os testes locais não comprovam as políticas, o Realtime ou a entrega de convites no Supabase real. Não foram adicionados lembretes em segundo plano ou notificações push.

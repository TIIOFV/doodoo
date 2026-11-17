/** A compact checkpoint; message contents never need to be kept in this cache. */
export interface TaskCheckpoint { assignee: string; comments: string[]; }
export interface NotificationTask {
  id: string; titulo: string; setor?: string; responsavel?: string; atribuido_por?: string;
  chat?: { id: string | number; author: string; authorId?: string; text: string; isAlert?: boolean }[];
}
export interface TaskNotice { title: string; desc: string; link: string; eventKey: string; }
export function taskCheckpoint(task: NotificationTask): TaskCheckpoint {
  return { assignee: task.responsavel || '', comments: (task.chat || []).map(c => String(c.id)) };
}
export function taskNotices(task: NotificationTask, previous: TaskCheckpoint | undefined, user: { user_id: string; nome: string; setor: string }): TaskNotice[] {
  if (task.setor !== user.setor || (task.responsavel !== user.nome && task.atribuido_por !== user.nome)) return [];
  const notices: TaskNotice[] = [];
  const link = `/dashboard/tarefas?taskId=${encodeURIComponent(task.id)}`;
  if (task.responsavel === user.nome && task.atribuido_por !== user.nome && previous?.assignee !== user.nome) {
    notices.push({ title: 'Nova tarefa para você', desc: `“${task.titulo}” delegada por ${task.atribuido_por}.`, link, eventKey: `task:${task.id}:assigned:${user.user_id}` });
  }
  // A newly discovered task has no reliable message baseline. Do not replay its history.
  if (!previous) return notices;
  const seen = new Set(previous.comments);
  for (const comment of task.chat || []) {
    if (seen.has(String(comment.id)) || (comment.authorId ? comment.authorId === user.user_id : comment.author === user.nome)) continue;
    notices.push({
      title: comment.isAlert ? 'Atenção no diário da tarefa' : 'Nova atualização na tarefa',
      desc: `${comment.author} · ${task.titulo}: ${comment.text.slice(0, 180)}`,
      link: `${link}&tab=updates`, eventKey: `task:${task.id}:comment:${comment.id}`,
    });
  }
  return notices;
}

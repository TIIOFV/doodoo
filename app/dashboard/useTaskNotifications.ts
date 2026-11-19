'use client';
import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { taskCheckpoint, taskNotices, type NotificationTask, type TaskCheckpoint } from '../lib/taskNotifications';

/** Global subscription: task notices also work while another portal page is open. */
export function useTaskNotifications(user: { user_id: string; nome: string; setor: string } | null, enabled: boolean) {
  const userId = user?.user_id, name = user?.nome, sector = user?.setor;
  useEffect(() => {
    if (!userId || !name || !sector || !enabled) return;
    const actor = { user_id: userId, nome: name, setor: sector };
    const key = `doodoo:task-checkpoints:v1:${userId}:${sector}`;
    let checkpoints: Record<string, TaskCheckpoint> = {};
    let initialized = false, active = true, syncing = false;
    const queued: NotificationTask[] = [];
    try {
      const saved = JSON.parse(localStorage.getItem(key) || 'null');
      if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
        checkpoints = Object.fromEntries(Object.entries(saved).filter((entry): entry is [string, TaskCheckpoint] => {
          const value = entry[1] as TaskCheckpoint | null;
          return !!value && typeof value.assignee === 'string' && Array.isArray(value.comments) && value.comments.every(id => typeof id === 'string');
        }));
        initialized = true;
      }
    } catch { /* Start a fresh baseline if browser storage is unavailable. */ }
    const persist = () => {
      try { localStorage.setItem(key, JSON.stringify(checkpoints)); } catch { /* Realtime still works in memory. */ }
    };
    const receive = (task: NotificationTask, announce: boolean) => {
      if (task.setor !== sector) return;
      if (announce) for (const notice of taskNotices(task, checkpoints[task.id], actor)) {
        window.dispatchEvent(new CustomEvent('doodoo:notify', { detail: notice }));
      }
      const checkpoint = taskCheckpoint(task);
      // Keep tombstones for removed messages and tolerate a snapshot racing a realtime event.
      checkpoint.comments = [...new Set([...(checkpoints[task.id]?.comments || []), ...checkpoint.comments])];
      checkpoints[task.id] = checkpoint;
    };
    const sync = async () => {
      if (syncing || !active) return;
      syncing = true;
      const { data, error } = await supabase.from('doodoo_tarefas').select('id,titulo,setor,responsavel,atribuido_por,status,updated_at,chat').eq('setor', sector);
      if (!active) return;
      if (!error && data) {
        const ids = new Set(data.map(task => task.id));
        for (const task of data) receive(task, initialized);
        for (const id of Object.keys(checkpoints)) if (!ids.has(id)) delete checkpoints[id];
        initialized = true;
        // Events received during the snapshot must not be lost or applied out of order.
        for (const task of queued.splice(0)) receive(task, true);
        persist();
      }
      syncing = false;
    };
    const channel = supabase.channel(`doodoo_task_notices_${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'doodoo_tarefas', filter: `setor=eq.${sector}` }, payload => {
        if (!active) return;
        if (payload.eventType === 'DELETE') { delete checkpoints[payload.old.id]; persist(); return; }
        const task = payload.new as NotificationTask;
        if (syncing || !initialized) queued.push(task);
        else { receive(task, true); persist(); }
      }).subscribe(status => { if (status === 'SUBSCRIBED') void sync(); });
    const onFocus = () => { if (document.visibilityState === 'visible') void sync(); };
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      active = false;
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
      void supabase.removeChannel(channel);
    };
  }, [userId, name, sector, enabled]);
}

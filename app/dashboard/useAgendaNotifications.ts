'use client';
import { useEffect } from 'react';
import { portalDayKey, serverNowDate } from '../lib/serverClock';
import { supabase } from '../lib/supabase';

interface AgendaRow {
  id: string;
  titulo: string;
  data: string;
  hora_inicio: string;
  hora_fim?: string;
  local?: string;
  visibilidade: string;
  setor: string;
  organizador_id: string;
  aceitos_por?: string[];
}

function formatDateBR(iso: string): string {
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  return `${parts[2]}/${parts[1]}`;
}

export function useAgendaNotifications(
  user: { user_id: string; nome: string; setor: string } | null,
  enabled: boolean
) {
  const userId = user?.user_id;
  const name = user?.nome;
  const sector = user?.setor;

  useEffect(() => {
    if (!userId || !name || !sector || !enabled) return;

    let active = true;
    let events: AgendaRow[] = [];
    const remindedKey = `doodoo:agenda-reminded:v1:${userId}`;
    const reminded = new Set<string>();

    try {
      const saved = JSON.parse(localStorage.getItem(remindedKey) || '[]');
      if (Array.isArray(saved)) {
        for (const item of saved) if (typeof item === 'string') reminded.add(item);
      }
    } catch {
      /* Memory fallback if storage is unavailable. */
    }

    const persistReminded = () => {
      try {
        localStorage.setItem(remindedKey, JSON.stringify([...reminded].slice(-80)));
      } catch {
        /* Ignore storage errors. */
      }
    };

    const isVisibleToUser = (ev: AgendaRow) =>
      ev.organizador_id === userId ||
      ev.visibilidade === 'geral' ||
      (ev.visibilidade === 'setor' && ev.setor === sector) ||
      Boolean(ev.aceitos_por?.includes(name));

    const checkUpcoming = () => {
      if (!active || !events.length) return;
      const now = serverNowDate();
      const today = portalDayKey(now);
      let changed = false;

      for (const ev of events) {
        if (!ev.data || ev.data !== today || !ev.hora_inicio) continue;
        const start = new Date(`${ev.data}T${ev.hora_inicio.slice(0, 5)}:00-03:00`);
        if (Number.isNaN(start.getTime())) continue;
        const diffMs = start.getTime() - now.getTime();
        // Alert within 15 minutes before start up to 1 minute after start.
        if (diffMs >= -60_000 && diffMs <= 15 * 60_000) {
          const eventKey = `agenda:soon:${ev.id}:${ev.data}`;
          if (reminded.has(eventKey)) continue;
          reminded.add(eventKey);
          changed = true;
          const timeStr = ev.hora_inicio.slice(0, 5);
          window.dispatchEvent(
            new CustomEvent('doodoo:notify', {
              detail: {
                title: diffMs <= 60_000 ? 'Evento começando agora' : 'Evento na agenda em breve',
                desc: `“${ev.titulo}” às ${timeStr}${ev.local ? ` · ${ev.local}` : ''}.`,
                link: '/dashboard/agenda',
                eventKey,
              },
            })
          );
        }
      }

      if (changed) persistReminded();
    };

    const loadEvents = async () => {
      const today = portalDayKey(serverNowDate());
      const { data, error } = await supabase
        .from('doodoo_agenda')
        .select('id,titulo,data,hora_inicio,hora_fim,local,visibilidade,setor,organizador_id,aceitos_por')
        .gte('data', today)
        .order('data', { ascending: true });
      if (!active || error || !data) return;
      events = (data as AgendaRow[]).filter(isVisibleToUser);
      checkUpcoming();
    };

    void loadEvents();

    const channel = supabase
      .channel(`doodoo_agenda_notices_${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'doodoo_agenda' }, (payload) => {
        if (!active) return;
        if (payload.eventType === 'DELETE') {
          events = events.filter((e) => e.id !== payload.old?.id);
          return;
        }
        const ev = payload.new as AgendaRow;
        if (!ev?.id || !isVisibleToUser(ev)) return;

        events = [...events.filter((e) => e.id !== ev.id), ev];

        if (payload.eventType === 'INSERT' && ev.organizador_id !== userId) {
          const timeStr = (ev.hora_inicio || '').slice(0, 5);
          window.dispatchEvent(
            new CustomEvent('doodoo:notify', {
              detail: {
                title: 'Novo evento na agenda',
                desc: `“${ev.titulo}” em ${formatDateBR(ev.data)}${timeStr ? ` às ${timeStr}` : ''}${ev.local ? ` · ${ev.local}` : ''}.`,
                link: '/dashboard/agenda',
                eventKey: `agenda:new:${ev.id}`,
              },
            })
          );
        }
        checkUpcoming();
      })
      .subscribe();

    const interval = window.setInterval(checkUpcoming, 30_000);
    const onFocus = () => {
      if (document.visibilityState === 'visible') void loadEvents();
    };
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onFocus);
    document.addEventListener('visibilitychange', onFocus);

    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
      void supabase.removeChannel(channel);
    };
  }, [userId, name, sector, enabled]);
}

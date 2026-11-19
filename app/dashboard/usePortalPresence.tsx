'use client';

import { createContext, useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  PRESENCE_HEARTBEAT_MS,
  PRESENCE_HIDDEN_GRACE_MS,
  PRESENCE_IDLE_MS,
  PRESENCE_TTL_MS,
  validPresence,
  type UserStatusType,
} from '../lib/chatPresence';

interface Profile {
  user_id: string;
  status_presenca?: UserStatusType;
}

interface PresenceValue {
  status: UserStatusType;
  preference: UserStatusType;
  sync: 'saving' | 'saved' | 'error';
  choose: (status: UserStatusType) => void;
  retry: () => void;
}

export const PortalPresenceContext = createContext<PresenceValue>({
  status: 'offline',
  preference: 'online',
  sync: 'saving',
  choose: () => {},
  retry: () => {},
});

/** One writer per mounted portal; moving between pages never resets a manual status. */
export function usePortalPresence(profile: Profile | null, enabled: boolean): PresenceValue {
  const [status, setStatus] = useState<UserStatusType>('offline');
  const [preference, setPreference] = useState<UserStatusType>('online');
  const [sync, setSync] = useState<PresenceValue['sync']>('saving');
  const controller = useRef<{ choose: (v: UserStatusType) => void; retry: () => void } | null>(null);
  const userId = enabled ? profile?.user_id : undefined;
  const initialStatus = useRef(profile?.status_presenca);

  useEffect(() => {
    initialStatus.current = profile?.status_presenca;
  }, [profile?.status_presenca]);

  // Expose live presence on <html> so sound, desktop pop-up, and buzz respect "Não incomodar" (ocupado) globally.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.dataset.userPresence = status;
    return () => {
      delete document.documentElement.dataset.userPresence;
    };
  }, [status]);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    let writing = false;
    let pending = false;
    let departing = false;
    let hiddenTimer: ReturnType<typeof setTimeout> | undefined;
    let hiddenSince: number | null = document.visibilityState === 'visible' ? null : Date.now();
    let writeAbort: AbortController | null = null;
    let lastWrite = 0;
    let lastStatus: UserStatusType | undefined;
    let lastActivity = Date.now();

    const key = 'doodoo:presence:' + userId;
    const prefix = key + ':tab:';
    const tabKey = prefix + crypto.randomUUID();

    let manual: UserStatusType = initialStatus.current && validPresence(initialStatus.current) ? initialStatus.current : 'online';
    try {
      const saved = localStorage.getItem(key);
      if (validPresence(saved)) manual = saved;
    } catch {
      /* Ignore storage restrictions. */
    }
    setPreference(manual);

    const hasOtherActiveTab = () => {
      try {
        const now = Date.now();
        for (let i = 0; i < localStorage.length; i++) {
          const name = localStorage.key(i);
          if (!name?.startsWith(prefix) || name === tabKey) continue;
          const tab = JSON.parse(localStorage.getItem(name) || 'null');
          if (tab?.visible && now - tab.updatedAt < PRESENCE_TTL_MS && now - tab.lastActivity < PRESENCE_IDLE_MS) {
            return true;
          }
        }
      } catch {
        /* Ignore storage read failures. */
      }
      return false;
    };

    const effective = (): UserStatusType => {
      if (manual !== 'online') return manual;
      const now = Date.now();
      const visibleNow = document.visibilityState === 'visible';
      if (visibleNow && now - lastActivity < PRESENCE_IDLE_MS) return 'online';
      if (hasOtherActiveTab()) return 'online';
      // Give a short grace window when briefly switching tabs before flipping to Ausente.
      if (!visibleNow && hiddenSince !== null && now - hiddenSince < PRESENCE_HIDDEN_GRACE_MS && now - lastActivity < PRESENCE_IDLE_MS) {
        return 'online';
      }
      return 'ausente';
    };

    const lease = () => {
      try {
        localStorage.setItem(
          tabKey,
          JSON.stringify({
            visible: document.visibilityState === 'visible',
            updatedAt: Date.now(),
            lastActivity,
          })
        );
      } catch {
        /* Ignore storage write failures. */
      }
    };

    const publish = async (force = false) => {
      if (!active || departing) return;
      const next = effective();
      setStatus(next);
      if (writing) {
        pending = true;
        return;
      }
      // Once explicitly offline, don't keep bumping last_seen every 25s (keeps "Visto por último" honest).
      if (next === 'offline' && lastStatus === 'offline' && !force) return;
      if (!force && next === lastStatus && Date.now() - lastWrite < PRESENCE_HEARTBEAT_MS) return;

      writing = true;
      writeAbort = new AbortController();
      setSync('saving');
      try {
        const patch: { status_presenca: UserStatusType; last_seen?: string } =
          next === 'offline' && lastStatus === 'offline'
            ? { status_presenca: 'offline' }
            : { status_presenca: next, last_seen: new Date().toISOString() };

        const { data, error } = await supabase
          .from('doodoo_perfis')
          .update(patch)
          .eq('user_id', userId)
          .select('user_id')
          .abortSignal(writeAbort.signal)
          .maybeSingle();
        if (error || !data) throw error || new Error('Presence update not confirmed');
        if (active) {
          lastWrite = Date.now();
          lastStatus = next;
          setSync('saved');
        }
      } catch {
        if (active && !departing) setSync('error');
      } finally {
        writing = false;
        if (pending && active && !departing) {
          pending = false;
          void publish();
        }
      }
    };

    controller.current = {
      choose: (value) => {
        manual = value;
        setPreference(value);
        if (value === 'online') {
          lastActivity = Date.now();
          hiddenSince = document.visibilityState === 'visible' ? null : Date.now();
        }
        try {
          localStorage.setItem(key, value);
        } catch {
          /* Ignore storage restrictions. */
        }
        lease();
        void publish(true);
      },
      retry: () => {
        lease();
        void publish(true);
      },
    };

    const onActivity = () => {
      const now = Date.now();
      const wasIdle = now - lastActivity >= PRESENCE_IDLE_MS;
      lastActivity = now;
      if (document.visibilityState === 'visible') hiddenSince = null;
      if (wasIdle || now - lastWrite > 10_000) {
        lease();
        void publish();
      }
    };

    const onVisibility = () => {
      clearTimeout(hiddenTimer);
      if (document.visibilityState === 'visible') {
        departing = false;
        hiddenSince = null;
        lastActivity = Date.now();
        lease();
        void publish(true);
      } else {
        hiddenSince = Date.now();
        lease();
        // Wait grace period before transitioning an "online" user to "ausente" when hidden,
        // so brief tab switches don't cause false Ausente flickering.
        hiddenTimer = setTimeout(() => {
          if (!departing && document.visibilityState !== 'visible') {
            lease();
            void publish(true);
          }
        }, PRESENCE_HIDDEN_GRACE_MS + 100);
      }
    };

    const onStorage = (e: StorageEvent) => {
      if (e.key === key && validPresence(e.newValue)) {
        manual = e.newValue;
        setPreference(manual);
        void publish(true);
      } else if (e.key?.startsWith(prefix)) {
        void publish();
      }
    };

    const onUnload = () => {
      departing = true;
      clearTimeout(hiddenTimer);
      writeAbort?.abort();
      try {
        localStorage.removeItem(tabKey);
      } catch {
        /* Ignore */
      }
    };

    lease();
    void publish(true);

    // Keep heartbeat active even in background tabs so manual statuses (Não incomodar, Ausente, Indisponível)
    // and backgrounded sessions stay accurate instead of falsely expiring to Offline after 100s.
    const heartbeat = window.setInterval(() => {
      if (manual === 'offline') return;
      lease();
      void publish(true);
    }, PRESENCE_HEARTBEAT_MS);

    const idleCheck = window.setInterval(() => {
      if (manual === 'online') void publish();
    }, 5000);

    const events = ['pointerdown', 'pointermove', 'keydown', 'touchstart'];
    for (const event of events) window.addEventListener(event, onActivity, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onVisibility);
    window.addEventListener('focus', onVisibility);
    window.addEventListener('pageshow', onVisibility);
    window.addEventListener('pagehide', onUnload);
    window.addEventListener('storage', onStorage);

    return () => {
      active = false;
      controller.current = null;
      onUnload();
      clearInterval(heartbeat);
      clearInterval(idleCheck);
      for (const event of events) window.removeEventListener(event, onActivity);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onVisibility);
      window.removeEventListener('focus', onVisibility);
      window.removeEventListener('pageshow', onVisibility);
      window.removeEventListener('pagehide', onUnload);
      window.removeEventListener('storage', onStorage);
    };
  }, [userId]);

  const choose = useCallback((v: UserStatusType) => controller.current?.choose(v), []);
  const retry = useCallback(() => controller.current?.retry(), []);

  return { status, preference, sync, choose, retry };
}

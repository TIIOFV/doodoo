'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';

export interface TypingMember {
  user_id: string;
  name: string;
}

export interface TypingChannel {
  id: string;
  isDirect?: boolean;
  members: TypingMember[];
}

type Connection = 'connecting' | 'ready' | 'error';

const PAUSE_MS = 2400;
const RENEW_MS = 1000;
const LEASE_MS = 5000;

// Track in-flight removeChannel promises by channel ID so React Strict Mode double-mounts
// or rapid channel updates never reuse a channel that is mid-unsubscribe/teardown.
const pendingRemovals = new Map<string, Promise<unknown>>();

function removeChannelSafely(id: string, channel: RealtimeChannel) {
  const prev = pendingRemovals.get(id);
  const task = (prev ? prev.catch(() => undefined) : Promise.resolve())
    .then(() => supabase.removeChannel(channel))
    .catch(() => undefined)
    .finally(() => {
      if (pendingRemovals.get(id) === task) pendingRemovals.delete(id);
    });
  pendingRemovals.set(id, task);
  return task;
}

export function useChatTyping(userId: string | undefined, channels: TypingChannel[], activeId: string | null) {
  const [signals, setSignals] = useState<Record<string, Record<string, number>>>({});
  const [connections, setConnections] = useState<Record<string, Connection>>({});
  const [revision, setRevision] = useState(0);

  const sockets = useRef(new Map<string, RealtimeChannel>());
  const memberIdsByChannel = useRef(new Map<string, Set<string>>());
  const activity = useRef({ id: null as string | null, at: 0, lastSent: 0, sent: false });
  const enabled = useRef(true);

  const authorizedChannels = useMemo(
    () =>
      channels
        .filter((c) => !c.id.startsWith('temp_') && c.members.some((m) => m.user_id === userId))
        .map((c) => ({ id: c.id, ids: c.members.map((m) => m.user_id).sort() }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    [channels, userId]
  );

  // Sync allowed member IDs in a ref without tearing down healthy sockets when member lists update.
  useEffect(() => {
    const next = new Map<string, Set<string>>();
    for (const item of authorizedChannels) {
      next.set(item.id, new Set(item.ids));
    }
    memberIdsByChannel.current = next;
  }, [authorizedChannels]);

  // Only channel additions/removals or explicit retries change active subscriptions.
  const channelIdsSignature = useMemo(
    () => authorizedChannels.map((c) => c.id).join(','),
    [authorizedChannels]
  );

  const send = useCallback(
    (id: string, typing: boolean) => {
      const channel = sockets.current.get(id);
      if (!userId || channel?.state !== 'joined') return false;
      void channel
        .send({ type: 'broadcast', event: 'typing', payload: { userId, typing } })
        .catch(() => undefined);
      return true;
    },
    [userId]
  );

  const stop = useCallback(() => {
    const item = activity.current;
    if (item.id && item.sent) send(item.id, false);
    activity.current = { id: null, at: 0, lastSent: 0, sent: false };
  }, [send]);

  const clearSender = useCallback((channelId: string, senderId: string) => {
    if (!channelId || !senderId) return;
    setSignals((prev) => {
      const entries = prev[channelId];
      if (!entries || !(senderId in entries)) return prev;
      const nextEntries = { ...entries };
      delete nextEntries[senderId];
      return { ...prev, [channelId]: nextEntries };
    });
  }, []);

  // Read privacy opt-out preference from localStorage
  useEffect(() => {
    const read = () => {
      try {
        enabled.current = localStorage.getItem('doodoo:typing:' + userId) !== 'off';
      } catch {
        enabled.current = true;
      }
      if (!enabled.current) stop();
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'doodoo:typing:' + userId) read();
    };
    read();
    window.addEventListener('doodoo:typing_preference', read);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('doodoo:typing_preference', read);
      window.removeEventListener('storage', onStorage);
    };
  }, [userId, stop]);

  // Incremental channel subscription management (avoids tearing down healthy rooms)
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const ownedSockets = sockets.current;
    const desiredIds = channelIdsSignature ? channelIdsSignature.split(',') : [];
    const desiredSet = new Set(desiredIds);

    // 1. Remove channels the user is no longer in
    for (const [id, channel] of Array.from(ownedSockets.entries())) {
      if (!desiredSet.has(id)) {
        ownedSockets.delete(id);
        void removeChannelSafely(id, channel);
        setSignals((prev) => {
          if (!(id in prev)) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
        setConnections((prev) => {
          if (!(id in prev)) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }
    }

    // 2. Connect channels that are new or need subscription
    const subscribeMissing = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (data.session?.access_token) {
          await supabase.realtime.setAuth(data.session.access_token);
        } else {
          await supabase.realtime.setAuth();
        }
      } catch {
        // Standard broadcast works even if explicit token refresh fails; continue attempting join.
      }
      if (cancelled) return;

      await Promise.all(
        desiredIds.map(async (id) => {
          if (ownedSockets.has(id)) return;
          const inflight = pendingRemovals.get(id);
          if (inflight) await inflight;
          if (cancelled || ownedSockets.has(id)) return;

          setConnections((prev) => ({ ...prev, [id]: 'connecting' }));

          const channel = supabase
            .channel('doodoo:typing:' + id, {
              config: { broadcast: { self: false, ack: false } },
            })
            .on('broadcast', { event: 'typing' }, (message) => {
              const value = message.payload as { userId?: unknown; typing?: unknown } | undefined;
              const allowedMembers = memberIdsByChannel.current.get(id);
              if (
                cancelled ||
                typeof value?.userId !== 'string' ||
                typeof value?.typing !== 'boolean' ||
                value.userId === userId ||
                !allowedMembers?.has(value.userId)
              ) {
                return;
              }
              const peerId = value.userId;
              const isTyping = value.typing;
              setSignals((prev) => {
                const entries = { ...(prev[id] || {}) };
                if (isTyping) entries[peerId] = Date.now() + LEASE_MS;
                else delete entries[peerId];
                return { ...prev, [id]: entries };
              });
            })
            .subscribe((status) => {
              if (cancelled || ownedSockets.get(id) !== channel) return;
              const nextState: Connection =
                status === 'SUBSCRIBED'
                  ? 'ready'
                  : status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED'
                    ? 'error'
                    : 'connecting';
              setConnections((prev) => ({ ...prev, [id]: nextState }));

              if (status !== 'SUBSCRIBED') {
                setSignals((prev) => (prev[id] && Object.keys(prev[id]).length ? { ...prev, [id]: {} } : prev));
              } else {
                const current = activity.current;
                if (current.id === id && Date.now() - current.at < PAUSE_MS && enabled.current) {
                  current.lastSent = Date.now();
                  current.sent = send(id, true);
                }
              }
            });

          ownedSockets.set(id, channel);
        })
      );
    };

    void subscribeMissing();

    return () => {
      cancelled = true;
    };
  }, [channelIdsSignature, userId, revision, send]);

  // Full cleanup on unmount or user change
  useEffect(() => {
    const ownedSockets = sockets.current;
    return () => {
      stop();
      for (const [id, channel] of Array.from(ownedSockets.entries())) {
        ownedSockets.delete(id);
        void removeChannelSafely(id, channel);
      }
    };
  }, [userId, stop]);

  // Stop broadcasting typing when switching active conversation
  useEffect(() => {
    stop();
  }, [activeId, stop]);

  // Keep-alive renewal + inactivity auto-stop + peer lease expiration
  useEffect(() => {
    const tick = window.setInterval(() => {
      const now = Date.now();
      const item = activity.current;
      if (item.id) {
        if (!enabled.current || document.visibilityState !== 'visible' || now - item.at >= PAUSE_MS) {
          stop();
        } else if (now - item.lastSent >= RENEW_MS && send(item.id, true)) {
          item.lastSent = now;
          item.sent = true;
        }
      }
      setSignals((prev) => {
        let changed = false;
        const next: typeof prev = {};
        for (const [id, entries] of Object.entries(prev)) {
          const alive: Record<string, number> = {};
          for (const [person, until] of Object.entries(entries)) {
            if (until > now) alive[person] = until;
            else changed = true;
          }
          next[id] = alive;
        }
        return changed ? next : prev;
      });
    }, 250);

    const onVisibility = () => {
      if (document.visibilityState !== 'visible') stop();
    };
    window.addEventListener('blur', stop);
    window.addEventListener('pagehide', stop);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(tick);
      stop();
      window.removeEventListener('blur', stop);
      window.removeEventListener('pagehide', stop);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [send, stop]);

  const input = useCallback(
    (value: string) => {
      if (!activeId || !value.trim() || !enabled.current || document.visibilityState !== 'visible') {
        stop();
        return;
      }
      const now = Date.now();
      const item = activity.current;
      item.id = activeId;
      item.at = now;
      if (!item.sent || now - item.lastSent >= RENEW_MS) {
        item.sent = send(activeId, true);
        if (item.sent) item.lastSent = now;
      }
    },
    [activeId, send, stop]
  );

  const typers = useCallback(
    (channelId: string): TypingMember[] => {
      const ids = Object.keys(signals[channelId] || {});
      if (ids.length === 0) return [];
      const channel = channels.find((c) => c.id === channelId);
      if (!channel) return [];
      return channel.members.filter((m) => ids.includes(m.user_id) && m.user_id !== userId);
    },
    [channels, signals, userId]
  );

  const label = useCallback(
    (channelId: string): string => {
      const activeTypers = typers(channelId);
      if (activeTypers.length === 0) return '';
      const channel = channels.find((c) => c.id === channelId);
      if (channel?.isDirect) {
        return 'digitando…';
      }
      const names = activeTypers.map((m) => m.name.split(' ')[0]);
      if (names.length === 1) return `${names[0]} está digitando…`;
      if (names.length === 2) return `${names[0]} e ${names[1]} estão digitando…`;
      return `${names.slice(0, 2).join(', ')} e outras pessoas estão digitando…`;
    },
    [channels, typers]
  );

  const retry = useCallback(() => {
    const ownedSockets = sockets.current;
    if (activeId && ownedSockets.has(activeId)) {
      const old = ownedSockets.get(activeId)!;
      ownedSockets.delete(activeId);
      void removeChannelSafely(activeId, old);
    }
    setRevision((n) => n + 1);
  }, [activeId]);

  return {
    label,
    typers,
    input,
    stop,
    clearSender,
    unavailable: !!activeId && connections[activeId] === 'error',
    retry,
  };
}

'use client';
import { BrandBadge, primaryActionStyle } from '../components/BrandMark';
import { EmptyState, LoadingState, panelStyle, ThemeSelect } from '../components/ui';
import { useTheme } from '../contexts/ThemeContext';
import { gameLabel, type GameKind } from '../lib/chatGames';
import type { UserStatusType } from '../lib/chatPresence';
import {
  getDesktopNotificationPermission,
  requestDesktopNotificationPermission,
  showDesktopNotification,
  type DesktopNotificationPermission,
} from '../lib/desktopNotifications';
import { environment } from '../lib/environment';
import { playPortalSound, unlockPortalAudio } from '../lib/notificationSound';
import { formatPortalTime, serverNowDate, serverNowIso, startServerClockSync } from '../lib/serverClock';
import { supabase } from './../lib/supabase';
import ChatAttention from './ChatAttention';
import './portal-mobile.css';
import { useAgendaNotifications } from './useAgendaNotifications';
import { useMobileViewport } from './useMobileViewport';
import { PortalPresenceContext, usePortalPresence } from './usePortalPresence';
import { useTaskNotifications } from './useTaskNotifications';

import type { Session } from '@supabase/supabase-js';
import {
  Bell,
  BellRing,
  Building2,
  Calendar,
  CheckCheck,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Gamepad2,
  LayoutGrid,
  LogOut,
  MessageSquare,
  Settings,
  ShieldAlert,
  StickyNote,
  Trash2,
  Zap,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type RoleType = 'administrador' | 'gestor' | 'coordenador' | 'supervisor' | 'analista' | 'colaborador';
interface DBProfile {
  id: string;
  user_id: string;
  nome: string;
  email: string;
  cargo: RoleType;
  setor: string;
  avatar_url?: string;
  status?: string;
  status_presenca?: UserStatusType;
}

interface AppNotification {
  id: string | number;
  title: string;
  desc: string;
  time: string;
  unread: boolean;
  link?: string;
  eventKey?: string;
}

const createNotificationId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

type NotifFilter = 'all' | 'chat' | 'tasks' | 'agenda';

interface ChannelSummary {
  id: string;
  nome: string;
  is_direct?: boolean;
}

function isPersistentNotificationKey(eventKey?: string): boolean {
  if (!eventKey) return false;
  return (
    eventKey.startsWith('chat:') ||
    eventKey.startsWith('chat-urgent:') ||
    eventKey.startsWith('chat-buzz:') ||
    eventKey.startsWith('chat-game:') ||
    eventKey.startsWith('task:') ||
    eventKey.startsWith('agenda:')
  );
}

function classifyNotification(eventKey?: string): {
  group: Exclude<NotifFilter, 'all'>;
  label: string;
  accent: string;
  kind: 'chat' | 'urgent' | 'buzz' | 'game' | 'task' | 'agenda';
} {
  if (!eventKey) return { group: 'chat', label: 'Aviso', accent: '#2563eb', kind: 'chat' };
  if (eventKey.startsWith('chat-buzz:')) {
    return { group: 'chat', label: 'Chamada de atenção', accent: '#d97706', kind: 'buzz' };
  }
  if (eventKey.startsWith('chat-urgent:')) {
    return { group: 'chat', label: 'Mensagem urgente', accent: '#d97706', kind: 'urgent' };
  }
  if (eventKey.startsWith('chat-game:')) {
    return { group: 'chat', label: 'Convite de jogo', accent: '#7c3aed', kind: 'game' };
  }
  if (eventKey.startsWith('chat:')) {
    return { group: 'chat', label: 'Mensagem no Chat', accent: '#2563eb', kind: 'chat' };
  }
  if (eventKey.startsWith('task:')) {
    if (eventKey.includes(':assigned:')) return { group: 'tasks', label: 'Nova tarefa', accent: '#059669', kind: 'task' };
    if (eventKey.includes(':status:')) return { group: 'tasks', label: 'Status de tarefa', accent: '#4f46e5', kind: 'task' };
    return { group: 'tasks', label: 'Diário de tarefa', accent: '#2563eb', kind: 'task' };
  }
  return { group: 'agenda', label: 'Agenda', accent: '#ea580c', kind: 'agenda' };
}

const getInitials = (name: string) => {
  if (!name) return '..';
  const parts = name.trim().split(' ').filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
};

const formatRole = (cargo?: string) => (cargo ? cargo.charAt(0).toUpperCase() + cargo.slice(1) : '');

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  useMobileViewport();
  const pathname = usePathname();
  const router = useRouter();
  const { theme, changeTheme } = useTheme();

  const [feedback, setFeedback] = useState<{ title: string; desc: string } | null>(null);
  useEffect(() => {
    if (!feedback) return;
    const timeout = window.setTimeout(() => setFeedback(null), 6000);
    return () => window.clearTimeout(timeout);
  }, [feedback]);

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [notifFilter, setNotifFilter] = useState<NotifFilter>('all');
  const [desktopPermission, setDesktopPermission] = useState<DesktopNotificationPermission>(() =>
    getDesktopNotificationPermission()
  );
  useEffect(() => {
    const syncPermission = () => setDesktopPermission(getDesktopNotificationPermission());
    window.addEventListener('doodoo:desktop_notif_preference', syncPermission);
    window.addEventListener('focus', syncPermission);
    return () => {
      window.removeEventListener('doodoo:desktop_notif_preference', syncPermission);
      window.removeEventListener('focus', syncPermission);
    };
  }, []);
  useEffect(() => {
    const unlock = () => {
      void unlockPortalAudio();
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  const notifRef = useRef<HTMLDivElement>(null);
  const mobileNotifRef = useRef<HTMLDivElement>(null);

  const [currentUser, setCurrentUser] = useState<DBProfile | null>(null);
  const [allowedTabs, setAllowedTabs] = useState<string[]>([]);
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const sessionId = session?.user.id;
  const [accessVersion, setAccessVersion] = useState(0);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  useTaskNotifications(currentUser?.user_id === sessionId ? currentUser : null, allowedTabs.includes('tarefas'));
  useAgendaNotifications(currentUser?.user_id === sessionId ? currentUser : null, allowedTabs.includes('agenda'));
  const portalPresence = usePortalPresence(currentUser?.user_id === sessionId ? currentUser : null, allowedTabs.includes('chat'));
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState(false);

  const [mobileChatActive, setHideBottomNavOnMobile] = useState(false);
  const hideBottomNavOnMobile = mobileChatActive && pathname.startsWith('/dashboard/conversas');

  const meusCanaisRef = useRef<string[]>([]);
  const channelMetaRef = useRef<Map<string, ChannelSummary>>(new Map());

  const solidDropdown = {
    ...panelStyle,
    boxShadow: 'var(--shadow-card-hover, 0 12px 28px -10px rgb(15 23 42 / 0.16))',
  };
  const headerStyle = {
    backgroundColor: 'color-mix(in srgb, var(--bg-card) 86%, transparent)',
    borderBottom: '1px solid var(--border-input)',
    backdropFilter: 'blur(12px)',
  };
  const glassBottomNav = {
    backgroundColor: 'var(--bg-card)',
    borderTop: '1px solid var(--border-input)',
  };

  useEffect(() => startServerClockSync(), []);

  useEffect(() => {
    let mounted = true;
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (mounted) setSession(error ? null : data.session);
      })
      .catch(() => {
        if (mounted) setSession(null);
      });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => {
      if (mounted) setSession(next);
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (currentUser && currentUser.user_id === sessionId) {
      try {
        localStorage.setItem('doodoo_notificacoes:' + currentUser.user_id, JSON.stringify(notifications));
      } catch {
        /* Notifications remain available in memory when storage is disabled. */
      }
    }
  }, [notifications, currentUser, sessionId]);

  useEffect(() => {
    const handleUpdateChatBadge = (e: Event) => setUnreadChatCount((e as CustomEvent<number>).detail);
    window.addEventListener('doodoo:update_unread_chat', handleUpdateChatBadge);

    const handleChatState = (e: Event) => setHideBottomNavOnMobile((e as CustomEvent<{ isInsideChat: boolean }>).detail.isInsideChat);
    window.addEventListener('doodoo:mobile_chat_state', handleChatState);

    return () => {
      window.removeEventListener('doodoo:update_unread_chat', handleUpdateChatBadge);
      window.removeEventListener('doodoo:mobile_chat_state', handleChatState);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!sessionId) return;
      try {
        const { data: profile, error: profileError } = await supabase
          .from('doodoo_perfis')
          .select('*')
          .eq('user_id', sessionId)
          .maybeSingle();
        if (profileError || !profile || profile.status === 'bloqueado') throw new Error('Acesso indisponível');
        const { data: permissions, error } = await supabase.from('doodoo_permissoes').select('*');
        if (error) throw error;
        const tabs = (permissions || [])
          .filter((p) => p.cargos_permitidos?.includes(profile.cargo) || p.usuarios_permitidos?.includes(profile.user_id))
          .map((p) => p.aba_key.replace('tarefas_todas', 'tarefas').replace('tarefas_minha', 'tarefas'));
        const { data: channels } = await supabase.from('doodoo_canais').select('id,nome,is_direct,membros');
        if (!active) return;
        const myChannels = (channels || []).filter((c) =>
          c.membros?.some((m: { user_id: string }) => m.user_id === profile.user_id)
        );
        meusCanaisRef.current = myChannels.map((c) => c.id);
        channelMetaRef.current = new Map(
          myChannels.map((c) => [c.id, { id: c.id, nome: c.nome || 'Canal', is_direct: c.is_direct }])
        );

        let initialUnreadChat = 0;
        if (tabs.includes('chat') && myChannels.length > 0) {
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
          const { data: recentMsgs } = await supabase
            .from('doodoo_mensagens')
            .select('canal_id,sender_id,metadata')
            .gte('created_at', sevenDaysAgo.toISOString());
          if (!active) return;
          const myIds = new Set(meusCanaisRef.current);
          initialUnreadChat = (recentMsgs || []).filter((m) => {
            if (!myIds.has(m.canal_id) || m.sender_id === profile.user_id) return false;
            const meta = m.metadata as { deleted?: boolean; lidoPor?: string[] } | null;
            if (meta?.deleted) return false;
            return !(Array.isArray(meta?.lidoPor) && meta.lidoPor.includes(profile.nome));
          }).length;
        }

        setAllowedTabs(Array.from(new Set(tabs)));
        setCurrentUser(profile as DBProfile);
        setAuthError(false);
        setUnreadChatCount(initialUnreadChat);
        setFeedback(null);
        try {
          const saved = JSON.parse(localStorage.getItem('doodoo_notificacoes:' + profile.user_id) || '[]');
          const seenKeys = new Set<string>();
          const seenIds = new Set<string>();
          const cleaned: AppNotification[] = [];
          if (Array.isArray(saved)) {
            for (const item of saved) {
              if (!item || typeof item.title !== 'string' || typeof item.desc !== 'string') continue;
              if (!isPersistentNotificationKey(item.eventKey)) continue;
              if (item.eventKey && seenKeys.has(item.eventKey)) continue;
              if (item.eventKey) seenKeys.add(item.eventKey);
              const rawId = item.id !== undefined && item.id !== null ? String(item.id) : '';
              const safeId = rawId && !seenIds.has(rawId) ? item.id : createNotificationId();
              seenIds.add(String(safeId));
              cleaned.push({ ...item, id: safeId });
              if (cleaned.length >= 30) break;
            }
          }
          setNotifications(cleaned);
        } catch {
          setNotifications([]);
        }
      } catch {
        if (active) setAuthError(true);
      } finally {
        if (active) setIsLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [sessionId, accessVersion]);

  useEffect(() => {
    if (!currentUser || currentUser.user_id !== sessionId) return;
    let listening = true;

    const refreshMyChannelsAndUnread = async () => {
      if (!allowedTabs.includes('chat')) return;
      const { data } = await supabase.from('doodoo_canais').select('id,nome,is_direct,membros');
      if (!listening || !data) return;
      const mine = data.filter((c) => c.membros?.some((m: { user_id: string }) => m.user_id === currentUser.user_id));
      meusCanaisRef.current = mine.map((c) => c.id);
      channelMetaRef.current = new Map(mine.map((c) => [c.id, { id: c.id, nome: c.nome || 'Canal', is_direct: c.is_direct }]));
      if (!window.location.pathname.startsWith('/dashboard/conversas')) {
        const sevenDaysAgo = serverNowDate();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const { data: recentMsgs } = await supabase
          .from('doodoo_mensagens')
          .select('canal_id,sender_id,metadata')
          .gte('created_at', sevenDaysAgo.toISOString());
        if (!listening || !recentMsgs) return;
        const myIds = new Set(meusCanaisRef.current);
        const count = recentMsgs.filter((m) => {
          if (!myIds.has(m.canal_id) || m.sender_id === currentUser.user_id) return false;
          const meta = m.metadata as { deleted?: boolean; lidoPor?: string[] } | null;
          if (meta?.deleted) return false;
          return !(Array.isArray(meta?.lidoPor) && meta.lidoPor.includes(currentUser.nome));
        }).length;
        setUnreadChatCount(count);
      }
    };

    // Unique topic per mount avoids Strict Mode / re-render async removeChannel() teardown collisions.
    const globalListener = supabase
      .channel(`doodoo_global_network_${currentUser.user_id}_${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'doodoo_perfis', filter: 'user_id=eq.' + currentUser.user_id },
        (payload) => {
          if (
            ['cargo', 'setor', 'status', 'nome'].some(
              (field) => field in payload.new && payload.new[field] !== currentUser[field as keyof DBProfile]
            )
          ) {
            setCurrentUser(null);
            setAccessVersion((v) => v + 1);
          } else if ('avatar_url' in payload.new)
            setCurrentUser((prev) => (prev ? { ...prev, avatar_url: payload.new.avatar_url } : prev));
        }
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'doodoo_permissoes' }, () => {
        setAccessVersion((v) => v + 1);
      });

    if (allowedTabs.includes('chat'))
      globalListener.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'doodoo_mensagens' }, async (payload) => {
        const msg = payload.new;
        if (!msg || msg.sender_id === currentUser.user_id) return;

        // Always verify membership on unknown channels (covers newly created direct/group rooms for ALL message types)
        if (!meusCanaisRef.current.includes(msg.canal_id)) {
          const { data } = await supabase
            .from('doodoo_canais')
            .select('id,nome,is_direct,membros')
            .eq('id', msg.canal_id)
            .maybeSingle();
          if (!listening) return;
          if (data?.membros?.some((m: { user_id: string }) => m.user_id === currentUser.user_id)) {
            meusCanaisRef.current = [...new Set([...meusCanaisRef.current, data.id])];
            channelMetaRef.current.set(data.id, { id: data.id, nome: data.nome || 'Canal', is_direct: data.is_direct });
          }
        }

        if (!meusCanaisRef.current.includes(msg.canal_id)) return;
        const chanInfo = channelMetaRef.current.get(msg.canal_id);
        const groupLabel = chanInfo && !chanInfo.is_direct ? chanInfo.nome : undefined;
        const whereText = groupLabel ? `no grupo “${groupLabel}”` : 'em conversa direta';
        const link = `/dashboard/conversas?chatId=${encodeURIComponent(msg.canal_id)}&messageId=${encodeURIComponent(msg.id)}`;

        // 1. Spark-style Buzz ("Vibrar tela")
        if (msg.metadata?.buzz === true && !msg.metadata?.deleted) {
          window.dispatchEvent(
            new CustomEvent('doodoo:chat_buzz', {
              detail: {
                id: msg.id,
                channelId: msg.canal_id,
                senderId: msg.sender_id,
                sender: msg.sender_nome,
                channelName: groupLabel,
                sentAt: msg.created_at,
              },
            })
          );
          if (document.hidden || !document.hasFocus()) {
            showDesktopNotification({
              userId: currentUser.user_id,
              title: `${msg.sender_nome} vibrou sua tela!`,
              body: `Chamada de atenção ${whereText}. Clique para abrir a conversa.`,
              link,
              eventKey: 'chat-buzz:' + msg.id,
              requireInteraction: true,
              onNavigate: (target) => {
                router.push(target);
                if (window.location.pathname.startsWith('/dashboard/conversas')) {
                  window.dispatchEvent(
                    new CustomEvent('doodoo:switch_chat', { detail: { chatId: msg.canal_id, messageId: msg.id, focusInput: true } })
                  );
                }
              },
            });
          }
          const timeStr = formatPortalTime(msg.created_at || serverNowDate());
          setNotifications((prev) =>
            prev.some((n) => n.eventKey === 'chat-buzz:' + msg.id)
              ? prev
              : [
                  {
                    id: createNotificationId(),
                    title: `${msg.sender_nome} chamou sua atenção`,
                    desc: `Vibrou sua tela ${whereText}.`,
                    time: timeStr,
                    unread: true,
                    link,
                    eventKey: 'chat-buzz:' + msg.id,
                  },
                  ...prev,
                ].slice(0, 30)
          );
          if (!window.location.pathname.startsWith('/dashboard/conversas')) {
            setUnreadChatCount((prev) => prev + 1);
          }
          return;
        }

        // 2. Game Challenge ("Jogo no Chat")
        if (msg.metadata?.game && !msg.metadata?.deleted) {
          const gKind = (msg.metadata.game as { kind?: GameKind }).kind || 'tictactoe';
          const gName = gameLabel(gKind);
          const titulo = `${msg.sender_nome} convidou para jogar ${gName}`;
          const descricao = `Partida de ${gName} iniciada ${whereText}. Clique para aceitar e jogar.`;
          if (!window.location.pathname.startsWith('/dashboard/conversas')) {
            setUnreadChatCount((prev) => prev + 1);
            window.dispatchEvent(
              new CustomEvent('doodoo:notify', {
                detail: { title: titulo, desc: descricao, link, eventKey: 'chat-game:' + msg.id },
              })
            );
          } else if (document.hidden || !document.hasFocus()) {
            showDesktopNotification({
              userId: currentUser.user_id,
              title: titulo,
              body: descricao,
              link,
              eventKey: 'chat-game:' + msg.id,
              onNavigate: (target) => {
                router.push(target);
                window.dispatchEvent(new CustomEvent('doodoo:switch_chat', { detail: { chatId: msg.canal_id, messageId: msg.id } }));
              },
            });
          }
          return;
        }

        // 3. Urgent Message (requires "Ciente")
        if (msg.metadata?.urgent === true && !msg.metadata?.deleted) {
          window.dispatchEvent(
            new CustomEvent('doodoo:chat_attention', {
              detail: { id: msg.id, channelId: msg.canal_id, senderId: msg.sender_id, sender: msg.sender_nome, text: msg.texto },
            })
          );
          if (!window.location.pathname.startsWith('/dashboard/conversas')) {
            setUnreadChatCount((prev) => prev + 1);
          }
          window.dispatchEvent(
            new CustomEvent('doodoo:notify', {
              detail: {
                title: groupLabel ? `Urgente · ${msg.sender_nome} (${groupLabel})` : `Urgente · ${msg.sender_nome}`,
                desc: `${msg.texto} — Requer confirmação de ciência.`,
                link,
                eventKey: 'chat-urgent:' + msg.id,
              },
            })
          );
          return;
        }

        // 4. Normal Chat Message
        const titulo = groupLabel ? `${msg.sender_nome} · ${groupLabel}` : `${msg.sender_nome} (Conversa direta)`;
        const descricao =
          msg.tipo === 'image'
            ? '📷 Enviou uma imagem.'
            : msg.tipo === 'file'
              ? `📎 Enviou o documento “${(msg.metadata?.fileName as string) || 'Arquivo'}”.`
              : msg.tipo === 'event'
                ? `📅 Convite de reunião: ${(msg.metadata?.eventDetails as { title?: string })?.title || msg.texto}`
                : msg.texto;
        const chatLink = `/dashboard/conversas?chatId=${encodeURIComponent(msg.canal_id)}`;

        if (!window.location.pathname.startsWith('/dashboard/conversas')) {
          setUnreadChatCount((prev) => prev + 1);
          window.dispatchEvent(
            new CustomEvent('doodoo:notify', {
              detail: { title: titulo, desc: descricao, link: chatLink, eventKey: 'chat:' + msg.id },
            })
          );
        } else if (document.hidden || !document.hasFocus()) {
          showDesktopNotification({
            userId: currentUser.user_id,
            title: titulo,
            body: descricao || '',
            link: chatLink,
            eventKey: 'chat:' + msg.id,
            onNavigate: (target) => {
              router.push(target);
              window.dispatchEvent(new CustomEvent('doodoo:switch_chat', { detail: { chatId: msg.canal_id } }));
            },
          });
        }
      });

    if (allowedTabs.includes('chat'))
      globalListener.on('postgres_changes', { event: '*', schema: 'public', table: 'doodoo_canais' }, () => {
        void refreshMyChannelsAndUnread();
      });

    globalListener.subscribe();
    void refreshMyChannelsAndUnread();

    // Instant Realtime Broadcast channel for Spark-style Buzz ("Vibrar tela") so alerts trigger in <100ms
    // across ANY portal page even if postgres_changes experiences WAL lag or reconnection.
    const buzzChannel = allowedTabs.includes('chat')
      ? supabase
          .channel('doodoo:buzz:global', { config: { broadcast: { self: false } } })
          .on('broadcast', { event: 'buzz' }, ({ payload }) => {
            const p = payload as {
              id?: string;
              channelId?: string;
              channelName?: string;
              senderId?: string;
              sender?: string;
              recipientIds?: string[];
              sentAt?: string;
            } | null;
            if (!p?.id || !p.channelId || !p.senderId || !p.sender || p.senderId === currentUser.user_id) return;
            const targeted =
              (Array.isArray(p.recipientIds) && p.recipientIds.includes(currentUser.user_id)) ||
              meusCanaisRef.current.includes(p.channelId);
            if (!targeted) return;

            const link = `/dashboard/conversas?chatId=${encodeURIComponent(p.channelId)}&messageId=${encodeURIComponent(p.id)}`;
            const whereText = p.channelName ? `no grupo “${p.channelName}”` : 'em conversa direta';
            window.dispatchEvent(
              new CustomEvent('doodoo:chat_buzz', {
                detail: {
                  id: p.id,
                  channelId: p.channelId,
                  senderId: p.senderId,
                  sender: p.sender,
                  channelName: p.channelName,
                  sentAt: p.sentAt,
                },
              })
            );
            if (document.hidden || !document.hasFocus()) {
              showDesktopNotification({
                userId: currentUser.user_id,
                title: `${p.sender} vibrou sua tela!`,
                body: `Chamada de atenção ${whereText}. Clique para abrir a conversa.`,
                link,
                eventKey: 'chat-buzz:' + p.id,
                requireInteraction: true,
                onNavigate: (target) => {
                  router.push(target);
                  if (window.location.pathname.startsWith('/dashboard/conversas')) {
                    window.dispatchEvent(
                      new CustomEvent('doodoo:switch_chat', { detail: { chatId: p.channelId, messageId: p.id, focusInput: true } })
                    );
                  }
                },
              });
            }
            const timeStr = formatPortalTime(p.sentAt || serverNowDate());
            setNotifications((prev) =>
              prev.some((n) => n.eventKey === 'chat-buzz:' + p.id)
                ? prev
                : [
                    {
                      id: createNotificationId(),
                      title: `${p.sender} chamou sua atenção`,
                      desc: `Vibrou sua tela ${whereText}.`,
                      time: timeStr,
                      unread: true,
                      link,
                      eventKey: 'chat-buzz:' + p.id,
                    },
                    ...prev,
                  ].slice(0, 30)
            );
          })
          .subscribe()
      : null;

    const onSendBuzzBroadcast = (event: Event) => {
      if (!buzzChannel) return;
      const detail = (event as CustomEvent<Record<string, unknown>>).detail;
      if (!detail) return;
      void buzzChannel.send({ type: 'broadcast', event: 'buzz', payload: detail }).catch(() => {});
    };

    const onWindowReturn = () => {
      if (document.visibilityState === 'visible') void refreshMyChannelsAndUnread();
    };
    window.addEventListener('doodoo:send_buzz_broadcast', onSendBuzzBroadcast);
    window.addEventListener('focus', onWindowReturn);
    document.addEventListener('visibilitychange', onWindowReturn);

    return () => {
      listening = false;
      window.removeEventListener('doodoo:send_buzz_broadcast', onSendBuzzBroadcast);
      window.removeEventListener('focus', onWindowReturn);
      document.removeEventListener('visibilitychange', onWindowReturn);
      void supabase.removeChannel(globalListener);
      if (buzzChannel) void supabase.removeChannel(buzzChannel);
    };
  }, [currentUser, sessionId, allowedTabs, router]);

  const markAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, unread: false })));
  };

  const clearReadNotifications = () => {
    setNotifications((prev) => prev.filter((n) => n.unread));
  };

  const openNotificationLink = (link?: string) => {
    if (!link) return;
    try {
      const url = new URL(link, window.location.origin);
      if (url.origin !== window.location.origin || !url.pathname.startsWith('/dashboard')) throw new Error('Destino inválido');
      router.push(url.pathname + url.search);
      setIsNotifOpen(false);
      if (url.pathname === '/dashboard/tarefas' && window.location.pathname === '/dashboard/tarefas')
        window.dispatchEvent(
          new CustomEvent('doodoo:open_task', {
            detail: { taskId: url.searchParams.get('taskId'), tab: url.searchParams.get('tab') },
          })
        );
      const chatId = url.searchParams.get('chatId');
      if (chatId && window.location.pathname.startsWith('/dashboard/conversas'))
        window.dispatchEvent(
          new CustomEvent('doodoo:switch_chat', { detail: { chatId, messageId: url.searchParams.get('messageId') } })
        );
    } catch {
      setFeedback({ title: 'Destino indisponível', desc: 'A notificação não aponta para uma página válida do portal.' });
    }
  };

  useEffect(() => {
    const handleNewNotif = (e: Event) => {
      const { title, desc, link, eventKey } = (
        e as CustomEvent<{ title?: string; desc?: string; link?: string; eventKey?: string }>
      ).detail;
      if (!eventKey?.startsWith('chat-urgent:')) setFeedback({ title: title || 'Alerta', desc: desc || '' });
      if (eventKey && currentUser?.user_id) {
        playPortalSound(currentUser.user_id);
        showDesktopNotification({
          userId: currentUser.user_id,
          title: title || 'Alerta',
          body: desc || '',
          link,
          eventKey,
          onNavigate: (target) => {
            try {
              const url = new URL(target, window.location.origin);
              if (url.origin !== window.location.origin || !url.pathname.startsWith('/dashboard')) return;
              router.push(url.pathname + url.search);
              if (url.pathname === '/dashboard/tarefas' && window.location.pathname === '/dashboard/tarefas') {
                window.dispatchEvent(
                  new CustomEvent('doodoo:open_task', {
                    detail: { taskId: url.searchParams.get('taskId'), tab: url.searchParams.get('tab') },
                  })
                );
              }
              const chatId = url.searchParams.get('chatId');
              if (chatId && window.location.pathname.startsWith('/dashboard/conversas')) {
                window.dispatchEvent(
                  new CustomEvent('doodoo:switch_chat', {
                    detail: { chatId, messageId: url.searchParams.get('messageId') },
                  })
                );
              }
            } catch {
              /* Ignore invalid notification links. */
            }
          },
        });
      }
      // Apenas notificações acionáveis e úteis entram na Central de Alertas;
      // toasts transitórios (sem eventKey, como "Enviando...", "Salvo", "Erro") ficam só no banner temporário.
      if (!isPersistentNotificationKey(eventKey)) return;
      const timeStr = formatPortalTime(serverNowDate());
      setNotifications((prev) =>
        eventKey && prev.some((n) => n.eventKey === eventKey)
          ? prev
          : [
              { id: createNotificationId(), title: title || 'Alerta', desc: desc || '', time: timeStr, unread: true, link: link || '', eventKey },
              ...prev,
            ].slice(0, 30)
      );
    };
    window.addEventListener('doodoo:notify', handleNewNotif);
    return () => window.removeEventListener('doodoo:notify', handleNewNotif);
  }, [currentUser?.user_id, router]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const isOutsideDesktop = notifRef.current && !notifRef.current.contains(event.target as Node);
      const isOutsideMobile = mobileNotifRef.current && !mobileNotifRef.current.contains(event.target as Node);
      if (isOutsideDesktop && isOutsideMobile) setIsNotifOpen(false);
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const toggleNotifPanel = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsNotifOpen((prev) => !prev);
  };

  const handleNotificationClick = (notif: AppNotification) => {
    setNotifications((prev) => prev.map((n) => (n.id === notif.id ? { ...n, unread: false } : n)));
    openNotificationLink(notif.link);
  };

  const rawNav = [
    { name: 'Visão Geral', icon: LayoutGrid, path: '/dashboard', badge: null, key: 'visao_geral' },
    { name: 'Chat', icon: MessageSquare, path: '/dashboard/conversas', badge: unreadChatCount > 0 ? unreadChatCount : null, key: 'chat' },
    { name: 'Tarefas', icon: CheckSquare, path: '/dashboard/tarefas', badge: null, key: 'tarefas' },
    { name: 'Agenda', icon: Calendar, path: '/dashboard/agenda', badge: null, key: 'agenda' },
    { name: 'Anotações', icon: StickyNote, path: '/dashboard/notas', badge: null, key: 'anotacoes' },
  ];

  const mainNav = rawNav.filter((item) => allowedTabs.includes(item.key));
  const isOverviewPage = pathname === '/dashboard';
  const currentPageTitle =
    mainNav.find((item) => (item.path === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(item.path)))?.name ||
    'Configurações';

  const isImmersivePage =
    pathname.startsWith('/dashboard/conversas') ||
    pathname.startsWith('/dashboard/tarefas') ||
    pathname.startsWith('/dashboard/agenda') ||
    pathname.startsWith('/dashboard/notas') ||
    pathname.startsWith('/dashboard/configuracoes');
  const unreadNotifCount = notifications.filter((n) => n.unread).length;
  const readNotifCount = notifications.length - unreadNotifCount;
  const filteredNotifications =
    notifFilter === 'all'
      ? notifications
      : notifications.filter((n) => classifyNotification(n.eventKey).group === notifFilter);

  const renderNotifIcon = (kind: ReturnType<typeof classifyNotification>['kind']) => {
    switch (kind) {
      case 'buzz':
        return <Zap className="w-3.5 h-3.5" />;
      case 'urgent':
        return <BellRing className="w-3.5 h-3.5" />;
      case 'game':
        return <Gamepad2 className="w-3.5 h-3.5" />;
      case 'task':
        return <CheckSquare className="w-3.5 h-3.5" />;
      case 'agenda':
        return <Calendar className="w-3.5 h-3.5" />;
      default:
        return <MessageSquare className="w-3.5 h-3.5" />;
    }
  };

  const renderNotifPanelBody = (maxHeightClass: string) => (
    <>
      <div className="px-3.5 py-3 border-b flex justify-between items-center gap-2" style={{ borderColor: 'var(--border-input)' }}>
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="font-bold text-sm truncate">Central de Alertas</h3>
          {unreadNotifCount > 0 && (
            <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-red-500/10 text-[var(--error-text)] flex-shrink-0">
              {unreadNotifCount} {unreadNotifCount === 1 ? 'nova' : 'novas'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {unreadNotifCount > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                markAllAsRead();
              }}
              className="text-[11px] font-semibold px-2 py-1 rounded-lg hover:bg-[var(--surface-hover)] flex items-center gap-1 cursor-pointer"
              style={{ color: 'var(--tab-active)' }}
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Ler tudo
            </button>
          )}
          {readNotifCount > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                clearReadNotifications();
              }}
              className="p-1.5 rounded-lg hover:bg-[var(--surface-hover)] cursor-pointer"
              style={{ color: 'var(--text-muted)' }}
              title="Limpar notificações lidas"
              aria-label="Limpar notificações lidas"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Filtros por categoria */}
      <div className="px-2.5 pt-2 pb-1 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        {(
          [
            { id: 'all', label: 'Todas' },
            { id: 'chat', label: 'Chat' },
            { id: 'tasks', label: 'Tarefas' },
            { id: 'agenda', label: 'Agenda' },
          ] as { id: NotifFilter; label: string }[]
        ).map((tab) => {
          const active = notifFilter === tab.id;
          const count =
            tab.id === 'all'
              ? notifications.filter((n) => n.unread).length
              : notifications.filter((n) => n.unread && classifyNotification(n.eventKey).group === tab.id).length;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setNotifFilter(tab.id)}
              className="flex-1 py-1.5 px-2 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1 border"
              style={
                active
                  ? {
                      backgroundColor: 'color-mix(in srgb, var(--tab-active) 10%, var(--bg-card))',
                      borderColor: 'color-mix(in srgb, var(--tab-active) 35%, var(--border-input))',
                      color: 'var(--tab-active)',
                    }
                  : {
                      backgroundColor: 'transparent',
                      borderColor: 'transparent',
                      color: 'var(--text-muted)',
                    }
              }
            >
              <span>{tab.label}</span>
              {count > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-red-500 text-white text-[9.5px] leading-tight font-bold">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {desktopPermission === 'default' && (
        <div
          className="mx-2 mt-1.5 px-3 py-2 rounded-xl border flex items-center justify-between gap-2"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--tab-active) 7%, var(--bg-card))',
            borderColor: 'color-mix(in srgb, var(--tab-active) 24%, var(--border-input))',
          }}
        >
          <span className="text-[11px] leading-snug font-medium" style={{ color: 'var(--text-main)' }}>
            Receba pop-ups do Windows para tarefas, chat e agenda.
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void requestDesktopNotificationPermission().then((res) => setDesktopPermission(res));
            }}
            className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-white flex-shrink-0 cursor-pointer hover:brightness-105"
            style={primaryActionStyle}
          >
            Ativar
          </button>
        </div>
      )}

      <div className={`p-2 ${maxHeightClass} overflow-y-auto custom-scrollbar space-y-1.5`}>
        {filteredNotifications.map((n, index) => {
          const meta = classifyNotification(n.eventKey);
          return (
            <div
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                  event.preventDefault();
                  event.currentTarget.click();
                }
              }}
              key={n.eventKey ? `${n.eventKey}:${n.id}` : `${n.id}:${index}`}
              onClick={() => handleNotificationClick(n)}
              className="p-3 rounded-xl border cursor-pointer transition-colors hover:brightness-[0.98]"
              style={
                n.unread
                  ? {
                      backgroundColor: 'color-mix(in srgb, var(--tab-active) 7%, var(--bg-card))',
                      borderColor: 'color-mix(in srgb, var(--tab-active) 26%, var(--border-input))',
                    }
                  : { backgroundColor: 'var(--bg-input)', borderColor: 'transparent' }
              }
            >
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
                  style={{
                    color: meta.accent,
                    backgroundColor: `color-mix(in srgb, ${meta.accent} 12%, var(--bg-card))`,
                  }}
                >
                  {renderNotifIcon(meta.kind)}
                  {meta.label}
                </span>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>
                    {n.time}
                  </span>
                  {n.unread && (
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: meta.accent }} />
                  )}
                </div>
              </div>
              <p className="text-xs font-bold leading-snug">{n.title}</p>
              <p className="text-[11.5px] mt-1 leading-relaxed line-clamp-2" style={{ color: 'var(--text-muted)' }}>
                {n.desc}
              </p>
            </div>
          );
        })}
        {filteredNotifications.length === 0 && (
          <div className="text-center py-8 px-4">
            <p className="text-xs font-semibold" style={{ color: 'var(--text-main)' }}>
              Tudo em dia por aqui
            </p>
            <p className="text-[11px] mt-1 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              {notifFilter === 'all'
                ? 'Novas mensagens, tarefas, compromissos da agenda e chamadas de atenção aparecerão aqui.'
                : 'Nenhuma notificação nesta categoria.'}
            </p>
          </div>
        )}
      </div>
    </>
  );

  const handleLogout = async () => {
    try {
      if (currentUser?.user_id) {
        await supabase
          .from('doodoo_perfis')
          .update({ status_presenca: 'offline', last_seen: serverNowIso() })
          .eq('user_id', currentUser.user_id);
      }
    } catch {
      /* Never block sign-out. */
    }
    await supabase.auth.signOut();
    router.replace('/');
  };

  const handleIrisRedirect = async () => {
    if (environment !== 'shared') return;
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const urlIris = process.env.NEXT_PUBLIC_IRIS_URL || 'http://localhost:5173';
    window.location.href = session?.access_token
      ? `${urlIris}/#access_token=${session.access_token}&refresh_token=${session.refresh_token}`
      : urlIris;
  };

  if (session === undefined || (sessionId && (isLoading || currentUser?.user_id !== sessionId) && !authError))
    return <LoadingState label="Verificando acesso..." />;

  if (!sessionId || authError || !currentUser) {
    return (
      <div
        className="fixed inset-0 z-50 flex flex-col items-center justify-center px-4 transition-colors duration-300"
        style={{ backgroundColor: 'var(--bg-page)', color: 'var(--text-main)' }}
      >
        {isLoading && sessionId ? (
          <div className="animate-pulse flex flex-col items-center">
            <BrandBadge size="lg" className="mb-4" />
          </div>
        ) : (
          <div
            className="max-w-md w-full p-8 sm:p-10 text-center space-y-6 rounded-2xl border"
            style={{ ...panelStyle, boxShadow: 'var(--shadow-card)' }}
          >
            <div className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center border border-red-500/20 bg-red-500/10">
              <ShieldAlert className="w-8 h-8 text-[var(--error-text)]" />
            </div>
            <div className="space-y-1.5">
              <h1 className="text-2xl font-bold tracking-tight">Sessão Expirada</h1>
              <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>
                Sua sessão foi encerrada. Inicie sessão novamente para continuar.
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="w-full py-3.5 rounded-xl text-white text-sm font-semibold transition-all hover:brightness-105 cursor-pointer"
              style={primaryActionStyle}
            >
              Fazer Login
            </button>
          </div>
        )}
      </div>
    );
  }

  const routeKey = pathname.startsWith('/dashboard/configuracoes')
    ? null
    : rawNav.find((item) => (item.path === '/dashboard' ? pathname === item.path : pathname.startsWith(item.path)))?.key;
  const permitted = !routeKey || allowedTabs.includes(routeKey);
  const isSettingsActive = pathname.startsWith('/dashboard/configuracoes');

  return (
    <PortalPresenceContext.Provider value={portalPresence}>
      <div
        data-chat-open={hideBottomNavOnMobile}
        className="app-shell flex h-[100dvh] overflow-hidden transition-colors duration-300 relative z-0"
        style={{ backgroundColor: 'var(--bg-page)', color: 'var(--text-main)' }}
      >
        {currentUser && allowedTabs.includes('chat') && <ChatAttention key={currentUser.user_id} userId={currentUser.user_id} />}
        {feedback &&
          createPortal(
            <div
              data-modal-live
              role="status"
              aria-live="polite"
              className="pointer-events-none fixed top-[max(.75rem,env(safe-area-inset-top))] left-1/2 z-[1100] w-[min(90vw,380px)] -translate-x-1/2 rounded-2xl border p-4"
              style={{
                backgroundColor: 'var(--bg-card)',
                color: 'var(--text-main)',
                borderColor: 'var(--border-input)',
                boxShadow: 'var(--shadow-card-hover)',
              }}
            >
              <strong className="text-sm font-semibold">{feedback.title}</strong>
              <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                {feedback.desc}
              </p>
            </div>,
            document.body
          )}

        {/* SIDEBAR DESKTOP — IRIS GESTÃO V2 STYLE */}
        <aside
          className={`${
            isCollapsed ? 'w-[78px]' : 'w-[258px]'
          } hidden lg:flex flex-col transition-all duration-300 relative z-40 flex-shrink-0 border-r`}
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-input)' }}
        >
          {/* Toggle Recolher/Expandir discreto (estilo Iris v2) */}
          <button
            type="button"
            aria-label={isCollapsed ? 'Expandir menu' : 'Recolher menu'}
            aria-expanded={!isCollapsed}
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="absolute -right-3 top-[23px] flex items-center justify-center w-6 h-6 rounded-full border shadow-sm transition-all hover:scale-105 z-50 cursor-pointer"
            style={{
              backgroundColor: 'var(--bg-card)',
              borderColor: 'var(--border-input)',
              color: 'var(--text-muted)',
            }}
          >
            {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
          </button>

          {/* Brand Header */}
          <div className={`h-[70px] shrink-0 flex items-center ${isCollapsed ? 'justify-center px-0' : 'px-5'}`}>
            <Link href="/dashboard" className="flex items-center gap-3 min-w-0">
              <BrandBadge size="sm" />
              {!isCollapsed && (
                <div className="min-w-0">
                  <div className="flex items-baseline gap-1 leading-none">
                    <span className="font-extrabold text-[15px] tracking-tight" style={{ color: 'var(--text-main)' }}>
                      DOO
                    </span>
                    <span className="font-extrabold text-[15px] tracking-tight" style={{ color: 'var(--tab-active)' }}>
                      DOO
                    </span>
                  </div>
                  <p
                    className="text-[9px] font-semibold tracking-[0.14em] uppercase mt-1 truncate"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    PORTAL CORPORATIVO
                  </p>
                </div>
              )}
            </Link>
          </div>

          {/* Ambiente / Setor Ativo (card estilo Módulo Ativo do Iris v2) */}
          {!isCollapsed && (
            <div className="px-4 pb-3">
              <div
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border"
                style={{
                  backgroundColor: 'var(--bg-input)',
                  borderColor: 'var(--border-input)',
                }}
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{
                    backgroundColor: 'var(--bg-card)',
                    color: 'var(--tab-active)',
                    border: '1px solid var(--border-input)',
                  }}
                >
                  <Building2 className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className="text-[9px] font-semibold uppercase tracking-[0.12em] leading-none"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Ambiente Ativo
                  </p>
                  <p className="text-xs font-semibold truncate mt-1" title={currentUser.setor || 'Corporativo'}>
                    {currentUser.setor || 'Corporativo'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Botão Notificações destacado + Popover (estilo Iris v2) */}
          <div className={`px-4 pb-3 relative`} ref={notifRef}>
            <button
              type="button"
              aria-label="Notificações"
              aria-expanded={isNotifOpen}
              onClick={toggleNotifPanel}
              title={isCollapsed ? 'Notificações' : undefined}
              className={`w-full flex items-center ${
                isCollapsed ? 'justify-center px-0 py-2.5' : 'justify-between px-3.5 py-2.5'
              } rounded-xl border transition-all cursor-pointer relative hover:bg-[var(--surface-hover)]`}
              style={{
                backgroundColor: isNotifOpen
                  ? 'color-mix(in srgb, var(--tab-active) 8%, var(--bg-card))'
                  : 'var(--bg-card)',
                borderColor: isNotifOpen
                  ? 'color-mix(in srgb, var(--tab-active) 35%, var(--border-input))'
                  : 'var(--border-input)',
              }}
            >
              <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-2.5'}`}>
                <Bell className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
                {!isCollapsed && (
                  <span className="text-[13px] font-medium" style={{ color: 'var(--text-main)' }}>
                    Notificações
                  </span>
                )}
              </div>
              {unreadNotifCount > 0 &&
                (isCollapsed ? (
                  <span
                    className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center border-2"
                    style={{ borderColor: 'var(--bg-card)' }}
                  >
                    {unreadNotifCount > 99 ? '99+' : unreadNotifCount}
                  </span>
                ) : (
                  <span className="px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-semibold leading-none">
                    {unreadNotifCount > 99 ? '99+' : unreadNotifCount}
                  </span>
                ))}
            </button>

            {isNotifOpen && (
              <div
                className="absolute top-0 left-[calc(100%+12px)] w-[396px] rounded-2xl p-2 z-[999]"
                style={solidDropdown}
              >
                {renderNotifPanelBody('max-h-[58vh]')}
              </div>
            )}
          </div>

          {/* Navegação Principal */}
          <nav className="flex-1 px-4 py-1 space-y-1 overflow-y-auto custom-scrollbar">
            {mainNav.map((item) => {
              const isActive = item.path === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(item.path);
              return (
                <Link
                  key={item.name}
                  href={item.path}
                  aria-current={isActive ? 'page' : undefined}
                  title={isCollapsed ? item.name : undefined}
                  className={`flex items-center ${
                    isCollapsed ? 'justify-center px-0 py-2.5' : 'justify-between px-3.5 py-2.5'
                  } rounded-xl transition-all group relative ${isActive ? '' : 'hover:bg-[var(--surface-hover)]'}`}
                  style={
                    isActive
                      ? {
                          ...primaryActionStyle,
                          color: '#ffffff',
                        }
                      : { color: 'var(--text-muted)' }
                  }
                >
                  <div className={`flex items-center ${isCollapsed ? 'justify-center w-full' : 'gap-3 min-w-0 flex-1'}`}>
                    <item.icon
                      className={`w-[18px] h-[18px] flex-shrink-0 transition-colors ${
                        isActive ? 'text-white' : 'group-hover:text-[var(--text-main)]'
                      }`}
                    />
                    {!isCollapsed && (
                      <span
                        className={`text-[13.5px] tracking-tight truncate transition-colors ${
                          isActive ? 'font-semibold text-white' : 'font-medium group-hover:text-[var(--text-main)]'
                        }`}
                      >
                        {item.name}
                      </span>
                    )}
                  </div>
                  {item.badge && !isCollapsed && (
                    <span
                      className={`ml-2 px-1.5 py-0.5 rounded-full text-[10px] font-semibold leading-none ${
                        isActive ? 'bg-white/25 text-white' : 'bg-red-500 text-white'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                  {item.badge && isCollapsed && (
                    <span
                      className="absolute top-1 right-1.5 w-2 h-2 rounded-full bg-red-500 ring-2"
                      style={{ '--tw-ring-color': 'var(--bg-card)' } as React.CSSProperties}
                    />
                  )}
                </Link>
              );
            })}

            <div className="my-3 h-px" style={{ backgroundColor: 'var(--border-input)' }} />

            <Link
              href="/dashboard/configuracoes"
              aria-current={isSettingsActive ? 'page' : undefined}
              title={isCollapsed ? 'Configurações' : undefined}
              className={`flex items-center ${
                isCollapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3.5 py-2.5'
              } rounded-xl transition-all group ${isSettingsActive ? '' : 'hover:bg-[var(--surface-hover)]'}`}
              style={
                isSettingsActive
                  ? {
                      ...primaryActionStyle,
                      color: '#ffffff',
                    }
                  : { color: 'var(--text-muted)' }
              }
            >
              <Settings
                className={`w-[18px] h-[18px] flex-shrink-0 transition-colors ${
                  isSettingsActive ? 'text-white' : 'group-hover:text-[var(--text-main)]'
                }`}
              />
              {!isCollapsed && (
                <span
                  className={`text-[13.5px] tracking-tight truncate transition-colors ${
                    isSettingsActive ? 'font-semibold text-white' : 'font-medium group-hover:text-[var(--text-main)]'
                  }`}
                >
                  Configurações
                </span>
              )}
            </Link>

            <button
              type="button"
              disabled={environment !== 'shared'}
              title={environment !== 'shared' ? 'Integração Iris desativada neste ambiente' : isCollapsed ? 'Iris Gestão' : undefined}
              onClick={handleIrisRedirect}
              className={`w-full flex items-center ${
                isCollapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3.5 py-2.5'
              } rounded-xl transition-all group cursor-pointer text-left hover:bg-[var(--surface-hover)]`}
              style={{ color: 'var(--text-muted)' }}
            >
              <ExternalLink className="w-[18px] h-[18px] flex-shrink-0 group-hover:text-[var(--text-main)] transition-colors" />
              {!isCollapsed && (
                <span className="text-[13.5px] font-medium tracking-tight truncate group-hover:text-[var(--text-main)] transition-colors">
                  Iris Gestão
                </span>
              )}
            </button>
          </nav>

          {/* Rodapé do Usuário + Sair do Sistema (estilo Iris v2) */}
          <div className="p-4 mt-auto border-t space-y-3" style={{ borderColor: 'var(--border-input)' }}>
            <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'}`}>
              <div className="relative flex-shrink-0">
                {currentUser.avatar_url ? (
                  <img
                    src={currentUser.avatar_url}
                    alt="Avatar"
                    className="w-9 h-9 rounded-xl object-cover border"
                    style={{ borderColor: 'var(--border-input)' }}
                  />
                ) : (
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-semibold text-xs"
                    style={primaryActionStyle}
                  >
                    {getInitials(currentUser.nome || '')}
                  </div>
                )}
              </div>
              {!isCollapsed && (
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold leading-tight truncate" title={currentUser.nome || ''}>
                    {currentUser.nome}
                  </p>
                  <p className="text-[11px] truncate mt-0.5" style={{ color: 'var(--text-muted)' }} title={currentUser.cargo || ''}>
                    {formatRole(currentUser.cargo)}
                  </p>
                </div>
              )}
            </div>

            <button
              type="button"
              aria-label="Sair do sistema"
              onClick={handleLogout}
              title={isCollapsed ? 'Sair do sistema' : undefined}
              className={`w-full flex items-center justify-center gap-2 ${
                isCollapsed ? 'py-2.5 px-0' : 'py-2.5 px-3'
              } rounded-xl border text-[11px] font-semibold uppercase tracking-wider transition-colors cursor-pointer hover:bg-red-500/10 hover:text-[var(--error-text)] hover:border-red-500/30`}
              style={{
                backgroundColor: 'var(--bg-card)',
                borderColor: 'var(--border-input)',
                color: 'var(--text-muted)',
              }}
            >
              <LogOut className="w-3.5 h-3.5 flex-shrink-0" />
              {!isCollapsed && <span>Sair do sistema</span>}
            </button>

            {!isCollapsed && (
              <p
                className="text-center text-[10px] font-medium tracking-[0.14em] uppercase opacity-55"
                style={{ color: 'var(--text-muted)' }}
              >
                RELEASE 2.0.0
              </p>
            )}
          </div>
        </aside>

        {/* ÁREA PRINCIPAL */}
        <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <header
            className={`portal-page-header relative z-20 shrink-0 min-h-[60px] items-center justify-between px-4 md:px-8 transition-colors duration-300 ${
              hideBottomNavOnMobile ? 'hidden' : isImmersivePage ? 'hidden lg:flex' : 'flex'
            }`}
            style={headerStyle}
          >
            <div className="flex min-w-0 items-center gap-3">
              {/* Marca compacta no Mobile */}
              <div className="lg:hidden flex items-center gap-2.5 min-w-0">
                <BrandBadge size="sm" />
              </div>

              <div className="flex min-w-0 flex-col justify-center">
                {isOverviewPage ? (
                  <div className="flex items-center gap-2">
                    <span
                      className="hidden sm:inline text-xs font-medium"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Portal Corporativo
                    </span>
                    <span className="hidden sm:inline text-xs opacity-40">/</span>
                    <h2 className="text-base md:text-[15px] font-semibold tracking-tight">{currentPageTitle}</h2>
                  </div>
                ) : (
                  <h2 className="text-lg md:text-xl font-bold tracking-tight">{currentPageTitle}</h2>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3" ref={mobileNotifRef}>
              <div className="hidden sm:block">
                <ThemeSelect value={theme} onChange={changeTheme} />
              </div>

              <div className="lg:hidden relative">
                <button
                  type="button"
                  aria-label="Notificações"
                  aria-expanded={isNotifOpen}
                  onClick={toggleNotifPanel}
                  className="p-2.5 rounded-xl cursor-pointer border relative transition-colors"
                  style={{
                    backgroundColor: 'var(--bg-card)',
                    borderColor: 'var(--border-input)',
                    color: 'var(--text-main)',
                  }}
                >
                  <Bell className="w-5 h-5" />
                  {unreadNotifCount > 0 && (
                    <span
                      className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center border-2"
                      style={{ borderColor: 'var(--bg-card)' }}
                    >
                      {unreadNotifCount > 99 ? '99+' : unreadNotifCount}
                    </span>
                  )}
                </button>

                {isNotifOpen && (
                  <div
                    className="absolute top-14 right-0 w-[88vw] max-w-[360px] rounded-2xl p-2 z-[999]"
                    style={solidDropdown}
                  >
                    {renderNotifPanelBody('max-h-[52vh]')}
                  </div>
                )}
              </div>
            </div>
          </header>

          <main
            data-immersive={isImmersivePage}
            className={`portal-content flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-y-auto overscroll-contain ${
              isImmersivePage ? (hideBottomNavOnMobile ? 'p-0' : 'p-0 md:p-5') : 'px-4 md:px-8 pt-5'
            } ${
              hideBottomNavOnMobile ? 'pb-0 lg:pb-5' : 'pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-6'
            } custom-scrollbar`}
          >
            {permitted ? (
              <div key={currentUser.user_id} className="contents">
                {children}
              </div>
            ) : (
              <EmptyState title="Acesso não permitido">
                Seu perfil não tem acesso a esta aba. Solicite a liberação ao administrador.
              </EmptyState>
            )}
          </main>

          {/* BOTTOM NAVIGATION (MOBILE PWA) */}
          <nav
            className={`portal-bottom-nav lg:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around pb-safe pt-1.5 px-2 transition-transform duration-300 ${
              hideBottomNavOnMobile ? 'translate-y-full opacity-0 pointer-events-none' : 'translate-y-0 opacity-100'
            }`}
            style={glassBottomNav}
          >
            {mainNav.map((item) => {
              const isActive = item.path === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(item.path);
              return (
                <Link
                  key={item.name}
                  href={item.path}
                  aria-current={isActive ? 'page' : undefined}
                  className="relative flex flex-col items-center justify-center px-1 py-1.5 min-w-0 flex-1 h-14 cursor-pointer transition-transform active:scale-95"
                >
                  <span
                    className="flex items-center justify-center w-10 h-7 rounded-full mb-0.5 transition-colors"
                    style={
                      isActive
                        ? { backgroundColor: 'color-mix(in srgb, var(--tab-active) 12%, transparent)' }
                        : undefined
                    }
                  >
                    <item.icon
                      className="w-[20px] h-[20px] transition-colors"
                      style={{ color: isActive ? 'var(--tab-active)' : 'var(--text-muted)' }}
                    />
                  </span>
                  <span
                    className={`text-[10px] tracking-normal transition-colors ${isActive ? 'font-semibold' : 'font-medium'}`}
                    style={{ color: isActive ? 'var(--tab-active)' : 'var(--text-muted)' }}
                  >
                    {item.name.split(' ')[0]}
                  </span>
                  {item.badge && (
                    <span
                      className="absolute top-1 right-2 min-w-[15px] h-[15px] px-1 rounded-full bg-red-500 text-white text-[9px] font-semibold flex items-center justify-center border-2"
                      style={{ borderColor: 'var(--bg-card)' }}
                    >
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}

            <Link
              href="/dashboard/configuracoes"
              aria-current={isSettingsActive ? 'page' : undefined}
              className="relative flex flex-col items-center justify-center px-1 py-1.5 min-w-0 flex-1 h-14 cursor-pointer transition-transform active:scale-95"
            >
              <span
                className="flex items-center justify-center w-10 h-7 rounded-full mb-0.5 transition-colors"
                style={
                  isSettingsActive
                    ? { backgroundColor: 'color-mix(in srgb, var(--tab-active) 12%, transparent)' }
                    : undefined
                }
              >
                {currentUser.avatar_url ? (
                  <img
                    src={currentUser.avatar_url}
                    alt="Perfil"
                    className="w-[20px] h-[20px] rounded-full object-cover border"
                    style={{ borderColor: isSettingsActive ? 'var(--tab-active)' : 'var(--border-input)' }}
                  />
                ) : (
                  <Settings
                    className="w-[20px] h-[20px]"
                    style={{ color: isSettingsActive ? 'var(--tab-active)' : 'var(--text-muted)' }}
                  />
                )}
              </span>
              <span
                className={`text-[10px] tracking-normal ${isSettingsActive ? 'font-semibold' : 'font-medium'}`}
                style={{ color: isSettingsActive ? 'var(--tab-active)' : 'var(--text-muted)' }}
              >
                Perfil
              </span>
            </Link>
          </nav>
        </div>
      </div>
    </PortalPresenceContext.Provider>
  );
}

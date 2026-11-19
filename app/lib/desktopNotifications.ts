const STORAGE_PREFIX = 'doodoo:desktop-notif:';
const shownEventKeys = new Set<string>();

export type DesktopNotificationPermission = NotificationPermission | 'unsupported';

export function isDesktopNotificationSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.Notification === 'function';
}

export function getDesktopNotificationPermission(): DesktopNotificationPermission {
  if (!isDesktopNotificationSupported()) return 'unsupported';
  return window.Notification.permission;
}

export function readDesktopNotificationEnabled(userId?: string | null): boolean {
  if (!userId || typeof window === 'undefined') return true;
  try {
    return localStorage.getItem(STORAGE_PREFIX + userId) !== 'off';
  } catch {
    return true;
  }
}

export function saveDesktopNotificationEnabled(userId: string, enabled: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_PREFIX + userId, enabled ? 'on' : 'off');
  window.dispatchEvent(new Event('doodoo:desktop_notif_preference'));
}

export async function requestDesktopNotificationPermission(): Promise<DesktopNotificationPermission> {
  if (!isDesktopNotificationSupported()) return 'unsupported';
  try {
    const result = await window.Notification.requestPermission();
    window.dispatchEvent(new Event('doodoo:desktop_notif_preference'));
    return result;
  } catch {
    return window.Notification.permission;
  }
}

/**
 * Strict allowlist for Windows / OS native pop-up notifications:
 * ONLY:
 * 1. Nova tarefa recebida (task:<id>:assigned:...)
 * 2. Mudança de status de tarefa (task:<id>:status:...)
 * 3. Mensagem recebida no chat (chat:... / chat-urgent:...)
 * 4. Evento na agenda (agenda:...)
 */
export function isAllowedDesktopEventKey(eventKey?: string): boolean {
  if (!eventKey) return false;
  if (
    eventKey.startsWith('chat:') ||
    eventKey.startsWith('chat-urgent:') ||
    eventKey.startsWith('chat-buzz:') ||
    eventKey.startsWith('chat-game:')
  )
    return true;
  if (eventKey.startsWith('agenda:')) return true;
  if (eventKey.startsWith('task:') && (eventKey.includes(':assigned:') || eventKey.includes(':status:'))) return true;
  return false;
}

export function showDesktopNotification(options: {
  userId?: string | null;
  title: string;
  body: string;
  link?: string;
  eventKey?: string;
  onNavigate?: (link: string) => void;
}): boolean {
  const { userId, title, body, link, eventKey, onNavigate } = options;
  if (!isDesktopNotificationSupported()) return false;
  if (typeof document !== 'undefined' && document.documentElement?.dataset?.userPresence === 'ocupado') return false;
  if (window.Notification.permission !== 'granted') return false;
  if (!readDesktopNotificationEnabled(userId)) return false;
  if (!isAllowedDesktopEventKey(eventKey)) return false;
  if (eventKey && shownEventKeys.has(eventKey)) return false;

  try {
    if (eventKey) {
      shownEventKeys.add(eventKey);
      if (shownEventKeys.size > 200) {
        const first = shownEventKeys.values().next().value;
        if (first) shownEventKeys.delete(first);
      }
    }
    const popup = new window.Notification(title, {
      body: body || 'Você tem uma nova atualização no Doo Doo.',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: eventKey || undefined,
    });
    popup.onclick = () => {
      try {
        window.focus();
      } catch {
        /* Ignore browser focus restrictions. */
      }
      popup.close();
      if (link && onNavigate) onNavigate(link);
    };
    return true;
  } catch {
    return false;
  }
}

export function sendTestDesktopNotification(): boolean {
  if (!isDesktopNotificationSupported() || window.Notification.permission !== 'granted') return false;
  try {
    const popup = new window.Notification('Doo Doo · Teste de notificação', {
      body: 'Os alertas pop-up do Windows estão ativos para tarefas, chat e agenda.',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'doodoo:desktop-test',
    });
    popup.onclick = () => {
      try {
        window.focus();
      } catch {
        /* Ignore */
      }
      popup.close();
    };
    return true;
  } catch {
    return false;
  }
}

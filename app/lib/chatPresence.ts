export type UserStatusType = 'online' | 'ausente' | 'ocupado' | 'indisponivel' | 'offline';

export const PRESENCE_HEARTBEAT_MS = 25_000;
export const PRESENCE_TTL_MS = 100_000;
export const PRESENCE_IDLE_MS = 180_000;
export const PRESENCE_HIDDEN_GRACE_MS = 30_000;

export const validPresence = (value: unknown): value is UserStatusType =>
  ['online', 'ausente', 'ocupado', 'indisponivel', 'offline'].includes(String(value));

export const isDoNotDisturb = (status?: UserStatusType | null): boolean => status === 'ocupado';

export const STATUS_OPTIONS: { value: UserStatusType; label: string; hint: string; dotClass: string }[] = [
  { value: 'online', label: 'Online', hint: 'Ativo agora', dotClass: 'bg-emerald-500' },
  { value: 'ausente', label: 'Ausente', hint: 'Ausente no momento', dotClass: 'bg-amber-500' },
  { value: 'ocupado', label: 'Não incomodar', hint: 'Notificações silenciadas', dotClass: 'bg-red-500' },
  { value: 'indisponivel', label: 'Indisponível', hint: 'Em atendimento', dotClass: 'bg-purple-500' },
  { value: 'offline', label: 'Offline', hint: 'Aparecer desconectado', dotClass: 'bg-slate-400' },
];

export function getRealUserStatus(
  profile?: { status_presenca?: UserStatusType; last_seen?: string } | null,
  now = Date.now()
) {
  const seen = Date.parse(profile?.last_seen || '');
  const fresh = Number.isFinite(seen) && now - seen < PRESENCE_TTL_MS;
  const status: UserStatusType =
    !fresh || !profile || profile.status_presenca === 'offline'
      ? 'offline'
      : validPresence(profile.status_presenca)
        ? profile.status_presenca
        : 'online';

  const labels: Record<UserStatusType, string> = {
    online: 'Online',
    ausente: 'Ausente',
    ocupado: 'Não incomodar',
    indisponivel: 'Indisponível',
    offline: 'Offline',
  };

  const colors: Record<UserStatusType, string> = {
    online: 'bg-emerald-500',
    ausente: 'bg-amber-500',
    ocupado: 'bg-red-500',
    indisponivel: 'bg-purple-500',
    offline: 'bg-slate-400',
  };

  let lastSeenText = 'Sem atividade recente';
  if (Number.isFinite(seen)) {
    const date = new Date(seen);
    const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    lastSeenText =
      date.toDateString() === new Date(now).toDateString()
        ? `Visto hoje às ${time}`
        : `Visto em ${date.toLocaleDateString('pt-BR')} às ${time}`;
  }

  if (status === 'online') lastSeenText = 'Ativo agora';
  if (status === 'ausente' && !Number.isFinite(seen)) lastSeenText = 'Ausente no momento';
  if (status === 'ocupado') lastSeenText = 'Notificações silenciadas';
  if (status === 'indisponivel') lastSeenText = 'Em atendimento';

  return { status, label: labels[status], color: colors[status], lastSeenText };
}

/** Fuso horário padrão corporativo (Brasília) para padronizar horários entre todos os colaboradores. */
export const PORTAL_TIMEZONE = 'America/Sao_Paulo';

const SYNC_INTERVAL_MS = 5 * 60 * 1000;
const OFFSET_DEADBAND_MS = 1500;

let clockOffsetMs = 0;
let hasSynced = false;
let lastSyncAt = 0;
let inflight: Promise<number> | null = null;

function isMockEnvironment(): boolean {
  return process.env.NEXT_PUBLIC_DOO_ENVIRONMENT === 'mock';
}

export function getClockOffsetMs(): number {
  return clockOffsetMs;
}

export function serverNowMs(): number {
  return Date.now() + clockOffsetMs;
}

export function serverNowDate(): Date {
  return new Date(serverNowMs());
}

export function serverNowIso(): string {
  return new Date(serverNowMs()).toISOString();
}

export async function syncServerClock(force = false): Promise<number> {
  if (typeof window === 'undefined') return 0;
  if (isMockEnvironment()) {
    hasSynced = true;
    clockOffsetMs = 0;
    return 0;
  }
  const nowLocal = Date.now();
  if (!force && hasSynced && nowLocal - lastSyncAt < 30_000) {
    return clockOffsetMs;
  }
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const t0 = performance.now();
      const response = await fetch(`/api/time?t=${Date.now()}`, {
        method: 'GET',
        cache: 'no-store',
        credentials: 'same-origin',
      });
      const t1 = performance.now();
      if (!response.ok) return clockOffsetMs;

      let serverMs = Number.NaN;
      try {
        const payload = (await response.json()) as { now?: number };
        if (typeof payload?.now === 'number' && Number.isFinite(payload.now)) {
          serverMs = payload.now;
        }
      } catch {
        const headerDate = response.headers.get('date');
        if (headerDate) serverMs = Date.parse(headerDate);
      }

      if (!Number.isFinite(serverMs)) return clockOffsetMs;

      const rttHalf = Math.min(2500, Math.max(0, Math.round((t1 - t0) / 2)));
      const rawOffset = serverMs + rttHalf - Date.now();
      const nextOffset = Math.abs(rawOffset) < OFFSET_DEADBAND_MS ? 0 : rawOffset;
      const previousOffset = clockOffsetMs;
      clockOffsetMs = nextOffset;
      hasSynced = true;
      lastSyncAt = Date.now();

      if (Math.abs(nextOffset - previousOffset) >= 2000) {
        window.dispatchEvent(new CustomEvent('doodoo:clock_synced', { detail: { offsetMs: nextOffset } }));
      }
      return clockOffsetMs;
    } catch {
      return clockOffsetMs;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/** Aguarda rapidamente a calibração do relógio do servidor antes de gravar last_seen ou horários críticos. */
export async function ensureServerClockSynced(timeoutMs = 1500): Promise<number> {
  if (typeof window === 'undefined' || hasSynced || isMockEnvironment()) {
    return clockOffsetMs;
  }
  return Promise.race([
    syncServerClock(),
    new Promise<number>((resolve) => {
      window.setTimeout(() => resolve(clockOffsetMs), timeoutMs);
    }),
  ]);
}

/** Mantém o relógio local calibrado com o servidor durante toda a sessão do portal. */
export function startServerClockSync(): () => void {
  if (typeof window === 'undefined') return () => {};
  void syncServerClock(true);

  const timer = window.setInterval(() => {
    void syncServerClock(true);
  }, SYNC_INTERVAL_MS);

  const onResume = () => {
    if (document.visibilityState === 'visible') {
      void syncServerClock(true);
    }
  };
  const onOnline = () => {
    void syncServerClock(true);
  };

  document.addEventListener('visibilitychange', onResume);
  window.addEventListener('online', onOnline);

  return () => {
    window.clearInterval(timer);
    document.removeEventListener('visibilitychange', onResume);
    window.removeEventListener('online', onOnline);
  };
}

function toValidDate(input: Date | string | number): Date | null {
  const date = input instanceof Date ? input : new Date(input);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatPortalTime(input: Date | string | number): string {
  const date = toValidDate(input);
  if (!date) return '';
  try {
    return date.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: PORTAL_TIMEZONE,
    });
  } catch {
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
}

export function formatPortalDate(input: Date | string | number): string {
  const date = toValidDate(input);
  if (!date) return '';
  try {
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: PORTAL_TIMEZONE,
    });
  } catch {
    return date.toLocaleDateString('pt-BR');
  }
}

export function formatPortalDateTime(input: Date | string | number): string {
  const d = formatPortalDate(input);
  const t = formatPortalTime(input);
  return d && t ? `${d} às ${t}` : d || t;
}

/** Retorna YYYY-MM-DD no fuso oficial do portal para comparar Hoje/Ontem com precisão. */
export function portalDayKey(input: Date | string | number): string {
  const date = toValidDate(input);
  if (!date) return '';
  try {
    return new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: PORTAL_TIMEZONE,
    }).format(date);
  } catch {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}

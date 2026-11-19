'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowUpRight, BellRing, MessageSquare, Volume2, X, Zap } from 'lucide-react';
import { primaryActionStyle } from '@/app/components/BrandMark';
import { playBuzzSound } from '../lib/notificationSound';
import { formatPortalTime, serverNowDate } from '../lib/serverClock';
import './chat-attention.css';

export interface ChatAttentionNotice {
  id: string;
  channelId: string;
  senderId: string;
  sender: string;
  text: string;
}

export interface ChatBuzzNotice {
  id: string;
  channelId: string;
  senderId: string;
  sender: string;
  channelName?: string;
  sentAt?: string;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'DD';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function ChatAttention({ userId }: { userId: string }) {
  const [queue, setQueue] = useState<ChatAttentionNotice[]>([]);
  const [buzzOverlay, setBuzzOverlay] = useState<(ChatBuzzNotice & { timeLabel: string; pulseKey: number }) | null>(null);
  const seen = useRef(new Set<string>());
  const last = useRef(new Map<string, number>());
  const seenBuzz = useRef(new Set<string>());
  const lastBuzz = useRef(new Map<string, number>());
  const pathnameRef = useRef('');
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  // Urgent message queue (requires explicit acknowledgement)
  useEffect(() => {
    const receive = (event: Event) => {
      const notice = (event as CustomEvent<ChatAttentionNotice>).detail;
      if (!notice?.id || notice.senderId === userId || seen.current.has(notice.id)) return;
      seen.current.add(notice.id);
      const key = notice.senderId + ':' + notice.channelId;
      const now = Date.now();
      if (now - (last.current.get(key) || 0) < 60000) return;
      last.current.set(key, now);
      setQueue((prev) => [...prev, notice].slice(-5));
    };
    window.addEventListener('doodoo:chat_attention', receive);
    return () => window.removeEventListener('doodoo:chat_attention', receive);
  }, [userId]);

  // Spark-style Buzz ("Vibrar tela" + prominent modal overlay over ANY Doo Doo page, respecting "Não incomodar")
  useEffect(() => {
    let shakeTimer: ReturnType<typeof setTimeout> | undefined;

    const triggerBuzz = (event: Event) => {
      const buzz = (event as CustomEvent<ChatBuzzNotice>).detail;
      if (!buzz?.id || buzz.senderId === userId || seenBuzz.current.has(buzz.id)) return;
      seenBuzz.current.add(buzz.id);

      // Respect "Não incomodar" (ocupado): no screen shake, sound, vibration, or modal overlay.
      if (document.documentElement?.dataset?.userPresence === 'ocupado') return;

      const key = buzz.senderId + ':' + buzz.channelId;
      const now = Date.now();
      if (now - (lastBuzz.current.get(key) || 0) < 10000) return;
      lastBuzz.current.set(key, now);

      // 1. Shake the portal window AND overlay modal (Spark / MSN Nudge effect)
      clearTimeout(shakeTimer);
      delete document.documentElement.dataset.buzzShake;
      requestAnimationFrame(() => {
        document.documentElement.dataset.buzzShake = 'true';
      });
      shakeTimer = setTimeout(() => {
        delete document.documentElement.dataset.buzzShake;
      }, 1050);

      // 2. Mobile haptic vibration + unmistakable Spark double-ring attention chime
      try {
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
          navigator.vibrate([200, 75, 200, 75, 260]);
        }
      } catch {
        /* Ignore vibration restrictions. */
      }
      playBuzzSound(userId);

      // 3. Open prominent modal on top of whatever Doo Doo page the user is on
      const timeLabel = formatPortalTime(buzz.sentAt || serverNowDate());
      setBuzzOverlay({ ...buzz, timeLabel, pulseKey: Date.now() });
    };

    window.addEventListener('doodoo:chat_buzz', triggerBuzz);
    return () => {
      window.removeEventListener('doodoo:chat_buzz', triggerBuzz);
      clearTimeout(shakeTimer);
      delete document.documentElement.dataset.buzzShake;
    };
  }, [userId]);

  // Allow Esc to dismiss the Buzz overlay
  useEffect(() => {
    if (!buzzOverlay) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setBuzzOverlay(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [buzzOverlay]);

  const notice = queue[0];

  // Flash browser tab title while Buzz or Urgent alert is awaiting user action
  useEffect(() => {
    if (!notice && !buzzOverlay) return;
    const previous = document.title;
    const primary = notice
      ? `Urgente · ${notice.sender}`
      : `⚡ ${buzzOverlay!.sender} chamou sua atenção!`;
    const alternate = notice ? '🔔 Mensagem urgente no Doo Doo' : '🔔 Doo Doo · Chamada de atenção!';
    let toggle = false;
    document.title = primary;
    const interval = window.setInterval(() => {
      toggle = !toggle;
      document.title = toggle ? alternate : primary;
    }, 950);
    return () => {
      window.clearInterval(interval);
      document.title = previous;
    };
  }, [notice, buzzOverlay]);

  const dismissUrgent = () => setQueue((prev) => prev.slice(1));
  const openUrgent = () => {
    if (!notice) return;
    router.push(`/dashboard/conversas?chatId=${encodeURIComponent(notice.channelId)}&messageId=${encodeURIComponent(notice.id)}`);
    if (pathname.startsWith('/dashboard/conversas')) {
      window.dispatchEvent(new CustomEvent('doodoo:switch_chat', { detail: { chatId: notice.channelId, messageId: notice.id } }));
    }
    dismissUrgent();
  };

  const isAlreadyInTargetChat = (() => {
    if (!buzzOverlay || !pathname.startsWith('/dashboard/conversas') || typeof window === 'undefined') return false;
    try {
      const activeParam = new URLSearchParams(window.location.search).get('chatId');
      return activeParam === buzzOverlay.channelId;
    } catch {
      return false;
    }
  })();

  const openBuzzConversation = () => {
    if (!buzzOverlay) return;
    const targetUrl = `/dashboard/conversas?chatId=${encodeURIComponent(buzzOverlay.channelId)}&messageId=${encodeURIComponent(buzzOverlay.id)}`;
    if (pathnameRef.current.startsWith('/dashboard/conversas')) {
      window.dispatchEvent(
        new CustomEvent('doodoo:switch_chat', {
          detail: { chatId: buzzOverlay.channelId, messageId: buzzOverlay.id, focusInput: true },
        })
      );
    } else {
      router.push(targetUrl);
    }
    setBuzzOverlay(null);
  };

  if (typeof document === 'undefined' || (!buzzOverlay && !notice)) return null;

  return createPortal(
    <>
      {buzzOverlay && (
        <div
          key={buzzOverlay.pulseKey}
          className="chat-buzz-backdrop"
          role="alertdialog"
          aria-modal="true"
          aria-label="Chamada de atenção"
          onClick={() => setBuzzOverlay(null)}
        >
          <div className="chat-buzz-modal" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="chat-buzz-modal-close"
              aria-label="Fechar aviso de atenção"
              onClick={() => setBuzzOverlay(null)}
            >
              <X size={18} />
            </button>

            <div className="chat-buzz-emblem">
              <Zap size={28} />
            </div>

            <span className="chat-buzz-kicker">
              <Volume2 size={13} />
              Chamada de atenção · {buzzOverlay.timeLabel}
            </span>

            <div className="chat-buzz-sender-chip">
              <span className="chat-buzz-sender-avatar" style={primaryActionStyle}>
                {getInitials(buzzOverlay.sender)}
              </span>
              <span className="chat-buzz-sender-name">{buzzOverlay.sender}</span>
            </div>

            <h2>{buzzOverlay.sender} vibrou sua tela!</h2>
            <p>
              {buzzOverlay.channelName
                ? `Está chamando sua atenção agora no grupo “${buzzOverlay.channelName}”.`
                : 'Está chamando sua atenção agora em uma conversa direta no Chat Corporativo.'}
            </p>

            <div className="chat-buzz-modal-actions">
              <button
                type="button"
                onClick={openBuzzConversation}
                className="chat-buzz-primary"
                style={primaryActionStyle}
              >
                {isAlreadyInTargetChat ? <MessageSquare size={16} /> : <ArrowUpRight size={16} />}
                <span>{isAlreadyInTargetChat ? 'Responder agora' : 'Abrir conversa agora'}</span>
              </button>
              <button
                type="button"
                onClick={() => setBuzzOverlay(null)}
                className="chat-buzz-secondary"
              >
                Dispensar
              </button>
            </div>
          </div>
        </div>
      )}

      {notice && (
        <aside key={notice.id} className="chat-attention" aria-label="Chamada urgente">
          <button
            type="button"
            className="chat-attention-dismiss"
            aria-label="Dispensar chamada urgente"
            onClick={dismissUrgent}
          >
            <X size={17} />
          </button>
          <div role="alert">
            <span className="chat-attention-kicker">
              <BellRing size={17} />
              Chamando sua atenção
            </span>
            <h2>{notice.sender} enviou uma urgência</h2>
            <p>{notice.text}</p>
          </div>
          <div className="chat-attention-actions">
            <button type="button" onClick={openUrgent}>
              Abrir conversa
              <ArrowUpRight size={16} />
            </button>
            <span>{queue.length > 1 ? `${queue.length - 1} outras chamadas` : 'Confirme “Ciente” na mensagem'}</span>
          </div>
        </aside>
      )}
    </>,
    document.body
  );
}

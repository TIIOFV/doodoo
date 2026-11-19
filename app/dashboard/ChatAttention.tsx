'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowUpRight, BellRing, X, Zap } from 'lucide-react';
import { primaryActionStyle } from '@/app/components/BrandMark';
import { playBuzzSound } from '../lib/notificationSound';
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
}

export default function ChatAttention({ userId }: { userId: string }) {
  const [queue, setQueue] = useState<ChatAttentionNotice[]>([]);
  const [buzzOverlay, setBuzzOverlay] = useState<ChatBuzzNotice | null>(null);
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

  // Spark-style Buzz ("Vibrar tela" + prominent overlay on top of any page, respecting "Não incomodar")
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
      if (now - (lastBuzz.current.get(key) || 0) < 15000) return;
      lastBuzz.current.set(key, now);

      // 1. Shake the portal window AND overlay card (Spark / MSN Nudge effect)
      clearTimeout(shakeTimer);
      document.documentElement.dataset.buzzShake = 'true';
      shakeTimer = setTimeout(() => {
        delete document.documentElement.dataset.buzzShake;
      }, 950);

      // 2. Mobile haptic vibration + Spark double-pulse buzz sound
      try {
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
          navigator.vibrate([160, 70, 160, 70, 220]);
        }
      } catch {
        /* Ignore vibration restrictions. */
      }
      playBuzzSound(userId);

      // 3. Overlay prominent alert card on top of whatever page the user is currently on
      setBuzzOverlay(buzz);
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

  useEffect(() => {
    if (!notice && !buzzOverlay) return;
    const previous = document.title;
    document.title = notice ? 'Urgente · ' + notice.sender : '⚡ ' + buzzOverlay!.sender + ' chamou atenção!';
    return () => {
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

  const openBuzzConversation = () => {
    if (!buzzOverlay) return;
    const targetUrl = `/dashboard/conversas?chatId=${encodeURIComponent(buzzOverlay.channelId)}&messageId=${encodeURIComponent(buzzOverlay.id)}`;
    if (pathnameRef.current.startsWith('/dashboard/conversas')) {
      window.dispatchEvent(
        new CustomEvent('doodoo:switch_chat', { detail: { chatId: buzzOverlay.channelId, messageId: buzzOverlay.id } })
      );
    } else {
      router.push(targetUrl);
    }
    setBuzzOverlay(null);
  };

  return (
    <>
      {buzzOverlay && (
        <div
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

            <span className="chat-buzz-kicker">Chamada de atenção</span>
            <h2>{buzzOverlay.sender} vibrou sua tela!</h2>
            <p>
              {buzzOverlay.channelName
                ? `Chamando sua atenção no grupo “${buzzOverlay.channelName}”.`
                : 'Chamando sua atenção em uma conversa direta no Chat Corporativo.'}
            </p>

            <div className="chat-buzz-modal-actions">
              <button
                type="button"
                onClick={openBuzzConversation}
                className="chat-buzz-primary"
                style={primaryActionStyle}
              >
                <span>Ir para a conversa</span>
                <ArrowUpRight size={16} />
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
    </>
  );
}

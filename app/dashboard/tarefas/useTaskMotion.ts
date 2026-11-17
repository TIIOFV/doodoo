'use client';

import { useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';

/** Animate both sides of the queue/detail swap without delaying reduced-motion users. */
export function useTaskMotion() {
  const root = useRef<HTMLDivElement>(null);
  const revision = useRef(0);
  const animation = useRef<Animation | null>(null);

  useEffect(() => () => {
    revision.current++;
    animation.current?.cancel();
  }, []);

  const switchView = async (update: () => void, direction: 'open' | 'close') => {
    const version = ++revision.current;
    animation.current?.cancel();
    const surface = () => root.current?.querySelector<HTMLElement>('.task-detail:not(.hidden), .task-queue:not(.hidden)');
    const outgoing = surface();
    if (!outgoing?.animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      update();
      return;
    }
    const offset = direction === 'open' ? 1 : -1;
    try {
      animation.current = outgoing.animate([
        { opacity: 1, transform: 'translateX(0) scale(1)' },
        { opacity: 0, transform: `translateX(${-10 * offset}px) scale(.995)` },
      ], { duration: 110, easing: 'ease-in', fill: 'forwards' });
      await animation.current.finished;
      if (version !== revision.current || !root.current) return;
      flushSync(update);
      animation.current.cancel();
      animation.current = surface()?.animate([
        { opacity: 0, transform: `translateX(${18 * offset}px) scale(.99)` },
        { opacity: 1, transform: 'translateX(0) scale(1)' },
      ], { duration: 240, easing: 'cubic-bezier(.2,.8,.2,1)' }) || null;
      await animation.current?.finished;
    } catch { /* A newer selection or route change cancels the previous animation. */ }
  };

  return { root, switchView };
}

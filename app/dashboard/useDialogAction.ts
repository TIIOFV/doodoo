'use client';
import { useRef,useState } from 'react';


/** Keeps async dialog actions single-flight, including clicks before React rerenders. */
export function useDialogAction() {
  const running = useRef(false);
  const [pending, setPending] = useState(false);
  const run = async (action: () => unknown) => {
    if (running.current) return;
    running.current = true;
    setPending(true);
    try {
      await action();
    } catch {
      window.dispatchEvent(new CustomEvent('doodoo:notify', { detail: { title: 'Erro', desc: 'Não foi possível concluir a ação. Tente novamente.' } }));
    } finally {
      running.current = false;
      setPending(false);
    }
  };
  return { pending, run };
}

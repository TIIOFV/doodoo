'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ModalShellProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * Modal sempre acima da sidebar e do cabeçalho do Dashboard.
 * O header e o footer permanecem visíveis; somente o conteúdo central rola.
 */
export default function ModalShell({
  open,
  onClose,
  title,
  children,
  footer,
}: ModalShellProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open, onClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto bg-slate-950/60 p-3 backdrop-blur-[4px] sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-[580px] flex-col overflow-hidden rounded-[1.75rem] border shadow-2xl sm:max-h-[calc(100dvh-3rem)]"
        style={{
          color: 'var(--text-main)',
          backgroundColor: 'var(--bg-card)',
          borderColor: 'var(--border-input)',
        }}
      >
        <header
          className="flex shrink-0 items-center justify-between gap-4 border-b px-5 py-4 sm:px-7"
          style={{ borderColor: 'var(--border-input)' }}
        >
          <h2 className="min-w-0 truncate text-lg font-extrabold">{title}</h2>
          <button
            type="button"
            aria-label="Fechar janela"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors hover:bg-black/10 dark:hover:bg-white/10"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-7">
          {children}
        </div>

        {footer && (
          <footer
            className="shrink-0 border-t px-5 py-4 sm:px-7"
            style={{ borderColor: 'var(--border-input)' }}
          >
            {footer}
          </footer>
        )}
      </section>
    </div>,
    document.body,
  );
}

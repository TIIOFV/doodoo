'use client';
import { X } from 'lucide-react';
import { useEffect,useId,useRef,type ReactNode } from 'react';
import { createPortal } from 'react-dom';


interface ModalShellProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  busy?: boolean;
  destructive?: boolean;
  size?: 'sm' | 'md' | 'lg';
}
const dialogs: HTMLElement[] = [];
const hosts: HTMLElement[] = [];
const backgroundState = new Map<HTMLElement, boolean>();
let originalOverflow = '';
function syncBackground() {
  if (!hosts.length) {
    backgroundState.forEach((inert, element) => { element.inert = inert; });
    backgroundState.clear();
    document.body.style.overflow = originalOverflow;
    return;
  }
  Array.from(document.body.children).forEach(child => {
    const element = child as HTMLElement;
    if (!backgroundState.has(element)) backgroundState.set(element, element.inert);
    element.inert = element.hasAttribute('data-modal-live') ? false : element === hosts.at(-1) ? (backgroundState.get(element) ?? false) : true;
  });
}
const focusable = 'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]';

/** Shared portal, keyboard management and reversible background isolation. */
export default function ModalShell({ open, onClose, title, description, children, footer, busy = false, destructive = false, size = 'md' }: ModalShellProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panel = useRef<HTMLElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const options = useRef({ onClose, busy });
  useEffect(() => { options.current = { onClose, busy }; });

  useEffect(() => {
    if (!open || !panel.current || !layer.current) return;
    const dialog = panel.current;
    const host = layer.current;
    const previousFocus = document.activeElement as HTMLElement | null;
    if (!hosts.length) originalOverflow = document.body.style.overflow;
    dialogs.push(dialog);
    hosts.push(host);
    syncBackground();
    const observer = new MutationObserver(syncBackground);
    observer.observe(document.body, { childList: true });
    document.body.style.overflow = 'hidden';
    const controls = () => Array.from(dialog.querySelectorAll<HTMLElement>(focusable)).filter(el => el.getClientRects().length && !el.closest('[inert]'));
    const frame = requestAnimationFrame(() => {
      (destructive ? dialog.querySelector<HTMLElement>('[data-modal-close]') : dialog.querySelector<HTMLElement>('input:not([type="hidden"]), select, textarea'))?.focus({ preventScroll: true });
      if (!dialog.contains(document.activeElement)) dialog.focus({ preventScroll: true });
    });
    const onKey = (event: KeyboardEvent) => {
      if (dialogs.at(-1) !== dialog) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!options.current.busy) options.current.onClose();
      }
      if (event.key === 'Tab') {
        const items = controls();
        const index = items.indexOf(document.activeElement as HTMLElement);
        if (!items.length) { event.preventDefault(); dialog.focus(); }
        else if (event.shiftKey && index <= 0) { event.preventDefault(); items.at(-1)?.focus(); }
        else if (!event.shiftKey && (index === items.length - 1 || index < 0)) { event.preventDefault(); items[0].focus(); }
      }
    };
    const onFocus = (event: FocusEvent) => {
      if (dialogs.at(-1) === dialog && !dialog.contains(event.target as Node)) dialog.focus({ preventScroll: true });
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('focusin', onFocus);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      dialogs.splice(dialogs.indexOf(dialog), 1);
      hosts.splice(hosts.indexOf(host), 1);
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('focusin', onFocus);
      syncBackground();
      if (previousFocus?.isConnected && !previousFocus.closest('[inert]')) previousFocus.focus({ preventScroll: true });
    };
  }, [open, destructive]);

  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div ref={layer} className="modal-layer" onClick={event => {
      if (event.target === event.currentTarget && !busy && !destructive) onClose();
    }}>
      <section onClickCapture={event => { if (busy && (event.target as HTMLElement).closest('button')) { event.preventDefault(); event.stopPropagation(); } }} ref={panel} role={destructive ? 'alertdialog' : 'dialog'} aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} aria-busy={busy} tabIndex={-1} className={`modal-panel modal-${size}`}>
        <header className="modal-header">
          <div className="min-w-0"><h2 id={titleId} className="break-words text-lg font-extrabold">{title}</h2>{description && <div id={descriptionId} className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>{description}</div>}</div>
          <button data-modal-close type="button" aria-label="Fechar janela" disabled={busy} onClick={onClose} className="modal-close"><X className="h-5 w-5" /></button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-footer">{footer}</footer>}
      </section>
    </div>, document.body,
  );
}

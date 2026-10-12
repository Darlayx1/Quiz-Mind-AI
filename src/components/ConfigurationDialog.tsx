import { useEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';

/** Native modal supplies inert background, focus containment and Escape semantics. */
export function ConfigurationDialog({ title, description, onClose, children, returnFocus }: {
  title: string; description: string; onClose: () => void; children: ReactNode | ((close: () => void) => ReactNode); returnFocus?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null, element = dialog.current!;
    const overflow = document.body.style.overflow;
    element.showModal(); document.body.style.overflow = 'hidden';
    element.querySelector<HTMLElement>('input[type=search]')?.focus({ preventScroll: true });
    return () => { clearTimeout(timer.current); element.close(); document.body.style.overflow = overflow;
      const target = previous?.isConnected ? previous : returnFocus ? document.querySelector<HTMLElement>(returnFocus) : null;
      target?.focus({ preventScroll: true });
    };
  }, []);
  const close = () => {
    if (closing) return;
    setClosing(true);
    timer.current = setTimeout(onClose, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 220);
  };
  return <dialog ref={dialog} className={`configuration-dialog ${closing ? 'is-closing' : ''}`} aria-labelledby="selector-title" aria-describedby="selector-description"
    onKeyDown={event => {
      // Search inputs consume native Escape to clear their value; dismissal wins here.
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
      if (event.key !== 'Tab') return;
      const items = [...event.currentTarget.querySelectorAll<HTMLElement>('button, input, textarea, select, summary, a[href], [tabindex]')]
        .filter(item => !item.matches(':disabled') && item.tabIndex >= 0 && item.getClientRects().length > 0);
      const first = items[0], last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}
    onCancel={event => { event.preventDefault(); close(); }} onClick={event => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close(); } }}>
    <header className="selector-header"><div><h2 id="selector-title">{title}</h2><p id="selector-description">{description}</p></div><button type="button" className="icon-button" aria-label="Tutup pemilih" onClick={close}><X size={20} /></button></header>
    <div className="selector-body">{typeof children === 'function' ? children(close) : children}</div>
  </dialog>;
}

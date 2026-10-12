import { useEffect, useState } from 'react';

export function PresetChips({ values, value, onChange, suffix = '' }: {
  values: number[]; value: number; onChange: (value: number) => void; suffix?: string;
}) {
  return <div className="preset-chips">{values.map(n => <button key={n} type="button" className="preset-chip" aria-pressed={n === value} onClick={() => onChange(n)}>{n}{suffix}</button>)}</div>;
}

// Hide the fixed action bar while editing; the inline CTA stays usable.
export function useMobileKeyboard() {
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    const viewport = window.visualViewport;
    const update = () => {
      const element = document.activeElement;
      const textInput = element instanceof HTMLElement && element.matches('textarea, input:not([type=radio]):not([type=checkbox]):not([type=range]), [contenteditable=true]');
      setEditing(!!textInput || !!(viewport && window.innerHeight - viewport.height > 150));
    };
    document.addEventListener('focusin', update); document.addEventListener('focusout', update); viewport?.addEventListener('resize', update);
    return () => { document.removeEventListener('focusin', update); document.removeEventListener('focusout', update); viewport?.removeEventListener('resize', update); };
  }, []);
  return editing;
}

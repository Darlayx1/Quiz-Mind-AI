import { useLayoutEffect, useRef } from 'react';
import { motionTiming, useMotionPreferences } from '../ui/motion.js';

// Bounded, memory-only registry: filters, revisions and revisits do not replay celebrations.
const presented = new Set<string>();
export function AnimatedScore({ value, resultId }: { value: number; resultId: string }) {
  const number = useRef<HTMLSpanElement>(null);
  const { reduced, hidden } = useMotionPreferences();
  useLayoutEffect(() => {
    const element = number.current;
    if (!element) return;
    element.textContent = String(value);
    if (presented.has(resultId) || reduced || hidden) { presented.add(resultId); return; }
    presented.add(resultId);
    if (presented.size > 100) presented.delete(presented.values().next().value!);
    const summary = element.closest<HTMLElement>('.result-summary');
    if (summary) summary.dataset.celebrate = 'true';
    const start = performance.now();
    let frame = 0;
    const update = (now: number) => {
      const progress = Math.min(1, (now - start) / motionTiming.score);
      const next = value * (1 - Math.pow(1 - progress, 3));
      element.textContent = progress === 1 ? String(value) : String(Math.floor(next));
      if (progress < 1) frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    const timer = setTimeout(() => { if (summary) delete summary.dataset.celebrate; }, 1500);
    return () => {
      cancelAnimationFrame(frame); clearTimeout(timer); element.textContent = String(value);
      if (summary) delete summary.dataset.celebrate;
    };
  }, [value, resultId, reduced, hidden]);
  return <strong><span ref={number} aria-hidden="true">{value}</span><span className="sr-only">{value}</span></strong>;
}

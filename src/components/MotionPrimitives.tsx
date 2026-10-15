import { useEffect, useRef, type ReactNode } from 'react';
import { LazyMotion, MotionConfig, domAnimation } from 'motion/react';
import { Pause, Play } from 'lucide-react';
import { toggleAmbientMotion, useAmbientActivity, useMotionPreferences } from '../ui/motion.js';

export function MotionRuntime({ children }: { children: ReactNode }) {
  const { reduced, paused, hidden } = useMotionPreferences();
  useEffect(() => {
    document.documentElement.dataset.ambientPaused = String(reduced || paused || hidden);
    return () => { delete document.documentElement.dataset.ambientPaused; };
  }, [reduced, paused, hidden]);
  return <LazyMotion features={domAnimation} strict><MotionConfig reducedMotion="user">{children}</MotionConfig></LazyMotion>;
}

export function MotionToggle() {
  const { paused, reduced } = useMotionPreferences();
  if (reduced) return null;
  return <button type="button" className="motion-toggle" aria-label="Jeda efek bergerak" aria-pressed={paused}
    title={paused ? 'Lanjutkan efek bergerak' : 'Jeda efek bergerak'} onClick={toggleAmbientMotion}>
    {paused ? <Play size={15} aria-hidden="true" /> : <Pause size={15} aria-hidden="true" />}
  </button>;
}

export function AmbientVisual({ className, children }: { className: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const active = useAmbientActivity(ref);
  return <div ref={ref} className={className} aria-hidden="true" data-ambient-active={active}>{children}</div>;
}

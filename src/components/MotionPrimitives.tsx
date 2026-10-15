import { useEffect, useRef, type ReactNode } from 'react';
import { LazyMotion, MotionConfig, domAnimation } from 'motion/react';
import { useAmbientActivity, useMotionPreferences } from '../ui/motion.js';

export function MotionRuntime({ children }: { children: ReactNode }) {
  const { hidden } = useMotionPreferences();
  useEffect(() => {
    document.documentElement.dataset.ambientPaused = String(hidden);
    return () => { delete document.documentElement.dataset.ambientPaused; };
  }, [hidden]);
  return <LazyMotion features={domAnimation} strict><MotionConfig reducedMotion="never">{children}</MotionConfig></LazyMotion>;
}

export function AmbientVisual({ className, children }: { className: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const active = useAmbientActivity(ref);
  return <div ref={ref} className={className} aria-hidden="true" data-ambient-active={active}>{children}</div>;
}

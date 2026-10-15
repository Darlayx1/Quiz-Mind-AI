import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Info } from 'lucide-react';
import { AmbientVisual } from './MotionPrimitives.js';
import { useMotionPreferences } from '../ui/motion.js';

export interface ContextBadge {
  id?: string;
  label: string;
  caption?: string;
  icon?: ReactNode;
}

export interface ProcessingLayoutProps {
  eyebrow: string;
  title: string;
  description: string;
  illustration: ReactNode;
  contextBadges?: ContextBadge[];
  statusMessage: string;
  progressPercent?: number;
  progressLabel?: string;
  startedAt?: number;
  longWaitThreshold?: number;
  longWaitMessage?: string;
  isCancelling?: boolean;
  error?: string;
}

export function ProcessingLayout({
  eyebrow, title, description, illustration, contextBadges = [], statusMessage,
  progressPercent, progressLabel, startedAt, longWaitThreshold = 20,
  longWaitMessage, isCancelling = false, error,
}: ProcessingLayoutProps) {
  const mountedAt = useRef(Date.now());
  const content = useRef<HTMLElement>(null);
  const [now, setNow] = useState(Date.now);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [paused, setPaused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const motionPreference = useMotionPreferences();
  const elapsed = Math.max(0, Math.floor((now - (startedAt ?? mountedAt.current)) / 1000));
  const active = contextBadges[activeIndex % Math.max(1, contextBadges.length)];
  const percent = typeof progressPercent === 'number' && Number.isFinite(progressPercent)
    ? Math.max(0, Math.min(100, progressPercent)) : undefined;
  const timerLabel = `${Math.floor(elapsed / 60).toString().padStart(2, '0')}:${(elapsed % 60).toString().padStart(2, '0')}`;

  useEffect(() => {
    content.current?.focus({ preventScroll: true });
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReducedMotion(preference.matches);
    sync();
    preference.addEventListener('change', sync);
    return () => preference.removeEventListener('change', sync);
  }, []);
  useEffect(() => {
    if (reducedMotion || paused || motionPreference.paused || motionPreference.hidden || isCancelling || contextBadges.length < 2) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) setActiveIndex(index => (index + 1) % contextBadges.length);
    }, 3500);
    return () => window.clearInterval(timer);
  }, [contextBadges.length, reducedMotion, paused, motionPreference.paused, motionPreference.hidden, isCancelling]);

  return <section ref={content} tabIndex={-1} className={`processing-page${isCancelling ? ' is-cancelling' : ''}`} aria-labelledby="processing-title">
    <AmbientVisual className="processing-visual">{illustration}</AmbientVisual>
    <div className="processing-intro">
      <span className="processing-eyebrow">{eyebrow}</span>
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
    {active && <div className={`processing-context${reducedMotion ? ' is-static' : ''}`} role="group" aria-label="Ringkasan konfigurasi"
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false); }}>
      {reducedMotion ? <dl className="processing-static-summary">{contextBadges.map((badge, index) => <div key={badge.id ?? index}><dt>{badge.caption ?? 'Konfigurasi'}</dt><dd>{badge.label}</dd></div>)}</dl>
        : <><div key={active.id ?? activeIndex} className="processing-context-item" aria-hidden="true">
          <span className="processing-context-icon">{active.icon}</span>
          <div><span className="processing-context-caption">{active.caption ?? 'Konfigurasi kuis'}</span><strong>{active.label}</strong></div>
        </div>
        <div className="processing-context-dots" aria-label="Pilih informasi konfigurasi">{contextBadges.map((badge, index) => <button key={badge.id ?? index} type="button" aria-label={`${badge.caption ?? 'Konfigurasi'}: ${badge.label}`} aria-pressed={activeIndex % contextBadges.length === index} onClick={() => { setActiveIndex(index); setPaused(true); }}><span /></button>)}</div>
        </>}
    </div>}
    <div className="processing-progress">
      <div className={`processing-track${percent === undefined ? ' is-indeterminate' : ''}`} role="progressbar" aria-label={progressLabel ?? 'Menunggu respons AI'} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
        <span className="processing-track-fill" style={percent === undefined ? undefined : { width: `${percent}%` }} />
      </div>
      <p className="processing-status" role="status" aria-live="polite" aria-atomic="true">{statusMessage}</p>
      <p className="processing-timer" aria-live="off">Waktu respons <span aria-hidden="true">·</span> <time>{timerLabel}</time></p>
    </div>
    <div className="processing-notice-slot">
      {elapsed >= longWaitThreshold && longWaitMessage && !isCancelling && <p className="processing-long-wait" role="status"><Info size={16} aria-hidden="true" /><span>{longWaitMessage}</span></p>}
      {error && <p className="processing-error" role="alert">{error}</p>}
    </div>
  </section>;
}

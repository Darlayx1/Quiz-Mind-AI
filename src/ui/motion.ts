import { useEffect, useLayoutEffect, useRef, useSyncExternalStore, type RefObject } from 'react';

export const motionTiming = {
  press: 110, selection: 220, enter: 340, exit: 200, score: 800,
  ease: 'cubic-bezier(.16,1,.3,1)',
} as const;

const listeners = new Set<() => void>();
const notify = () => listeners.forEach(listener => listener());
const snapshot = () => typeof document !== 'undefined' && document.hidden;
function subscribe(listener: () => void) {
  if (!listeners.size) document.addEventListener('visibilitychange', notify);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) document.removeEventListener('visibilitychange', notify);
  };
}
export function useMotionPreferences() {
  const hidden = useSyncExternalStore(subscribe, snapshot, () => false);
  return { hidden };
}

/** Dismiss presentation only; business actions must never wait for this callback. */
export function useAnimatedDismiss<T extends HTMLElement>(ref: RefObject<T | null>, onClose: () => void, enabled = true) {
  const callback = useRef(onClose); callback.current = onClose;
  const running = useRef(false);
  const cleanup = useRef<() => void>(() => {});
  useEffect(() => {
    running.current = false;
    return () => { cleanup.current(); running.current = false; };
  }, [enabled]);
  return () => {
    if (!enabled || running.current) return;
    const element = ref.current;
    if (!element || !element.animate) { callback.current(); return; }
    running.current = true;
    element.dataset.closing = 'true';
    const animation = element.animate([{ opacity: 1, transform: 'translateY(0) scale(1)' },
      { opacity: 0, transform: 'translateY(8px) scale(.985)' }],
    { duration: motionTiming.exit, easing: motionTiming.ease, fill: 'forwards' });
    let done = false;
    const finish = () => { if (done) return; done = true; running.current = false; clearTimeout(timer); callback.current(); };
    const timer = setTimeout(finish, motionTiming.exit + 100);
    void animation.finished.then(finish, () => {});
    cleanup.current = () => { done = true; clearTimeout(timer); animation.cancel(); };
  };
}

/** FLIP for existing keyed rows: moving an item preserves its focused button. */
export function useListReflow(ref: RefObject<HTMLElement | null>, identity: string) {
  const previous = useRef(new Map<string, { left: number; top: number }>());
  useLayoutEffect(() => {
    const animations: Animation[] = [];
    const next = new Map<string, { left: number; top: number }>();
    const element = ref.current;
    if (!element) return;
    const bounds = element.getBoundingClientRect();
    [...element.children].forEach((child, index) => {
      if (!(child instanceof HTMLElement)) return;
      const key = child.dataset.motionKey;
      if (!key) return;
      const rect = child.getBoundingClientRect(), old = previous.current.get(key);
      const position = { left: rect.left - bounds.left, top: rect.top - bounds.top };
      next.set(key, position);
      if (!child.animate || rect.top > window.innerHeight || rect.bottom < 0) return;
      if (old && (old.left !== position.left || old.top !== position.top)) {
        animations.push(child.animate([{ transform: `translate(${old.left - position.left}px,${old.top - position.top}px)` },
          { transform: 'translate(0,0)' }], { duration: motionTiming.enter, easing: motionTiming.ease }));
      } else if (!old && index < 6) {
        animations.push(child.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }],
          { duration: motionTiming.enter, delay: index * 35, easing: motionTiming.ease, fill: 'backwards' }));
      }
    });
    previous.current = next;
    return () => animations.forEach(animation => animation.cancel());
  }, [ref, identity]);
}

/** Animate the existing node: inputs, draft ownership and domain effects stay mounted. */
export function useVisualTransition<T extends HTMLElement>(ref: RefObject<T | null>, identity: string | number, distance = 12) {
  const previous = useRef(identity);
  useLayoutEffect(() => {
    const element = ref.current;
    const backwards = typeof identity === 'number' && typeof previous.current === 'number' && identity < previous.current;
    previous.current = identity;
    if (!element || !element.animate) return;
    const frames = distance === 0 ? [{ opacity: 0 }, { opacity: 1 }] : [
      { opacity: 0, transform: `translate${typeof identity === 'number' ? 'X' : 'Y'}(${backwards ? -distance : distance}px)` },
      { opacity: 1, transform: 'translate(0,0)' },
    ];
    const animation = element.animate(frames, { duration: motionTiming.enter, easing: motionTiming.ease });
    return () => animation.cancel();
  }, [identity, ref, distance]);
}

/** Measured indicator follows selection without mounting a second interactive control. */
export function useSelectionIndicator<T extends HTMLElement>(ref: RefObject<T | null>, selection: string) {
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const sync = () => {
      const active = element.querySelector<HTMLElement>('[aria-current="page"], [aria-selected="true"]');
      if (!active) { element.style.setProperty('--indicator-opacity', '0'); return; }
      element.style.setProperty('--indicator-x', `${active.offsetLeft}px`);
      element.style.setProperty('--indicator-y', `${active.offsetTop}px`);
      element.style.setProperty('--indicator-width', `${active.offsetWidth}px`);
      element.style.setProperty('--indicator-height', `${active.offsetHeight}px`);
      element.style.setProperty('--indicator-opacity', '1');
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(element);
    for (const child of element.children) observer.observe(child);
    return () => observer.disconnect();
  }, [selection, ref]);
}

export function useAmbientActivity(ref: RefObject<HTMLElement | null>) {
  const { hidden } = useMotionPreferences();
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => {
      element.dataset.ambientVisible = String(entry.isIntersecting);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return !hidden;
}

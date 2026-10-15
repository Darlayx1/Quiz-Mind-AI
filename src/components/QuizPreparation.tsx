import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, ListChecks } from 'lucide-react';
import type { Quiz } from '../types/quiz.js';
import { preparationSummary } from '../quizPreparation.js';
import { AmbientVisual } from './MotionPrimitives.js';

function PreparationVisual() {
  return <AmbientVisual className="preparation-visual">
    <div className="preparation-pedestal" />
    <div className="preparation-shadow" />
    <div className="preparation-scene">
      <div className="preparation-orbit"><span /></div>
      <div className="preparation-card preparation-card-back preparation-card-far"><span /><span /><span /></div>
      <div className="preparation-card preparation-card-back preparation-card-near"><span /><span /><span /></div>
      <div className="preparation-card preparation-card-main">
        <div className="preparation-card-face"><ListChecks size={30} strokeWidth={1.6} /><span className="preparation-card-title" /><span className="preparation-card-line" />
          {[0, 1, 2].map(row => <div className="preparation-card-check" key={row}><span>{row === 0 && <Check size={12} strokeWidth={3} />}</span><i /></div>)}
          <span className="preparation-card-seal"><Check size={18} strokeWidth={2.5} /></span>
        </div>
      </div>
    </div>
  </AmbientVisual>;
}

export function QuizPreparation({ quiz, onStart }: { quiz: Quiz; onStart: () => void }) {
  const startButton = useRef<HTMLButtonElement>(null);
  const started = useRef(false);
  const [starting, setStarting] = useState(false);
  useEffect(() => { startButton.current?.focus({ preventScroll: true }); }, []);
  const start = () => {
    if (started.current) return;
    started.current = true;
    setStarting(true);
    onStart();
  };
  return <section className="preparation-page" aria-labelledby="preparation-title">
    <PreparationVisual />
    <ul className="preparation-summary">{preparationSummary(quiz).map(({ label, value }) => <li key={label}>
      <div><span className="preparation-label">{label}</span><strong>{value}</strong></div>
    </li>)}</ul>
    <p className="preparation-description">Mulai saat Anda siap — waktu baru berjalan setelah tombol Mulai ditekan.</p>
    <button ref={startButton} type="button" className="settings-primary preparation-start" disabled={starting} onClick={start}>Mulai kuis <ArrowRight size={18} aria-hidden="true" /></button>
  </section>;
}

import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QuizResults } from '../src/components/QuizResults.js';
import { TopBar } from '../src/components/TopBar.js';
import { buildResult } from '../src/scoring.js';
import { reviewFixture, type ReviewScenario } from './results-review-fixture.js';
import '../src/index.css';
import '../src/styles/motion.css';

// Isolated local preview: callbacks never call an AI provider or account storage.
function Preview() {
  const [scenario, setScenario] = useState<ReviewScenario>('final');
  const [result, setResult] = useState(() => reviewFixture());
  const [busy, setBusy] = useState(false), [action, setAction] = useState('');
  const [printPreview, setPrintPreview] = useState(false);
  useEffect(() => {
    if (!printPreview) return;
    // Local fallback for browsers without media emulation. Reuse actual print declarations.
    const collect = (rules: CSSRuleList): string => Array.from(rules).map(rule => {
      if (rule instanceof CSSMediaRule && rule.conditionText === 'print') return '@media all {' + Array.from(rule.cssRules).map(r => r.cssText).join('\n') + '}';
      if ('cssRules' in rule) {
        const nested = collect((rule as CSSGroupingRule).cssRules);
        return nested ? rule.cssText.slice(0, rule.cssText.indexOf('{') + 1) + nested + '}' : '';
      }
      return '';
    }).join('\n');
    const style = document.createElement('style');
    style.dataset.qaPrint = 'true';
    style.textContent = Array.from(document.styleSheets).map(sheet => { try { return collect(sheet.cssRules); } catch { return ''; } }).join('\n');
    document.head.append(style);
    return () => style.remove();
  }, [printPreview]);
  return <div className="app-frame min-h-screen">
    <TopBar activeView="results" isBusy={busy} onNavigate={() => setAction('Beranda')} onOpenSettings={() => setAction('Pengaturan AI')} storageLabel="QA lokal" isKeyConfigured onNewQuizClick={() => setAction('Kuis baru')} />
    <aside className="print:hidden" aria-label="Skenario QA" style={{ padding: '12px 16px', display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 14 }}>
      <label>Skenario <select aria-label="Skenario" value={scenario} onChange={e => { const next = e.target.value as ReviewScenario; setScenario(next); setResult(reviewFixture(next)); setBusy(false); }}>
        {(['final', 'pending', 'failed', 'cancelled', 'needs_review', 'unanswered', 'manual', 'long', 'long_prompt'] as const).map(s => <option key={s}>{s}</option>)}
      </select></label>
      <label><input type="checkbox" checked={busy} onChange={e => setBusy(e.target.checked)} /> Evaluasi aktif</label>
      <label><input type="checkbox" checked={printPreview} onChange={e => setPrintPreview(e.target.checked)} /> Simulasi CSS cetak</label>
      <output aria-live="polite">{action}</output>
    </aside>
    <main><QuizResults key={scenario} result={result} isEvaluating={busy} onRetake={() => setAction('Remedial: soal yang sama')} onRegenerate={() => setAction('Generate ulang: soal baru dengan konfigurasi sama')} onNewQuiz={() => setAction('Kuis baru')} onEvaluate={ids => setAction('Evaluasi: ' + (ids?.join(',') ?? 'belum selesai'))} onCancelEvaluation={() => { setBusy(false); setAction('Evaluasi dibatalkan'); }} onOpenConnections={() => setAction('Kelola Evaluasi AI')} onReview={(id, points, reason) => {
      const before = result.evaluations![id], { previous, ...old } = before;
      setResult(buildResult(result.quiz, result.submission, { ...result.evaluations, [id]: { ...before, status: 'graded', method: 'manual', earnedPoints: points, manualReason: reason, revision: (before.revision ?? 0) + 1, previous: [...(previous ?? []), old] } }));
      setAction('Nilai manual tersimpan');
    }} /></main>
  </div>;
}
const root = createRoot(document.getElementById('root')!);
root.render(<Preview />);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());

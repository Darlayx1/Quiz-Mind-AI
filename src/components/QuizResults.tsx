import React, { useEffect, useState } from 'react';
import type { QuizResult, QuestionEvaluation } from '../types/quiz.js';
import { Button } from './Button.js';
import { QuestionReview } from './QuestionReview.js';
import { AnswerDiscussion } from './AnswerDiscussion.js';
import { questionLabels, questionType } from '../questionState.js';
import { buildResult } from '../scoring.js';
import { exportJSON } from '../quizStorage.js';
import { modelName } from '../models.js';
import { matchesReviewFilter, questionScore, questionStatusLabel, reviewFilters, reviewStatus, type ReviewFilter } from '../resultPresentation.js';
import { Check, Circle, Clock3, Download, Minus, Printer, RotateCcw, Sparkles, X } from 'lucide-react';

interface Props {
  result: QuizResult; onRetake: () => void; onNewQuiz: () => void; isEvaluating?: boolean;
  onRegenerate?: () => void;
  onEvaluate?: (ids?: string[]) => void; onCancelEvaluation?: () => void;
  onOpenConnections?: () => void; onReview?: (id: string, points: number, reason: string) => void;
}
function ReviewControl({ id, e, onReview }: { id: string; e: QuestionEvaluation; onReview: NonNullable<Props['onReview']> }) {
  const initialScore = questionScore(e.proposedPoints ?? e.earnedPoints, e.maxPoints);
  const [points, setPoints] = useState(initialScore === null ? '' : String(initialScore));
  const [reason, setReason] = useState('');
  const number = Number(points), valid = points.trim() !== '' && Number.isFinite(number) && number >= 0 && number <= 100 && !!reason.trim();
  return <details className="manual-review print:hidden">
    <summary>Tinjau / sesuaikan nilai</summary>
    <p className="field-help">Latihan pribadi: perubahan Anda disimpan bersama alasan dan nilai sebelumnya.</p>
    <label className="field-label" htmlFor={'manual-' + id}>Nilai (0–100)</label>
    <input id={'manual-' + id} className="field-input" type="number" min={0} max={100} step="0.01" value={points} onChange={v => setPoints(v.target.value)} />
    <label className="field-label" htmlFor={'reason-' + id}>Alasan penetapan nilai</label>
    <textarea id={'reason-' + id} className="field-input" value={reason} maxLength={1000} onChange={v => setReason(v.target.value)} rows={2} />
    <div className="review-control-actions">
      <button type="button" className="topic-chip" disabled={!valid} onClick={() => onReview(id, number / 100 * e.maxPoints, reason.trim())}>Simpan nilai manual</button>
      {e.status === 'needs_review' && e.proposedPoints !== undefined && <button type="button" className="topic-chip" onClick={() => onReview(id, e.proposedPoints!, 'Menerima nilai usulan AI setelah meninjau rubrik.')}>Terima usulan AI: {questionScore(e.proposedPoints, e.maxPoints)}/100</button>}
    </div>
  </details>;
}
const statusIcons = { correct: Check, partial: Minus, incorrect: X, unanswered: Circle, pending: Clock3 };
export const QuizResults: React.FC<Props> = ({ result, onRetake, onRegenerate, isEvaluating = false, onEvaluate, onCancelEvaluation, onOpenConnections, onReview }) => {
  const [filter, setFilter] = useState<ReviewFilter>('all');
  const data = result.evaluations ? result : buildResult(result.quiz, result.submission);
  const evaluations = data.evaluations!;
  const score = result.finalScore === undefined ? result.score : result.finalScore;
  const counts = reviewFilters.map(f => result.quiz.questions.filter(q => matchesReviewFilter(evaluations[q.id], f.id)).length);
  const activeFilter = filter === 'all' || counts[reviewFilters.findIndex(f => f.id === filter)] > 0 ? filter : 'all';
  const visibleCount = counts[reviewFilters.findIndex(f => f.id === activeFilter)];
  useEffect(() => { if (filter !== activeFilter) setFilter(activeFilter); }, [filter, activeFilter]);
  return <div className="page-shell results-page">
    <header className="result-header">
      <p className="result-eyebrow">HASIL SESI BELAJAR</p>
      <h1>{result.quiz.title}</h1>
      <p className="result-meta">
        <span>{result.quiz.questions.length} soal</span>
        <span>Durasi {Math.floor(result.submission.timeTakenSeconds / 60)}:{String(result.submission.timeTakenSeconds % 60).padStart(2, '0')}</span>
        <time dateTime={result.submission.completedAt}>{new Date(result.submission.completedAt).toLocaleString('id-ID')}</time>
        <span>Pembuat soal: {modelName(result.quiz.model)}</span>
      </p>
    </header>
    <section className="result-summary" aria-label="Ringkasan hasil">
      <div className="result-score">
        <div className="result-score-top">
        <div>
        <span className="result-score-label">Skor · {score === null ? 'Belum final' : 'Final'}</span>
        <p className="result-score-value"><strong key={score ?? 'pending'}>{score ?? '—'}</strong><span>/ 100</span></p>
        </div>
        </div>
        {score !== null && <div className="result-score-track" aria-hidden="true"><span style={{ width: `${Math.max(0, Math.min(100, score))}%` }} /></div>}
      </div>
      <div className="result-summary-detail">
        <dl className="result-metric-strip">
          {([
            ['Benar penuh', data.correctCount, 'correct'], ['Sebagian benar', data.partialCount ?? 0, 'partial'],
            ['Salah', data.incorrectCount, 'incorrect'], ['Belum dijawab', data.unansweredCount, 'unanswered'], ['Belum final', data.pendingCount ?? 0, 'pending'],
          ] as const).map(([label, value, status]) => {
            if (value === 0) return null;
            const Icon = statusIcons[status];
            return <div key={label} className={'result-count ' + status} title={`${label}: ${value}`}>
              <dt className="sr-only">{label}</dt>
              <dd><span className="result-count-icon"><Icon size={17} aria-hidden="true" /></span><strong>{value}</strong></dd>
            </div>;
          })}
        </dl>
      </div>
      <div className="result-action-row print:hidden">
        <div className="result-main-actions">
          <Button label="Generate ulang" className="result-regenerate" aria-describedby="result-retry-help" disabled={isEvaluating || !onRegenerate} icon={<Sparkles size={16} />} iconPosition="leading" onClick={onRegenerate} />
          <Button label="Remedial" className="result-remedial" aria-describedby="result-retry-help" disabled={isEvaluating} icon={<RotateCcw size={16} />} iconPosition="leading" variant="outline" onClick={onRetake} />
        </div>
        <div className="result-utilities">
          <Button label="Cetak" icon={<Printer size={18} />} iconPosition="only" variant="ghost" onClick={() => window.print()} />
          <Button label="Ekspor jawaban & hasil" icon={<Download size={18} />} iconPosition="only" variant="ghost" onClick={() => exportJSON('quizmind-hasil-' + result.quiz.id + '.json', result)} />
        </div>
      </div>
      <div className="result-action-help print:hidden">
        <p id="result-retry-help" className="result-retry-help">Generate ulang: soal baru, konfigurasi sama · memakai kuota AI. Remedial: soal yang sama.</p>
        {!result.quiz.generationConfig && <p className="result-legacy-config">Kuis lama menggunakan konfigurasi yang masih tersimpan.</p>}
      </div>
    </section>
    {(data.pendingCount ?? 0) > 0 && <section className="result-evaluation-notice" aria-label="Status evaluasi">
      <div aria-live="polite"><h2>{isEvaluating ? 'Evaluasi AI sedang berjalan' : 'Penilaian belum final'}</h2>
        <p>{result.quiz.questions.length - (data.pendingCount ?? 0)} dari {result.quiz.questions.length} soal mempunyai nilai final. Jawaban Anda tetap tersimpan. Soal yang perlu tinjauan dapat dinilai secara manual di pembahasan.</p>
      </div>
      <div className="review-control-actions print:hidden">
        {isEvaluating ? <button type="button" className="topic-chip" disabled={!onCancelEvaluation} onClick={onCancelEvaluation}>Batalkan evaluasi</button> : <>
          <button type="button" className="topic-chip" disabled={!onEvaluate} onClick={() => onEvaluate?.()}>Evaluasi yang belum selesai · memakai kuota</button>
          <button type="button" className="topic-chip" disabled={!onOpenConnections} onClick={onOpenConnections}>Kelola Evaluasi AI</button>
        </>}
      </div>
    </section>}
    <section className="review-section" aria-labelledby="review-heading">
      <div className="review-heading">
        <div><h2 id="review-heading" tabIndex={-1}>Pembahasan soal</h2><p>Bandingkan jawaban dengan kunci atau rubrik penilaian.</p></div>
        <span className="review-result-count print:hidden" role="status">{visibleCount} dari {result.quiz.questions.length} soal</span>
      </div>
      <div className="review-filter-wrap print:hidden">
        <div className="review-filters" role="group" aria-label="Filter pembahasan">
          {reviewFilters.map((f, i) => (f.id === 'all' || counts[i] > 0) && <button type="button" key={f.id} aria-pressed={activeFilter === f.id} aria-controls="review-list" onClick={() => setFilter(f.id)}>{f.label}<span>{counts[i]}</span></button>)}
        </div>
        <p className="review-filter-hint">Geser untuk melihat semua kategori →</p>
      </div>
      {visibleCount === 0 && <div className="review-empty print:hidden"><p>Tidak ada soal pada kategori ini.</p><button type="button" className="topic-chip" onClick={() => setFilter('all')}>Kembali ke Semua</button></div>}
      <div id="review-list" className="review-list">
        {result.quiz.questions.map((q, index) => {
          const e = evaluations[q.id], status = reviewStatus(e), Icon = statusIcons[status];
          // Keep every question in the document so printing always includes the full review.
          return <article key={q.id} style={{ '--review-delay': `${Math.min(index, 5) * 45}ms` } as React.CSSProperties} className={'review-card' + (matchesReviewFilter(e, activeFilter) ? '' : ' review-filtered')} aria-labelledby={'question-title-' + q.id}>
            <div className="review-question-meta">
              <span className="question-counter">SOAL {String(index + 1).padStart(2, '0')} · {questionLabels[questionType(q)]}</span>
              <span className={'answer-status ' + status}><Icon size={14} aria-hidden="true" />{questionStatusLabel(q, e)}</span>
            </div>
            <h3 id={'question-title-' + q.id} className="question-title">{q.question}</h3>
            <AnswerDiscussion question={q} answer={result.submission.userAnswers[q.id]} evaluation={e} title={result.quiz.title} number={index + 1} />
            <QuestionReview question={q} answer={result.submission.userAnswers[q.id]} evaluation={e} />
            {(q.type === 'short_answer' || q.type === 'essay') && !isEvaluating && <>
              {onReview && <ReviewControl key={`${q.id}-${e.revision ?? 0}-${e.status}-${e.earnedPoints}`} id={q.id} e={e} onReview={onReview} />}
              {onEvaluate && <button type="button" className="topic-chip print:hidden" onClick={() => onEvaluate([q.id])}>Nilai ulang soal ini · memakai kuota</button>}
            </>}
          </article>;
        })}
      </div>
    </section>
  </div>;
};

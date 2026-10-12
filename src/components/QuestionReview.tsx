import React from 'react';
import { Check, X } from 'lucide-react';
import type { AnswerValue, Question, QuestionEvaluation, StoredAnswer } from '../types/quiz.js';
import { normalizedAnswer, optionIds } from '../questionState.js';
import { questionScore, reviewStatusLabel } from '../resultPresentation.js';

function AnswerRow({ letter, text, correct, chosen, multiple = false }: { letter: string; text: string; correct: boolean; chosen: boolean; multiple?: boolean }) {
  return <li role="listitem" style={{ '--option-delay': `${(letter.charCodeAt(0) - 65) * 35}ms` } as React.CSSProperties} className={'review-option' + (correct ? ' correct-option' : chosen ? ' wrong-option' : '')}>
    <span className="option-letter">{letter}</span>
    <div className="review-option-content"><p>{text}</p>
      {(correct || chosen || multiple) && <div className="option-status-labels">
        {correct && <span><Check size={14} aria-hidden="true" />Jawaban benar</span>}
        {chosen && <span>{!correct && <X size={14} aria-hidden="true" />}Pilihan Anda{!correct && ' · Salah'}</span>}
        {multiple && !chosen && <span>Tidak dipilih</span>}
      </div>}
    </div>
  </li>;
}
function ChoiceReview({ q, a }: { q: Extract<Question, { options: string[] }>; a?: AnswerValue }) {
  const ids = optionIds(q);
  return <ul role="list" className="review-options" aria-label="Seluruh pilihan jawaban">{q.options.map((text, i) => {
    const id = ids[i], correct = q.type === 'multiple_select' ? q.correctOptionIds.includes(id) : i === q.correctAnswerIndex;
    const chosen = a?.type === 'single_choice' ? a.selectedOptionId === id : a?.type === 'multiple_select' && a.selectedOptionIds.includes(id);
    return <AnswerRow key={id} letter={String.fromCharCode(65 + i)} text={text} correct={correct} chosen={Boolean(chosen)} multiple={q.type === 'multiple_select'} />;
  })}</ul>;
}
function WrittenReview({ q, a, e }: { q: Extract<Question, { type: 'short_answer' | 'essay' }>; a?: AnswerValue; e: QuestionEvaluation }) {
  return <div className="written-review">
    <div className="written-answer-grid">
    <section><h4>Jawaban Anda</h4><p className="answer-text">{a?.type === 'short_answer' || a?.type === 'essay' ? a.text || 'Belum dijawab' : 'Belum dijawab'}</p></section>
    <section><h4>Jawaban acuan</h4><p className="answer-text">{q.referenceAnswer}</p></section>
    </div>
    {q.type === 'short_answer' && <>
      {q.acceptedAnswers.length > 0 && <><h4>Jawaban yang diterima</h4><ul className="review-text-list">{q.acceptedAnswers.map((text, i) => <li key={i}>{text}</li>)}</ul></>}
      {q.requiredConcepts.length > 0 && <><h4>Konsep yang diharapkan</h4><ul className="review-text-list">{q.requiredConcepts.map((text, i) => <li key={i}>{text}</li>)}</ul></>}
    </>}
    {q.type === 'essay' && <><h4>Rubrik penilaian</h4><ul className="rubric-results">{q.rubric.map(c => {
      const value = e.criteria?.find(v => v.criterionId === c.id);
      return <li key={c.id}>
        <div className="rubric-heading"><strong>{c.description}</strong><span>Bobot {c.weight}%</span></div>
        <p className="rubric-anchors">Acuan tingkat: {c.anchors.join(' · ')}</p>
        {value ? <><p>{value.level * 100}% terpenuhi · {value.feedback}</p>{value.evidence && <blockquote><span>Bukti jawaban: </span>“{value.evidence}”</blockquote>}</> : <p>Belum ada penilaian kriteria.</p>}
      </li>;
    })}</ul></>}
  </div>;
}
function MatchingReview({ q, a }: { q: Extract<Question, { type: 'matching' }>; a?: AnswerValue }) {
  return <div className="matching-review">
    <h4>Seluruh pilihan pasangan</h4><ul className="review-text-list matching-options">{q.rightItems.map(i => <li key={i.id}>{i.text}</li>)}</ul>
    <h4>Pasangan Anda dan kunci</h4><dl className="matching-pairs">{q.leftItems.map(i => {
      const chosenId = a?.type === 'matching' ? a.pairs[i.id] : undefined;
      return <div key={i.id}><dt>{i.text}</dt><dd>
        <p><span>Jawaban Anda: </span>{q.rightItems.find(r => r.id === chosenId)?.text ?? 'Belum dipasangkan'}</p>
        <p><span>Kunci: </span>{q.rightItems.find(r => r.id === q.correctPairs[i.id])?.text}</p>
        <p className={'pair-status ' + (!chosenId ? 'unanswered' : chosenId === q.correctPairs[i.id] ? 'correct' : 'incorrect')}>{!chosenId ? 'Belum dipasangkan' : chosenId === q.correctPairs[i.id] ? 'Pasangan benar' : 'Pasangan salah'}</p>
      </dd></div>;
    })}</dl>
  </div>;
}
function OrderingReview({ q, a }: { q: Extract<Question, { type: 'ordering' }>; a?: AnswerValue }) {
  const confirmed = a?.type === 'ordering' && a.confirmed;
  return <div className="ordering-review"><div><h4>{confirmed ? 'Urutan Anda · Dikonfirmasi' : 'Seluruh item · Belum dikonfirmasi'}</h4>
    {!confirmed && <p>Belum ada urutan jawaban yang dikonfirmasi. Item berikut ditampilkan dalam urutan sumber.</p>}
    <ol>{(confirmed ? a.orderedItemIds : q.items.map(i => i.id)).map(id => <li key={id}>{q.items.find(i => i.id === id)?.text}</li>)}</ol>
  </div><div><h4>Urutan benar</h4><ol>{q.correctOrder.map(id => <li key={id}>{q.items.find(i => i.id === id)?.text}</li>)}</ol></div></div>;
}
function Explanation({ q, e }: { q: Question; e: QuestionEvaluation }) {
  return <>
    <div className="explanation"><h4>Pembahasan</h4><p>{q.explanation}</p>
      {e.method !== 'deterministic' && <><h4>Evaluasi jawaban · {reviewStatusLabel(e)}</h4><p>{e.feedback}</p>
        {e.proposedPoints !== undefined && e.status === 'needs_review' && <p>Nilai usulan AI (belum final): {questionScore(e.proposedPoints, e.maxPoints)}/100</p>}
        {e.reviewFlags?.length ? <ul className="review-text-list">{e.reviewFlags.map((flag, i) => <li key={i}>{flag}</li>)}</ul> : null}
        {e.errorCode && <p>Keterangan evaluasi: {e.errorCode}</p>}
        {e.model && <p className="evaluation-provenance">{e.provider} · {e.model}{e.evaluatedAt && <> · <time dateTime={e.evaluatedAt}>{new Date(e.evaluatedAt).toLocaleString('id-ID')}</time></>}</p>}
      </>}
      {e.manualReason && <p><strong>Disesuaikan pengguna: </strong>{e.manualReason}</p>}
      {(e.revision !== undefined || e.previous?.length) && <div className="review-audit"><h4>Riwayat penilaian · Revisi {e.revision ?? e.previous?.length}</h4>
        <ol>{e.previous?.map((previous, i) => <li key={i}><p>{reviewStatusLabel(previous)} · {questionScore(previous.earnedPoints, previous.maxPoints) ?? '—'}/100 · {previous.method}</p>
          <p>{previous.feedback}</p>
          {previous.manualReason && <p>Alasan penetapan nilai: {previous.manualReason}</p>}
          {previous.evaluatedAt && <time dateTime={previous.evaluatedAt}>{new Date(previous.evaluatedAt).toLocaleString('id-ID')}</time>}
        </li>)}</ol>
      </div>}
    </div>
    {q.groundingSources?.some(s => /^https?:\/\//i.test(s.url)) && <div className="review-sources"><h4>Sumber</h4><ul>{q.groundingSources.filter(s => /^https?:\/\//i.test(s.url)).map((s, i) => <li key={i}><a href={s.url} target="_blank" rel="noopener noreferrer">{s.title || s.url}</a><span className="review-source-url">{s.url}</span></li>)}</ul></div>}
  </>;
}
export function QuestionReview({ question: q, answer: raw, evaluation: e }: { question: Question; answer?: StoredAnswer; evaluation: QuestionEvaluation }) {
  const a = normalizedAnswer(q, raw);
  return <div className="question-review">
    {(q.type === undefined || q.type === 'single_choice' || q.type === 'multiple_select') && <ChoiceReview q={q} a={a} />}
    {q.type === 'true_false' && <ul role="list" className="review-options" aria-label="Seluruh pilihan jawaban">{[true, false].map((value, i) => <AnswerRow key={String(value)} letter={String.fromCharCode(65 + i)} text={value ? 'Benar' : 'Salah'} correct={q.correctValue === value} chosen={a?.type === 'true_false' && a.value === value} />)}</ul>}
    {(q.type === 'short_answer' || q.type === 'essay') && <WrittenReview q={q} a={a} e={e} />}
    {q.type === 'matching' && <MatchingReview q={q} a={a} />}
    {q.type === 'ordering' && <OrderingReview q={q} a={a} />}
    <Explanation q={q} e={e} />
  </div>;
}

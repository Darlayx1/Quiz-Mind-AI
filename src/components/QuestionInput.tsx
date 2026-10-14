import React from 'react';
import { Check, ArrowUp, ArrowDown } from 'lucide-react';
import { Select } from './Select.js';
import type { AnswerValue, Question, StoredAnswer } from '../types/quiz.js';
import { normalizedAnswer, optionIds } from '../questionState.js';

export function stableShuffle<T extends { id: string }>(items: T[], seed: string): T[] {
  let state = 2166136261;
  for (const c of seed) state = Math.imul(state ^ c.charCodeAt(0), 16777619);
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const j = state % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export interface QuestionInputProps {
  question: Question;
  value?: StoredAnswer;
  onChange: (value: AnswerValue) => void;
  seed?: string;
  disabled?: boolean;
}

export function QuestionInput({ question: q, value, onChange, seed = '', disabled = false }: QuestionInputProps) {
  const a = normalizedAnswer(q, value), id = 'answer-' + q.id;
  if (q.type === undefined || q.type === 'single_choice' || q.type === 'multiple_select') {
    const ids = optionIds(q), multi = q.type === 'multiple_select';
    const count = a?.type === 'multiple_select' ? a.selectedOptionIds.length : 0;
    return <fieldset disabled={disabled} className="quiz-options" aria-label={multi ? 'Pilih semua jawaban yang tepat' : 'Pilihan jawaban'}>
      {multi && <div className="quiz-input-hint"><span>Pilih semua jawaban yang tepat</span><strong>{count} dipilih</strong></div>}
      {q.options.map((option, i) => {
        const selected = multi ? a?.type === 'multiple_select' && a.selectedOptionIds.includes(ids[i]) : a?.type === 'single_choice' && a.selectedOptionId === ids[i];
        return <label key={ids[i]} className={`quiz-option-interactive quiz-choice ${selected ? 'is-selected' : ''}`}>
          <input type={multi ? 'checkbox' : 'radio'} name={id} checked={!!selected} onChange={() => {
            if (multi) {
              const current = a?.type === 'multiple_select' ? a.selectedOptionIds : [];
              onChange({ type: 'multiple_select', selectedOptionIds: selected ? current.filter(v => v !== ids[i]) : [...current, ids[i]] });
            } else onChange({ type: 'single_choice', selectedOptionId: ids[i] });
          }} />
          <span className="quiz-option-letter" aria-hidden="true">{String.fromCharCode(65 + i)}</span>
          <span className="quiz-option-text">{option.replace(/^[A-H][.)]\s+/i, '')}</span>
          <span aria-hidden="true" className={`quiz-choice-mark ${multi ? 'is-checkbox' : ''}`}>{selected && <Check size={13} strokeWidth={3} />}</span>
        </label>;
      })}
    </fieldset>;
  }
  if (q.type === 'true_false') return <fieldset disabled={disabled} className="quiz-options quiz-boolean" aria-label="Benar atau salah">
    {[true, false].map(v => {
      const selected = a?.type === 'true_false' && a.value === v;
      return <label key={String(v)} className={`quiz-option-interactive quiz-choice ${selected ? 'is-selected' : ''}`}>
        <input type="radio" name={id} checked={selected} onChange={() => onChange({ type: 'true_false', value: v })} />
        <span className={`quiz-option-letter ${v ? 'is-true' : 'is-false'}`} aria-hidden="true">{v ? '✓' : '✕'}</span>
        <span className="quiz-option-text">{v ? 'Benar' : 'Salah'}</span>
        <span className="quiz-choice-mark" aria-hidden="true">{selected && <Check size={13} strokeWidth={3} />}</span>
      </label>;
    })}
  </fieldset>;
  if (q.type === 'short_answer' || q.type === 'essay') {
    const text = a?.type === 'short_answer' || a?.type === 'essay' ? a.text : '';
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    return <div className="quiz-written-answer">
      <label className="sr-only" htmlFor={id}>Jawaban Anda</label>
      {q.type === 'essay' && <details className="quiz-rubric"><summary>Kriteria penilaian</summary><ul>{q.rubric.map(c => <li key={c.id}>{c.description} ({c.weight}%)</li>)}</ul></details>}
      <div className="quiz-text-editor">
        {q.type === 'short_answer'
          ? <input id={id} type="text" disabled={disabled} maxLength={q.maxLength} value={text} placeholder="Ketik jawaban singkat Anda…" onChange={e => onChange({ type: q.type, text: e.target.value })} aria-describedby={id + '-help'} />
          : <textarea id={id} rows={6} disabled={disabled} maxLength={q.maxLength} value={text} placeholder="Tuliskan jawaban Anda secara terstruktur dan jelas…" onChange={e => onChange({ type: q.type, text: e.target.value })} aria-describedby={id + '-help'} />}
        <div id={id + '-help'} className="quiz-input-hint quiz-text-count"><span>{q.type === 'essay' ? `${words} kata` : 'Isian singkat'}</span><span>{text.length.toLocaleString('id-ID')} / {q.maxLength.toLocaleString('id-ID')} karakter</span></div>
      </div>
    </div>;
  }
  if (q.type === 'matching') {
    const pairs = a?.type === 'matching' ? a.pairs : {}, right = stableShuffle(q.rightItems, q.id + seed);
    return <fieldset disabled={disabled} className="quiz-matching">
      <legend className="quiz-input-hint">Pasangkan setiap item. Setiap pilihan digunakan sekali.</legend>
      {q.leftItems.map((item, i) => <div className="quiz-matching-row" key={item.id}>
        <label htmlFor={id + '-' + item.id}><span className="quiz-option-letter">{i + 1}</span>{item.text}</label>
        <Select disabled={disabled} className="field-input" id={id + '-' + item.id} value={pairs[item.id] ?? ''} onChange={e => {
          const next = { ...pairs };
          if (e.target.value) next[item.id] = e.target.value; else delete next[item.id];
          onChange({ type: 'matching', pairs: next });
        }}><option value="">Pilih pasangan…</option>{right.map(r => <option key={r.id} value={r.id} disabled={Object.entries(pairs).some(([l, v]) => l !== item.id && v === r.id)}>{r.text}</option>)}</Select>
      </div>)}
    </fieldset>;
  }
  if (q.type !== 'ordering') return null;
  const initial = stableShuffle(q.items, q.id + seed), ordered = a?.type === 'ordering' ? a.orderedItemIds : initial.map(i => i.id), confirmed = a?.type === 'ordering' && a.confirmed;
  const move = (index: number, delta: number) => {
    const next = [...ordered];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    onChange({ type: 'ordering', orderedItemIds: next, confirmed: true });
  };
  return <div className="quiz-ordering">
    <p className="quiz-input-hint">Susun dari awal ke akhir dengan tombol panah.</p>
    <ol>{ordered.map((itemId, i) => {
      const item = q.items.find(v => v.id === itemId)!;
      return <li key={itemId}><span className="quiz-option-letter">{i + 1}</span><span>{item.text}</span>
        <button type="button" className="quiz-icon-button" disabled={disabled || !i} aria-label={'Naikkan ' + item.text} onClick={() => move(i, -1)}><ArrowUp size={16} /></button>
        <button type="button" className="quiz-icon-button" disabled={disabled || i === ordered.length - 1} aria-label={'Turunkan ' + item.text} onClick={() => move(i, 1)}><ArrowDown size={16} /></button>
      </li>;
    })}</ol>
    <button type="button" className="quiz-inline-action" disabled={disabled || confirmed} onClick={() => onChange({ type: 'ordering', orderedItemIds: ordered, confirmed: true })}>{confirmed ? 'Urutan dikonfirmasi' : 'Gunakan urutan ini'}</button>
  </div>;
}

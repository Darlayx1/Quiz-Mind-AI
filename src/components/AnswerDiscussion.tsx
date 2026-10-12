import React, { useRef, useState } from 'react';
import { ArrowUpRight, MessageCircle } from 'lucide-react';
import type { Question, QuestionEvaluation, StoredAnswer } from '../types/quiz.js';
import { answerDiscussionLink, buildAnswerDiscussionPrompt, copyDiscussionPrompt } from '../answerDiscussion.js';

export function AnswerDiscussion({ question, answer, evaluation, title, number }: { question: Question; answer?: StoredAnswer; evaluation: QuestionEvaluation; title: string; number: number }) {
  const prompt = buildAnswerDiscussionPrompt(question, answer, evaluation, title);
  const link = answerDiscussionLink(prompt);
  const [message, setMessage] = useState(''), [manualCopy, setManualCopy] = useState(false);
  const text = useRef<HTMLTextAreaElement>(null);
  const copyForChat = async () => {
    if (await copyDiscussionPrompt(prompt, navigator.clipboard)) {
      // Long prompts always expose a selectable copy as well, even if the clipboard reports success.
      setManualCopy(link.requiresPaste);
      setMessage(link.requiresPaste ? 'Prompt lengkap disalin. Tempel di ChatGPT (Ctrl+V atau Tempel), atau salin teks di bawah.' : 'ChatGPT dibuka dengan prompt soal. Jika belum terisi, tempel prompt yang juga sudah disalin.');
    } else {
      setManualCopy(true);
      setMessage('Jika prompt belum terisi di ChatGPT, pilih dan salin teks di bawah, lalu tempel di sana.');
    }
  };
  return <div className="answer-discussion print:hidden">
    <a className="discussion-link" href={link.href} target="_blank" rel="noopener noreferrer" aria-label={`Bedah jawaban soal ${number} di ChatGPT`} onClick={() => { void copyForChat(); }}>
      <MessageCircle size={17} aria-hidden="true" /><span>Bedah jawaban</span><ArrowUpRight size={15} aria-hidden="true" />
    </a>
    <span className="discussion-hint">{link.requiresPaste ? 'Buka ChatGPT · prompt panjang disalin untuk ditempel' : 'Buka ChatGPT dengan soal & jawaban Anda'}</span>
    {message && <p className="discussion-status" role="status">{message}</p>}
    {manualCopy && <div className="discussion-copy-fallback">
      <label htmlFor={'discussion-prompt-' + question.id}>Prompt bedah jawaban</label>
      <textarea ref={text} id={'discussion-prompt-' + question.id} readOnly value={prompt} rows={7} onFocus={e => e.currentTarget.select()} />
      <button type="button" onClick={() => { text.current?.focus(); text.current?.select(); }}>Pilih teks prompt</button>
    </div>}
  </div>;
}

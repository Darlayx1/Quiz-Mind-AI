import React, { useState } from 'react';
import { QuizResult } from '../types/quiz.js';
import { Button } from './Button.js';
import {
  Trophy,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Clock,
  ExternalLink,
  RotateCcw,
  Plus,
  Printer,
  Sparkles,
  Search,
  BookOpen,
} from 'lucide-react';

interface QuizResultsProps {
  result: QuizResult;
  onRetake: () => void;
  onNewQuiz: () => void;
}

export const QuizResults: React.FC<QuizResultsProps> = ({
  result,
  onRetake,
  onNewQuiz,
}) => {
  const [filterMode, setFilterMode] = useState<'all' | 'incorrect' | 'correct'>('all');

  const { quiz, submission, score, correctCount, incorrectCount, unansweredCount, accuracyPercentage } = result;

  // Filter questions based on filterMode
  const filteredQuestions = quiz.questions.filter((q) => {
    const userAnswer = submission.userAnswers[q.id];
    const isCorrect = userAnswer === q.correctAnswerIndex;

    if (filterMode === 'correct') return isCorrect;
    if (filterMode === 'incorrect') return !isCorrect;
    return true;
  });

  const minutesTaken = Math.floor(submission.timeTakenSeconds / 60);
  const secondsTaken = submission.timeTakenSeconds % 60;
  const formattedTimeTaken = `${minutesTaken > 0 ? `${minutesTaken}m ` : ''}${secondsTaken}d`;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="w-full max-w-4xl mx-auto py-8 px-4 sm:px-6">
      {/* Printable Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs mb-8 print:border-none print:shadow-none">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6 pb-6 border-b border-slate-100">
          <div className="text-center sm:text-left">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 mb-1">
              <Trophy className="w-4 h-4" />
              <span>Hasil Evaluasi Kuis</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
              {quiz.title}
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Topik: {quiz.topic} · Tingkat: {quiz.difficulty.toUpperCase()} · Selesai pada {new Date(submission.completedAt).toLocaleDateString('id-ID', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>

          {/* Big Score Callout */}
          <div className="flex flex-col items-center justify-center p-4 bg-slate-50 rounded-2xl border border-slate-200/80 min-w-[140px]">
            <span className="text-xs font-semibold text-slate-500 uppercase">Skor Akhir</span>
            <span className="text-4xl sm:text-5xl font-black text-blue-600 font-mono tabular-nums">
              {score}
            </span>
            <span className="text-xs text-slate-500">dari 100</span>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-6">
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs text-slate-500 block">Jawaban Benar</span>
              <span className="text-base font-bold text-slate-900 font-mono tabular-nums">
                {correctCount}
              </span>
            </div>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-red-100 text-red-700 flex items-center justify-center shrink-0">
              <XCircle className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs text-slate-500 block">Jawaban Salah</span>
              <span className="text-base font-bold text-slate-900 font-mono tabular-nums">
                {incorrectCount}
              </span>
            </div>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
              <Trophy className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs text-slate-500 block">Akurasi</span>
              <span className="text-base font-bold text-slate-900 font-mono tabular-nums">
                {accuracyPercentage}%
              </span>
            </div>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-slate-200 text-slate-700 flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs text-slate-500 block">Waktu Selesai</span>
              <span className="text-base font-bold text-slate-900 font-mono tabular-nums">
                {formattedTimeTaken}
              </span>
            </div>
          </div>
        </div>

        {/* Action Buttons (Hidden when printing) */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-6 mt-6 border-t border-slate-100 print:hidden">
          <div className="flex items-center gap-2">
            <Button
              label="Ulangi Kuis"
              icon={<RotateCcw className="w-4 h-4" />}
              iconPosition="leading"
              variant="outline"
              size="md"
              onClick={onRetake}
            />
            <Button
              label="Cetak / Simpan PDF"
              icon={<Printer className="w-4 h-4" />}
              iconPosition="leading"
              variant="outline"
              size="md"
              onClick={handlePrint}
            />
          </div>

          <Button
            label="Buat Kuis Baru"
            icon={<Plus className="w-4 h-4" />}
            iconPosition="leading"
            variant="primary"
            size="md"
            onClick={onNewQuiz}
          />
        </div>
      </div>

      {/* Review Section */}
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Pembahasan & Sumber Fakta</h2>
            <p className="text-xs text-slate-500">
              Penalaran mendalam model Gemini 3.8 Flash beserta verifikasi Google Grounding
            </p>
          </div>

          {/* Filter Segmented Control */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg print:hidden">
            <button
              onClick={() => setFilterMode('all')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                filterMode === 'all'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Semua ({quiz.questions.length})
            </button>
            <button
              onClick={() => setFilterMode('incorrect')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                filterMode === 'incorrect'
                  ? 'bg-white text-red-700 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Salah ({incorrectCount})
            </button>
            <button
              onClick={() => setFilterMode('correct')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                filterMode === 'correct'
                  ? 'bg-white text-emerald-700 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Benar ({correctCount})
            </button>
          </div>
        </div>

        {/* Questions Loop */}
        <div className="space-y-6">
          {filteredQuestions.map((q, idx) => {
            const originalIndex = quiz.questions.findIndex((item) => item.id === q.id);
            const userAnswer = submission.userAnswers[q.id];
            const isCorrect = userAnswer === q.correctAnswerIndex;
            const isUnanswered = userAnswer === undefined;

            return (
              <div
                key={q.id}
                className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-5"
              >
                {/* Header Question */}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-md bg-slate-100 text-slate-800 text-xs font-bold font-mono flex items-center justify-center">
                      {originalIndex + 1}
                    </span>
                    <span className="text-xs font-medium text-slate-500">
                      {q.topicCategory || quiz.topic}
                    </span>
                  </div>

                  {/* Status Indicator */}
                  <div className="flex items-center gap-1.5 text-xs font-semibold">
                    {isUnanswered ? (
                      <span className="text-slate-500 flex items-center gap-1">
                        <HelpCircle className="w-4 h-4" />
                        <span>Tidak Dijawab</span>
                      </span>
                    ) : isCorrect ? (
                      <span className="text-emerald-600 flex items-center gap-1">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Jawaban Benar</span>
                      </span>
                    ) : (
                      <span className="text-red-600 flex items-center gap-1">
                        <XCircle className="w-4 h-4" />
                        <span>Jawaban Kurang Tepat</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Question Text */}
                <p className="text-base font-semibold text-slate-900 leading-relaxed">
                  {q.question}
                </p>

                {/* Options Review */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {q.options.map((optionText, optIdx) => {
                    const isKeyAnswer = optIdx === q.correctAnswerIndex;
                    const isUserChoice = optIdx === userAnswer;
                    const optLabel = String.fromCharCode(65 + optIdx);

                    let optionBorder = 'border-slate-200 bg-slate-50/50 text-slate-700';
                    if (isKeyAnswer) {
                      optionBorder = 'border-emerald-500 bg-emerald-50/70 text-emerald-950 font-medium ring-1 ring-emerald-400';
                    } else if (isUserChoice && !isCorrect) {
                      optionBorder = 'border-red-400 bg-red-50 text-red-950 line-through';
                    }

                    return (
                      <div
                        key={optIdx}
                        className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${optionBorder}`}
                      >
                        <span
                          className={`w-5 h-5 rounded-md flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5 ${
                            isKeyAnswer
                              ? 'bg-emerald-600 text-white'
                              : isUserChoice && !isCorrect
                              ? 'bg-red-600 text-white'
                              : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {optLabel}
                        </span>
                        <div className="flex-1">
                          <span>{optionText}</span>
                          {isKeyAnswer && (
                            <span className="block text-[10px] text-emerald-700 font-semibold mt-0.5">
                              ✓ Kunci Jawaban
                            </span>
                          )}
                          {isUserChoice && !isCorrect && (
                            <span className="block text-[10px] text-red-600 font-semibold mt-0.5">
                              ✗ Pilihan Anda
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Deep Thinking Explanation */}
                <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-100 text-xs text-slate-800 space-y-1.5">
                  <div className="flex items-center gap-1.5 font-bold text-blue-900">
                    <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                    <span>Penalaran Mendalam Gemini 3.8 Flash</span>
                  </div>
                  <p className="leading-relaxed text-slate-700 pl-5">
                    {q.explanation}
                  </p>
                </div>

                {/* Google Search Grounding Sources */}
                {q.groundingSources && q.groundingSources.length > 0 && (
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                      <Search className="w-3.5 h-3.5 text-blue-600" />
                      <span>Sumber Fakta Google Grounding:</span>
                    </div>
                    <div className="flex flex-wrap gap-2 pl-5">
                      {q.groundingSources.map((src, sIdx) => (
                        <a
                          key={sIdx}
                          href={src.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 hover:underline bg-white px-2.5 py-1 rounded-md border border-slate-200 transition-colors"
                        >
                          <span className="max-w-[220px] truncate">{src.title}</span>
                          <ExternalLink className="w-3 h-3 shrink-0" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

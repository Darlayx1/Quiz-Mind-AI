import React, { useState, useEffect } from 'react';
import { Quiz, QuizSubmission } from '../types/quiz.js';
import { Button } from './Button.js';
import { ConfirmModal } from './ConfirmModal.js';
import {
  Clock,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  AlertCircle,
  HelpCircle,
  Send,
} from 'lucide-react';

interface QuizRunnerProps {
  quiz: Quiz;
  onSubmit: (submission: QuizSubmission) => void;
  onQuit: () => void;
}

export const QuizRunner: React.FC<QuizRunnerProps> = ({
  quiz,
  onSubmit,
  onQuit,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<string, number>>({});
  const [bookmarks, setBookmarks] = useState<Set<string>>(new Set());
  const [timeLeftSeconds, setTimeLeftSeconds] = useState(quiz.timeLimitMinutes * 60);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [showQuitConfirm, setShowQuitConfirm] = useState(false);

  // Timer countdown
  useEffect(() => {
    if (timeLeftSeconds <= 0) {
      handleForceSubmit();
      return;
    }

    const timer = setInterval(() => {
      setTimeLeftSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleForceSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeftSeconds]);

  const handleForceSubmit = () => {
    const timeSpent = quiz.timeLimitMinutes * 60 - timeLeftSeconds;
    onSubmit({
      quizId: quiz.id,
      userAnswers,
      bookmarkedQuestions: Array.from(bookmarks),
      completedAt: new Date().toISOString(),
      timeTakenSeconds: Math.max(timeSpent, 1),
    });
  };

  const handleSelectOption = (questionId: string, optionIndex: number) => {
    setUserAnswers((prev) => ({
      ...prev,
      [questionId]: optionIndex,
    }));
  };

  const toggleBookmark = (questionId: string) => {
    setBookmarks((prev) => {
      const next = new Set(prev);
      if (next.has(questionId)) {
        next.delete(questionId);
      } else {
        next.add(questionId);
      }
      return next;
    });
  };

  const currentQuestion = quiz.questions[currentIndex];
  const totalQuestions = quiz.questions.length;
  const answeredCount = Object.keys(userAnswers).length;
  const unansweredCount = totalQuestions - answeredCount;

  // Format MM:SS
  const minutes = Math.floor(timeLeftSeconds / 60);
  const seconds = timeLeftSeconds % 60;
  const formattedTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  const isTimeCritical = timeLeftSeconds <= 60;

  const currentAnswer = userAnswers[currentQuestion.id];
  const isCurrentBookmarked = bookmarks.has(currentQuestion.id);

  return (
    <div className="w-full max-w-5xl mx-auto py-6 px-4 sm:px-6">
      {/* Top Runner Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 mb-6">
        <div>
          <span className="text-xs font-semibold text-blue-600 uppercase tracking-wider block">
            {quiz.topic}
          </span>
          <h2 className="text-lg font-bold text-slate-900">{quiz.title}</h2>
        </div>

        <div className="flex items-center gap-4">
          {/* Timer Display */}
          <div
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-mono tabular-nums ${
              isTimeCritical
                ? 'bg-red-50 text-red-600 border-red-200 animate-pulse font-bold'
                : 'bg-slate-50 text-slate-700 border-slate-200'
            }`}
          >
            <Clock className="w-4 h-4 text-slate-500" />
            <span>Sisa Waktu: {formattedTime}</span>
          </div>

          <button
            onClick={() => setShowQuitConfirm(true)}
            className="text-xs text-slate-500 hover:text-red-600 transition-colors cursor-pointer"
          >
            Keluar
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Main Question Stage (3 Cols) */}
        <div className="lg:col-span-3 space-y-6">
          {/* Question Header Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-6">
              <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
                <span className="font-semibold text-slate-900 text-sm">
                  Soal {currentIndex + 1}
                </span>
                <span>/</span>
                <span>{totalQuestions}</span>
              </div>

              {/* Bookmark Toggle */}
              <button
                type="button"
                onClick={() => toggleBookmark(currentQuestion.id)}
                className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                  isCurrentBookmarked
                    ? 'bg-amber-50 text-amber-700 border border-amber-200'
                    : 'text-slate-500 hover:bg-slate-100'
                }`}
              >
                <Bookmark
                  className={`w-3.5 h-3.5 ${
                    isCurrentBookmarked ? 'fill-amber-500 text-amber-500' : ''
                  }`}
                />
                <span>{isCurrentBookmarked ? 'Ditandai Ragu' : 'Tandai Ragu'}</span>
              </button>
            </div>

            {/* Question Text */}
            <p className="text-base sm:text-lg font-medium text-slate-900 leading-relaxed mb-8">
              {currentQuestion.question}
            </p>

            {/* Options List */}
            <div className="space-y-3">
              {currentQuestion.options.map((optionText, optIndex) => {
                const isSelected = currentAnswer === optIndex;
                const optionLabel = String.fromCharCode(65 + optIndex); // A, B, C, D

                return (
                  <button
                    key={optIndex}
                    type="button"
                    onClick={() => handleSelectOption(currentQuestion.id, optIndex)}
                    className={`w-full text-left p-4 rounded-xl border transition-all flex items-start gap-3.5 cursor-pointer ${
                      isSelected
                        ? 'bg-blue-50/70 border-blue-500 ring-2 ring-blue-100 text-slate-900 shadow-xs'
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50 text-slate-800'
                    }`}
                  >
                    <span
                      className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 mt-0.5 ${
                        isSelected
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {optionLabel}
                    </span>
                    <span className="text-sm leading-relaxed pt-0.5">{optionText}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Navigation Controls */}
          <div className="flex items-center justify-between pt-2">
            <Button
              label="Sebelumnya"
              icon={<ChevronLeft className="w-4 h-4" />}
              iconPosition="leading"
              variant="outline"
              size="md"
              disabled={currentIndex === 0}
              onClick={() => setCurrentIndex((prev) => Math.max(prev - 1, 0))}
            />

            {currentIndex < totalQuestions - 1 ? (
              <Button
                label="Selanjutnya"
                icon={<ChevronRight className="w-4 h-4" />}
                iconPosition="trailing"
                variant="primary"
                size="md"
                onClick={() => setCurrentIndex((prev) => Math.min(prev + 1, totalQuestions - 1))}
              />
            ) : (
              <Button
                label="Kumpulkan Kuis"
                icon={<Send className="w-4 h-4" />}
                iconPosition="trailing"
                variant="primary"
                size="md"
                onClick={() => setShowSubmitConfirm(true)}
              />
            )}
          </div>
        </div>

        {/* Sidebar Question Palette (1 Col) */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs sticky top-20">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4 pb-2 border-b border-slate-100">
              Navigasi Soal
            </h3>

            {/* Matrix of numbers */}
            <div className="grid grid-cols-5 gap-2 mb-6">
              {quiz.questions.map((q, idx) => {
                const isAns = userAnswers[q.id] !== undefined;
                const isMark = bookmarks.has(q.id);
                const isCurr = idx === currentIndex;

                let stateClasses = 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100';
                if (isCurr) {
                  stateClasses = 'border-blue-600 bg-blue-600 text-white font-bold ring-2 ring-blue-100';
                } else if (isMark) {
                  stateClasses = 'border-amber-400 bg-amber-50 text-amber-800 font-semibold';
                } else if (isAns) {
                  stateClasses = 'border-emerald-300 bg-emerald-50 text-emerald-800 font-medium';
                }

                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setCurrentIndex(idx)}
                    className={`h-9 rounded-lg border text-xs font-mono tabular-nums flex items-center justify-center transition-all cursor-pointer relative ${stateClasses}`}
                  >
                    <span>{idx + 1}</span>
                    {isMark && !isCurr && (
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 absolute top-1 right-1" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div className="space-y-2 text-xs text-slate-500 pt-3 border-t border-slate-100">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-sm bg-emerald-50 border border-emerald-300" />
                <span>Terjawab ({answeredCount})</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-sm bg-amber-50 border border-amber-300" />
                <span>Ragu-ragu ({bookmarks.size})</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-sm bg-slate-50 border border-slate-200" />
                <span>Belum Dijawab ({unansweredCount})</span>
              </div>
            </div>

            <div className="pt-5 mt-5 border-t border-slate-100">
              <Button
                label="Kumpulkan Sekarang"
                variant="secondary"
                size="md"
                className="w-full"
                onClick={() => setShowSubmitConfirm(true)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modal Submit */}
      <ConfirmModal
        isOpen={showSubmitConfirm}
        title="Kumpulkan Kuis Ini?"
        message={`Anda telah menjawab ${answeredCount} dari total ${totalQuestions} soal. ${
          unansweredCount > 0
            ? `Masih ada ${unansweredCount} soal yang belum dijawab.`
            : 'Semua soal telah terjawab.'
        } Yakin ingin menyelesaikan dan melihat penilaian?`}
        confirmLabel="Ya, Kumpulkan"
        cancelLabel="Kembali Mengerjakan"
        onConfirm={() => {
          setShowSubmitConfirm(false);
          handleForceSubmit();
        }}
        onCancel={() => setShowSubmitConfirm(false)}
      />

      {/* Confirmation Modal Quit */}
      <ConfirmModal
        isOpen={showQuitConfirm}
        title="Batalkan Pengerjaan Kuis?"
        message="Seluruh progres pengerjaan kuis ini saat ini tidak akan disimpan jika Anda keluar sekarang."
        confirmLabel="Ya, Keluar"
        cancelLabel="Tetap di Sini"
        isDestructive={true}
        onConfirm={() => {
          setShowQuitConfirm(false);
          onQuit();
        }}
        onCancel={() => setShowQuitConfirm(false)}
      />
    </div>
  );
};

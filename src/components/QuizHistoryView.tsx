import { questionLabels,questionType } from '../questionState.js';
import { exportJSON } from '../quizStorage.js';
import React, { useState } from 'react';
import { Quiz, QuizResult } from '../types/quiz.js';
import { Button } from './Button.js';
import { difficultyName } from '../models.js';
import { durationLabel, quizTimerSeconds } from '../quizConfig.js';
import { ConfirmModal } from './ConfirmModal.js';
import {
  History,
  Trash2,
  Play,
  CheckCircle,
  Clock,
  BookOpen,
  ArrowRight,
} from 'lucide-react';

interface SavedHistoryItem {
  quiz: Quiz;
  lastResult?: QuizResult;
  results?: QuizResult[];
  savedAt: string;
}

interface QuizHistoryViewProps {
  historyItems: SavedHistoryItem[];
  onSelectQuiz: (quiz: Quiz) => void;
  onViewResult?: (result: QuizResult) => void;
  onClearHistory: () => void;
  onDeleteItem: (quizId: string) => void;
  onNewQuiz: () => void;
}

export const QuizHistoryView: React.FC<QuizHistoryViewProps> = ({
  historyItems,
  onSelectQuiz,
  onViewResult,
  onClearHistory,
  onDeleteItem,
  onNewQuiz,
}) => {
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  if (historyItems.length === 0) {
    return (
      <div className="w-full max-w-3xl mx-auto py-16 px-4 text-center">
        <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mx-auto mb-4">
          <BookOpen className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">Belum Ada Riwayat Kuis</h2>
        <p className="text-sm text-slate-500 max-w-md mx-auto mb-6">
          Kuis yang Anda buat akan tersimpan pada ruang penyimpanan aktif untuk dipelajari kembali.
        </p>
        <Button
          label="Buat Kuis Pertama Sekarang"
          variant="primary"
          size="md"
          icon={<Play className="w-4 h-4" />}
          iconPosition="leading"
          onClick={onNewQuiz}
        />
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto py-8 px-4 sm:px-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <History className="w-6 h-6 text-blue-600" />
            <span>Riwayat Kuis Tersimpan</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Kuis dan catatan skor pada ruang penyimpanan aktif.
          </p>
        </div>

        <Button
          label="Kosongkan Riwayat"
          variant="outline"
          size="sm"
          icon={<Trash2 className="w-3.5 h-3.5 text-red-500" />}
          iconPosition="leading"
          onClick={() => setShowClearConfirm(true)}
        />
      </div>

      <button type="button" className="topic-chip mb-4" onClick={()=>exportJSON('quizmind-riwayat.json',historyItems)}>Ekspor riwayat & jawaban</button>
      {/* History List */}
      <div className="space-y-4">
        {historyItems.map((item) => {
          const { quiz, lastResult, savedAt, results } = item;
          const formattedDate = new Date(savedAt).toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          });

          return (
            <div
              key={quiz.id}
              className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs hover:border-slate-300 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="space-y-1.5 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="font-semibold text-blue-700">{quiz.topic}</span>
                  <span>·</span>
                  <span>{difficultyName(quiz.difficulty)}</span>
                  <span>·</span>
                  <span>{quiz.questions.length} Soal</span>
                  <span>·</span>
                  <span>{formattedDate}</span>
                </div>

                <h3 className="text-base font-bold text-slate-900 leading-snug">
                  {quiz.title}
                </h3>

                <p className="text-xs text-slate-500 line-clamp-1">{quiz.summary}</p><p className="field-help">{[...new Set(quiz.questions.map(questionType))].map(t=>questionLabels[t]).join(' · ')}</p>{results&&results.length>1&&<select className="field-input" aria-label={'Pilih hasil sesi '+quiz.title} value={lastResult?.submission.attemptId??lastResult?.submission.completedAt} onChange={e=>{const r=results.find(r=>(r.submission.attemptId??r.submission.completedAt)===e.target.value);if(r)onViewResult?.(r);}}>{results.map((r,i)=><option key={r.submission.attemptId??r.submission.completedAt} value={r.submission.attemptId??r.submission.completedAt}>Sesi {i+1} · {new Date(r.submission.completedAt).toLocaleString('id-ID')} · {r.finalScore===null?'Belum final':r.score+'/100'}</option>)}</select>}
                <p className="text-xs text-slate-400 flex items-center gap-1.5 pt-1"><Clock size={12} />{quiz.displayMode === 'sequential' ? 'Sekuensial' : 'Non sekuensial'} · {durationLabel(quizTimerSeconds(quiz))}{quizTimerSeconds(quiz) > 0 ? quiz.displayMode === 'sequential' ? ' / soal' : ' total' : ''}</p>
              </div>

              {/* Score or Action */}
              <div className="flex items-center gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 shrink-0">
                {lastResult && (
                  <div className="text-right px-3 py-1 bg-blue-50/80 rounded-lg border border-blue-100">
                    <span className="text-[10px] text-slate-500 uppercase block">Skor</span>
                    <span className="text-base font-bold text-blue-700 font-mono tabular-nums">
                      {lastResult.finalScore===null?'Belum final':lastResult.score+'/100'}
                    </span>
                  </div>
                )}

                <Button
                  label={lastResult?'Lihat hasil':'Lanjutkan kuis'}
                  icon={<Play className="w-3.5 h-3.5" />}
                  iconPosition="leading"
                  variant="primary"
                  size="sm"
                  onClick={() => lastResult&&onViewResult?onViewResult(lastResult):onSelectQuiz(quiz)}
                />
                {lastResult&&<button type="button" className="topic-chip" onClick={()=>onSelectQuiz(quiz)}>Lanjutkan kuis</button>}

                <button
                  type="button"
                  onClick={() => setDeletingId(quiz.id)}
                  className="p-2 text-slate-400 hover:text-red-600 rounded-lg hover:bg-slate-50 transition-colors"
                  aria-label="Hapus kuis ini"
                  title="Hapus kuis ini"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Confirmation Clear All */}
      <ConfirmModal
        isOpen={showClearConfirm}
        title="Kosongkan Semua Riwayat?"
        message="Seluruh kuis dan skor pada ruang aktif akan dihapus. Ruang lokal dan akun lain tidak terpengaruh. Tindakan ini tidak dapat dibatalkan."
        confirmLabel="Ya, Kosongkan"
        cancelLabel="Batal"
        isDestructive={true}
        onConfirm={() => {
          setShowClearConfirm(false);
          onClearHistory();
        }}
        onCancel={() => setShowClearConfirm(false)}
      />

      {/* Confirmation Delete Single */}
      <ConfirmModal
        isOpen={Boolean(deletingId)}
        title="Hapus Kuis Ini?"
        message="Kuis dan rekap skor terkait akan dihapus dari ruang penyimpanan aktif."
        confirmLabel="Hapus"
        cancelLabel="Batal"
        isDestructive={true}
        onConfirm={() => {
          if (deletingId) {
            onDeleteItem(deletingId);
            setDeletingId(null);
          }
        }}
        onCancel={() => setDeletingId(null)}
      />
    </div>
  );
};

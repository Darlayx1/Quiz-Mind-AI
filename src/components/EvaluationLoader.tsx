import React, { useEffect, useState } from 'react';
import { CheckSquare, Hash, Sparkles, FileText, Bookmark } from 'lucide-react';
import type { QuizResult } from '../types/quiz.js';
import { modelName } from '../models.js';
import { ProcessingLayout, ContextBadge } from './ProcessingLayout.js';
import { EvaluationIllustration } from './ProcessingIllustrations.js';

export interface ActiveEvaluationState {
  targetIds: string[];
  totalTargets: number;
  completedCount: number;
  isReEvaluation: boolean;
  questionNumber?: number;
  savingConfirmed: boolean;
  isSavingCheckpoint?: boolean;
}

export interface EvaluationLoaderProps {
  result: QuizResult;
  evaluationState: ActiveEvaluationState;
  onCancel?: () => void;
  isCancelling?: boolean;
  error?: string;
}

export const EvaluationLoader: React.FC<EvaluationLoaderProps> = ({
  result,
  evaluationState,
  onCancel,
  isCancelling = false,
  error,
}) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const {
    totalTargets,
    completedCount,
    isReEvaluation,
    questionNumber,
    savingConfirmed,
    isSavingCheckpoint,
  } = evaluationState;

  // Build context badges
  const contextBadges: ContextBadge[] = [
    {
      id: 'topic',
      label: result.quiz.topic || result.quiz.title,
      icon: <Hash size={13} />,
    },
  ];

  if (isReEvaluation && questionNumber) {
    contextBadges.push({
      id: 'target',
      label: `Soal ${questionNumber}`,
      icon: <FileText size={13} />,
    });
    contextBadges.push({
      id: 'mode',
      label: 'Penilaian Ulang',
      icon: <Bookmark size={13} />,
    });
  } else {
    contextBadges.push({
      id: 'target',
      label: `${totalTargets} Jawaban Ditelaah`,
      icon: <CheckSquare size={13} />,
    });
    const totalQuizQuestions = result.quiz.questions.length;
    if (totalTargets < totalQuizQuestions) {
      contextBadges.push({
        id: 'mode',
        label: 'Evaluasi Lanjutan',
        icon: <Bookmark size={13} />,
      });
    } else {
      contextBadges.push({
        id: 'mode',
        label: 'Evaluasi Lengkap',
        icon: <Bookmark size={13} />,
      });
    }
  }

  const evalModel = result.evaluationSettings?.model || result.quiz.model;
  if (evalModel) {
    contextBadges.push({
      id: 'model',
      label: modelName(evalModel),
      icon: <Sparkles size={13} />,
    });
  }

  // Determine status message and progress
  let statusMessage = 'Menyiapkan evaluasi jawaban...';
  let progressPercent: number | undefined;
  let progressLabel: string | undefined;

  if (isCancelling) {
    statusMessage = 'Membatalkan evaluasi...';
  } else if (isSavingCheckpoint) {
    statusMessage = 'Menyimpan checkpoint hasil evaluasi...';
  } else if (!savingConfirmed) {
    statusMessage = 'Menyimpan jawaban Anda sebelum evaluasi...';
  } else if (isReEvaluation && questionNumber) {
    if (completedCount > 0) {
      statusMessage = `Menyelesaikan penilaian soal ${questionNumber}...`;
      progressPercent = 100;
      progressLabel = `Soal ${questionNumber} selesai`;
    } else {
      statusMessage = `Menilai ulang jawaban soal ${questionNumber} berdasarkan rubrik...`;
      progressPercent = undefined;
    }
  } else {
    if (completedCount > 0 && totalTargets > 0) {
      statusMessage = `${completedCount} dari ${totalTargets} jawaban selesai diproses.`;
      progressPercent = Math.min(100, Math.round((completedCount / totalTargets) * 100));
      progressLabel = `${completedCount}/${totalTargets} jawaban selesai`;
    } else {
      statusMessage = 'Jawaban Anda telah tersimpan. Menelaah dengan rubrik...';
      progressPercent = totalTargets > 0 ? 0 : undefined;
      progressLabel = `0/${totalTargets} jawaban`;
    }
  }

  return (
    <ProcessingLayout
      eyebrow="MENELAAH JAWABAN"
      title="Menelaah jawaban Anda"
      description="AI sedang menilai jawaban berdasarkan rubrik dan menyiapkan umpan balik."
      illustration={<EvaluationIllustration />}
      contextBadges={contextBadges}
      statusMessage={statusMessage}
      progressPercent={progressPercent}
      progressLabel={progressLabel}
      elapsedSeconds={elapsed}
      longWaitThreshold={20}
      longWaitMessage="Penelaahan masih berlangsung. Waktu proses bergantung pada jumlah dan panjang jawaban yang dinilai."
      onCancel={onCancel}
      cancelLabel="Batalkan evaluasi"
      cancellingLabel="Membatalkan evaluasi..."
      isCancelling={isCancelling}
      footerNote="Jawaban dan hasil yang telah tersimpan tidak akan hilang saat dibatalkan."
      error={error}
    />
  );
};

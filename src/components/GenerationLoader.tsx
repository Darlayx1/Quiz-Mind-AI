import React from 'react';
import { BookOpen, Sparkles, Search, Layers, BarChart2, Hash } from 'lucide-react';
import type { QuizConfig } from '../types/quiz.js';
import { questionLabels } from '../questionState.js';
import { AIModel, modelName, difficultyName } from '../models.js';
import { ProcessingLayout, ContextBadge } from './ProcessingLayout.js';
import { GenerateIllustration } from './ProcessingIllustrations.js';

export interface GenerationLoaderProps {
  config?: QuizConfig;
  topic?: string;
  questionCount?: number;
  completedCount?: number;
  enableGrounding?: boolean;
  model?: AIModel;
  isSaving?: boolean;
  isCancelling?: boolean;
  startedAt?: number;
}

export const GenerationLoader: React.FC<GenerationLoaderProps> = ({
  config,
  topic: rawTopic,
  questionCount: rawQuestionCount,
  completedCount = 0,
  enableGrounding = false,
  model,
  isSaving = false,
  isCancelling = false,
  startedAt,
}) => {

  const topic = config?.topic || rawTopic || 'Kuis Pembelajaran';
  const totalCount = config?.questionCount || rawQuestionCount || 1;

  // Determine question type label
  let typeLabel: string | undefined;
  if (config?.questionType) {
    typeLabel = questionLabels[config.questionType];
  } else if (config?.questionDistribution) {
    const activeTypes = Object.entries(config.questionDistribution).filter(([, count]) => (count ?? 0) > 0);
    if (activeTypes.length > 1) {
      typeLabel = 'Campuran';
    } else if (activeTypes.length === 1) {
      typeLabel = questionLabels[activeTypes[0][0] as keyof typeof questionLabels];
    }
  }

  // Build context badges
  const contextBadges: ContextBadge[] = [
    {
      id: 'topic',
      caption: 'Topik kuis',
      label: topic,
      icon: <Hash size={13} />,
    },
    {
      id: 'count',
      caption: 'Jumlah soal',
      label: `${totalCount} Soal`,
      icon: <Layers size={13} />,
    },
  ];

  if (typeLabel) {
    contextBadges.push({
      id: 'type',
      caption: 'Jenis soal',
      label: typeLabel,
      icon: <BookOpen size={13} />,
    });
  }

  if (config?.difficulty) {
    contextBadges.push({
      id: 'difficulty',
      caption: 'Tingkat kesulitan',
      label: difficultyName(config.difficulty),
      icon: <BarChart2 size={13} />,
    });
  }

  if (enableGrounding) {
    contextBadges.push({
      id: 'grounding',
      caption: 'Referensi',
      label: 'Referensi Web Aktif',
      icon: <Search size={13} />,
    });
  }

  if (model) {
    contextBadges.push({
      id: 'model',
      caption: 'Model AI',
      label: modelName(model),
      icon: <Sparkles size={13} />,
    });
  }

  // Determine status message and progress
  let statusMessage = 'Menunggu respons pembuatan soal...';
  let progressPercent: number | undefined;
  let progressLabel: string | undefined;

  if (isCancelling) {
    statusMessage = 'Membatalkan pembuatan kuis...';
  } else if (isSaving) {
    statusMessage = 'Menyimpan kuis...';
    progressPercent = 100;
    progressLabel = 'Menyimpan ke ruang aktif';
  } else if (completedCount > 0 && totalCount > 0) {
    statusMessage = `${completedCount} dari ${totalCount} soal telah diterima.`;
    progressPercent = Math.min(100, Math.round((completedCount / totalCount) * 100));
    progressLabel = `${completedCount}/${totalCount} soal diterima · menunggu validasi lengkap`;
  }

  return (
    <ProcessingLayout
      eyebrow="MENYUSUN SOAL"
      title="Menyiapkan kuis Anda"
      description="AI sedang menyusun soal dan pembahasan untuk topik yang Anda pilih."
      illustration={<GenerateIllustration />}
      contextBadges={contextBadges}
      statusMessage={statusMessage}
      progressPercent={progressPercent}
      progressLabel={progressLabel}
      startedAt={startedAt}
      longWaitThreshold={20}
      longWaitMessage="Pembuatan kuis masih berlangsung. Waktu proses dapat berbeda sesuai jumlah soal dan respons layanan AI."
      isCancelling={isCancelling}
    />
  );
};

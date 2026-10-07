import React, { useEffect, useState } from 'react';
import { Search, Brain, CheckCircle2, Loader2, Sparkles, XCircle } from 'lucide-react';
import { Button } from './Button.js';

interface GenerationLoaderProps {
  topic: string;
  enableGrounding: boolean;
  onCancel?: () => void;
}

const STAGES = [
  {
    id: 1,
    title: 'Analisis Konseptual Materi',
    description: 'Mengurai topik, menentukan taksonomi berpikir, dan menyusun peta soal.',
    icon: Brain,
  },
  {
    id: 2,
    title: 'Google Search Grounding',
    description: 'Menelusuri mesin pencari Google untuk memverifikasi keakuratan fakta aktual dan sumber ilmiah.',
    icon: Search,
  },
  {
    id: 3,
    title: 'Penalaran Mendalam (Deep Thinking)',
    description: 'Menyusun opsi jawaban dengan distractor realistis serta argumen penjelasan logis.',
    icon: Sparkles,
  },
  {
    id: 4,
    title: 'Validasi & Integrasi Soal',
    description: 'Menyematkan kutipan fakta web Google dan mengunci struktur penilaian.',
    icon: CheckCircle2,
  },
];

const TIPS = [
  'Model Gemini 3.8 Flash memanfaatkan penalaran multi-langkah untuk meminimalisir kesalahan konseptual.',
  'Google Search Grounding memvalidasi tanggal, rumus, dan terminologi agar kunci jawaban 100% akurat.',
  'Distractor (pilihan salah) dirancang untuk mengidentifikasi miskonsepsi umum dalam materi.',
  'Pembahasan mendalam akan menyertakan tautan sumber web yang dapat Anda telusuri langsung.',
];

export const GenerationLoader: React.FC<GenerationLoaderProps> = ({
  topic,
  enableGrounding,
  onCancel,
}) => {
  const [currentStageIndex, setCurrentStageIndex] = useState(0);
  const [tipIndex, setTipIndex] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const timerInterval = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);

    const stageInterval = setInterval(() => {
      setCurrentStageIndex((prev) => {
        if (prev < STAGES.length - 1) return prev + 1;
        return prev;
      });
    }, 2500);

    const tipInterval = setInterval(() => {
      setTipIndex((prev) => (prev + 1) % TIPS.length);
    }, 4000);

    return () => {
      clearInterval(timerInterval);
      clearInterval(stageInterval);
      clearInterval(tipInterval);
    };
  }, []);

  return (
    <div className="w-full max-w-2xl mx-auto py-10 px-4 flex flex-col items-center text-center">
      <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 mb-6 relative">
        <Loader2 className="w-7 h-7 animate-spin" />
        <div className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 rounded-full animate-ping" />
      </div>

      <h2 className="text-2xl font-bold tracking-tight text-slate-900 mb-2">
        Memproses Kuis Berkualitas Tinggi
      </h2>
      <p className="text-slate-600 text-sm max-w-md mx-auto mb-6">
        Model Gemini sedang memproses materi{' '}
        <span className="font-semibold text-slate-800">"{topic}"</span> dengan penalaran mendalam.
      </p>

      {/* Progress Stages Bar */}
      <div className="w-full bg-white rounded-xl border border-slate-200 p-6 text-left shadow-xs mb-6">
        <div className="flex items-center justify-between text-xs text-slate-500 mb-4 pb-3 border-b border-slate-100">
          <span>Proses Penalaran AI</span>
          <span className="font-mono tabular-nums">Waktu Berjalan: {elapsedSeconds} detik</span>
        </div>

        <div className="space-y-4">
          {STAGES.map((stage, idx) => {
            const Icon = stage.icon;
            const isDone = idx < currentStageIndex;
            const isCurrent = idx === currentStageIndex;

            return (
              <div
                key={stage.id}
                className={`flex items-start gap-3.5 transition-opacity duration-300 ${
                  isCurrent ? 'opacity-100' : isDone ? 'opacity-80' : 'opacity-40'
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                    isDone
                      ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                      : isCurrent
                      ? 'bg-blue-600 text-white animate-pulse'
                      : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {isDone ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : (
                    <Icon className="w-4 h-4" />
                  )}
                </div>
                <div>
                  <h4
                    className={`text-sm font-semibold ${
                      isCurrent ? 'text-blue-600' : isDone ? 'text-slate-900' : 'text-slate-500'
                    }`}
                  >
                    {stage.title}
                  </h4>
                  <p className="text-xs text-slate-500 leading-relaxed mt-0.5">
                    {stage.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Did You Know Tips */}
      <div className="w-full max-w-lg bg-slate-50 rounded-lg p-4 border border-slate-200/80 text-left mb-6">
        <span className="text-xs font-semibold text-slate-700 block mb-1">
          Tahukah Anda?
        </span>
        <p className="text-xs text-slate-600 leading-relaxed transition-all duration-300">
          {TIPS[tipIndex]}
        </p>
      </div>

      {/* Cancel Button */}
      {onCancel && (
        <div className="flex flex-col items-center gap-2">
          <Button
            label="Batalkan Pembuatan Kuis"
            icon={<XCircle className="w-4 h-4 text-slate-500" />}
            iconPosition="leading"
            variant="outline"
            size="sm"
            onClick={onCancel}
          />
          {elapsedSeconds > 15 && (
            <span className="text-xs text-amber-600">
              Proses memerlukan waktu lebih lama dari perkiraan. Anda dapat membatalkan atau tetap menunggu.
            </span>
          )}
        </div>
      )}
    </div>
  );
};

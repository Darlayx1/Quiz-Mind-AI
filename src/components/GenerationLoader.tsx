import React, { useEffect, useState } from "react";
import { Loader2, Sparkles, Search, BookOpen } from "lucide-react";
import { AIModel, modelName } from "../models.js";
interface GenerationLoaderProps {
  topic: string;
  enableGrounding: boolean;
  model: AIModel;
}
export const GenerationLoader: React.FC<GenerationLoaderProps> = ({
  topic,
  enableGrounding,
  model,
}) => {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="page-shell max-w-2xl text-center py-16">
      <section className="surface section-pad">
        <div className="icon-tile mx-auto mb-6 w-16 h-16">
          <Loader2 size={28} className="animate-spin" />
        </div>
        <div role="status">
          <div className="eyebrow justify-center">MENYUSUN KUIS ANDA</div>
          <h1 className="text-2xl font-bold mt-3 mb-3">
            Menyiapkan sesi belajar Anda
          </h1>
          <p className="text-sm text-slate-500 leading-relaxed">
            <strong className="text-slate-700">{modelName(model)}</strong>{" "}
            sedang membuat soal untuk
            <br />
            <span className="text-indigo-600 font-semibold">{topic}</span>.
          </p>
        </div>
        <div className="flex justify-center flex-wrap gap-3 mt-7 text-xs text-slate-500">
          <span className="soft-badge flex gap-2 items-center">
            <Sparkles size={14} /> Soal & pilihan jawaban
          </span>
          {enableGrounding && (
            <span className="soft-badge flex gap-2 items-center">
              <Search size={14} /> Referensi web diminta
            </span>
          )}
          <span className="soft-badge flex gap-2 items-center">
            <BookOpen size={14} /> Pembahasan
          </span>
        </div>
        <p className="text-xs text-slate-400 mt-8 tabular-nums">
          {elapsed} detik berlalu · Menunggu respons AI
        </p>
        {elapsed >= 20 && (
          <p className="text-xs text-slate-500 mt-3 leading-relaxed">
            Pembuatan kuis dapat memerlukan waktu lebih lama sesuai jumlah soal
            dan ketersediaan model.
          </p>
        )}
      </section>
    </div>
  );
};

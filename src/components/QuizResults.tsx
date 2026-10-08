import React, { useState } from "react";
import { QuizResult } from "../types/quiz.js";
import { modelName, difficultyName, providerName } from "../models.js";
import { durationLabel, quizTimerSeconds } from "../quizConfig.js";
import { Button } from "./Button.js";
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
  BookOpen,
  ArrowUpRight,
  Search,
} from "lucide-react";
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
  const [filter, setFilter] = useState<
    "all" | "incorrect" | "correct" | "unanswered"
  >("all");
  const {
    quiz,
    submission,
    score,
    correctCount,
    incorrectCount,
    unansweredCount,
  } = result;
  const questions = quiz.questions.filter((q) => {
    const answer = submission.userAnswers[q.id];
    return (
      filter === "all" ||
      (filter === "correct"
        ? answer === q.correctAnswerIndex
        : filter === "unanswered"
          ? answer === undefined
          : answer !== undefined && answer !== q.correctAnswerIndex)
    );
  });
  const headline =
    score >= 90
      ? "Pemahaman yang luar biasa."
      : score >= 70
        ? "Langkah belajar yang bagus."
        : "Setiap latihan membawa kemajuan.";
  const time = `${Math.floor(submission.timeTakenSeconds / 60)}m ${submission.timeTakenSeconds % 60}d`;
  return (
    <div className="page-shell results-page">
      <div className="page-heading">
        <div className="eyebrow">
          <Trophy size={15} /> HASIL SESI BELAJAR
        </div>
        <h1>{headline}</h1>
        <p>Kuis selesai. Saatnya melihat kemajuan dan menemukan hal baru.</p>
      </div>
      <section className="surface result-overview">
        <div className="result-intro">
          <div className="flex flex-wrap gap-2 mb-4">
            <span className="soft-badge">
              {difficultyName(quiz.difficulty)}
            </span>
            <span className="soft-badge">{quiz.questions.length} soal</span>
            <span className="soft-badge">{quiz.displayMode === 'sequential' ? 'Sekuensial' : 'Non sekuensial'}</span>
            <span className="soft-badge">{durationLabel(quizTimerSeconds(quiz))}{quizTimerSeconds(quiz) > 0 ? quiz.displayMode === 'sequential' ? ' / soal' : ' total' : ''}</span>
          </div>
          <h2>{quiz.title}</h2>
          <p className="text-sm text-slate-500 mt-2">
            {new Date(submission.completedAt).toLocaleString("id-ID", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </p>
          <div className="result-analysis">
            <Sparkles size={19} />
            <p>{result.evaluationAnalysis}</p>
          </div>
        </div>
        <div className="score-block">
          <div
            className="score-ring"
            style={
              { "--score-angle": `${score * 3.6}deg` } as React.CSSProperties
            }
          >
            <div>
              <strong>{score}</strong>
              <span>dari 100 poin</span>
            </div>
          </div>
          <span className="text-xs text-slate-500 mt-3">
            Skor pemahaman Anda
          </span>
        </div>
        <div className="result-metrics">
          {[
            {
              icon: CheckCircle2,
              label: "Jawaban benar",
              value: correctCount,
              color: "emerald",
            },
            {
              icon: XCircle,
              label: "Jawaban salah",
              value: incorrectCount,
              color: "rose",
            },
            {
              icon: HelpCircle,
              label: "Belum dijawab",
              value: unansweredCount,
              color: "slate",
            },
            {
              icon: Clock,
              label: "Waktu pengerjaan",
              value: time,
              color: "indigo",
            },
          ].map((m) => (
            <div className="result-metric" key={m.label}>
              <span className={`metric-icon ${m.color}`}>
                <m.icon size={19} />
              </span>
              <div>
                <span>{m.label}</span>
                <strong>{m.value}</strong>
              </div>
            </div>
          ))}
        </div>
        <div className="result-footer">
          <div className="text-xs text-slate-500 flex flex-col gap-1">
            <span className="flex items-center gap-1.5">
              <Sparkles size={14} /> {quiz.provider ? providerName(quiz.provider) + ' · ' : ''}{modelName(quiz.model)}
            </span>
            {quiz.requestedProvider && quiz.provider !== quiz.requestedProvider && <span>Penyedia cadangan digunakan. Pilihan awal: {providerName(quiz.requestedProvider)}.</span>}
            {quiz.requestedModel && quiz.model !== quiz.requestedModel && (
              <span>
                Model cadangan digunakan. Pilihan awal:{" "}
                {modelName(quiz.requestedModel)}.
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <Search size={14} />
              {quiz.usedGrounding === true
                ? quiz.provider === 'groq' ? 'Menggunakan pencarian web Groq' : 'Menggunakan pencarian Google'
                : quiz.usedGrounding === false
                  ? "Dibuat tanpa pencarian web; periksa referensi secara mandiri."
                  : "Referensi tersedia pada pembahasan"}
            </span>
          </div>
          <div className="result-actions print:hidden">
            <Button
              label="Cetak"
              icon={<Printer size={16} />}
              iconPosition="leading"
              variant="ghost"
              onClick={() => window.print()}
            />
            <Button
              label="Ulangi kuis"
              icon={<RotateCcw size={16} />}
              iconPosition="leading"
              variant="outline"
              onClick={onRetake}
            />
            <Button
              label="Kuis baru"
              icon={<Plus size={16} />}
              iconPosition="leading"
              onClick={onNewQuiz}
            />
          </div>
        </div>
      </section>
      <section className="review-section">
        <div className="review-heading">
          <div>
            <div className="eyebrow">
              <BookOpen size={15} /> BELAJAR DARI JAWABAN
            </div>
            <h2>Pembahasan soal</h2>
            <p>Kenali alasan di balik setiap jawaban.</p>
          </div>
          <div
            className="review-filters print:hidden"
            aria-label="Filter pembahasan"
          >
            {[
              { id: "all", label: "Semua", count: quiz.questions.length },
              { id: "incorrect", label: "Salah", count: incorrectCount },
              { id: "correct", label: "Benar", count: correctCount },
              {
                id: "unanswered",
                label: "Belum dijawab",
                count: unansweredCount,
              },
            ].map((f) => (
              <button
                key={f.id}
                aria-pressed={filter === f.id}
                onClick={() => setFilter(f.id as typeof filter)}
              >
                {f.label}
                <span>{f.count}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-4">
          {questions.map((q) => {
            const answer = submission.userAnswers[q.id];
            const correct = answer === q.correctAnswerIndex;
            const empty = answer === undefined;
            const index = quiz.questions.indexOf(q);
            return (
              <article key={q.id} className="surface review-card">
                <div className="flex flex-wrap justify-between items-center gap-3 mb-5">
                  <span className="text-xs font-semibold text-slate-500">
                    SOAL {String(index + 1).padStart(2, "0")}
                    <span className="font-normal ml-3">{q.topicCategory}</span>
                  </span>
                  <span
                    className={`answer-status ${correct ? "correct" : empty ? "empty" : "incorrect"}`}
                  >
                    {correct ? (
                      <CheckCircle2 size={14} />
                    ) : empty ? (
                      <HelpCircle size={14} />
                    ) : (
                      <XCircle size={14} />
                    )}
                    {correct
                      ? "Benar"
                      : empty
                        ? "Belum dijawab"
                        : "Perlu ditinjau"}
                  </span>
                </div>
                <h3 className="text-base sm:text-lg font-semibold text-slate-900 leading-relaxed mb-5">
                  {q.question}
                </h3>
                <div className="grid sm:grid-cols-2 gap-2.5">
                  {q.options.map((option, i) => (
                    <div
                      key={i}
                      className={`review-option ${i === q.correctAnswerIndex ? "correct-option" : i === answer ? "wrong-option" : ""}`}
                    >
                      <span className="option-letter">
                        {String.fromCharCode(65 + i)}
                      </span>
                      <span className="flex-1 min-w-0">
                        {option}
                        {(i === answer || i === q.correctAnswerIndex) && (
                          <small>
                            {i === q.correctAnswerIndex
                              ? "Jawaban benar"
                              : "Jawaban Anda"}
                            {i === answer && i === q.correctAnswerIndex
                              ? " · Pilihan Anda"
                              : ""}
                          </small>
                        )}
                      </span>
                      {i === q.correctAnswerIndex ? (
                        <CheckCircle2 size={17} className="shrink-0" />
                      ) : i === answer ? (
                        <XCircle size={17} className="shrink-0" />
                      ) : null}
                    </div>
                  ))}
                </div>
                <div className="explanation">
                  <div className="flex items-center gap-2 text-indigo-700 font-semibold text-sm mb-2">
                    <BookOpen size={16} /> Mengapa jawaban ini benar?
                  </div>
                  <p>{q.explanation}</p>
                </div>
                {q.groundingSources.length > 0 && (
                  <div className="reference-list">
                    <span>Pelajari lebih lanjut</span>
                    {q.groundingSources
                      .filter((s) => /^https?:\/\//i.test(s.url))
                      .map((s, i) => (
                        <a
                          href={s.url}
                          key={i}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {s.title}
                          <ArrowUpRight size={13} />
                        </a>
                      ))}
                  </div>
                )}
              </article>
            );
          })}
          {questions.length === 0 && (
            <div className="surface p-10 text-center">
              <CheckCircle2
                className="mx-auto text-indigo-500 mb-3"
                size={28}
              />
              <h3 className="font-semibold text-slate-800">
                Tidak ada soal dalam kategori ini
              </h3>
              <p className="text-sm text-slate-500 mt-2">
                Pilih filter lain untuk melanjutkan pembahasan.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

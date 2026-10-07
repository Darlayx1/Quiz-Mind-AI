import React, { useState, useEffect, useRef } from "react";
import { difficultyName, modelName } from "../models.js";
import { quizTimerSeconds, durationLabel } from "../quizConfig.js";
import type { Quiz, QuizSubmission, Question } from "../types/quiz.js";
import { Button } from "./Button.js";
import { ConfirmModal } from "./ConfirmModal.js";
import {
  Clock,
  Bookmark,
  ChevronRight,
  Send,
  Infinity as InfinityIcon,
  LayoutGrid,
  ListOrdered,
  Check,
  ArrowRight,
} from "lucide-react";

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
  const sequential = quiz.displayMode === "sequential";
  const limit = quizTimerSeconds(quiz);
  const unlimited = limit === 0;
  const total = quiz.questions.length;
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<string, number>>({});
  const [bookmarks, setBookmarks] = useState<Set<string>>(new Set());
  const [timeLeft, setTimeLeft] = useState(limit);
  const [notice, setNotice] = useState("");
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [showQuitConfirm, setShowQuitConfirm] = useState(false);
  const submitted = useRef(false);
  const startedAt = useRef(Date.now());
  const deadline = useRef(startedAt.current + limit * 1000);
  const indexRef = useRef(0);
  const answersRef = useRef(userAnswers);
  const bookmarksRef = useRef(bookmarks);
  const submitRef = useRef(onSubmit);
  submitRef.current = onSubmit;
  const questionHeading = useRef<HTMLHeadingElement>(null);

  const finish = (finishedAt = Date.now()) => {
    if (submitted.current) return;
    submitted.current = true;
    submitRef.current({
      quizId: quiz.id,
      userAnswers: answersRef.current,
      bookmarkedQuestions: Array.from(bookmarksRef.current),
      completedAt: new Date().toISOString(),
      timeTakenSeconds: Math.max(
        0,
        Math.round((finishedAt - startedAt.current) / 1000),
      ),
    });
  };

  // Absolute deadlines remain accurate after a background tab or a suspended device.
  const tick = () => {
    if (unlimited || submitted.current) return false;
    const now = Date.now();
    if (now < deadline.current) {
      setTimeLeft(Math.ceil((deadline.current - now) / 1000));
      return false;
    }
    if (!sequential) {
      finish(deadline.current);
      return true;
    }
    const expiredCount =
      Math.floor((now - deadline.current) / (limit * 1000)) + 1;
    const nextIndex = indexRef.current + expiredCount;
    if (nextIndex >= total) {
      finish(deadline.current + (total - 1 - indexRef.current) * limit * 1000);
      return true;
    }
    indexRef.current = nextIndex;
    deadline.current += expiredCount * limit * 1000;
    setCurrentIndex(nextIndex);
    setTimeLeft(Math.max(0, Math.ceil((deadline.current - now) / 1000)));
    setShowSubmitConfirm(false);
    setNotice(
      `Waktu habis. Anda beralih otomatis ke soal ${nextIndex + 1}. Jawaban sebelumnya telah dikunci.`,
    );
    return true;
  };

  useEffect(() => {
    if (unlimited) return;
    const timer = window.setInterval(tick, 250);
    const onVisible = () => {
      if (!document.hidden) tick();
    };
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  useEffect(() => {
    if (sequential && currentIndex > 0) {
      questionHeading.current?.focus({ preventScroll: true });
      document
        .getElementById(`question-${quiz.questions[currentIndex].id}`)
        ?.scrollIntoView({ block: "start", behavior: "instant" });
    }
  }, [currentIndex]);

  const choose = (id: string, answer: number) => {
    if (submitted.current || tick()) return;
    if (sequential && id !== quiz.questions[indexRef.current].id) return;
    answersRef.current = { ...answersRef.current, [id]: answer };
    setUserAnswers(answersRef.current);
  };
  const toggleBookmark = (id: string) => {
    const next = new Set(bookmarksRef.current);
    next.has(id) ? next.delete(id) : next.add(id);
    bookmarksRef.current = next;
    setBookmarks(next);
  };
  const advance = () => {
    if (submitted.current || tick()) return;
    if (indexRef.current >= total - 1) {
      setShowSubmitConfirm(true);
      return;
    }
    indexRef.current += 1;
    setCurrentIndex(indexRef.current);
    deadline.current = Date.now() + limit * 1000;
    setTimeLeft(limit);
    setNotice("");
  };
  const jumpTo = (index: number) => {
    if (sequential) return;
    setCurrentIndex(index);
    document
      .getElementById(`question-${quiz.questions[index].id}`)
      ?.scrollIntoView({ block: "start", behavior: "smooth" });
  };
  const answered = Object.keys(userAnswers).length;
  const unanswered = total - answered;
  const critical =
    !unlimited && timeLeft <= (sequential ? Math.min(15, limit / 4) : 60);
  const clockText = `${String(Math.floor(timeLeft / 60)).padStart(2, "0")}:${String(timeLeft % 60).padStart(2, "0")}`;
  const renderQuestion = (question: Question, index: number) => (
    <article
      key={question.id}
      id={`question-${question.id}`}
      className="surface question-stage section-pad"
    >
      <div className="question-card-heading">
        <span className="question-counter">
          SOAL {String(index + 1).padStart(2, "0")} <span>/ {total}</span>
        </span>
        <button
          type="button"
          onClick={() => toggleBookmark(question.id)}
          aria-pressed={bookmarks.has(question.id)}
          className={`bookmark-button ${bookmarks.has(question.id) ? "is-bookmarked" : ""}`}
        >
          <Bookmark size={15} />
          <span>
            {bookmarks.has(question.id) ? "Ditandai ragu" : "Tandai ragu"}
          </span>
        </button>
      </div>
      {question.topicCategory && (
        <div className="question-category">{question.topicCategory}</div>
      )}
      <h2
        ref={sequential ? questionHeading : undefined}
        tabIndex={-1}
        className="question-title"
      >
        {question.question}
      </h2>
      <fieldset className="question-options">
        <legend className="field-help mb-5">
          Pilih satu jawaban yang paling tepat.
        </legend>
        {question.options.map((option, optionIndex) => (
          <label
            key={optionIndex}
            className={`answer-choice ${userAnswers[question.id] === optionIndex ? "is-selected" : ""}`}
          >
            <input
              type="radio"
              name={`answer-${question.id}`}
              value={optionIndex}
              checked={userAnswers[question.id] === optionIndex}
              onChange={() => choose(question.id, optionIndex)}
            />
            <span className="option-letter">
              {String.fromCharCode(65 + optionIndex)}
            </span>
            <span className="answer-text">{option}</span>
            <span className="answer-check">
              {userAnswers[question.id] === optionIndex && <Check size={16} />}
            </span>
          </label>
        ))}
      </fieldset>
      {!sequential && userAnswers[question.id] !== undefined && (
        <div className="answer-saved">
          <Check size={13} /> Jawaban tercatat · Anda dapat mengubahnya sebelum
          mengumpulkan.
        </div>
      )}
    </article>
  );

  return (
    <div
      className={`page-shell runner-page ${sequential ? "sequential-runner" : "free-runner"}`}
    >
      <div className="runner-heading">
        <div>
          <div className="eyebrow">
            {sequential ? <ListOrdered size={15} /> : <LayoutGrid size={15} />}{" "}
            {sequential ? "SESI SEKUENSIAL" : "SESI NON SEKUENSIAL"}
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 mt-3">
            {quiz.title}
          </h1>
          <p className="text-xs text-slate-500 mt-2">
            {difficultyName(quiz.difficulty)} · {total} soal ·{" "}
            {modelName(quiz.model)}
          </p>
        </div>
        <div className="runner-header-actions">
          <div
            className={`session-timer ${critical ? "is-critical" : ""}`}
            role="timer"
            aria-label={
              unlimited
                ? "Tanpa batas waktu"
                : `${sequential ? "Sisa waktu soal" : "Sisa waktu total"} ${clockText}`
            }
          >
            <span>
              {unlimited ? <InfinityIcon size={17} /> : <Clock size={17} />}
              {unlimited
                ? "Tanpa batas"
                : sequential
                  ? "Waktu soal"
                  : "Waktu total"}
            </span>
            {!unlimited && <strong>{clockText}</strong>}
          </div>
          <button
            onClick={() => setShowQuitConfirm(true)}
            className="exit-session"
          >
            Keluar sesi
          </button>
        </div>
      </div>
      <div className="runner-progress">
        <div>
          <span>Progres pengerjaan</span>
          <strong>
            {answered} dari {total} terjawab
          </strong>
        </div>
        <progress value={answered} max={total} aria-label="Progres jawaban" />
      </div>
      <div className="session-guidance">
        {sequential ? <ListOrdered size={17} /> : <LayoutGrid size={17} />}
        <p>
          {sequential
            ? `Jawab satu soal, lalu lanjut. Jawaban dikunci setelah Anda beralih.${unlimited ? "" : ` Setiap soal memiliki waktu ${durationLabel(limit)}.`}`
            : `Semua soal tersedia di bawah. Jawab dengan urutan bebas dan tinjau sebelum mengumpulkan.${unlimited ? "" : " Timer berlaku untuk seluruh kuis."}`}
        </p>
      </div>
      <div className="session-notice" role="status" aria-live="polite">
        {notice}
      </div>
      <div className="runner-layout">
        <div className="min-w-0 space-y-5">
          {sequential
            ? renderQuestion(quiz.questions[currentIndex], currentIndex)
            : quiz.questions.map(renderQuestion)}
          <div className="question-controls session-controls">
            <span className="field-help">
              {sequential
                ? `Langkah ${currentIndex + 1} dari ${total}`
                : `${unanswered === 0 ? "Semua soal sudah terjawab." : `${unanswered} soal belum dijawab.`}`}
            </span>
            {sequential && currentIndex < total - 1 ? (
              <Button
                label={
                  userAnswers[quiz.questions[currentIndex].id] === undefined
                    ? "Lewati soal"
                    : "Simpan & lanjut"
                }
                icon={<ChevronRight size={17} />}
                iconPosition="trailing"
                onClick={advance}
              />
            ) : (
              <Button
                label="Kumpulkan kuis"
                icon={<Send size={17} />}
                iconPosition="trailing"
                onClick={() => {
                  if (!tick()) setShowSubmitConfirm(true);
                }}
              />
            )}
          </div>
        </div>
        <aside className="runner-sidebar">
          <div className="surface section-pad">
            <div className="sidebar-heading">
              <strong>{sequential ? "Peta progres" : "Navigasi soal"}</strong>
              <span>{total} soal</span>
            </div>
            <div className="question-palette">
              {quiz.questions.map((question, index) => (
                <button
                  key={question.id}
                  type="button"
                  disabled={sequential}
                  onClick={() => jumpTo(index)}
                  aria-label={`Soal ${index + 1}, ${userAnswers[question.id] !== undefined ? "terjawab" : "belum dijawab"}${bookmarks.has(question.id) ? ", ditandai ragu" : ""}${sequential && index < currentIndex ? ", dikunci" : ""}`}
                  aria-current={index === currentIndex ? "step" : undefined}
                  className={`palette-item ${userAnswers[question.id] !== undefined ? "answered" : ""} ${bookmarks.has(question.id) ? "bookmarked" : ""} ${index === currentIndex ? "current" : ""}`}
                >
                  {index + 1}
                </button>
              ))}
            </div>
            <div className="palette-legend">
              <span>
                <i className="legend-answered" />
                Terjawab <strong>{answered}</strong>
              </span>
              <span>
                <i className="legend-bookmarked" />
                Ragu-ragu <strong>{bookmarks.size}</strong>
              </span>
              <span>
                <i />
                Belum dijawab <strong>{unanswered}</strong>
              </span>
            </div>
            {sequential && (
              <p className="field-help mt-4">
                Peta ini menunjukkan progres. Soal dikerjakan berurutan dan
                tidak dapat dikunjungi kembali.
              </p>
            )}
            <div className="sidebar-submit">
              <Button
                label="Selesaikan sesi"
                variant="secondary"
                className="w-full"
                icon={<ArrowRight size={16} />}
                iconPosition="trailing"
                onClick={() => {
                  if (!tick()) setShowSubmitConfirm(true);
                }}
              />
            </div>
          </div>
        </aside>
      </div>
      <ConfirmModal
        isOpen={showSubmitConfirm}
        title="Selesaikan sesi belajar?"
        message={`Anda telah menjawab ${answered} dari ${total} soal. ${unanswered > 0 ? `${unanswered} soal belum dijawab dan akan dihitung tanpa jawaban.` : "Semua soal sudah terjawab."} Kumpulkan untuk melihat hasil dan pembahasan.`}
        confirmLabel="Kumpulkan & lihat hasil"
        cancelLabel="Lanjut mengerjakan"
        onConfirm={() => {
          setShowSubmitConfirm(false);
          if (!tick()) finish();
        }}
        onCancel={() => setShowSubmitConfirm(false)}
      />
      <ConfirmModal
        isOpen={showQuitConfirm}
        title="Keluar dari sesi?"
        message="Progres jawaban sesi ini akan hilang. Kuis tetap tersedia di riwayat untuk dikerjakan ulang."
        confirmLabel="Keluar sesi"
        cancelLabel="Lanjut mengerjakan"
        isDestructive
        onConfirm={() => {
          submitted.current = true;
          setShowQuitConfirm(false);
          onQuit();
        }}
        onCancel={() => setShowQuitConfirm(false)}
      />
    </div>
  );
};

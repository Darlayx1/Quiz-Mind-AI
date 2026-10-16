import React, { useRef, useState } from 'react';
import { Select } from './Select.js';
import { Button } from './Button.js';
import { ConfirmModal } from './ConfirmModal.js';
import { AmbientVisual } from './MotionPrimitives.js';
import { useListReflow } from '../ui/motion.js';
import { questionLabels, questionType } from '../questionState.js';
import { exportJSON } from '../quizStorage.js';
import { Quiz, QuizResult } from '../types/quiz.js';
import { difficultyName, modelName } from '../models.js';
import { durationLabel, quizTimerSeconds } from '../quizConfig.js';
import {
  History,
  Trash2,
  Play,
  Check,
  Clock,
  ArrowRight,
  Download,
  Search,
  X,
  Sparkles,
  Layers,
  RotateCcw,
  Award,
  CheckCircle2,
} from 'lucide-react';

export interface SavedHistoryItem {
  quiz: Quiz;
  lastResult?: QuizResult;
  results?: QuizResult[];
  attempts?: QuizResult[];
  savedAt: string;
}

export interface QuizHistoryViewProps {
  historyItems: SavedHistoryItem[];
  onSelectQuiz: (quiz: Quiz) => void;
  onViewResult?: (result: QuizResult) => void;
  onRetakeQuiz?: (quiz: Quiz) => void;
  onClearHistory: () => void;
  onDeleteItem: (quizId: string) => void;
  onNewQuiz: () => void;
}

type HistoryFilter = 'all' | 'completed' | 'unstarted';
type HistorySort = 'newest' | 'score' | 'title' | 'questions';

function HistoryEmptyVisual() {
  return (
    <AmbientVisual className="history-visual">
      <div className="history-pedestal" />
      <div className="history-shadow" />
      <div className="history-scene">
        <div className="history-orbit">
          <span />
        </div>
        <div className="history-card-3d history-card-3d-back history-card-3d-far">
          <span />
          <span />
          <span />
        </div>
        <div className="history-card-3d history-card-3d-back history-card-3d-near">
          <span />
          <span />
          <span />
        </div>
        <div className="history-card-3d history-card-3d-main">
          <div className="history-card-3d-face">
            <History size={28} strokeWidth={1.6} />
            <span className="history-card-3d-title" />
            <span className="history-card-3d-line" />
            {[0, 1, 2].map((row) => (
              <div className="history-card-3d-check" key={row}>
                <span>{row < 2 && <Check size={11} strokeWidth={3} />}</span>
                <i />
              </div>
            ))}
            <span className="history-card-3d-seal">
              <Sparkles size={16} strokeWidth={2.2} />
            </span>
          </div>
        </div>
      </div>
    </AmbientVisual>
  );
}

function getEffectiveScore(result?: QuizResult): number | null {
  if (!result) return null;
  if (result.finalScore === null) return null;
  const val = result.finalScore ?? result.score;
  return Number.isFinite(val) ? Math.round(val * 10) / 10 : null;
}

export const QuizHistoryView: React.FC<QuizHistoryViewProps> = ({
  historyItems,
  onSelectQuiz,
  onViewResult,
  onRetakeQuiz,
  onClearHistory,
  onDeleteItem,
  onNewQuiz,
}) => {
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<HistorySort>('newest');
  const historyList = useRef<HTMLDivElement>(null);

  const totalQuizzes = historyItems.length;
  const totalQuestions = historyItems.reduce((sum, item) => sum + item.quiz.questions.length, 0);
  const completedItems = historyItems.filter((item) => Boolean(item.lastResult));
  const completedCount = completedItems.length;
  const unstartedCount = totalQuizzes - completedCount;

  const totalAttempts = historyItems.reduce((sum, item) => {
    const sessions = item.attempts?.length ? item.attempts : item.results ?? (item.lastResult ? [item.lastResult] : []);
    return sum + sessions.length;
  }, 0);

  const finalizedScores = completedItems
    .map((item) => getEffectiveScore(item.lastResult))
    .filter((score): score is number => score !== null);

  const avgScore =
    finalizedScores.length > 0
      ? Math.round((finalizedScores.reduce((sum, s) => sum + s, 0) / finalizedScores.length) * 10) / 10
      : null;

  const activeFilter: HistoryFilter =
    (filter === 'completed' && completedCount === 0) || (filter === 'unstarted' && unstartedCount === 0)
      ? 'all'
      : filter;

  const query = search.trim().toLowerCase();

  const visibleItems = historyItems
    .filter((item) => {
      if (activeFilter === 'completed' && !item.lastResult) return false;
      if (activeFilter === 'unstarted' && item.lastResult) return false;
      if (!query) return true;
      const typeNames = [...new Set(item.quiz.questions.map(questionType))]
        .map((t) => questionLabels[t])
        .join(' ');
      const haystack = `${item.quiz.title} ${item.quiz.topic} ${item.quiz.summary || ''} ${difficultyName(item.quiz.difficulty)} ${typeNames}`.toLowerCase();
      return haystack.includes(query);
    })
    .slice()
    .sort((a, b) => {
      if (sortBy === 'score') {
        const sA = getEffectiveScore(a.lastResult) ?? -1;
        const sB = getEffectiveScore(b.lastResult) ?? -1;
        if (sB !== sA) return sB - sA;
      } else if (sortBy === 'title') {
        return a.quiz.title.localeCompare(b.quiz.title, 'id');
      } else if (sortBy === 'questions') {
        if (b.quiz.questions.length !== a.quiz.questions.length) {
          return b.quiz.questions.length - a.quiz.questions.length;
        }
      }
      return (b.savedAt || '').localeCompare(a.savedAt || '');
    });

  useListReflow(
    historyList,
    `${activeFilter}:${sortBy}:${ visibleItems.map((item) => item.quiz.id).join('|') }`
  );

  if (historyItems.length === 0) {
    return (
      <section className="page-shell history-empty" aria-labelledby="history-empty-title">
        <HistoryEmptyVisual />
        <p className="history-eyebrow">ARSIP &amp; REKAP BELAJAR</p>
        <h1 id="history-empty-title">Belum Ada Riwayat Kuis</h1>
        <p className="history-empty-description">
          Setiap kuis yang Anda rancang dan selesaikan akan tersimpan secara otomatis pada ruang aktif ini untuk dipelajari kembali kapan saja.
        </p>
        <Button
          label="Buat Kuis Pertama Sekarang"
          variant="primary"
          size="md"
          className="history-empty-cta"
          icon={<Play className="w-4 h-4" />}
          iconPosition="leading"
          onClick={onNewQuiz}
        />
      </section>
    );
  }

  const filterOptions: { id: HistoryFilter; label: string; count: number }[] = [
    { id: 'all', label: 'Semua kuis', count: totalQuizzes },
    { id: 'completed', label: 'Selesai', count: completedCount },
    { id: 'unstarted', label: 'Belum dikerjakan', count: unstartedCount },
  ];

  return (
    <div className="page-shell history-page">
      {/* Editorial Hero Header */}
      <header className="history-header">
        <div className="history-header-copy">
          <p className="history-eyebrow">ARSIP &amp; REKAP BELAJAR</p>
          <h1>Riwayat Kuis Tersimpan</h1>
          <p className="history-subtitle">
            Kuis, progres pengerjaan, dan rekap evaluasi pada ruang penyimpanan aktif Anda.
          </p>
        </div>

        <div className="history-header-actions">
          <button
            type="button"
            className="history-utility-btn"
            onClick={() => exportJSON('quizmind-riwayat.json', historyItems)}
          >
            <Download size={15} aria-hidden="true" />
            <span>Ekspor riwayat &amp; jawaban</span>
          </button>

          <Button
            label="Kosongkan Riwayat"
            variant="outline"
            size="sm"
            className="history-clear-btn"
            icon={<Trash2 className="w-3.5 h-3.5" />}
            iconPosition="leading"
            onClick={() => setShowClearConfirm(true)}
          />
        </div>
      </header>

      {/* Systematic Overview & Telemetry Strip */}
      <section className="history-overview" aria-label="Ringkasan arsip kuis">
        <div className="history-metric-card">
          <div className="history-metric-top">
            <span className="history-metric-label">Koleksi Tersimpan</span>
            <span className="history-metric-icon" aria-hidden="true">
              <Layers size={16} />
            </span>
          </div>
          <p className="history-metric-value">
            <strong>{totalQuizzes}</strong>
            <span>kuis</span>
          </p>
          <p className="history-metric-foot">
            {totalQuestions} butir soal terarsip di ruang ini
          </p>
        </div>

        <div className="history-metric-card">
          <div className="history-metric-top">
            <span className="history-metric-label">Status Pengerjaan</span>
            <span className="history-metric-icon is-emerald" aria-hidden="true">
              <CheckCircle2 size={16} />
            </span>
          </div>
          <p className="history-metric-value">
            <strong>{completedCount}</strong>
            <span>/ {totalQuizzes} selesai</span>
          </p>
          <p className="history-metric-foot">
            {totalAttempts > 0 ? `${totalAttempts} sesi pengerjaan tercatat` : 'Belum ada sesi yang diselesaikan'}
            {unstartedCount > 0 ? ` · ${unstartedCount} siap dimulai` : ''}
          </p>
        </div>

        <div className="history-metric-card is-highlight">
          <div className="history-metric-top">
            <span className="history-metric-label">Rata-rata Skor Final</span>
            <span className="history-metric-icon is-accent" aria-hidden="true">
              <Award size={16} />
            </span>
          </div>
          <p className="history-metric-value">
            <strong>{avgScore !== null ? avgScore : '—'}</strong>
            {avgScore !== null && <span>/ 100</span>}
          </p>
          {avgScore !== null ? (
            <div className="history-overview-track" aria-hidden="true">
              <span style={{ width: `${Math.max(0, Math.min(100, avgScore))}%` }} />
            </div>
          ) : (
            <p className="history-metric-foot">
              Selesaikan kuis untuk melihat rata-rata capaian
            </p>
          )}
        </div>
      </section>

      {/* Dynamic Filter, Search & Sort Toolbar */}
      <section className="history-toolbar" aria-label="Filter dan pencarian riwayat">
        <div className="history-filters" role="group" aria-label="Filter status kuis">
          {filterOptions.map(
            (opt) =>
              (opt.id === 'all' || opt.count > 0) && (
                <button
                  key={opt.id}
                  type="button"
                  aria-pressed={activeFilter === opt.id}
                  onClick={() => setFilter(opt.id)}
                >
                  <span>{opt.label}</span>
                  <small>{opt.count}</small>
                </button>
              )
          )}
        </div>

        <div className="history-controls">
          <label className="history-search">
            <Search size={15} aria-hidden="true" />
            <input
              type="search"
              aria-label="Cari riwayat kuis"
              placeholder="Cari judul, topik, atau tipe soal…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                className="history-search-clear"
                aria-label="Bersihkan pencarian"
                onClick={() => setSearch('')}
              >
                <X size={14} />
              </button>
            )}
          </label>

          <div className="history-sort">
            <Select
              aria-label="Urutkan riwayat kuis"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as HistorySort)}
            >
              <option value="newest">Urutan: Terbaru</option>
              <option value="score">Urutan: Skor tertinggi</option>
              <option value="title">Urutan: Judul A–Z</option>
              <option value="questions">Urutan: Jumlah soal</option>
            </Select>
          </div>
        </div>
      </section>

      {/* Filtered Empty State */}
      {visibleItems.length === 0 ? (
        <div className="history-filtered-empty" role="status">
          <p>Tidak ditemukan kuis yang cocok dengan filter atau kata kunci pencarian Anda.</p>
          <button
            type="button"
            className="topic-chip"
            onClick={() => {
              setFilter('all');
              setSearch('');
            }}
          >
            Tampilkan semua kuis
          </button>
        </div>
      ) : (
        /* History Card List */
        <div ref={historyList} className="history-list">
          {visibleItems.map((item, index) => {
            const { quiz, lastResult, savedAt } = item;
            const sessionList = item.attempts?.length
              ? item.attempts
              : item.results ?? [];
            const effectiveScore = getEffectiveScore(lastResult);
            const isPendingScore = Boolean(lastResult && lastResult.finalScore === null);
            const timerSeconds = quizTimerSeconds(quiz);
            const timerDescription =
              timerSeconds > 0
                ? `${durationLabel(timerSeconds)}${quiz.displayMode === 'sequential' ? ' / soal' : ' total'}`
                : durationLabel(0);
            const uniqueTypes = [...new Set(quiz.questions.map(questionType))]
              .map((t) => questionLabels[t])
              .join(' · ');

            const formattedDate = savedAt
              ? new Date(savedAt).toLocaleDateString('id-ID', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : 'Baru tersimpan';

            const scoreTone = !lastResult
              ? 'unstarted'
              : isPendingScore
                ? 'pending'
                : (effectiveScore ?? 0) >= 80
                  ? 'high'
                  : (effectiveScore ?? 0) >= 60
                    ? 'mid'
                    : 'low';

            return (
              <article
                key={quiz.id}
                data-motion-key={quiz.id}
                style={{ '--card-delay': `${Math.min(index, 6) * 40}ms` } as React.CSSProperties}
                className={`history-card status-${scoreTone}`}
              >
                <div className="history-card-body">
                  <div className="history-card-meta">
                    <span className="history-topic-badge">{quiz.topic}</span>
                    <span className="history-difficulty-badge">
                      {difficultyName(quiz.difficulty)}
                    </span>
                    <time className="history-date" dateTime={savedAt}>
                      {formattedDate}
                    </time>
                  </div>

                  <h3 className="history-card-title">{quiz.title}</h3>

                  {quiz.summary && (
                    <p className="history-card-summary">{quiz.summary}</p>
                  )}

                  <div className="history-specs">
                    <span className="history-spec-chip">
                      <Layers size={12} aria-hidden="true" />
                      {quiz.questions.length} Soal
                    </span>
                    <span className="history-spec-chip">{uniqueTypes}</span>
                    <span className="history-spec-chip">
                      <Clock size={12} aria-hidden="true" />
                      {quiz.displayMode === 'sequential' ? 'Sekuensial' : 'Non sekuensial'} · {timerDescription}
                    </span>
                    {quiz.model && (
                      <span className="history-spec-chip is-model">
                        <Sparkles size={11} aria-hidden="true" />
                        {modelName(quiz.model)}
                      </span>
                    )}
                  </div>

                  {sessionList.length > 1 && (
                    <div className="history-session-picker">
                      <span className="history-session-label">
                        Riwayat pengerjaan ({sessionList.length} sesi):
                      </span>
                      <Select
                        className="field-input"
                        aria-label={'Pilih hasil sesi ' + quiz.title}
                        value={
                          lastResult?.submission.attemptId ??
                          lastResult?.submission.completedAt
                        }
                        onChange={(e) => {
                          const selected = sessionList.find(
                            (r) =>
                              (r.submission.attemptId ??
                                r.submission.completedAt) === e.target.value
                          );
                          if (selected) {
                            if (onViewResult) onViewResult(selected);
                            else onSelectQuiz(quiz);
                          }
                        }}
                      >
                        {sessionList.map((r, i) => (
                          <option
                            key={r.submission.attemptId ?? r.submission.completedAt}
                            value={r.submission.attemptId ?? r.submission.completedAt}
                          >
                            Sesi {i + 1} ·{' '}
                            {new Date(r.submission.completedAt).toLocaleString('id-ID')} ·{' '}
                            {r.finalScore === null ? 'Belum final' : `${r.score}/100`}
                          </option>
                        ))}
                      </Select>
                    </div>
                  )}
                </div>

                {/* Score Showcase & Action Cluster */}
                <div className="history-card-aside">
                  {lastResult ? (
                    <div className={`history-score-panel tone-${scoreTone}`}>
                      <div className="history-score-head">
                        <span className="history-score-caption">
                          {isPendingScore ? 'Evaluasi' : 'Skor Akhir'}
                        </span>
                        {sessionList.length > 1 && (
                          <span className="history-attempt-pill">
                            {sessionList.length}x
                          </span>
                        )}
                      </div>
                      <div className="history-score-readout">
                        {isPendingScore ? (
                          <strong className="is-pending-text">Belum final</strong>
                        ) : (
                          <>
                            <strong>{effectiveScore ?? lastResult.score}</strong>
                            <span>/100</span>
                          </>
                        )}
                      </div>
                      {!isPendingScore && effectiveScore !== null && (
                        <div className="history-score-bar" aria-hidden="true">
                          <span
                            style={{
                              width: `${Math.max(0, Math.min(100, effectiveScore))}%`,
                            }}
                          />
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="history-unstarted-panel">
                      <span className="history-unstarted-dot" aria-hidden="true" />
                      <div>
                        <strong>Belum dikerjakan</strong>
                        <span>Siap dimulai kapan saja</span>
                      </div>
                    </div>
                  )}

                  <div className="history-card-actions">
                    <Button
                      label={lastResult ? 'Lihat hasil' : 'Lanjutkan kuis'}
                      icon={
                        lastResult ? (
                          <ArrowRight className="w-3.5 h-3.5" />
                        ) : (
                          <Play className="w-3.5 h-3.5" />
                        )
                      }
                      iconPosition={lastResult ? 'trailing' : 'leading'}
                      variant="primary"
                      size="sm"
                      className="history-primary-action"
                      onClick={() =>
                        lastResult && onViewResult
                          ? onViewResult(lastResult)
                          : onSelectQuiz(quiz)
                      }
                    />

                    {lastResult && (
                      <button
                        type="button"
                        className="history-retake-btn"
                        onClick={() =>
                          onRetakeQuiz ? onRetakeQuiz(quiz) : onSelectQuiz(quiz)
                        }
                        title="Kerjakan ulang kuis ini dari awal"
                      >
                        <RotateCcw size={14} aria-hidden="true" />
                        <span>Lanjutkan kuis</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setDeletingId(quiz.id)}
                      className="history-delete-btn"
                      aria-label="Hapus kuis ini"
                      title="Hapus kuis ini"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

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

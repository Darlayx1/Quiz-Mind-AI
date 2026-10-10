import React, { ReactNode } from 'react';
import { Loader2, Info } from 'lucide-react';

export interface ContextBadge {
  id?: string;
  label: string;
  icon?: ReactNode;
}

export interface ProcessingLayoutProps {
  eyebrow: string;
  title: string;
  description: string;
  illustration: ReactNode;
  contextBadges?: ContextBadge[];
  statusMessage: string;
  progressPercent?: number; // Only supplied if determinate & valid
  progressLabel?: string;
  elapsedSeconds: number;
  longWaitThreshold?: number;
  longWaitMessage?: string;
  onCancel?: () => void;
  cancelLabel?: string;
  cancellingLabel?: string;
  isCancelling?: boolean;
  cancelDisabled?: boolean;
  footerNote?: string;
  error?: string;
}

export const ProcessingLayout: React.FC<ProcessingLayoutProps> = ({
  eyebrow,
  title,
  description,
  illustration,
  contextBadges = [],
  statusMessage,
  progressPercent,
  progressLabel,
  elapsedSeconds,
  longWaitThreshold = 20,
  longWaitMessage,
  onCancel,
  cancelLabel = 'Batalkan',
  cancellingLabel = 'Membatalkan...',
  isCancelling = false,
  cancelDisabled = false,
  footerNote,
  error,
}) => {
  const isLongWait = elapsedSeconds >= longWaitThreshold && !!longWaitMessage;
  const hasDeterminateProgress = typeof progressPercent === 'number' && Number.isFinite(progressPercent);
  const clampedProgress = hasDeterminateProgress ? Math.max(0, Math.min(100, progressPercent)) : null;

  return (
    <div className="qm-processing-shell py-6 sm:py-8 md:py-12 px-3.5 sm:px-6 text-center animate-fade-in mx-auto">
      <section
        className="surface qm-processing-card w-full p-5 sm:p-8 md:p-10 rounded-2xl relative overflow-hidden"
        role="status"
        aria-busy="true"
        aria-live="polite"
      >
        {/* Subtle decorative background glow */}
        <div
          className="absolute -top-24 left-1/2 -translate-x-1/2 w-64 sm:w-80 h-36 bg-blue-100/40 rounded-full blur-3xl pointer-events-none -z-10"
          aria-hidden="true"
        />

        {/* 1. Eyebrow Context */}
        <div className="qm-eyebrow eyebrow justify-center tracking-wider text-xs font-semibold text-blue-600 mb-4 select-none">
          {eyebrow}
        </div>

        {/* 2. Main Illustration */}
        <div className="mb-6 flex justify-center">
          {illustration}
        </div>

        {/* 3. Title & 4. Description */}
        <div className="space-y-2 mb-6">
          <h1 className="qm-title text-xl sm:text-2xl md:text-[26px] font-bold text-slate-900 tracking-tight leading-snug">
            {title}
          </h1>
          <p className="qm-description text-sm text-slate-600 leading-relaxed max-w-md mx-auto">
            {description}
          </p>
        </div>

        {/* 5. Context Badges */}
        {contextBadges.length > 0 && (
          <div
            className="flex flex-wrap items-center justify-center gap-2 mb-7 select-none"
            aria-label="Ringkasan konteks"
          >
            {contextBadges.map((badge, idx) => (
              <span
                key={badge.id || idx}
                className="soft-badge inline-flex items-center gap-1.5 px-3 py-1 text-xs text-slate-600 bg-slate-100/90 rounded-full border border-slate-200/80 font-medium"
              >
                {badge.icon && <span className="text-slate-500 shrink-0">{badge.icon}</span>}
                <span className="truncate max-w-[200px] sm:max-w-[260px]">{badge.label}</span>
              </span>
            ))}
          </div>
        )}

        {/* 6. Status & Actual Progress Area */}
        <div className="qm-progress-zone bg-slate-50/80 border border-slate-200/80 rounded-xl p-4 sm:p-5 mb-6 max-w-lg mx-auto">
          {/* Progress bar or Indeterminate Activity */}
          {hasDeterminateProgress ? (
            <div className="space-y-2 mb-3">
              <div className="flex justify-between items-center text-xs font-medium text-slate-600 px-0.5">
                <span>{progressLabel || 'Progres'}</span>
                <span className="tabular-nums font-semibold text-blue-600">
                  {Math.round(clampedProgress!)}%
                </span>
              </div>
              <div
                className="w-full bg-slate-200/80 h-2 rounded-full overflow-hidden"
                role="progressbar"
                aria-valuenow={Math.round(clampedProgress!)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={progressLabel || 'Progres aktivitas'}
              >
                <div
                  className="bg-blue-600 h-full rounded-full transition-all duration-400 ease-out"
                  style={{ width: `${clampedProgress}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 text-xs text-blue-600 font-medium mb-2.5">
              <Loader2 size={16} className="animate-spin text-blue-600 shrink-0" />
              <span>Memproses dengan AI</span>
            </div>
          )}

          {/* Current status message */}
          <p className="qm-status-text text-sm font-medium text-slate-800 leading-snug min-h-[1.5rem] flex items-center justify-center">
            {statusMessage}
          </p>
        </div>

        {/* 7. Long Wait Message (if threshold reached) */}
        {isLongWait && (
          <div
            className="flex items-start gap-2.5 bg-amber-50/90 border border-amber-200/80 text-amber-800 text-xs rounded-xl p-3.5 mb-6 max-w-lg mx-auto text-left leading-relaxed animate-fade-in"
            role="note"
          >
            <Info size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <div>{longWaitMessage}</div>
          </div>
        )}

        {/* Error notice if present */}
        {error && (
          <div
            className="bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl p-3.5 mb-6 max-w-lg mx-auto text-left leading-relaxed"
            role="alert"
          >
            {error}
          </div>
        )}

        {/* 8. Secondary Timer Info */}
        <div className="text-xs text-slate-400 tabular-nums mb-5 select-none" aria-label="Waktu berlalu">
          {elapsedSeconds} detik berlalu
        </div>

        {/* 9. Cancel Action */}
        {onCancel && (
          <div className="pt-2 flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={cancelDisabled || isCancelling}
              className="qm-cancel-btn inline-flex items-center justify-center min-h-[44px] px-6 py-2.5 rounded-xl text-xs font-semibold text-slate-600 bg-white border border-slate-300 hover:bg-slate-50 active:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              aria-busy={isCancelling}
            >
              {isCancelling ? (
                <>
                  <Loader2 size={14} className="animate-spin mr-2 text-slate-500" />
                  {cancellingLabel}
                </>
              ) : (
                cancelLabel
              )}
            </button>
            {footerNote && (
              <span className="text-[11px] text-slate-400 leading-tight">
                {footerNote}
              </span>
            )}
          </div>
        )}
      </section>
    </div>
  );
};

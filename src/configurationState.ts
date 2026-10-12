import { composerSources, type ComposerDraft } from './composerDraft.js';
import { activeQuestionTypes, compositionError, effectiveCount, maximumPoints, typeSettingsError } from './questionComposition.js';
import { durationLabel, normalizeQuizConfig } from './quizConfig.js';
import { effectiveLanguageStyle, LANGUAGE_STYLES, languageStyleLabel } from './languageStyles.js';
import { defaultEvaluationSettings } from './evaluationSettings.js';
import { modelInfo } from './models.js';
import type { Preferences } from './workspace/types.js';

// One derived snapshot drives both the summary and the generation payload.
export function configurationState(draft: ComposerDraft) {
  const composition = draft.composition, sequential = draft.displayMode === 'sequential';
  const selectedCount = draft.countChoice === 'custom' ? Number(draft.customCount) : draft.countChoice;
  const count = effectiveCount(composition, selectedCount), types = activeQuestionTypes(composition);
  const timer = Number(sequential ? draft.perQuestionSeconds : draft.totalMinutes);
  const timed = sequential && !draft.unlimited;
  const validTimer = draft.unlimited || (Number.isInteger(timer) && timer >= (sequential ? 15 : 1) && timer <= (sequential ? 600 : 120));
  const customStyle = !!draft.languageStyle.trim() && (draft.languageStyleMode === 'custom' || (draft.languageStyleMode === undefined && !LANGUAGE_STYLES.some(([label]) => label === draft.languageStyle)));
  const preset = LANGUAGE_STYLES.find(([label]) => label === draft.languageStyle) ?? LANGUAGE_STYLES.find(([label]) => label === draft.languageStylePreset) ?? LANGUAGE_STYLES[0];
  const style = customStyle ? draft.languageStyle : preset[0];
  const allocationError = compositionError(composition, selectedCount);
  const settingsError = types.map(type => { const error = typeSettingsError(composition, type, timed); return error ? { type, error } : undefined; }).find(Boolean);
  const error = allocationError || settingsError?.error || (!validTimer ? `Masukkan durasi ${sequential ? '15–600 detik.' : '1–120 menit.'}` : '');
  const errorTarget = allocationError ? 'composition-title' : settingsError ? `${settingsError.error.startsWith('Bobot') ? 'points' : 'time'}-${settingsError.type}` : !validTimer ? 'quiz-duration' : 'language-style';
  const effectiveTimes = types.map(type => timed ? composition.times?.[type] ?? timer : draft.unlimited ? 0 : timer * 60);
  const uniqueTimes = [...new Set(effectiveTimes)];
  const timerLabel = !validTimer || effectiveTimes.some(seconds => !Number.isInteger(seconds) || seconds < 0 || seconds > (sequential ? 600 : 7200)) ? '—' : uniqueTimes.length === 1 ? durationLabel(uniqueTimes[0]) : uniqueTimes.length > 1 ? 'Bervariasi per tipe' : draft.unlimited ? 'Tanpa batas' : durationLabel(sequential ? timer : timer * 60);
  return { selectedCount, count, types, sequential, timer, timed, validTimer, timerLabel, customStyle, style, styleLabel: languageStyleLabel(style, customStyle), allocationError, error, errorTarget, totalPoints: maximumPoints(composition, selectedCount) };
}
export function buildComposerConfig(draft: ComposerDraft, preferences: Preferences) {
  const state = configurationState(draft), sources = composerSources(draft), composition = draft.composition;
  if (sources.error || state.error) throw new Error(sources.error || state.error);
  const activeMap = (map: typeof composition.points) => Object.fromEntries(state.types.filter(type => map[type] !== undefined).map(type => [type, map[type]]));
  const supportsGrounding = modelInfo(preferences.model)?.grounding !== false || preferences.searchProvider === 'parallel';
  return normalizeQuizConfig({ model: preferences.model, topic: sources.topic, studyMaterial: sources.material || undefined,
    difficulty: draft.difficulty, questionCount: state.count, displayMode: draft.displayMode, questionType: composition.type,
    questionDistribution: composition.mode === 'mixed' ? composition.distribution : { [composition.type]: state.count },
    pointsByType: activeMap(composition.points), partialCredit: composition.partialCredit,
    timePerQuestionByType: state.timed ? activeMap(composition.times ?? {}) : undefined,
    evaluationSettings: preferences.evaluation ?? defaultEvaluationSettings,
    timeLimitMinutes: draft.unlimited ? 0 : state.sequential ? (Number.isInteger(Number(draft.totalMinutes)) && Number(draft.totalMinutes) >= 1 && Number(draft.totalMinutes) <= 120 ? Number(draft.totalMinutes) : 15) : Number(draft.totalMinutes),
    timePerQuestionSeconds: state.sequential ? draft.unlimited ? 0 : state.timer : undefined,
    language: draft.language, languageStyle: effectiveLanguageStyle(state.style), additionalInstructions: draft.additionalInstructions.trim() || undefined,
    enableGrounding: preferences.grounding && supportsGrounding });
}

import type { Quiz, QuestionType } from './types/quiz.js';
import { QUESTION_TYPES } from './types/quiz.js';
import { questionLabels, questionType } from './questionState.js';
import { difficultyName } from './models.js';
import { durationLabel, quizTimerSeconds } from './quizConfig.js';

export function preparationSummary(quiz: Quiz): { label: string; value: string }[] {
  const config = quiz.generationConfig ?? quiz;
  const distribution = quiz.generationConfig?.questionDistribution ?? quiz.questions.reduce<Partial<Record<QuestionType, number>>>((counts, question) => {
    const type = questionType(question);
    counts[type] = (counts[type] ?? 0) + 1;
    return counts;
  }, {});
  const types = QUESTION_TYPES.filter(type => (distribution[type] ?? 0) > 0);
  const formatTime = (seconds: number) => seconds > 0 ? durationLabel(seconds) : 'Tanpa batas waktu';
  const sequential = config.displayMode === 'sequential';
  // Match the runner's legacy default and per-type overrides, including explicit zero.
  const defaultSeconds = quizTimerSeconds({ ...config, timeLimitMinutes: config.timeLimitMinutes ?? 0 });
  const times = types.map(type => config.timePerQuestionByType?.[type] ?? defaultSeconds);
  const uniqueTimes = new Set(times);
  const time = !sequential ? formatTime(defaultSeconds) : uniqueTimes.size <= 1
    ? formatTime(times[0] ?? defaultSeconds) + ((times[0] ?? defaultSeconds) > 0 ? ' per soal' : '')
    : types.map((type, index) => `${questionLabels[type]}: ${formatTime(times[index])}${times[index] > 0 ? ' per soal' : ''}`).join(' · ');
  const rows = [
    { label: 'Topik', value: quiz.title || quiz.topic },
    { label: 'Jumlah soal', value: `${quiz.questions.length} soal` },
    { label: 'Jenis soal', value: types.map(type => `${distribution[type]} ${questionLabels[type].toLocaleLowerCase('id-ID')}`).join(' · ') },
    { label: 'Tingkat kesulitan', value: config.difficulty ? difficultyName(config.difficulty) : '' },
    { label: 'Waktu', value: time },
  ];
  return rows.filter(row => !!row.value);
}

import { DEFAULT_MODEL, DIFFICULTIES, isProvider, modelInfo, validModelId, defaultProviderModel, normalizeModelId } from "./models.js";
import type { DifficultyLevel, QuizConfig } from "./types/quiz.js";
import { QUESTION_TYPES, type QuestionType } from './types/quiz.js';
import { normalizeEvaluationSettings } from './evaluationSettings.js';

export class QuizConfigError extends Error {}

// Shared validation keeps server, Worker, and personal-key mode consistent.
export function normalizeQuizConfig(input: unknown): QuizConfig {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new QuizConfigError("Konfigurasi kuis tidak valid.");
  const body = input as Record<string, unknown>;
  if (typeof body.topic !== "string" || !body.topic.trim())
    throw new QuizConfigError("Topik kuis tidak boleh kosong.");
  if (body.provider !== undefined && !isProvider(body.provider)) throw new QuizConfigError('Penyedia AI tidak didukung.');
  const rawModel = body.model ?? (isProvider(body.provider) ? defaultProviderModel(body.provider) : DEFAULT_MODEL);
  const model = typeof rawModel === 'string' ? normalizeModelId(rawModel) : rawModel;
  const known = modelInfo(String(model));
  if (!validModelId(model) || (!known && !isProvider(body.provider))) throw new QuizConfigError('Model AI tidak didukung. Pilih penyedia untuk menggunakan ID model kustom.');
  const provider = body.provider ?? known!.provider;
  if (known && known.provider !== provider) throw new QuizConfigError('Model tidak sesuai dengan penyedia yang dipilih.');
  const difficulty =
    { beginner: "easy", advanced: "hard", expert: "master" }[
      String(body.difficulty)
    ] ??
    body.difficulty ??
    "intermediate";
  if (!DIFFICULTIES.some((level) => level.id === difficulty))
    throw new QuizConfigError("Tingkat kesulitan tidak didukung.");
  const count = Number(body.questionCount ?? 5);
  if (!Number.isInteger(count) || count < 1 || count > 100)
    throw new QuizConfigError(
      "Jumlah soal harus bilangan bulat antara 1 dan 100.",
    );
  const type = body.questionType ?? 'single_choice';
  if (!QUESTION_TYPES.includes(type as QuestionType)) throw new QuizConfigError('Tipe soal tidak didukung.');
  const distribution = body.questionDistribution ?? { [String(type)]: count };
  if (!distribution || typeof distribution !== 'object' || Array.isArray(distribution) || Object.entries(distribution).some(([key,value]) => !QUESTION_TYPES.includes(key as QuestionType) || !Number.isInteger(value) || Number(value)<0) || Object.values(distribution).reduce<number>((sum,value)=>sum+Number(value),0)!==count) throw new QuizConfigError('Jumlah per tipe harus bilangan bulat dan totalnya sesuai jumlah soal.');
  const validateMap = (raw: unknown,min:number,max:number) => {
    if(raw===undefined)return undefined;
    if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.entries(raw).some(([key,value])=>!QUESTION_TYPES.includes(key as QuestionType)||!Number.isInteger(value)||Number(value)<min||Number(value)>max))throw new QuizConfigError('Bobot atau waktu per tipe tidak valid.');
    return raw as Partial<Record<QuestionType,number>>;
  };
  if(body.partialCredit!==undefined&&typeof body.partialCredit!=='boolean')throw new QuizConfigError('Pengaturan kredit parsial tidak valid.');
  let evaluationSettings;
  try { evaluationSettings=normalizeEvaluationSettings(body.evaluationSettings); } catch { throw new QuizConfigError('Pengaturan evaluator tidak valid.'); }
  const displayMode = body.displayMode ?? "non_sequential";
  if (displayMode !== "non_sequential" && displayMode !== "sequential")
    throw new QuizConfigError("Tampilan soal tidak didukung.");
  const minutes = Number(body.timeLimitMinutes ?? 10);
  if (!Number.isFinite(minutes) || minutes < 0 || minutes > 120)
    throw new QuizConfigError("Durasi total harus antara 0 dan 120 menit.");
  const seconds = Number(
    body.timePerQuestionSeconds ?? (minutes === 0 ? 0 : 60),
  );
  if (!Number.isInteger(seconds) || seconds < 0 || seconds > 600)
    throw new QuizConfigError("Durasi per soal harus antara 0 dan 600 detik.");
  const optionalText = (value: unknown, max: number) =>
    typeof value === "string"
      ? value.trim().slice(0, max) || undefined
      : undefined;
  return {
    questionType: type as QuestionType,
    questionDistribution: distribution as Partial<Record<QuestionType,number>>,
    pointsByType: validateMap(body.pointsByType,1,20),
    timePerQuestionByType: validateMap(body.timePerQuestionByType,0,600),
    partialCredit:body.partialCredit===true,
    evaluationSettings,
    model,
    provider,
    topic: body.topic.trim().slice(0, 300),
    studyMaterial: optionalText(body.studyMaterial, 15000),
    difficulty: difficulty as DifficultyLevel,
    questionCount: count,
    displayMode,
    timeLimitMinutes: minutes,
    timePerQuestionSeconds: displayMode === "sequential" ? seconds : undefined,
    language: body.language === "en" ? "en" : "id",
    enableGrounding: body.enableGrounding !== false,
    languageStyle: optionalText(body.languageStyle, 500),
    additionalInstructions: optionalText(body.additionalInstructions, 2000),
  };
}

export function quizTimerSeconds(
  quiz: Pick<
    QuizConfig,
    "displayMode" | "timeLimitMinutes" | "timePerQuestionSeconds"
  >,
) {
  return quiz.displayMode === "sequential"
    ? (quiz.timePerQuestionSeconds ?? (quiz.timeLimitMinutes === 0 ? 0 : 60))
    : quiz.timeLimitMinutes * 60;
}

export function durationLabel(seconds: number) {
  if (seconds === 0) return "Tanpa batas";
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return [
    minutes ? `${minutes} menit` : "",
    remainder ? `${remainder} detik` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

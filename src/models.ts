export type AIProvider = 'gemini';
export const isProvider = (value: unknown): value is AIProvider => value === 'gemini';
export const providerName = (_value?: AIProvider) => 'Google Gemini';
const GEMINI_MODELS = [
  {
    id: "gemini-3.8-flash",
    name: "Gemini 3.8 Flash",
    tag: "Penalaran mendalam",
    description: "Untuk latihan analitis dan materi yang kompleks.",
  },
  {
    id: "gemini-3.7-flash",
    name: "Gemini 3.7 Flash",
    tag: "Penalaran & analisis",
    description: "Untuk latihan dengan penalaran bertahap dan analisis konsep.",
  },
  {
    id: "gemini-3.6-flash",
    name: "Gemini 3.6 Flash",
    tag: "Serbaguna",
    description: "Untuk pemahaman terapan dan beragam topik belajar.",
  },
  {
    id: "gemini-3.5-flash",
    name: "Gemini 3.5 Flash",
    tag: "Latihan harian",
    description: "Untuk membangun pemahaman melalui latihan rutin.",
  },
  {
    id: "gemini-3.5-flash-lite",
    name: "Gemini 3.5 Flash Lite",
    tag: "Cepat & efisien",
    description: "Untuk latihan harian dengan respons yang ringan.",
  },
  {
    id: "gemma-4-31b-it",
    name: "Gemma 4 31B",
    tag: "Model terbuka · 31B",
    description: "Alternatif model Gemma untuk eksplorasi dan latihan konsep.",
  },
] as const;
export const AI_MODELS = [
  ...GEMINI_MODELS.map(model => ({ ...model, provider: 'gemini' as const, grounding: model.id !== 'gemma-4-31b-it', structured: model.id !== 'gemma-4-31b-it' })),
];
export type AIModel = string;
export const DEFAULT_MODEL: AIModel = "gemini-3.8-flash";
export const normalizeModelId = (id?: string): string => {
  if (!id) return '';
  return id.trim();
};
export const isAIModel = (value: unknown): value is AIModel =>
  typeof value === 'string' && AI_MODELS.some((model) => model.id === value || model.id === normalizeModelId(value));
export const validModelId = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,119}$/.test(value);
export const modelInfo = (id?: string) => {
  const norm = normalizeModelId(id);
  return AI_MODELS.find(model => model.id === norm || model.id === id);
};
export const defaultProviderModel = (_provider?: AIProvider) => DEFAULT_MODEL;
export const modelName = (id?: string) => {
  const norm = normalizeModelId(id);
  return AI_MODELS.find((model) => model.id === norm || model.id === id)?.name ?? norm ?? id ?? "Gemini";
};
export const DIFFICULTIES = [
  {
    id: "primitive",
    name: "Elementer",
    description:
      "Latihan paling dasar.",
  },
  {
    id: "very_easy",
    name: "Sangat mudah",
    description:
      "Latihan pengenalan sederhana.",
  },
  {
    id: "easy",
    name: "Mudah",
    description: "Latihan konsep dasar.",
  },
  {
    id: "moderate",
    name: "Menengah",
    description: "Latihan pemahaman umum.",
  },
  {
    id: "intermediate",
    name: "Menantang",
    description:
      "Latihan dengan tantangan tambahan.",
  },
  {
    id: "hard",
    name: "Sulit",
    description: "Latihan tingkat lanjut.",
  },
  {
    id: "very_hard",
    name: "Sangat sulit",
    description: "Latihan yang lebih kompleks.",
  },
  {
    id: "master",
    name: "Pakar",
    description:
      "Latihan pendalaman materi.",
  },
  {
    id: "grand_master",
    name: "Ekstrem",
    description:
      "Latihan dengan tantangan tertinggi.",
  },
] as const;
export const difficultyName = (id: string) =>
  DIFFICULTIES.find((level) => level.id === id)?.name ??
  { beginner: "Mudah", advanced: "Sulit", expert: "Pakar" }[id] ??
  id;

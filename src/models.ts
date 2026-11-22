export type AIProvider = 'gemini';
export const isProvider = (value: unknown): value is AIProvider => value === 'gemini';
export const providerName = (_value?: AIProvider) => 'Google Gemini';
const GEMINI_MODELS = [
  {
    id: "gemini-4-hydrogen",
    name: "Gemini 4 Hydrogen",
    tag: "Generasi terbaru",
    description: "Model generasi terbaru untuk pembuatan kuis dan evaluasi yang presisi.",
  },
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
export const DEFAULT_MODEL: AIModel = "gemini-4-hydrogen";
export const THINKING_EFFORTS = ["low", "medium", "high", "extra"] as const;
export type ThinkingEffort = (typeof THINKING_EFFORTS)[number];
export const DEFAULT_EFFORT: ThinkingEffort = "high";
export type ApiThinkingLevel = "MINIMAL" | "LOW" | "MEDIUM" | "HIGH" | "XHIGH";

export const EFFORT_OPTIONS: readonly {
  id: ThinkingEffort;
  label: string;
  description: string;
  hydrogenOnly?: boolean;
}[] = [
  { id: "low", label: "Low", description: "Respons paling cepat dan ringan untuk latihan rutin." },
  { id: "medium", label: "Medium", description: "Keseimbangan kecepatan dan kedalaman penalaran." },
  { id: "high", label: "High", description: "Penalaran mendalam untuk akurasi tinggi (Default)." },
  { id: "extra", label: "Extra", description: "Kedalaman penalaran maksimum khusus Gemini 4 Hydrogen.", hydrogenOnly: true },
] as const;

export const normalizeModelId = (id?: string): string => {
  if (!id) return '';
  return id.trim();
};
export const supportsExtraEffort = (modelId?: string): boolean =>
  normalizeModelId(modelId) === "gemini-4-hydrogen";
export const allowedEffortsForModel = (modelId?: string) =>
  EFFORT_OPTIONS.filter((opt) => !opt.hydrogenOnly || supportsExtraEffort(modelId));
export const isThinkingEffort = (value: unknown): value is ThinkingEffort =>
  typeof value === "string" && (THINKING_EFFORTS as readonly string[]).includes(value.trim().toLowerCase());
export const normalizeEffort = (value: unknown, modelId?: string): ThinkingEffort => {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (raw === "extra") return supportsExtraEffort(modelId) ? "extra" : DEFAULT_EFFORT;
  if (raw === "low" || raw === "medium" || raw === "high") return raw;
  return DEFAULT_EFFORT;
};
export const effortLabel = (effort?: ThinkingEffort, modelId?: string): string => {
  const norm = normalizeEffort(effort, modelId);
  return EFFORT_OPTIONS.find((opt) => opt.id === norm)?.label ?? "High";
};
export function resolveApiThinkingLevel(
  modelId: string | undefined,
  effort: ThinkingEffort | undefined = DEFAULT_EFFORT,
  purpose: "generate" | "evaluate" | "probe" = "generate"
): ApiThinkingLevel | undefined {
  const normModel = normalizeModelId(modelId || DEFAULT_MODEL);
  const info = AI_MODELS.find((m) => m.id === normModel || m.id === modelId);
  if (!info) return undefined;
  const normEffort = normalizeEffort(effort, info.id);
  if (info.id === "gemini-4-hydrogen") {
    if (purpose === "probe") return "LOW";
    return ({ low: "LOW", medium: "MEDIUM", high: "HIGH", extra: "XHIGH" } as const)[normEffort];
  }
  if (info.id === "gemma-4-31b-it") {
    if (purpose === "probe") return "MINIMAL";
    return normEffort === "low" ? "MINIMAL" : "HIGH";
  }
  if (purpose === "probe") return "MINIMAL";
  return ({ low: "LOW", medium: "MEDIUM", high: "HIGH", extra: "HIGH" } as const)[normEffort];
}
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

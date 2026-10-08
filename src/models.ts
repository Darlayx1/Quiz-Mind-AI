export type AIProvider = 'gemini' | 'groq';
export const isProvider = (value: unknown): value is AIProvider => value === 'gemini' || value === 'groq';
export const providerName = (value: AIProvider) => value === 'groq' ? 'Groq' : 'Google Gemini';
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
  { id: 'qwen/qwen3.8-27b', name: 'Qwen 3.8 27B', provider: 'groq' as const, tag: 'Model utama · 27B', description: 'Model utama Groq untuk latihan, penalaran, dan analisis konsep.', grounding: false, structured: true },
  { id: 'openai/gpt-oss-20b', name: 'GPT-OSS 20B', provider: 'groq' as const, tag: 'Cepat & efisien', description: 'Latihan harian melalui Groq dengan keluaran terstruktur.', grounding: false, structured: true },
  { id: 'openai/gpt-oss-120b', name: 'GPT-OSS 120B', provider: 'groq' as const, tag: 'Penalaran mendalam', description: 'Materi kompleks melalui Groq dengan keluaran terstruktur.', grounding: false, structured: true },
];
export type AIModel = string;
export const DEFAULT_MODEL: AIModel = "gemini-3.8-flash";
export const normalizeModelId = (id?: string): string => {
  if (!id) return '';
  const trimmed = id.trim();
  if (trimmed === 'qwen/qwen3.8-27' || trimmed === 'qwen3.8-27') return 'qwen/qwen3.8-27b';
  return trimmed;
};
export const isAIModel = (value: unknown): value is AIModel =>
  typeof value === 'string' && AI_MODELS.some((model) => model.id === value || model.id === normalizeModelId(value));
export const validModelId = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,119}$/.test(value);
export const modelInfo = (id?: string) => {
  const norm = normalizeModelId(id);
  return AI_MODELS.find(model => model.id === norm || model.id === id);
};
export const defaultProviderModel = (provider: AIProvider) => provider === 'groq' ? 'qwen/qwen3.8-27b' : DEFAULT_MODEL;
export const modelName = (id?: string) => {
  const norm = normalizeModelId(id);
  return AI_MODELS.find((model) => model.id === norm || model.id === id)?.name ?? norm ?? id ?? "Gemini";
};
export const DIFFICULTIES = [
  {
    id: "primitive",
    name: "Primitif",
    description:
      "Mengenali fakta paling dasar, dengan pertanyaan langsung dan opsi sederhana.",
  },
  {
    id: "very_easy",
    name: "Sangat mudah",
    description:
      "Mengingat istilah dan konsep dasar dengan konteks yang familiar.",
  },
  {
    id: "easy",
    name: "Mudah",
    description: "Memahami konsep dasar dan hubungan sederhana antaride.",
  },
  {
    id: "moderate",
    name: "Sedang",
    description: "Menerapkan satu konsep pada contoh atau situasi sehari-hari.",
  },
  {
    id: "intermediate",
    name: "Menengah",
    description:
      "Menghubungkan beberapa konsep dan melakukan analisis terapan.",
  },
  {
    id: "hard",
    name: "Sulit",
    description: "Menganalisis studi kasus dan menyelesaikan masalah bertahap.",
  },
  {
    id: "very_hard",
    name: "Sangat sulit",
    description: "Mengevaluasi masalah kompleks dengan beberapa sudut pandang.",
  },
  {
    id: "master",
    name: "Master",
    description:
      "Mensintesis konsep tingkat pakar dengan penalaran abstrak mendalam.",
  },
  {
    id: "grand_master",
    name: "Grand master",
    description:
      "Memecahkan persoalan orisinal tingkat kompetisi dengan sintesis lintas konsep.",
  },
] as const;
export const difficultyName = (id: string) =>
  DIFFICULTIES.find((level) => level.id === id)?.name ??
  { beginner: "Pemula", advanced: "Mahir", expert: "Olimpiade" }[id] ??
  id;

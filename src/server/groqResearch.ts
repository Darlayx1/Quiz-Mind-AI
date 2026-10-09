import type { QuizConfig } from '../types/quiz.js';
import { QuizGenerationError } from './generationError.js';

// Shared by production and the live diagnostic. Do not tune without live evidence.
export function groqResearchBody(config: QuizConfig) {
  return {
    model: 'openai/gpt-oss-20b',
    messages: [{ role: 'user', content: `Cari informasi web terkini tentang ${config.topic}. Tanggal saat ini ${new Date().toISOString().slice(0, 10)}. Ringkas fakta penting yang relevan untuk membuat kuis akurat dalam bahasa ${config.language === 'en' ? 'Inggris' : 'Indonesia'}. Sertakan tanggal publikasi dan URL sumber bila tersedia. Bedakan fakta yang ditemukan dari kesimpulan. Materi pengguna tetap menjadi acuan utama bila diberikan.` }],
    tools: [{ type: 'browser_search' }], tool_choice: 'required',
    reasoning_effort: 'high', include_reasoning: false, max_completion_tokens: 8192, stream: false,
  };
}

export function validateGroqResearch(data: any): string {
  const choice = data?.choices?.[0];
  if (choice?.finish_reason === 'length') throw new QuizGenerationError('Pemrosesan pencarian web Groq terpotong sebelum selesai. Silakan coba kembali.', 502, 'WEB_SEARCH_TRUNCATED');
  const content = choice?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new QuizGenerationError('Pencarian web Groq tidak menghasilkan materi riset yang dapat digunakan. Silakan coba kembali.', 502, 'WEB_SEARCH_EMPTY');
  if (choice.finish_reason !== 'stop') throw new QuizGenerationError('Pencarian web Groq belum menghasilkan jawaban akhir yang lengkap.', 502, 'WEB_SEARCH_UNAVAILABLE');
  // Reasoning and executed_tools are diagnostic metadata, never a final answer.
  return content.trim();
}

export function researchFailure(error: any): Error {
  if (error?.code?.startsWith('WEB_SEARCH_') || [400,401,402,403,404].includes(error?.status)) return error;
  if (error?.status === 429) return new QuizGenerationError('Batas permintaan pencarian web Groq tercapai. Tunggu sebelum mencoba kembali.', 429, 'WEB_SEARCH_RATE_LIMITED');
  if (error?.status === 504 || error?.name === 'TimeoutError') return new QuizGenerationError('Pencarian web Groq melewati batas waktu. Silakan coba kembali.', 504, 'WEB_SEARCH_TIMEOUT');
  return new QuizGenerationError('Layanan pencarian web Groq sementara tidak tersedia. Silakan coba kembali.', 503, 'WEB_SEARCH_UNAVAILABLE');
}

// Explicit allowlist: no raw responses, prompts, provider messages or headers.
export function researchDiagnostics(data: any, durationMs: number, error?: any) {
  const choice = data?.choices?.[0], message = choice?.message;
  const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  const finishes = ['stop','length','tool_calls','content_filter'];
  return {
    model: 'openai/gpt-oss-20b', httpStatus: data ? 200 : number(error?.status),
    errorCode: error ? (error instanceof QuizGenerationError ? error.code : [400,401,402,403,404,429].includes(error.status) ? `HTTP_${error.status}` : 'REQUEST_FAILED') : undefined,
    finishReason: finishes.includes(choice?.finish_reason) ? choice.finish_reason : undefined,
    contentLength: typeof message?.content === 'string' ? message.content.length : 0,
    executedTools: Array.isArray(message?.executed_tools) && message.executed_tools.length > 0,
    usage: data?.usage ? { promptTokens: number(data.usage.prompt_tokens), completionTokens: number(data.usage.completion_tokens), reasoningTokens: number(data.usage.completion_tokens_details?.reasoning_tokens) } : undefined,
    durationMs, timeout: error?.status === 504 || error?.name === 'TimeoutError' || error?.code === 'WEB_SEARCH_TIMEOUT', rateLimited: error?.status === 429,
  };
}

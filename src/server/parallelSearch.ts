import { QuizGenerationError } from './generationError.js';
import type { GroundingSource } from '../types/quiz.js';

export interface ParallelResearch {
  provider: 'parallel'; topic: string; searchedAt: string; queries: string[]; sources: GroundingSource[];
}
const failure = (message: string, status = 502, code = 'PARALLEL_SEARCH_FAILED') => new QuizGenerationError(message, status, code);
export function validateParallelKey(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length < 8 || value.trim().length > 1024 || /\s/.test(value.trim()))
    throw failure('Masukkan API key Parallel yang valid, 8–1024 karakter tanpa spasi.', 400, 'PARALLEL_KEY_INVALID');
  return value.trim();
}
export function usableResearch(value: ParallelResearch | undefined, topic: string): value is ParallelResearch {
  return value?.provider === 'parallel' && value.topic === topic && Number.isFinite(Date.parse(value.searchedAt)) &&
    Array.isArray(value.queries) && value.queries.length > 0 && Array.isArray(value.sources) && value.sources.length > 0 && value.sources.length <= 5 &&
    value.sources.every(s => typeof s.title === 'string' && typeof s.snippet === 'string' && s.snippet.length > 0 && s.snippet.length <= 3000 && /^https?:\/\//i.test(s.url));
}
export async function searchParallel(topic: string, secret: string, signal?: AbortSignal): Promise<ParallelResearch> {
  const key = validateParallelKey(secret);
  if (typeof topic !== 'string' || !topic.trim() || topic.length > 500) throw failure('Topik pencarian tidak valid.', 400, 'PARALLEL_QUERY_INVALID');
  const bounded = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(15000)]);
  try {
    bounded.throwIfAborted();
    const response = await fetch('https://api.parallel.ai/v1/search', {
      method: 'POST', signal: bounded, headers: { 'Content-Type': 'application/json', 'x-api-key': key },
      body: JSON.stringify({ objective: `Find trustworthy primary sources for a quiz about: ${topic}. Include evidence for answers and explanations.`,
        search_queries: [topic], mode: 'fast', advanced_settings: { max_results: 5, excerpt_settings: { max_chars_per_result: 3000 } } }),
    });
    if (!response.ok) {
      const messages: Record<number, string> = { 401: 'API key Parallel ditolak. Ganti key pada Pengaturan AI.', 403: 'Akses Parallel ditolak. Periksa izin key.',
        402: 'Kredit Parallel tidak mencukupi.', 429: 'Parallel membatasi permintaan. Tunggu sebelum mencoba kembali.' };
      throw failure(messages[response.status] || 'Layanan pencarian Parallel belum tersedia.', response.status, 'PARALLEL_HTTP_' + response.status);
    }
    const body = await response.json();
    const seen = new Set<string>();
    const sources: GroundingSource[] = [];
    for (const result of Array.isArray(body?.results) ? body.results : []) {
      if (typeof result.url !== 'string' || result.url.length > 2048 || !/^https?:\/\//i.test(result.url) || seen.has(result.url)) continue;
      try { const url = new URL(result.url); if (url.username || url.password) continue; } catch { continue; }
      const snippet = (Array.isArray(result.excerpts) ? result.excerpts.filter((s: unknown) => typeof s === 'string').join('\n') : '').trim().slice(0, 3000);
      if (!snippet) continue;
      sources.push({ url: result.url, title: String(result.title || 'Referensi').slice(0, 500), snippet }); seen.add(result.url);
      if (sources.length === 5) break;
    }
    bounded.throwIfAborted();
    if (!sources.length) throw failure('Parallel tidak menghasilkan sumber yang dapat digunakan. Sesuaikan topik.', 502, 'PARALLEL_SEARCH_EMPTY');
    return { provider: 'parallel', topic, searchedAt: new Date().toISOString(), queries: [topic], sources };
  } catch (error) {
    if (signal?.aborted) signal.throwIfAborted();
    if (bounded.aborted) throw failure('Pencarian Parallel melewati batas waktu 15 detik.', 504, 'PARALLEL_TIMEOUT');
    if (error instanceof QuizGenerationError) throw error;
    throw failure('Pencarian Parallel gagal. Periksa koneksi dan layanan pencarian.');
  }
}

/** Guest relay: caller-owned key is used for this request only; never persisted or logged. */
export async function parallelRelay(request: Request): Promise<Response> {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    if (request.method !== 'POST') return Response.json({ error: 'Metode tidak didukung.' }, { status: 405, headers });
    if (Number(request.headers.get('content-length')) > 4096) return Response.json({ error: 'Permintaan terlalu besar.' }, { status: 413, headers });
    const text = await request.text();
    if (new TextEncoder().encode(text).length > 4096) return Response.json({ error: 'Permintaan terlalu besar.' }, { status: 413, headers });
    let body;
    try { body = JSON.parse(text); } catch { throw failure('Isi permintaan tidak valid.', 400, 'PARALLEL_REQUEST_INVALID'); }
    return Response.json({ research: await searchParallel(body?.topic, body?.secret, request.signal) }, { headers });
  } catch (error) {
    if (request.signal.aborted) return Response.json({ error: 'Pencarian dibatalkan.', code: 'CANCELLED' }, { status: 409, headers });
    const safe = error instanceof QuizGenerationError ? error : failure('Pencarian Parallel belum tersedia.');
    return Response.json({ error: safe.message, code: safe.code }, { status: safe.status, headers });
  }
}

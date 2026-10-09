import dotenv from 'dotenv';
import { groqRequest } from '../src/server/providerClient.js';
import { groqResearchBody, researchDiagnostics, validateGroqResearch } from '../src/server/groqResearch.js';
import { normalizeQuizConfig } from '../src/quizConfig.js';

dotenv.config({ quiet: true });
const key = process.env.GROQ_API_KEY;
if (!key || key.startsWith('MY_')) {
  console.log('SKIP: GROQ_API_KEY tidak tersedia; diagnosis live belum terverifikasi.');
} else {
  const baseline = groqResearchBody(normalizeQuizConfig({ provider: 'groq', topic: 'Penjumlahan bilangan bulat dalam pendidikan dasar', language: 'id', enableGrounding: true }));
  async function probe(label: string, body: typeof baseline) {
    const started = Date.now(), signal = AbortSignal.timeout(180_000);
    let data: any;
    try {
      data = await groqRequest('chat/completions', key!, signal, body);
      validateGroqResearch(data);
      console.log(JSON.stringify({ label, reasoningEffort: body.reasoning_effort, tokenBudget: body.max_completion_tokens, ...researchDiagnostics(data, Date.now() - started) }));
      return { success: true, truncated: false, retry: false };
    } catch (error: any) {
      console.log(JSON.stringify({ label, reasoningEffort: body.reasoning_effort, tokenBudget: body.max_completion_tokens, ...researchDiagnostics(data, Date.now() - started, error) }));
      return { success: false, truncated: data?.choices?.[0]?.finish_reason === 'length', retry: ['WEB_SEARCH_EMPTY','WEB_SEARCH_TRUNCATED'].includes(error.code) };
    }
  }
  const first = await probe('Baseline', baseline);
  let result = first;
  // At most three calls, only following evidence of an empty/truncated final answer.
  if (!first.success && first.retry) {
    result = await probe('Varian A', { ...baseline, reasoning_effort: 'medium' });
    if (!result.success && result.truncated) result = await probe('Varian B', { ...baseline, reasoning_effort: 'medium', max_completion_tokens: 16384 });
  }
  if (!result.success) process.exitCode = 1;
}

import type { GenerateContentResponse } from '@google/genai';

/** Scan once across chunk boundaries. Count complete JSON objects in questions,
 * never braces/escaped quotes in question text or nested rubrics. */
export class QuestionStreamCounter {
  private buffer = '';
  private depth = 0;
  private inString = false;
  private escaped = false;
  private stringStart = 0;
  private pending: 'colon' | 'array' | undefined;
  private questionArray = false;
  private finished = false;
  private itemStart = -1;
  count = 0;

  append(text: string) {
    const start = this.buffer.length;
    this.buffer += text;
    for (let i = start; i < this.buffer.length && !this.finished; i++) {
      const c = this.buffer[i];
      if (this.inString) {
        if (this.escaped) this.escaped = false;
        else if (c === '\\') this.escaped = true;
        else if (c === '"') {
          this.inString = false;
          if (this.depth === 1 && this.buffer.slice(this.stringStart, i + 1) === '"questions"') this.pending = 'colon';
        }
        continue;
      }
      if (/\s/.test(c)) continue;
      if (this.pending === 'colon') {
        this.pending = c === ':' ? 'array' : undefined;
      } else if (this.pending === 'array') {
        this.questionArray = c === '[' && this.depth === 1;
        this.pending = undefined;
      }
      if (c === '"') { this.inString = true; this.stringStart = i; }
      else if (c === '{' || c === '[') {
        if (this.questionArray && this.depth === 2 && c === '{') this.itemStart = i;
        this.depth++;
      } else if (c === '}' || c === ']') {
        if (this.questionArray && this.depth === 3 && c === '}' && this.itemStart >= 0) {
          try {
            const item = JSON.parse(this.buffer.slice(this.itemStart, i + 1));
            if (item && typeof item === 'object' && !Array.isArray(item)) this.count++;
          } catch { /* The final validator rejects malformed items; no repair calls. */ }
          this.itemStart = -1;
        }
        if (this.questionArray && this.depth === 2 && c === ']') this.finished = true;
        this.depth--;
      }
    }
    return this.count;
  }
}

const unique = <T>(items: T[]) => [...new Map(items.map(item => [JSON.stringify(item), item])).values()];

/** Collect one request's stream without exposing drafts as a playable quiz. */
export async function collectQuizStream(stream: AsyncIterable<GenerateContentResponse>, signal: AbortSignal,
  started: number, onProgress?: (count: number) => void) {
  let text = '', firstTextMs: number | undefined;
  let candidate: NonNullable<GenerateContentResponse['candidates']>[number] | undefined;
  let usageMetadata: GenerateContentResponse['usageMetadata'];
  let promptFeedback: GenerateContentResponse['promptFeedback'];
  const counter = new QuestionStreamCounter();
  for await (const chunk of stream) {
    signal.throwIfAborted();
    const incoming = chunk.candidates?.[0];
    const part = incoming?.content?.parts?.filter(p => !p.thought).map(p => p.text ?? '').join('') ?? chunk.text ?? '';
    if (part) {
      firstTextMs ??= Date.now() - started;
      text += part;
      const previous = counter.count;
      const received = counter.append(part);
      if (received > previous) onProgress?.(received);
    }
    if (incoming) {
      const previousGrounding = candidate?.groundingMetadata;
      const grounding = incoming.groundingMetadata;
      candidate = { ...candidate, ...incoming, finishReason: incoming.finishReason ?? candidate?.finishReason,
        ...(previousGrounding || grounding ? { groundingMetadata: { ...previousGrounding, ...grounding,
          groundingChunks: unique([...(previousGrounding?.groundingChunks ?? []), ...(grounding?.groundingChunks ?? [])]),
          webSearchQueries: unique([...(previousGrounding?.webSearchQueries ?? []), ...(grounding?.webSearchQueries ?? [])])
        } } : {}) };
    }
    if (chunk.usageMetadata) usageMetadata = { ...usageMetadata, ...chunk.usageMetadata };
    promptFeedback = chunk.promptFeedback ?? promptFeedback;
  }
  signal.throwIfAborted();
  return { text, candidates: candidate ? [candidate] : [], usageMetadata, promptFeedback, firstTextMs };
}

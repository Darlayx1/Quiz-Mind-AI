/**
 * Parser JSON defensif untuk LLM:
 * - Menangani markdown code blocks
 * - Menangani unescaped LaTeX backslashes (\alpha, \rightarrow, \frac, dll)
 * - Menangani trailing commas pada array dan objek
 * - Menangani control characters
 * - Menangani perbaikan kurung kurawal/siku yang terpotong (truncation recovery)
 */
export function sanitizeAndParseJson(raw: string): any {
  if (!raw || typeof raw !== 'string') {
    throw new Error('Respon kosong atau bukan string.');
  }

  let text = raw.trim();

  // 1. Ekstrak dari blok ```json ... ```
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlock && codeBlock[1]) {
    text = codeBlock[1].trim();
  }

  // 2. Ambil dari { pertama hingga } terakhir
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    text = text.substring(firstBrace, lastBrace + 1);
  }

  // Coba parse langsung
  try {
    return JSON.parse(text);
  } catch {
    // Lanjut perbaikan defensif
  }

  // 3. Tangani TeX/LaTeX macro yang diawali backslash huruf (misal \rightarrow, \alpha, \frac, dsb)
  let sanitized = text.replace(/\\([a-zA-Z])/g, (_, ch) => '\\\\' + ch);

  // 4. Bersihkan trailing commas: [1, 2, ] -> [1, 2] dan { "a": 1, } -> { "a": 1 }
  sanitized = sanitized.replace(/,\s*([}\]])/g, '$1');

  try {
    return JSON.parse(sanitized);
  } catch {
    // Lanjut pembersihan kontrol karakter
  }

  // 5. Bersihkan karakter kontrol tak terlihat (ASCII < 32 kecuali newline & tab)
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ' ');

  try {
    return JSON.parse(sanitized);
  } catch {
    // Lanjut perbaikan truncasi
  }

  // 6. Perbaikan truncasi: jika output terpotong sebelum kurung tutup
  let openBraces = 0;
  let openBrackets = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < sanitized.length; i++) {
    const char = sanitized[i];
    if (char === '"' && !escaped) inString = !inString;
    if (!inString) {
      if (char === '{') openBraces++;
      else if (char === '}') openBraces = Math.max(0, openBraces - 1);
      else if (char === '[') openBrackets++;
      else if (char === ']') openBrackets = Math.max(0, openBrackets - 1);
    }
    escaped = (char === '\\' && !escaped);
  }

  if (inString) sanitized += '"';
  while (openBrackets > 0) {
    sanitized += ']';
    openBrackets--;
  }
  while (openBraces > 0) {
    sanitized += '}';
    openBraces--;
  }

  sanitized = sanitized.replace(/,\s*([}\]])/g, '$1');

  try {
    return JSON.parse(sanitized);
  } catch (err: any) {
    throw new Error('Gagal mengekstrak struktur kuis JSON dari respon model AI: ' + err.message);
  }
}

/**
 * Parser JSON defensif berbasis state-machine untuk respons LLM:
 * - Mengekstrak dari blok markdown ```json ... ```
 * - Menangani unescaped LaTeX backslashes (\alpha, \rightarrow, \frac, \theta, \nabla, \times, dll.)
 *   TANPA merusak escape JSON yang sah (\", \\, \/, \b, \f, \n, \r, \t, \uXXXX) atau menggandakan \\frac menjadi \\\frac
 * - Menangani literal control characters (newline/tab mentah) di dalam string JSON
 * - Menangani trailing commas di luar string JSON
 * - Menangani pemulihan kurung kurawal/siku terpotong sesuai urutan stack LIFO ({ vs [)
 */

function extractJsonSlice(raw: string): string {
  let text = raw.trim();
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlock && codeBlock[1]) {
    text = codeBlock[1].trim();
  }
  const firstBrace = text.indexOf('{');
  if (firstBrace === -1) return text;
  const lastBrace = text.lastIndexOf('}');
  if (lastBrace > firstBrace) {
    // Gunakan sampai lastBrace hanya jika tidak ada indikasi terpotong setelahnya
    const tail = text.slice(lastBrace + 1).trim();
    if (!tail || !/[{\["a-zA-Z0-9]/.test(tail)) {
      return text.slice(firstBrace, lastBrace + 1);
    }
  }
  return text.slice(firstBrace);
}

function isHex4(str: string, start: number): boolean {
  if (start + 4 > str.length) return false;
  for (let i = start; i < start + 4; i++) {
    const c = str.charCodeAt(i);
    const isDigit = c >= 48 && c <= 57;
    const isUpper = c >= 65 && c <= 70;
    const isLower = c >= 97 && c <= 102;
    if (!isDigit && !isUpper && !isLower) return false;
  }
  return true;
}

const VALID_SINGLE_ESCAPES = new Set(['"', '\\', '/', 'b', 'f', 'n', 'r', 't']);
const LATEX_ESCAPE_PREFIXES = [
  'frac', 'forall', 'flat',
  'beta', 'binom', 'bar', 'bigcap', 'bigcup', 'big', 'boldsymbol', 'boxed', 'bullet', 'bot',
  'nabla', 'neq', 'ne', 'ni', 'not', 'nu', 'natural', 'nless', 'ngtr',
  'rightarrow', 'Rightarrow', 'rho', 'rfloor', 'rceil', 'rangle', 'rm',
  'theta', 'Theta', 'times', 'tau', 'text', 'textbf', 'textit', 'tfrac', 'tilde', 'to', 'top', 'triangle',
];

function repairJsonStringsAndSyntax(input: string): string {
  let out = '';
  let inString = false;
  let i = 0;
  const len = input.length;

  while (i < len) {
    const ch = input[i];

    if (!inString) {
      if (ch === '"') {
        inString = true;
        out += ch;
        i++;
        continue;
      }
      // Hapus karakter kontrol ilegal di luar string kecuali whitespace standar
      const code = ch.charCodeAt(0);
      if (code < 32 && ch !== '\n' && ch !== '\r' && ch !== '\t') {
        out += ' ';
        i++;
        continue;
      }
      out += ch;
      i++;
      continue;
    }

    // Di dalam string JSON
    if (ch === '"') {
      inString = false;
      out += ch;
      i++;
      continue;
    }

    if (ch === '\\') {
      const next = input[i + 1];
      if (next === undefined) {
        // Backslash menggantung di akhir string
        out += '\\\\';
        i++;
        continue;
      }
      if (next === '\\') {
        // Pasangan escape backslash yang sudah sah (misal \\frac atau \\n): konsumsi keduanya sekaligus!
        out += '\\\\';
        i += 2;
        continue;
      }
      if (next === 'u' && isHex4(input, i + 2)) {
        out += input.slice(i, i + 6);
        i += 6;
        continue;
      }
      if (VALID_SINGLE_ESCAPES.has(next)) {
        // Cek apakah ini sebenarnya makro LaTeX seperti \frac, \theta, \rightarrow, \beta, \nabla
        const rest = input.slice(i + 1, i + 14);
        const isLatexMacro = LATEX_ESCAPE_PREFIXES.some(
          prefix => rest.startsWith(prefix) && !/[a-zA-Z]/.test(rest[prefix.length] ?? '')
        );
        if (isLatexMacro) {
          out += '\\\\' + next;
        } else {
          out += '\\' + next;
        }
        i += 2;
        continue;
      }
      // Escape tidak dikenal dalam JSON (misal \alpha, \sigma, \Delta, \pi, \sqrt, \%, \_): gandakan backslash
      out += '\\\\' + next;
      i += 2;
      continue;
    }

    // Karakter kontrol mentah di dalam string literal JSON harus di-escape
    const code = ch.charCodeAt(0);
    if (code < 32 || code === 127) {
      if (ch === '\n') out += '\\n';
      else if (ch === '\r') out += '\\r';
      else if (ch === '\t') out += '\\t';
      else out += ' ';
      i++;
      continue;
    }

    out += ch;
    i++;
  }

  return out;
}

function removeTrailingCommasOutsideStrings(input: string): string {
  let out = '';
  let inString = false;
  let escaped = false;
  const len = input.length;

  for (let i = 0; i < len; i++) {
    const ch = input[i];
    if (inString) {
      out += ch;
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === ',') {
      let j = i + 1;
      while (j < len && /\s/.test(input[j])) j++;
      if (j < len && (input[j] === '}' || input[j] === ']')) {
        continue;
      }
    }
    out += ch;
  }
  return out;
}

function closeTruncatedJson(input: string): string {
  const stack: ('}' | ']')[] = [];
  let inString = false;
  let escaped = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      stack.push('}');
    } else if (ch === '[') {
      stack.push(']');
    } else if (ch === '}' || ch === ']') {
      if (stack.length > 0 && stack[stack.length - 1] === ch) {
        stack.pop();
      }
    }
  }

  let closed = input;
  if (inString) {
    if (escaped) closed += '\\';
    closed += '"';
  }
  // Bersihkan trailing colon atau comma sebelum menutup delimiter stack
  closed = closed.replace(/[,:\s]+$/, '');
  while (stack.length > 0) {
    closed += stack.pop();
  }
  return removeTrailingCommasOutsideStrings(closed);
}

export function sanitizeAndParseJson(raw: string): any {
  if (!raw || typeof raw !== 'string') {
    throw new Error('Respon kosong atau bukan string.');
  }

  const text = extractJsonSlice(raw);

  // 1. Fast path: coba parse langsung
  try {
    return JSON.parse(text);
  } catch {
    // Lanjut perbaikan state-machine
  }

  // 2. Perbaiki string escapes (LaTeX, raw newlines/control chars) & trailing commas
  const repaired = removeTrailingCommasOutsideStrings(repairJsonStringsAndSyntax(text));
  try {
    return JSON.parse(repaired);
  } catch {
    // Lanjut pemulihan truncasi berbasis stack LIFO
  }

  // 3. Pemulihan truncasi dengan urutan stack kurung yang presisi
  const closed = closeTruncatedJson(repaired);
  try {
    return JSON.parse(closed);
  } catch (err: any) {
    throw new Error('Gagal mengekstrak struktur kuis JSON dari respon model AI: ' + err.message);
  }
}

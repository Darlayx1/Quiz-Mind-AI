const apiBase = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
export const standalonePages = !apiBase && import.meta.env.BASE_URL !== '/';
let personalApiKey = '';

export function setPersonalApiKey(value: string) {
  personalApiKey = value.trim();
}

export async function fetchApi(pathname: string, options?: RequestInit): Promise<Response> {
  const key = personalApiKey;
  if (key || standalonePages) {
    if (pathname === '/api/health') return Response.json({ security: {
      hasApiKey: Boolean(key), maskedKey: key ? 'Kunci pribadi aktif untuk sesi ini' : 'Belum diisi',
    } });
    if (pathname === '/api/generate-quiz') {
      if (!key) return Response.json({ success: false, error: 'Isi API key Gemini Anda pada kolom API Key Pribadi sebelum membuat kuis.' }, { status: 400 });
      try {
        const { generateQuizWithGemini } = await import('./server/geminiService.js');
        const config = JSON.parse(String(options?.body));
        const quiz = await generateQuizWithGemini(config, key);
        return Response.json({ success: true, quiz });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const quota = /429|quota|RESOURCE_EXHAUSTED/i.test(message);
        const unauthorized = /400|401|403|API_KEY_INVALID|API key not valid|PERMISSION_DENIED/i.test(message);
        return Response.json({ success: false, error: quota
          ? 'Kuota Gemini untuk kunci Anda sudah habis. Periksa kuota proyek di Google AI Studio atau coba lagi setelah reset.'
          : unauthorized ? 'Kunci Gemini tidak diterima. Periksa kunci, izin API, dan pembatasan domain di Google AI Studio.'
          : 'Gemini belum berhasil membuat kuis. Periksa koneksi dan kunci Anda, lalu coba kembali.' }, { status: quota ? 429 : unauthorized ? 401 : 502 });
      }
    }
    throw new Error('Fitur ini membutuhkan backend server. Kuis dengan API key pribadi dapat digunakan langsung di browser.');
  }
  return fetch(apiBase + pathname, options);
}

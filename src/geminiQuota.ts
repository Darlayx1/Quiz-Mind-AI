/** Extract only quota evidence; never forward raw provider messages or credentials. */
export function geminiQuotaDetails(error: any) {
  const message = String(error?.message ?? error?.error?.message ?? '');
  let payload = error?.error ?? error;
  try {
    const start = message.indexOf('{');
    const parsed = JSON.parse(start >= 0 ? message.slice(start) : message);
    payload = parsed.error ?? parsed;
  } catch { /* SDK errors may contain plain text instead of JSON. */ }
  const details: any[] = Array.isArray(payload?.details) ? payload.details : [];
  const violations = details.flatMap(detail =>
    String(detail?.['@type'] ?? '').endsWith('google.rpc.QuotaFailure') && Array.isArray(detail.violations) ? detail.violations : []);
  const metrics: string[] = [...new Set<string>(violations.map(v => v?.quotaMetric).filter((v): v is string =>
    typeof v === 'string' && /^generativelanguage\.googleapis\.com\/[a-zA-Z0-9_]{1,120}$/.test(v)))];
  const ids = violations.map(v => typeof v?.quotaId === 'string' ? v.quotaId : '').join(' ');
  const zero = violations.some(v => v?.quotaValue !== undefined && /^0(?:\.0+)?$/.test(String(v.quotaValue))) ||
    /\blimit\s*:\s*0(?:\.0+)?\b/i.test(message);
  // Generic Google quota messages mention billing even for model-only limits.
  const projectWide = /spend|spending|cost|billing/i.test(ids + ' ' + metrics.join(' ')) ||
    /(?:spend(?:ing)?|cost|billing|account|project)[ _-]*(?:cap|limit)\s+(?:exceeded|reached)/i.test(message);
  const daily = !zero && /per.?day|daily/i.test(ids + ' ' + metrics.join(' ') + ' ' + message);
  const minute = /per.?minute|per.?second/i.test(ids + ' ' + metrics.join(' ') + ' ' + message);
  const retryDelay = details.find(detail => String(detail?.['@type'] ?? '').endsWith('google.rpc.RetryInfo'))?.retryDelay;
  const seconds = /^(\d+(?:\.\d+)?)s$/.exec(String(retryDelay ?? ''))?.[1] ??
    /"retryDelay"\s*:\s*"([\d.]+)s"/.exec(message)?.[1];
  const retryMs = seconds ? Number(seconds) * 1000 : undefined;
  const reason = zero ? 'Google melaporkan batas kuota 0 untuk permintaan ini; penggunaan belum diperlukan untuk mencapai batas tersebut.' :
    projectWide ? 'Google melaporkan pembatasan biaya atau kuota proyek.' :
    daily ? 'Google melaporkan batas harian model.' :
    minute ? 'Google melaporkan batas permintaan atau token per menit/detik.' :
    'Google menolak permintaan dengan 429; jenis batas belum dapat dipastikan dari detail respons.';
  const evidence = metrics.length ? ` Metrik: ${metrics.join(', ')}.` : '';
  return { zero, projectWide, daily, retryMs, reason: reason + evidence };
}

export function geminiQuotaMessage(error: any, model: string) {
  const details = geminiQuotaDetails(error);
  const advice = details.zero
    ? 'Periksa ketersediaan model dan tier/billing pada proyek pemilik API key di Google AI Studio. Menunggu saja belum tentu mengubah batas 0.'
    : 'Periksa batas model pada proyek pemilik API key di Google AI Studio, serta jeda di Koneksi AI → Pemantauan. Anda dapat mengaktifkan model cadangan di Model & Cadangan.';
  const delay = details.retryMs && details.retryMs > 0 ? ` Google menyarankan jeda ${Math.ceil(details.retryMs / 1000)} detik.` : '';
  return `Permintaan model ${model} ditolak Google (429). ${details.reason}${delay} ${advice} Angka penggunaan yang rendah belum menjelaskan batas yang menolak permintaan ini. Key dalam proyek Google yang sama berbagi kuota.`;
}

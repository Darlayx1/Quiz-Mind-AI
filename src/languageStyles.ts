// Labels remain compatible with existing drafts; only the effective prompt is expanded.
export const LANGUAGE_STYLES = [
  ['Baku & akademis', 'Gunakan bahasa baku, istilah akademis yang tepat, dan struktur kalimat jelas.'],
  ['Formal & objektif', 'Gunakan nada formal, netral, dan objektif tanpa opini atau sapaan santai.'],
  ['Ilmiah berbasis bukti', 'Utamakan penalaran ilmiah dan bukti terverifikasi; jangan mengarang sumber.'],
  ['Profesional & ringkas', 'Gunakan bahasa profesional, langsung pada inti, tanpa pengulangan.'],
  ['Sederhana & mudah dipahami', 'Gunakan kalimat sederhana dan jelaskan istilah sulit secara singkat.'],
  ['Santai & komunikatif', 'Gunakan nada santai dan komunikatif sambil menjaga ketepatan konsep.'],
  ['Ramah untuk pemula', 'Gunakan nada ramah, jelaskan istilah saat pertama muncul tanpa mengubah kesulitan.'],
  ['Teknis & presisi', 'Gunakan terminologi teknis yang konsisten dan rumusan yang presisi.'],
  ['Analitis & sistematis', 'Susun bahasa secara sistematis dengan hubungan sebab akibat yang jelas.'],
  ['Kritis & argumentatif', 'Gunakan bahasa yang menguji alasan, asumsi, dan kekuatan argumen.'],
  ['Sokratik & reflektif', 'Gunakan pertanyaan reflektif yang mendorong pemeriksaan pemahaman dan alasan.'],
  ['Naratif & kontekstual', 'Bingkai soal dalam cerita singkat dan konteks relevan tanpa detail berlebihan.'],
  ['Berbasis analogi', 'Gunakan analogi yang akurat untuk menjelaskan hubungan konsep; jelaskan batas analogi.'],
  ['Bertahap & instruksional', 'Gunakan instruksi berurutan yang jelas dan mudah diikuti.'],
  ['Konseptual & mendalam', 'Tekankan hubungan antarkonsep dan makna mendasar melalui rumusan yang jelas.'],
  ['Praktis & aplikatif', 'Gunakan konteks penerapan nyata dan contoh praktis yang sesuai materi.'],
  ['Interaktif & dialogis', 'Gunakan sapaan dan nada dialogis dengan instruksi jawaban yang tetap eksplisit.'],
  ['Informatif & netral', 'Sampaikan informasi secara netral, faktual, dan bebas bahasa persuasif.'],
  ['Eksploratif & menggugah rasa ingin tahu', 'Gunakan rumusan eksploratif yang mengundang rasa ingin tahu tanpa ambiguitas.'],
  ['Serius bergaya ujian', 'Gunakan rumusan ujian yang formal, tegas, dan hemat kata tanpa petunjuk jawaban.'],
] as const;
export function effectiveLanguageStyle(value: string): string | undefined {
  const preset = LANGUAGE_STYLES.find(([label]) => label === value);
  return preset ? `${preset[0]}: ${preset[1]} Pertahankan jumlah, tipe, bobot, dan tingkat kesulitan yang ditentukan.` : value.trim() || undefined;
}
export const languageStyleLabel = (value: string, custom = false) => custom ? 'Gaya kustom' : value || 'Baku & akademis';

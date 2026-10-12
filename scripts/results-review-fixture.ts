import type { Question, QuestionEvaluation, Quiz, QuizResult, QuizSubmission } from '../src/types/quiz.js';
import { buildResult } from '../src/scoring.js';

const sources = [{ title: 'Referensi belajar', url: 'https://example.org/konsep' }];
const common = { explanation: 'Pelajari hubungan antara struktur, fungsi, dan contoh penerapannya. Setiap pilihan tetap tersedia agar alasan jawaban dapat dibandingkan.', groundingSources: sources, maxPoints: 2 };
const choices = ['Karbon, hidrogen, dan oksigen merupakan unsur utama penyusun karbohidrat.', 'Nitrogen dan sulfur selalu menjadi unsur utama semua karbohidrat.', 'Karbohidrat hanya tersusun dari satu unsur tanpa ikatan kimia.', 'Fosfor merupakan satu-satunya unsur penyusun molekul karbohidrat.', 'Struktur molekul tidak berkaitan dengan fungsi dan sifat karbohidrat.'];
export const reviewQuestions: Question[] = [
  { ...common, id: 'single', type: 'single_choice', question: 'Unsur kimia dasar apa yang menyusun karbohidrat?', options: choices, correctAnswerIndex: 0 },
  { ...common, id: 'multi', type: 'multiple_select', question: 'Pilih seluruh pernyataan yang sesuai dengan konsep karbohidrat.', options: choices, correctAnswerIndex: 0, correctOptionIds: ['o0', 'o4'], scoringMode: 'partial' },
  { ...common, id: 'boolean', type: 'true_false', question: 'Semua karbohidrat memiliki fungsi yang sama di dalam tubuh.', correctValue: false },
  { ...common, id: 'short', type: 'short_answer', question: 'Jelaskan fungsi utama glukosa dalam satu kalimat.', referenceAnswer: 'Glukosa menyediakan energi untuk aktivitas sel melalui metabolisme.', acceptedAnswers: ['Sumber energi sel', 'Menyediakan energi'], requiredConcepts: ['energi', 'sel'], maxLength: 5000, caseSensitive: false, allowPartial: true },
  { ...common, maxPoints: 10, id: 'essay', type: 'essay', question: 'Jelaskan hubungan struktur karbohidrat dengan fungsi biologisnya.', referenceAnswer: 'Struktur dan ikatan menentukan sifat molekul. Monosakarida menyediakan energi; polisakarida berperan dalam penyimpanan energi dan struktur sel.', rubric: ['Ketepatan konsep', 'Hubungan struktur dan fungsi', 'Contoh biologis', 'Penalaran ilmiah', 'Kejelasan penjelasan'].map((description, i) => ({ id: 'c' + i, description, weight: 20, anchors: ['Belum terpenuhi', 'Sebagian terpenuhi', 'Terpenuhi'] })), maxLength: 15000 },
  { ...common, id: 'matching', type: 'matching', question: 'Pasangkan setiap konsep dengan fungsi yang paling sesuai.', leftItems: [1, 2, 3].map(i => ({ id: 'l' + i, text: ['Glukosa', 'Glikogen', 'Selulosa'][i - 1] })), rightItems: [1, 2, 3, 4].map(i => ({ id: 'r' + i, text: ['Energi sel', 'Cadangan energi hewan', 'Struktur dinding sel tumbuhan', 'Pilihan pengecoh yang tidak digunakan'][i - 1] })), correctPairs: { l1: 'r1', l2: 'r2', l3: 'r3' } },
  { ...common, id: 'ordering', type: 'ordering', question: 'Urutkan proses pemanfaatan karbohidrat.', items: [1, 2, 3, 4].map(i => ({ id: 'i' + i, text: ['Pencernaan', 'Penyerapan', 'Pengangkutan', 'Metabolisme sel'][i - 1] })), correctOrder: ['i1', 'i2', 'i3', 'i4'], scoringMode: 'partial' },
];
export const reviewQuiz: Quiz = { id: 'results-review-fixture', schemaVersion: 2, title: 'Penilaian Dasar Karbohidrat', topic: 'Karbohidrat', summary: 'Fixture lokal untuk tujuh tipe soal.', difficulty: 'moderate', timeLimitMinutes: 0, createdAt: '2026-10-12T02:00:00Z', model: 'gemini-2.5-flash', questions: reviewQuestions };
export const reviewSubmission: QuizSubmission = { quizId: reviewQuiz.id, userAnswers: {
  single: { type: 'single_choice', selectedOptionId: 'o1' }, multi: { type: 'multiple_select', selectedOptionIds: ['o0'] }, boolean: { type: 'true_false', value: false },
  short: { type: 'short_answer', text: 'Glukosa memberi energi bagi sel.\nPenjelasan tambahan dengan teks panjang yang harus tetap terbaca. ' + 'Metabolisme menghasilkan energi. '.repeat(12) },
  essay: { type: 'essay', text: 'Struktur karbohidrat berkaitan dengan fungsinya.\n' + 'Ikatan dan susunan unit penyusun memengaruhi pemanfaatan energi dan fungsi struktural. '.repeat(10) },
  matching: { type: 'matching', pairs: { l1: 'r1', l2: 'r3', l3: 'r2' } }, ordering: { type: 'ordering', orderedItemIds: ['i2', 'i1', 'i3', 'i4'], confirmed: true },
}, bookmarkedQuestions: [], timeTakenSeconds: 63, completedAt: '2026-10-12T02:01:03Z' };
export type ReviewScenario = 'final' | 'pending' | 'failed' | 'cancelled' | 'needs_review' | 'unanswered' | 'manual' | 'long' | 'long_prompt';
export function reviewFixture(scenario: ReviewScenario = 'final'): QuizResult {
  const quiz = structuredClone(reviewQuiz), submission = structuredClone(reviewSubmission);
  if (scenario === 'unanswered') submission.userAnswers = { ordering: { type: 'ordering', orderedItemIds: ['i2', 'i1', 'i3', 'i4'], confirmed: false } };
  if (scenario === 'long') { quiz.title += ' · ' + 'Judulpanjangtanpaspasi'.repeat(10); quiz.questions[0].options![2] = 'Katapanjangtanpaspasi'.repeat(50); }
  if (scenario === 'long_prompt') submission.userAnswers.essay = { type: 'essay', text: 'Penjelasan struktur, fungsi, dan contoh biologis. '.repeat(250) };
  const result = buildResult(quiz, submission);
  if (scenario === 'unanswered') return result;
  const evaluations = result.evaluations!;
  for (const id of ['short', 'essay']) {
    const q = quiz.questions.find(q => q.id === id)!;
    const status = ['pending', 'failed', 'cancelled', 'needs_review'].includes(scenario) ? scenario as QuestionEvaluation['status'] : 'graded';
    evaluations[id] = { ...evaluations[id], status, method: 'ai', earnedPoints: status === 'graded' ? (id === 'essay' ? 8 : 2) : null, proposedPoints: status === 'needs_review' ? (id === 'essay' ? 8 : 2) : undefined, feedback: status === 'graded' ? 'Konsep utama tepat; tambahkan contoh yang lebih spesifik.' : 'Penilaian belum final. Tinjau informasi evaluasi sebelum melanjutkan.', reviewFlags: status === 'needs_review' ? ['Contoh perlu diverifikasi'] : [], errorCode: status === 'failed' ? 'PROVIDER_ERROR' : undefined, provider: 'gemini', model: 'gemini-2.5-flash', evaluatedAt: '2026-10-12T02:02:00Z', criteria: q.type === 'essay' ? q.rubric.map(c => ({ criterionId: c.id, level: .8, evidence: 'Struktur karbohidrat berkaitan dengan fungsinya.', feedback: 'Konsep terpenuhi; contoh dapat diperjelas.' })) : undefined };
  }
  if (scenario === 'manual') {
    const old = structuredClone(evaluations.essay);
    evaluations.essay = { ...old, method: 'manual', earnedPoints: 9, manualReason: 'Contoh struktur sudah saya verifikasi.', revision: 1, previous: [old] };
  }
  return buildResult(quiz, submission, evaluations);
}

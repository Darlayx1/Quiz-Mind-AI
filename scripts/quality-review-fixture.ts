/** Provider fixture for the separate audit call; no production code bypasses the audit. */
export function qualityReviewFixture(prompt: string) {
  if (!prompt.startsWith('ASSESSMENT_REVIEW\n')) return undefined;
  const data = JSON.parse(prompt.split('\nDATA: ')[1]);
  const [min, max] = data.spec.difficulty.targetSuccessPercent;
  return { reviews: data.questions.map((q: any) => ({ questionId: q.id, relevant: true, difficultyFits: true,
    correct: true, unambiguous: true, evidenceSupported: true, estimatedSuccessPercent: (min + max) / 2,
    reason: 'Fixture penilaian independen sesuai spesifikasi.' })) };
}

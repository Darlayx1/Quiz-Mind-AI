# Quiz quality and difficulty policy

## Diagnosis and scope

The former Parallel integration searched only the topic and instructed the generator to use only the returned evidence for factual questions. A broad anatomy search could therefore substitute learning platforms and historical publications for anatomical competence. URL validation established provenance but did not check relevance, reasoning depth, or answer correctness.

The active guest/account generation path now freezes topic, supplied learning material, audience and difficulty before research. Queries request concepts, relationships and applications at that depth. Conservative filtering removes obvious catalogues, historical pages outside an explicitly historical scope, and navigation lines. The generator uses evidence as support, never as the list of topics. A cheap scope check blocks the screenshot's catalogue/history regressions; a separate model call audits semantic scope, difficulty, key/explanation, ambiguity and cited support before accepting a batch.

The audit is a separate context using the selected model, not an independently trained expert or a statistical experiment. It cannot guarantee correctness. Native Google grounding metadata includes URLs/titles rather than excerpts; verification of source support in that mode is limited. Unknown token usage is left absent, not reported as zero.

The older internal `generateQuizWithGemini` adapter receives the same assessment prompt and scope check. The application uses `generateQuizBatch` through workspace adapters, where the independent audit and persisted circuit apply.

## Nine levels

Stable IDs preserve saved quizzes/drafts and API compatibility. Legacy beginner/advanced/expert aliases map to easy/hard/master. New names apply to historical IDs; old quizzes were not generated under the new calibration policy and should not be interpreted as calibrated examples.

| Stable ID | Display name | Target mastery success | Demand |
| --- | --- | --- | --- |
| primitive | Elementer | 99–100% | Nearly universal basic recognition |
| very_easy | Sangat mudah | 95–<99% | Familiar basic recall |
| easy | Mudah | 85–<95% | Basic concepts and simple relationships |
| moderate | Menengah | 70–<85% | Two concepts or a familiar application |
| intermediate | Menantang | 50–<70% | Several related concepts and applied analysis |
| hard | Sulit | 30–<50% | Multi-step case analysis |
| very_hard | Sangat sulit | 15–<30% | Deep analysis with relevant constraints |
| master | Pakar | 5–<15% | Expert synthesis and abstract reasoning |
| grand_master | Ekstrem | >0–<5% | Complex, precise synthesis within scope |

Rates describe the specified audience's ability to answer without guessing. They are design targets; the audit's probability is an estimate. Default audience is masyarakat umum; the creator allows a different audience and saves it in drafts/configs/quizzes. Every audited item must satisfy both the qualitative difficulty criterion and its estimated range. Zero-probability questions are rejected even at Ekstrem. Difficulty does not justify ambiguity, omitted information, obscure trivia or a topic change.

Five-option single choice has a 20% random-guess floor; true/false has 50%. Actual correct-answer rates for those formats cannot be equated with low mastery targets. Use short answers or essays to investigate the highest levels, while keeping the user's selected format supported.

## Recovery and checkpoints

- Search has a 15-second timeout; guest relay has a 20-second deadline. Generation plus audit has a 180-second deadline; the audit has a 60-second deadline. Authenticated operations are bounded below the existing lease duration.
- The guest relay accepts up to 128 KiB to carry the bounded learning material/configuration. Keys remain caller-owned and are neither logged nor included in evidence.
- Research is keyed by exact assessment specification. Batches/resume reuse it only for that specification. Legacy unscoped research is refreshed in workspace orchestration.
- Empty or conservatively rejected Parallel results can use generation without web for stable learning content. The quiz records `groundingFallbackUsed` and shows a warning. All subsequent batches follow the same decision. Key/HTTP/transport failures do not silently switch providers or disable research.
- Current/dated, clinical-guidance/dosage, price or legal-regulatory requests are conservatively excluded from this fallback. This classification is heuristic; ambiguous requests should be made explicit. The audit additionally rejects uncertain unsupported claims.
- A quality rejection supplies a diagnosis in the next generation prompt. At most three generation attempts per batch; each successful structural generation can incur one separate audit call. Two consecutive failures with the same issue fingerprint open the circuit earlier and report root-cause checks. Distinct semantic issues are not treated as identical merely because both use `QUALITY_REJECTED`.
- Attempts are checkpointed before provider calls and after failures. Resume cannot reset an exhausted/open circuit. Guest checkpoints use the workspace repository; account checkpoints use the service-only, owner/lease-checked `qm_checkpoint_generation_state` RPC.

## Calibration and comparisons

History offers an expandable actual-success table and a JSON export. It groups by topic, audience, difficulty, search mode, model and question type. Only the first submission per quiz is used to limit practice inflation; newer grading of that same submission replaces its previous evaluation. Pending grades are excluded from the denominator and shown separately. Unanswered graded items count as unsuccessful. Duplicate quiz entries are not counted twice. This is workspace practice data, not a representative population sample, and includes guesses. It does not automatically rewrite target rates.

`npm run benchmark:quality` writes a manifest under `.qa/quality-benchmark` without API calls. The full matrix uses three subjects, nine levels, three research modes and two repetitions: 162 attempts, up to 324 model calls and 54 Parallel searches. Short-answer format avoids the closed-choice guessing floor.

For a smaller comparison, use `-- --levels=easy,intermediate,grand_master --repetitions=1`. Real calls require `--live` and caller-owned `QUIZ_BENCHMARK_GEMINI_KEY` / `QUIZ_BENCHMARK_PARALLEL_KEY`. Model selection can use `QUIZ_BENCHMARK_MODEL`. Do not put keys in source or output files. Live comparisons deliberately do not retry or substitute no-web generation, so failures remain visible.

Results checkpoint each completed case and include accepted quizzes, rejection codes, elapsed times and available successful-call token usage. Failed-provider token consumption and billing totals are unavailable. `blind-review.json` shuffles questions and hides provider labels; keep `review-mapping.json` away from the reviewer until ratings are complete. Reviewers can score relevance, depth, difficulty fit, answer correctness and ambiguity on the same 1–5 rubric; source-support review requires the mapping's evidence. No improvement claim should be made from synthetic tests alone.

## Verification and release

- `npm run test:quality`: anatomy scope regressions, every difficulty in all three modes, audit rejection, adaptive correction, persistent circuit, fallback/current-fact boundaries, calibration and creator UI.
- `npm run test:parallel`: existing search/storage/authentication/cancellation/grounding regression suite plus service-only generation checkpoints and account quality/fallback behavior.
- `npm run lint`, `npm run build`, `npm run build:pages`: types and deployment packaging.
- Apply `supabase/migrations/202610110002_generation_quality.sql` after existing migrations, then deploy both refreshed Edge Functions and the frontend. Generated standalone Edge sources are in `build/` after `npm run build:edge`. Local builds do not publish services or apply a production migration.

Acceptance requires zero off-scope questions on explicit-scope comparison cases, expert-reviewed valid keys, difficulty progression for the same audience and measured benefit relative to both baselines. Real participant data is needed to validate the population-rate matrix. One extra audit call per accepted batch adds latency/token cost; successful batches record its usage/time for comparison.

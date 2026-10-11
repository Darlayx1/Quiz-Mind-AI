# Quiz generation performance — 11 October 2026

## Preserved contract

One request to the selected model per operation; `HIGH` reasoning remains explicit. Full material, user preferences, difficulty guidance, all requested question types, answer keys, explanations and rubrics remain required. The complete response must pass the existing count, composition, duplicate and question validators before a playable quiz is returned. No partial quiz publication, model fallback, automatic repair or extra audit request.

## Changes

- For models with native structured output, send the schema through the API once. Gemma and unknown/unstructured models retain the schema in their text prompt.
- Keep difficulty guidance in the assessment specification instead of repeating it in the user prompt. Ask for compact JSON without restricting educational content.
- Enforce the exact requested question count in the API schema as well as the existing local validator.
- Use one streaming request in the guest and account UI for supported structured models. Count complete question objects incrementally across chunk boundaries; show received progress while awaiting full validation. Do not expose model thoughts or publish draft questions.
- Retain final finish reason, safety feedback, grounding sources/queries and token usage across stream chunks. Abort/timeout/error remains terminal and never retries with another transport.
- Coalesce account progress writes, scoped to owner, operation, lease and running status. Progress writes do not block reception; late writes cannot overwrite a terminal job. Status requests no longer read API keys and return only required job columns.
- Record provider duration, validation duration, first text time for streams, transport, thought tokens, total tokens and prompt character count alongside existing metrics. These optional fields preserve old saved quizzes.

## Measurements and limits

Three real requests used Gemini 3.8 Flash, `HIGH`, 10 single-choice questions about Newton's laws, intermediate difficulty, no web and a 145-second timeout. No automatic retries were used.

| Request | Prompt characters | Result |
| --- | ---: | --- |
| Original prompt, ordinary response | 3,140 | Timed out at 145,021 ms |
| Optimized prompt, ordinary response | 2,514 | Timed out at 145,009 ms |
| Optimized prompt, stream | 2,514 | STOP; all 10 questions passed structural validation in 112,972 ms |

The streamed response first produced text at 97,656 ms, then delivered 108 chunks. Provider usage: 486 prompt tokens, 5,234 thought tokens, 2,718 candidate tokens, 8,438 total tokens. An authenticated model-list connectivity check returned HTTP 200 in 273 ms and confirmed the selected model exists.

Prompt characters fell 19.9%; this is not a measured reduction in provider token usage or a latency guarantee. The first two requests partly overlapped and there is only one sample per variant. These observations do not establish a stable speedup, isolate reasoning from provider queue time, or prove semantic quality equivalence. The successful response retained full explanations; structural acceptance is not an independent factual audit.

Most time in the successful sample elapsed before the first output text. Streaming exposes actual progress and transport timing; it does not make the model's reasoning instantaneous. A guaranteed sub-30-second response under an unchanged `HIGH` policy has not been demonstrated. These were the first three experiments; a subsequent authorized comparison is documented below.

Local experiment outputs, including the generated sample, are in ignored `.qa/generation-performance/`. The reusable benchmark is `scripts/generation-latency-benchmark.ts`: without `--live` it makes no API calls; `--live --stream --label=sample` uses one bounded provider request and writes a local result without credentials.

## Verification and rollout

Verified incremental parsing, escaping, nested rubric objects, thought privacy, metadata preservation, cancellation, one transport request, all seven question types, exact counts, quality requirements and unstructured-model schema compatibility. Existing quality, workspace, account ownership, database, Parallel search and application cancellation checks pass. Type checks and frontend/server/Pages/Edge builds pass.

The shared Edge engine is rebuilt from source. No database migration is required: account progress uses the existing cursor column. Changes are local and have not been deployed to the public frontend or Supabase. Deploy the matching frontend and Edge function together to enable account progress.

## Execution of the controlled comparison plan

Production defaults to `baseline-high`. Only an internal function option can select `focused-high` or `focused-medium`; normalized user configuration cannot enable an experiment. Experimental calls are restricted to Gemini 3.8 Flash. The focused prompt consolidates checks, establishes keys before alternatives, and repairs specific defects rather than requesting an unbounded repeated audit. It retains scope, difficulty, factual, key, ambiguity, explanation, option and rubric requirements. It is a candidate, not a proven quality improvement.

`npm run benchmark:generation` previews a manifest without external calls. `-- --live --case=newton-10` executes a serial three-call pilot with 145-second request deadlines and no retries. Full coverage is predefined as Newton 10, seven mixed question types with supplied material/preferences, and two hard essay questions, each with two repetitions per variant. Variant order rotates between cases/repetitions. Results are checkpointed after every call. Two consecutive identical failures or three failures stop the run for root cause analysis. Risk annotations do not change production reasoning automatically.

Authorized pilot, 11 October 2026, same normalized input, one streaming request per variant:

| Candidate | End-to-end | First text | Thought tokens | Result |
| --- | ---: | ---: | ---: | --- |
| baseline-high | 37,441 ms | 23,389 ms | 4,163 | 10 structurally valid questions |
| focused-high | 48,834 ms | unavailable | unavailable | INCOMPLETE_RESPONSE; rejected |
| focused-medium | 18,222 ms | 7,234 ms | 1,124 | 10 structurally valid questions |

The paired medium sample is 51.3% faster. This is one pair, with prompt and thinking level both changed; it cannot attribute the benefit solely to either change, establish reliability, or demonstrate equivalent semantic quality. The same production HIGH input varied from 112,972 ms earlier to 37,441 ms in this pilot. No further live calls were made after the pilot: the incomplete focused-high result and absent independent reviews prevent promotion. Additional diagnostics now record finish reason, output budget and thought/output usage on MAX_TOKENS failures without logging credentials or provider payloads; they were added after this pilot, so no unsupported cause is assigned to its failure.

Local evidence: `.qa/generation-performance/comparison-2026-10-11T02-41-36-242Z/results.json`. Independent human review artifact: `blind-review.json` in the same directory. Candidate labels, timing and token metadata are omitted from that review artifact; scores are intentionally blank. Reviewers must not consult the mapping until ratings are final.

`scripts/generation-quality-gate.ts <artifact-directory>` checks matched inputs, all cases and repetitions, one-call execution, structural counts/composition/duplicates, review identity/content, complete human scores, zero critical errors, minimum 3/4 in each dimension, no per-pair dimension regression, and at least 40% median paired latency reduction. Missing evidence blocks eligibility. It never activates or deploys a model policy, even on a passing report; controlled rollout remains separate. The benchmark is intentionally small and cannot prove statistical equivalence.

Adaptive routing and caching remain deferred. Routing has no approved semantic-quality evidence; caching is not supported by a measured benefit for the observed short prompt. Production stays HIGH and the existing account policy is unchanged. No claim is made that production now generates every 10-question quiz in 18 seconds.

Validation: generation/stream/gate tests, existing quality and account/Parallel/database tests, type checking, and application/Edge builds pass. Gate tests use synthetic reviews and are not evidence of actual quiz quality.

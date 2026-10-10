# Quiz generation policy

Policy version 2 treats difficulty as general guidance. The nine difficulty IDs and legacy aliases remain compatible with saved quizzes. The creator no longer asks for a target audience and no longer displays or enforces estimated success percentages. Legacy audience metadata can remain in stored quizzes but is ignored by generation, research and the history comparison.

## Quality feedback

The generator receives topic, study material, general difficulty and user preferences. It should produce relevant, clear questions with defensible answers. Scope checks and the separate AI review now supply advisory feedback, not acceptance gates. Missing excerpts, missing citations, difficulty variation or a negative review do not reject an otherwise usable quiz. Invalid, unavailable or timed-out reviews are disclosed with a short warning and do not discard questions. User cancellation still stops work.

Only sources actually supplied to the generator may be attached to questions. Unrecognized citations are omitted. Empty or irrelevant Parallel results allow generation without web, including for dated topics; the quiz explicitly states that current information has not been verified. Missing native Google metadata likewise produces a warning. Provider authentication, quota, HTTP and network errors remain real failures rather than fabricated successes.

## Partial batches and recovery

Basic structural validation remains necessary for rendering and scoring: supported question types, usable options and answer keys. Malformed or duplicate items are skipped. Every nonempty batch of valid questions is saved; the next batch requests only the missing items. A batch with zero usable items reports a concise failure. Existing saved items are retained if a later provider call fails.

Resuming an older job clears exhausted budgets caused specifically by the obsolete quality, review or citation gates. Budgets for actual provider failures remain bounded, and checkpoints, ownership checks and cancellation are preserved. Advisory warnings accumulate across batches.

## Verification and release

- `npm run test:quality`: all nine levels and three research modes; negative, unavailable and malformed review recovery; cancellation; partial and malformed batches; obsolete quality circuit recovery; simple creator UI.
- `npm run test:parallel`: search, storage, account ownership, partial account batches, resume and cancellation regressions.
- `npm run lint`, `npm run build`, `npm run build:pages`: types and deployment packages.

Run `npm run build:edge` to refresh shared Edge sources and the standalone Supabase function packages in `build/`. Deploy the refreshed Edge Functions and frontend together for account mode to use the new policy. Local verification does not update the public website. No database migration is required for this policy change.

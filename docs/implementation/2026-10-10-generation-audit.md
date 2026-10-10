# Audit generation failure and spontaneous cancellation

## Evidence
- User confirmed cancellation appeared without pressing Cancel.
- Production account logs contain HTTP 502 and generic generation failures. No provider detail was logged by that deployment, so the exact cause of those historical 502 responses remains unconfirmed.
- Read-only database audit confirms outcome RPC exists; earlier jobs remained pending with zero questions. A subsequent production job completed 10 questions at 11:06:58 UTC, with success activity at 11:07:00 UTC.
- Direct supplied-key probes: grounded structured request returned 429; ungrounded simple request succeeded; ungrounded structured five-question anatomy request succeeded. This distinguishes the web-search path from basic model access.
- Real workspace canary succeeded with 10 valid, unique single-choice anatomy questions, grounding fallback true, five provider calls across two batches, duration 53,720 ms. No credential written to disk; canary IndexedDB is memory-only.

## Changes and verification
- Guest and account orchestrators fall back from grounded 429 to ungrounded generation within the existing maximum three attempts per batch. Optional preference allows disabling this behavior. Quiz displays a warning when fallback occurred.
- Scope/mode interruption clears operation identity immediately. Stale catch/finally/progress/checkpoints cannot change a newer operation or record a session interruption as a user cancellation.
- Account errors return a diagnostic code and log only safe code/status, never credentials or raw provider requests.
- All seven question schemas, sparse distributions, fallback opt-out, exhausted quota, guest mixed batches, and mocked authenticated handler passed relevant regressions. Real App hook-host integration reproduces same-account session recovery and stale rejection; newer generation stays active and completes.
- Typecheck and Pages build passed. CI includes App operation regression.
- Canary harness initially rejected unsupported difficulty `medium` before making a provider request. Root cause was verified in DIFFICULTIES and corrected to `moderate`; final canary succeeded. Do not repeat these rejected harness attempts.
- Heartbeat `audit-pembuatan-kuis-quizmind` installed ACTIVE every four hours, quiet when unchanged. One live canary per run; follow anti-loop circuit breaker and never infer authenticated production success from local canary alone.

## Limits / next meaningful evidence
- Specific historical trigger of spontaneous cancellation is not reproduced from user session; operation-race reproduction validates the protection, not the original auth-event cause.
- Historical 502 cause is unknown. Future safe code/status telemetry is necessary to diagnose recurrence. The observed production success proves account generation can work, not universal availability.
- Deployment verification is recorded after publishing below.

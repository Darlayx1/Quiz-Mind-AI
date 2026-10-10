# Parallel Search integration

Users enter their own Parallel API key in **Pengaturan AI → API key → Parallel Search** and select **Parallel Search** under **Model & penggunaan**. Each guest workspace and account permits one Parallel key, including a disabled key. Replacement updates that slot. Gemini generation and evaluation keys remain separate, with the existing 100-key limit.

## Storage and execution

- Guest metadata and credentials follow the existing IndexedDB repository. Account metadata uses `public.qm_api_keys`; credentials remain in `private.qm_key_credentials`. This follows the existing storage policy, without adding application-level encryption.
- A partial unique database index enforces one Parallel key per account. Local writes enforce the singleton within the existing IndexedDB transaction.
- Account searches run inside the authenticated `quiz-ai` Edge Function. Secrets are resolved against the authenticated owner and never returned to the browser.
- Guest searches default to the separate `parallel-search` Edge Function, supporting static hosting including GitHub Pages. Guest keys are passed for one request only and are not written to Supabase. The relay has no database client or shared search key.
- For a Node server or Worker deployment, `VITE_PARALLEL_RELAY_MODE=same-origin` selects the included `/api/parallel-search` relay instead. Keep the default `supabase` mode on static hosting.
- Search calls have a 15-second timeout, cancellation support, a 4 KiB guest request limit, five usable sources, and at most 3,000 excerpt characters per source. Search failures stop immediately without switching to Google or generation without sources.
- Search evidence is checkpointed before generation and reused across batches/resume. Each generated question must cite URLs from that evidence. This validates source provenance, not the factual correctness of every generated claim.
- Export includes metadata only. Import skips a different Parallel key already on the account unless the user explicitly selects replacement.

## Deployment

1. Apply `supabase/migrations/202610110001_parallel_search.sql` after the existing workspace migration.
2. Run `npm run build:edge` to regenerate shared engines and the standalone dashboard sources `build/quiz-ai.ts` and `build/parallel-search.ts`.
3. Deploy both `quiz-ai` and `parallel-search` Edge Functions using `supabase/config.toml`. The account function verifies the user JWT itself. The guest function intentionally accepts caller-owned keys without login; it has no access to account data.
4. Build/deploy the frontend and, if used, the Node server or Worker. All account/frontend changes should be rolled out after the database migration. No Parallel key belongs in build environment variables.
5. Enter a real user key and press **Uji akses** once. This consumes Parallel quota. Automated tests use simulated API responses and do not verify live billing/access.

Static frontend deployment alone does not install the SQL migration or publish the Edge Functions.

## Verification

`npm run test:parallel` regenerates Edge source and runs isolated tests for API requests/errors, local transactions, citations, batch checkpoints, the UI, authenticated generation, and the static-hosting relay. It also checks the real SQL migrations against disposable PostgreSQL via the development-only PGlite dependency, including RLS, private credentials, singleton constraints, import conflicts, and service ownership. Existing workspace and Gemini generation regression checks are included. Every child process has a 60-second timeout.

Run `npm run lint`, `npm run build`, and `npm run build:pages` for type and packaging checks.

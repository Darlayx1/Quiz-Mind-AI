# Production account storage investigation

Production root cause confirmed: `qm_save_workspace` raised SQLSTATE `40001` for stale application revisions. PostgREST 14.18 automatically retried these permanent conflicts, consuming CPU and API connections indefinitely. The targeted production patch changes the conflict to `PT409` (HTTP 409).

## Live production observations

Public-key probes to project `btsvqhlfkkgwkqsezzoq`, without a user session:

| Endpoint | Result | Duration |
| --- | --- | --- |
| GET `/auth/v1/settings` | HTTP 200 | 2847 ms |
| POST `/rest/v1/rpc/qm_load_workspace` with empty arguments | Timeout; no HTTP response | 15011 ms |
| OPTIONS `/rest/v1/rpc/qm_load_workspace` | HTTP 200; CORS `*` | 440 ms |
| GET `/auth/v1/health` | HTTP 200 | 594 ms |
| GET `/rest/v1/` | HTTP 401; `Secret API key required` | 666 ms |
| GET `/rest/v1/qm_api_keys?select=id&limit=1` | Timeout; no HTTP response | 18001 ms |

These checks returned no user rows or credentials. The RPC is expected to reject anonymous callers; it does not create a workspace without an authenticated identity. OPTIONS and the API-root rejection do not establish database health.

## Supported conclusion

Two independent Data API resource routes do not respond within their deadlines, while Auth and gateway responses work. A production Data API/PostgREST path issue is independently reproducible without React or `getSession()`. This does not prove the same issue is the only cause affecting the user's browser, nor identify the internal bottleneck (gateway, PostgREST connectivity/pool, query locks, or database load).

SDK source was checked: auth-js 2.117.3 uses its lockless path by default. No evidence supports blaming a navigator lock or disabling Auth locking. The app already defers database work outside the Auth callback.

## Next diagnostic step and remedies

Run `supabase/diagnostics/account-storage-health.sql` in this project's SQL Editor and inspect PostgREST/API logs around failed requests. This read-only query reports connections, wait events, blocking PIDs, required schema/permissions, and workspace RPC source without returning tokens, keys, or user records.

- Blocking transactions: resolve the identified blocking operation; do not terminate unrelated sessions.
- Exhausted pool/connections: locate the producers or long transactions and correct them before tuning capacity.
- Unhealthy PostgREST with a healthy database and no blockers: recover the affected service/project under an administrator's control, then verify authenticated workspace and metadata reads.
- Missing schema/permissions: apply only verified missing migrations or grants while retaining RLS and existing data.

No administrative token or service credential is available in the execution environment. The user's native Chrome session could not be inspected due to browser URL enforcement. A separate production tab in Codex was opened for user login; its initial guest workspace works.

## Authenticated production confirmation

The user logged into the Codex browser production tab with the affected account. The same workspace timeout was observed. Diagnostic commit `4d1a1ca` was deployed successfully via GitHub Pages run `38116570260`.

After reloading with the existing authenticated session, the application displayed: "Memuat data penyimpanan: Layanan database akun tidak merespons. Sesi Anda tersedia, tetapi data akun belum dapat dibuka. Coba lagi setelah layanan pulih."

This message is emitted only after `accountSession()` resolves successfully and the subsequent RPC request/response stage times out. The warning was recorded at `2026-10-11T06:00:57.547Z`. No credentials or user records were logged. This rules out a pending session lookup as the source of this reproduced failure. The affected stage is the production Data API workspace request, corroborated by anonymous resource probes.

The new code distinguishes session timeout from database timeout; it does not claim to recover the backend. Internal database/PostgREST diagnosis remains pending administrator SQL output. Do not increase the frontend timeout or reinstall migrations speculatively. No production database or infrastructure was changed during this investigation.

## Follow-up repository and environment audit

The local `.env` was inspected without printing secrets. No management, service-role, or database connection credential was available there or in process environment. URL/public key configuration matches the production defaults. The application's database access uses HTTPS, not a direct PostgreSQL connection pool. Actual hosted PostgREST pool settings and logs require administrator access.

One further zero-row anonymous metadata permission probe (`GET /rest/v1/qm_api_keys?select=id&limit=0`) was allowed up to 45 seconds to distinguish an earlier frontend deadline from a later server error. It still returned no HTTP response and aborted at 45013 ms. This is not a recovery result and no automatic retry was added.

The diagnostic SQL now includes all-database connection counts, reserved connection settings, role connection counts, allowlisted saved role timeouts, function properties, and read-only status. Full function source is no longer returned. It was successfully exercised against disposable PostgreSQL (PGlite): READ ONLY was on, 5s/2s local limits were active, the workspace RPC was not invoked, and fixture rows remained unchanged. This validates the diagnostic script, not production health.

Detailed audit findings, SQL Editor steps, requested outputs, conditional remedies, and recovery criteria are recorded in `docs/implementation/2026-10-11-supabase-sql-editor-guide.md`.

## Administrator investigation and targeted remediation

The Supabase dashboard administrator session was accessible during the subsequent investigation. SQL diagnostics were executed inside `BEGIN READ ONLY` with local 5s statement and 2s lock limits; the transaction was rolled back. These diagnostics did not invoke application write functions or read account records/secrets.

- Dashboard warned of high CPU on Nano compute.
- At 2026-10-11 13:52 UTC: 25 total connections against max_connections 60, required workspace/key tables and load function present, no blocking PIDs or idle long transactions observed.
- PostgREST connections reported application_name `PostgREST 14.18`.
- At the performance snapshot: transaction setup `select set_config(...)` had 106,935,151 calls, whereas completed save calls numbered 335 and load calls 91. Several concurrent active operations were `qm_save_workspace`, with each repeated transaction lasting fractions of a second. Query text was normalized to remove literal values before display.
- Production function source was inspected: it raised `40001` for stale revision, with unchanged owner check and CAS update. Source hash before patch: `7b9879378a1561defa9abc6e9d4b22c0`.
- Saved role statement timeouts: anon 3s, authenticated 8s, authenticator 8s; authenticator lock_timeout 8s. Short individual retries explain why these limits did not end the looping HTTP request.

Official Supabase documentation describes this precise PostgREST 14 behavior and recommends a non-retryable application error: https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b .

The separately authorized repair (not a read-only diagnostic) was applied through SQL Editor: replace `qm_save_workspace` with the same definition and change only the conflict SQLSTATE to `PT409`. No data deletion, permission grants, RLS change, session termination, compute purchase, or timeout increase was performed. Post-patch checks returned: uses_http_conflict=true, uses_retryable_conflict=false, security_definer=true, authenticated_can_save=true.

At 2026-10-11 14:00:35 UTC: zero active authenticator operations; configuration-call count was 107,055,396. A zero-row anonymous metadata probe responded HTTP 401/42501 in 1777ms (correct permission denial), where pre-patch probes timed out up to 45 seconds. This proves Data API responsiveness and termination of the previously observed active loop, not yet authenticated end-to-end recovery.

Local regression coverage checks successful CAS save, stale revision returns PT409 without altering the stored data/revision, cross-account write rejection and RLS isolation, plus frontend HTTP 409 messaging. Database suite (11 tests), actual hook/account adapter tests, TypeScript check and Pages build passed.

Authenticated browser verification after patch was blocked by an in-app browser DNS failure (`ERR_NAME_NOT_RESOLVED` for GitHub Pages) and URL-policy rejection of its generated error page. No credentials were extracted and no browser restriction was bypassed. Stop repeated browser attempts and keep authenticated recovery explicitly pending until a real account workspace load succeeds.

Deployment automation now applies the conflict repair alongside its existing generation migration and stops on database migration failure instead of claiming a successful deployment.

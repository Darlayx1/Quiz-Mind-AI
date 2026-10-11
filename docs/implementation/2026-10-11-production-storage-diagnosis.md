# Production account storage investigation

The deployed timeout now confirms the failure occurs while loading the workspace, before reading key metadata. The prior patch handles timeout/recovery but does not establish the production cause.

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

No administrative token or service credential is available in the execution environment. The user's native Chrome session could not be inspected due to browser URL enforcement. A separate production tab in Codex has been opened for user login; its initial guest workspace works. Authenticated session verification and internal database diagnosis are pending.

Do not increase the frontend timeout or reinstall migrations speculatively. No application code or production infrastructure was changed during this investigation.

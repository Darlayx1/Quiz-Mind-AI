# Account storage loading recovery

## Findings

- The screenshot's recovery screen was rendered for every `ready=false` account state, including an in-progress load.
- Same-owner Auth events restarted loading until a context existed, incrementing the epoch and discarding earlier results.
- Database requests had timeouts, but session lookup before dispatch and the combined workspace/key load had no overall deadline.
- Existing App tests replaced the workspace hook. They did not exercise this loading lifecycle.

## Changes

- Separate loading from readiness/errors in App and settings. Startup timeout exits loading and permits manual recovery.
- Coalesce same-epoch loads and avoid restarting on same-owner Auth events. Switching scope aborts pending requests and rejects old results.
- Bound the combined load to 30 seconds; bound account operations, including session lookup, to 20 seconds.
- Keep the last valid same-account snapshot on a failed refresh. Expired/missing sessions clear account state and expose login recovery, without switching to guest implicitly.
- Provide stage-specific errors, validate response shapes, and distinguish non-JSON responses from authentication errors.
- Add real hook/repository tests with simulated Auth/HTTP and include them in Pages CI. Extend App tests for loading and startup errors.

## Validation

Type checking, production Pages build, account lifecycle tests, App operation tests, local workspace tests, workspace AI tests, and disposable PostgreSQL account/RLS tests passed. The build reports its existing large-chunk advisory.

## Limits

No authenticated production session was available for reproducing the user's exact account failure. No database migration or deployment was performed. Database migration/permission failure in production remains a possible cause; the UI now identifies the failed stage rather than presenting an ambiguous pending state. The deployment script still applies only its selected latest migration; production migration history must be audited before any backend repair.

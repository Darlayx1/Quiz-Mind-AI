# Google-only grounding: latest key audit

User explicitly requires broad Google web grounding, not an encyclopedia-only substitute. Supersedes the uncommitted independent Wikipedia strategy, which was withdrawn before deployment confirmation. Existing deployed Google-only implementation remains in place (307f818).

## Direct evidence

Tests used the latest user-supplied credential only in a child process environment; no credential is recorded here or persisted in code/configuration.

| Request | Result |
| --- | --- |
| Gemini 2.5 Flash generateContent with Google Search | 404 NOT_FOUND: provider explicitly says unavailable to new users and recommends Gemini 3.8 |
| Gemini 3.5 Flash Lite generateContent with Google Search, plain prompt, no quiz schema | 429 RESOURCE_EXHAUSTED |
| Gemini 3.5 Flash Lite plain text control, same credential | 200 |
| Gemini 3.8 Flash Interactions with google_search, store:false | 429 |

The generateContent search rejection contains only a Help link, not QuotaFailure metrics or RetryInfo. Therefore it does not prove the text allowance was consumed or identify a specific exhausted project counter. The control proves the credential can generate text. Rejection occurs without question types, JSON schema, workspace storage, or the Supabase handler, so those cannot explain these minimal provider-side search failures.

The supplied screenshots show unused text-model RPM/TPM/RPD and Free tier. These are valid evidence of available text allowances; they do not display a Google Search entitlement/counter. Ownership of the tested key to the screenshot's project was not independently verified.

## Official access distinction

- https://ai.google.dev/gemini-api/docs/pricing lists Google Search for Gemini 3.5 Flash Lite, 3.6 Flash and 3.8 Flash as unavailable on the API free tier, with a footnote allowing testing in Google AI Studio. Text input/output can still be free.
- https://ai.google.dev/gemini-api/docs/google-search documents broad web access through Google's google_search tool. The deployed code sends googleSearch without restricting search to Wikipedia or a fixed source list.
- API access/tier restrictions are consistent with the observations, but the generic 429 alone does not establish the exact project's tier or limit. Verify the project owning the credential and its Google Search access before further automatic probes.

## Circuit breaker and next action

Three distinct grounded routes failed with the latest key (legacy model, minimal generateContent, current Interactions). Stop automatic search probes until access changes or a new, verified supported route is available. No billing, credentials, or permissions were changed. The previously paused heartbeat remains paused.

The supported next action is for the user to verify/enable Google Search API access on the key's project, including the required paid API tier where applicable. Activating billing is a user action with financial consequences; deploy authorization does not authorize it. Once access is confirmed, run one bounded Google-only quiz canary and verify actual queries/source metadata before claiming end-to-end success.

No application patch can grant a provider entitlement. No new deployment is claimed. All prior uncommitted Wikipedia functionality was removed from the working tree; its development checkpoint is retained in ignored .qa for audit only.

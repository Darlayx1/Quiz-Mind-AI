# Required web research

User requires current, sourced quiz facts. This supersedes the previous no-search fallback strategy.

## Live evidence / circuit breaker
- Minimal Google Search calls, without structured quiz output, rejected with 429 on both gemini-3.5-flash-lite and gemini-3.8-flash.
- Neither response provided quota metric or RetryInfo, so exact quota type and billing requirement remain unknown. Do not label the project free-tier or assume billing is the cause.
- Together with earlier grounded quiz 429 this is sufficient evidence of blocked Google Search access. No more identical automatic probes without new evidence (project quota/access changed or key from another project).
- Official docs: https://ai.google.dev/gemini-api/docs/google-search and https://ai.google.dev/gemini-api/docs/rate-limits. Google limits apply per project; different keys on the same project share limits.

## Implemented contract
- Web-active guest and authenticated account generation must use Google Search. Legacy allowGroundingFallback=true is ignored; UI removes that option.
- Real webSearchQueries and HTTP(S) groundingChunks are required. No metadata means WEB_SEARCH_EMPTY, no retries of identical output. The usedGrounding flag is based on actual response evidence, not just a requested tool.
- Search quota errors return WEB_SEARCH_QUOTA and stop without silently disabling web or retrying identical calls.
- Prompt requires checking facts, answers and explanations using current primary sources, source dates and historical/current distinctions. This instruction and search evidence do not guarantee every claim is correct.
- Search timestamp is stored and shown; source links remain in question review. Sources currently represent batch research, not verified one-to-one claim/source attribution.
- Gemma cannot fulfill web-active generation and gets a clear unsupported error. Partial older no-web fallback quizzes must start anew for required web.
- Canary now requires real grounding evidence and citations on every question. Previously successful no-web canary does not qualify.
- Existing heartbeat prompt updated for required web and no repeated blocked probes; existing PAUSED status preserved.

## Verification
- Guest/account mocked regressions pass all seven question types, actual grounding evidence, missing source/query rejection, legacy preference safety, quota stop, and grounded multi-batch success.
- Mixed quiz regression, App session race regression, typecheck and Pages build passed.
- Real web generation remains externally blocked by Google 429. Next step is reviewing Google AI Studio project limits or providing authorized access to a different project with working search quota. Do not enable billing automatically.

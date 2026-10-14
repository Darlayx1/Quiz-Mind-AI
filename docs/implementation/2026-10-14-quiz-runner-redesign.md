# Quiz runner redesign — 2026-10-14

UI verification: VERIFIED locally. Publication is tracked by the GitHub Pages workflow for the published commit.

## Acceptance and implementation

- The active runner takes over the viewport; App omits TopBar, workspace status strip, and footer only while the runner is rendered.
- A sticky header contains the title, total/per-question/untimed clock, export icon, and exit control. The animated progress track spans the viewport content width and starts directly below the header.
- Desktop uses 12 columns with an 8-column question area and a 4-column sticky navigation card. Below 1024px, a fixed action bar opens an accessible bottom sheet with keyboard focus containment, Escape dismissal, focus restoration, and scroll locking.
- All seven existing question types retain their structured AnswerValue contracts, option IDs, validation, max lengths, scoring, and stable shuffled ordering. Legacy numeric choices and false boolean answers remain supported.
- Complete, partial, flagged, and unanswered states share aligned indicators. Reset appears in the question footer only after an answer exists. Essay readiness below eight words is a UI hint; grading does not change. Bookmark counts overlap answer completeness, as in the requested design.
- Free navigation uses IntersectionObserver scroll-spy. Untimed sequential sessions support previous/next and palette jumps with answers preserved. Sessions containing per-question timers keep the existing forward-only locking policy; previous and earlier palette controls remain disabled to protect deadlines.
- Reduced-motion styles stop animations and transitions. Safe-area padding protects the mobile action bar.

## Diagnostics and interventions

1. UI redesign: one substantive implementation pass, followed by verification.
2. App regression test initially failed because it invoked TopBar during an active runner. The intended exam mode omits TopBar. Updated that test to use onQuit and assert chrome disappearance/restoration plus progress preservation; the next run passed.
3. Browser testing exposed the pre-existing StrictMode lease race: the discarded mount could briefly acquire a lock and make the real mount read-only. Deferred acquisition by one microtask and ignored stale effects. The next browser run and a dedicated regression test passed. Actual other-tab locks still block editing/submission.
4. Preview HMR reported duplicate createRoot registration during source edits. Reuse the preview root through Vite hot data.

No repeated failed correction strategy or circuit-breaker event occurred. Existing unrelated Google-login documents and agent rules were preserved.

## Verification

- npm run build: PASS; client, server, and Worker artifacts generated. Vite retains its non-blocking warning about chunks larger than 500 kB.
- npm run lint: PASS (tsc --noEmit, including preview props).
- node --import tsx scripts/quiz-types-test.ts: PASS.
- node --import tsx scripts/app-operation-test.ts: PASS.
- npm run test:runner: PASS. Covers all seven disabled/reset contracts, legacy/false answers, essay/matching readiness, stable ordering, StrictMode ownership, untimed previous/next, timed locking with zero type overrides, restored deadline/attempt/bookmarks, duplicate submission, and actual tab conflicts.
- git diff --check: PASS.
- Browser fixtures: 320x740, 390x844, 768x1024, 1024x900, 1440x1000. No horizontal overflow observed. At 1024px the sidebar appears and the bottom bar hides. Header top is zero; progress width matches document client width (excluding the scrollbar).
- Browser interactions: restored mixed progress; essay partial-to-complete; free-mode scroll-spy; mobile drawer and Escape/focus restoration; sequential previous/next, multi-select and false answers retained in the received submission; submit confirmation. Timer styles verified at 600s, 120s, and 45s.

Local screenshots are stored in .qa/quiz-runner/desktop.jpg and .qa/quiz-runner/mobile-drawer.jpg (ignored QA artifacts). The local fixture uses no provider calls or real saved history. Automated timing tests use an isolated clock. Production account persistence and remote deployment were outside this task.

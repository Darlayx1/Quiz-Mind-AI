# Project Agent Instructions

## Permanent Anti-Loop Rules

Before starting any task in this workspace, read and follow `.agents/rules/anti-loop.md`, which contains the Universal Anti-Loop Intelligence Protocol (UALIP 3.0). Apply this always-active protocol to task classification, diagnostics, attempt accounting, execution budgets, recovery, changes, and verification.

Use UALIP 3.0 risk-aware attempt budgets and circuit-breaker criteria. Non-mutating diagnostics do not automatically count as correction attempts. Track substantive interventions by stable problem identity, reassess after two consecutive interventions without meaningful progress, and stop the affected operation when its budget is exhausted or another circuit-breaker condition applies.

Preserve existing project rules and user changes. Do not modify application functionality when installing or maintaining agent rules.

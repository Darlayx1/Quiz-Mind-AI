# Project Agent Instructions

## Permanent Anti-Loop Rules

Before starting any task in this workspace, read and follow `.agents/rules/anti-loop.md`. Apply these rules to every task, including debugging, terminal execution, context management, changes, and verification.

The anti-loop rules are always active. Allow at most three attempts per problem. After two consecutive failures with identical symptoms, stop code changes and perform root cause analysis before another attempt. After three failed attempts, stop automatic attempts and report findings, limitations, and next options.

Preserve existing project rules and user changes. Do not modify application functionality when installing or maintaining agent rules.

---
name: run-and-verify-tests
description: Run, debug and verify Vitest unit tests in the Taskly monorepo (backend and frontend), measure coverage of specific files and check test stability. Use after writing or changing tests and before reporting results; also use to find uncovered lines and branches.
allowed-tools: Bash(node ${CLAUDE_SKILL_DIR}/scripts/uncovered-lines.mjs *)
---

# Run and verify tests

All commands run from the repository root. Only these commands are permitted; do not try
alternatives (`npx`, `cd`, shell redirection) — they are blocked.

| Purpose | Backend | Frontend |
|---|---|---|
| One or more test files | `npm --prefix backend test -- tests/x.test.ts` | `npm --prefix frontend test -- src/lib/x.test.ts` |
| Whole project | `npm --prefix backend test` | `npm --prefix frontend test` |
| Type check | `npm --prefix backend run typecheck` | `npm --prefix frontend run typecheck` |
| Coverage report (JSON for the script below) | `npm --prefix backend run test:coverage -- --coverage.reporter=json --coverage.reporter=text-summary` | `npm --prefix frontend run test:coverage -- --coverage.reporter=json --coverage.reporter=text-summary` |
| Gaps in specific files | `node .claude/skills/run-and-verify-tests/scripts/uncovered-lines.mjs backend src/factory.ts` | `node .claude/skills/run-and-verify-tests/scripts/uncovered-lines.mjs frontend src/lib/http.ts` |
| Formatting (frontend only) | — | `node frontend/node_modules/prettier/bin/prettier.cjs --write frontend/src/x.test.tsx` |

A coverage run may exit non-zero because of coverage thresholds; the report is still written.
Read the numbers instead of treating that as a test failure.

## The loop (per test file)

1. Run the file. If it passes, run it a second time with `--sequence.shuffle` appended to check
   that tests do not depend on order or leaked state.
2. If it fails, read the **first** error fully and classify it:
   - **Test bug** (wrong import path, missing mock, wrong query, async not awaited, type error):
     fix the test.
   - **Wrong expectation** about behaviour: re-read the source; assert what the code is clearly
     meant to do. If the code itself looks wrong, remove that assertion, keep the rest, and record a
     suspected bug.
   - **Environment gap** (jsdom lacks an API such as `showModal`, `matchMedia`, `scrollIntoView`):
     stub it inside the test file and restore it afterwards.
   - **Pre-existing failure** unrelated to your change: do not touch it; mention it in `notes`.
3. At most **three** fix attempts per file. Then revert your changes to that file by restoring its
   previous content with an edit (or deleting what you added), and mark the source file
   `needs_human` with the last error message.
4. Check coverage of the target file with the coverage command and the gaps script. Add tests for
   meaningful uncovered branches; do not chase lines that only exist for defensive typing.

## Before reporting (mandatory)

For every affected project:

1. `npm --prefix <project> test` — the whole suite must pass, not only your files.
2. `npm --prefix <project> run typecheck` — must pass.
3. Frontend: format every test file you changed with Prettier.
4. Record the final totals (passed/failed) from the last whole-suite run for `test_runs`.

Never report a run you did not execute, and never report passing tests when the last run failed.
The CI workflow re-runs everything independently and will reject the patch if your report and
reality differ.

## Never

- Change production code, configuration or thresholds to make a test pass.
- Mark tests as skipped, todo, only or expected-to-fail.
- Replace a precise assertion with a vague one (`toBeDefined`, `toBeTruthy`) to get green.
- Increase timeouts to hide slowness; fix the waiting logic instead.

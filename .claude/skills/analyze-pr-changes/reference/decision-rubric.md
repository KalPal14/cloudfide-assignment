# Decision rubric

Use the first row that matches.

| # | Signal | Decision | Reason template |
|---|---|---|---|
| 1 | Source file deleted | `needs_human` | "Source deleted; related tests X may be obsolete — removing tests is reserved for humans." |
| 2 | File only re-exports, declares types, or holds static values | `skipped` | "No runtime logic (re-export/types/constants)." |
| 3 | Changed lines are comments, formatting, imports or renames only | `skipped` | "Change has no behavioural effect." |
| 4 | Existing tests already assert every changed behaviour: `uncoveredRanges` and `uncoveredBranchRanges` are empty **and** you checked the assertions, not just execution | `skipped` | "Covered by `<test>`: asserts <behaviour>." |
| 5 | An existing test fails on the PR head, and the diff or PR description states the new behaviour | `updated` | "Intended change (<quote the intent>): updated assertions for <behaviour>." |
| 6 | An existing test fails on the PR head and intent is not stated | `needs_human` | "Possible regression: `<test>` expects <old>, code now does <new>." |
| 7 | Behaviour looks wrong (contradicts validation rules, API contract, UI text, naming) | test the rest; add to `suspected_bugs` | "Tested <A, B>; <C> looks like a bug, reported instead of asserted." |
| 8 | Test file exists and changed lines contain logic that is uncovered **or only executed incidentally** (uncovered branches, a new exported function tested only through a caller, a bug fix without an assertion pinning it) | `updated` | "Added tests for <behaviours> (lines <ranges>)." |
| 9 | No test file and the file has logic | `created` | "New test file covering <behaviours>." |
| 10 | Testing requires changing production code (hidden globals, side effects at import, no seam) | `needs_human` | "Not unit-testable without refactoring: <why>." |

## What counts as "logic"

Branches, loops, data mapping, validation, error handling, state transitions, effects and
cleanup, conditional rendering, event handlers, cache updates, HTTP status mapping, routing order.

## What is not worth a unit test here

Styled-components styles, stories, theme tokens, type declarations, barrels, the Prisma generated
client, `frontend/src/main.tsx`. These are already filtered by the manifest; do not add them back.

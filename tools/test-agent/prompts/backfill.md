Mode: backfill

Raise unit-test coverage of existing code in one scope of the repository. Your input:

- `.test-agent/manifest.json` — trusted, deterministic list of the files in scope that are not fully covered, ordered by the number of uncovered lines, with `uncoveredRanges`, test candidates and related tests.

Follow your workflow: analyse the manifest files with the `analyze-pr-changes` skill, write meaningful tests for the untested behaviour using the `backend-unit-tests` and `frontend-unit-tests` skills, verify them with the `run-and-verify-tests` skill (targeted runs, then the full suite and type check of every affected project), and finish with the structured report described by the `test-report` skill.

Aim for tests that specify behaviour: every branch that matters, error handling and boundaries. Coverage is a consequence, not the goal; skip lines that would only be covered by asserting implementation details.

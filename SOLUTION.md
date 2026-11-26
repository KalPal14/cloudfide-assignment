# Solution: unit-test agent and agentic PR workflow

**Summary**

- **Custom agent.** [`unit-test-engineer`](.claude/agents/unit-test-engineer.md) runs headless in Claude Code inside GitHub Actions: `claude -p --agent unit-test-engineer`.
- **Reusable skills** in [`.claude/skills/`](.claude/skills):
  - `analyze-pr-changes`
  - `backend-unit-tests`
  - `frontend-unit-tests`
  - `run-and-verify-tests`
  - `test-report`
- **Agentic workflow.** [`.github/workflows/test-agent.yml`](.github/workflows/test-agent.yml) runs `gate → generate → verify → publish` automatically on every pull request. A manual mode backfills coverage one scope at a time.
- **Results in the PR:**
  - a sticky comment: decisions, independent verification, coverage, suspected bugs, skills used, cost;
  - a bot commit with the verified tests;
  - a commit status and CI on that commit;
  - job summaries, JUnit annotations and artifacts, including the agent transcript.

| | Tests before → after | Line coverage before → after |
|---|---|---|
| backend | 48 → **82** | 33.0% → **100%** (statements 99.2, branches 100, functions 96.9) |
| frontend | 18 → **145** | 35.5%¹ → **100%** (statements 99.6, branches 98.8, functions 100) |

¹ Measured with the design-system component logic now included (47.7% with the original scope). The agent generated every new test through the workflow in 8 backfill PRs. Thresholds now lock the level in ([#11](https://github.com/KalPal14/cloudfide-assignment/pull/11); branch floors raised to 95% in [#27](https://github.com/KalPal14/cloudfide-assignment/pull/27)).

**Demo:** [PR #12 "clear completed tasks"](https://github.com/KalPal14/cloudfide-assignment/pull/12) shows the full loop over three pushes. See the [example run](#example-run).

---

## 1. Main technical decisions

| Decision | Why |
|---|---|
| **Claude Code CLI as the agent runtime**, version pinned, called directly rather than through a wrapper action | Custom agents (`.claude/agents`) and Agent Skills (`.claude/skills`) are native, so the same agent and skills work in a developer's terminal and unattended in CI. Calling the CLI directly avoids the GitHub App and auto-commit behaviour of `claude-code-action`. The workflow, not the model, decides what reaches the repository. |
| **Deterministic code around a narrow model task** | [`tools/test-agent/`](tools/test-agent) (zero dependencies, 128 `node:test` tests) does everything that must be exact: the change manifest, file classification and prioritisation, patch collection, path policy, quality gate, diff coverage, verdict and report rendering. The model only decides *what* to test and writes the tests. |
| **Gate before the model** | Types, styles, stories, barrels, docs, config, generated code and tests changed in the PR are filtered out deterministically. PRs without testable changes never call the model and cost $0 ([#2](https://github.com/KalPal14/cloudfide-assignment/pull/2), [#11](https://github.com/KalPal14/cloudfide-assignment/pull/11)). Runs are capped at 15 files. Files are ordered by uncovered changed lines and branches. |
| **Never trust the agent's own claims** | `verify` runs in a job **without credentials** on a fresh checkout. It applies the patch, then runs: type check, Prettier, the full suites with coverage, the changed specs 3× in shuffled order, a quality gate (no `.only/.skip/.todo/.fails`, no snapshots or `@ts-ignore`, at least one assertion per spec, no lost tests), and line and **branch** coverage of the changed lines before and after. This caught real failures (see [Implementation notes](#implementation-notes)). |
| **Commit to the PR branch only after verification** | Tests arrive as a normal reviewable commit from `github-actions[bot]`. If verification fails, nothing is pushed: the comment explains why, and the patch stays in the run artifacts. |
| **Workload identity federation, no API key** | GitHub OIDC → short-lived Anthropic credentials scoped to one workspace with a spend limit. The Console rule trusts only this repository, by its immutable owner and repository IDs. It accepts only `pull_request` events and `workflow_dispatch` on `main`, and only from the `test-agent.yml` workflow file (CEL on `workflow_ref`). A real run confirmed this after the clause was added ([run](https://github.com/KalPal14/cloudfide-assignment/actions/runs/45829462148)). No secret is stored anywhere. |
| **Structured output plus observed facts** | `--json-schema tools/test-agent/report.schema.json` forces a validated report. The comment combines it with facts the harness observes itself: the skills actually invoked (from the transcript), turns, cost, guardrail denials and the verification verdict. |
| **Batched backfill** | Each scope (`tools/test-agent/lib/scopes.mjs`) fits one run and becomes one reviewable PR. |

### Security model

**Trust assumptions:**

- Same-repository PR authors are trusted: they already have write access.
- Fork PRs get no OIDC token and are skipped explicitly. `pull_request_target` is never used.
- `id-token: write` applies to the whole `generate` job. PR code that runs in `npm ci` or in the baseline tests could therefore request a GitHub OIDC token and exchange it for an Anthropic credential that lasts about 10 minutes. The trust assumption above covers this; the production section below describes how to remove it.

**Threats addressed:**

- prompt injection through code, comments or PR text;
- the agent writing outside the test tree or weakening tests;
- test code exfiltrating credentials;
- runaway cost.

| Layer | Control |
|---|---|
| Untrusted input | The PR title and body go to a file labelled untrusted and are never interpolated into shell. The agent and skills treat all repository content as data. |
| Tools | `--agent` restricts the tools: no web access, no subagents. `--permission-mode dontAsk` applies an explicit Bash allowlist and denylist (`curl`, `git push`, `npm install`, `rm`, `env`, …). Claude Code also blocks shell redirections and loops. |
| Writes | A PreToolUse hook ([`guard-test-paths.mjs`](.claude/hooks/guard-test-paths.mjs)) blocks `Edit`/`Write` outside the test allowlist. The sandbox denies writes to `backend/src`, `.github`, `.claude` and `tools`. `collect-patch` keeps only allowlisted files and reports the rest. `verify-patch` rejects deletions, renames, symlinks, mode changes, binaries and oversize patches. It runs **from the base branch**, in a job without credentials, and again right before the commit. After `git apply` it also checks the staged index, which must hold exactly the files the patch check listed: git reads more patch formats than the policy parser. |
| Execution | Every Bash command, and therefore every test the agent runs, executes in the Claude Code bubblewrap sandbox. The sandbox has **no network**, cannot write to `backend/src`, `.github`, `.claude` or `tools`, and cannot read the OIDC token directory. **Verified** by a probe PR ([#15](https://github.com/KalPal14/cloudfide-assignment/pull/15)): tests that the agent ran inside its sandbox could not reach the network, write to `backend/src` or read the token. The same probes succeed outside the sandbox (control). The GitHub OIDC request variables are removed from the agent's environment. The env-scrub hardening mode (`CLAUDE_CODE_SUBPROCESS_ENV_SCRUB`) is on: Claude Code strips credentials from the environment of the commands it starts and runs them in their own PID namespace. **Measured** by a probe PR ([#25](https://github.com/KalPal14/cloudfide-assignment/pull/25)) with the mode off and on: with it on, a test process no longer sees the path of the OIDC token file or Claude Code's messaging token, and both suites still run. |
| Privileges | `permissions` are set per job. Only `publish` can write, and it never installs dependencies or runs PR code. It reads the other jobs' artifacts as data (`jq`, never `require()`). Actions are pinned to SHAs, the repository setting enforces this, and Dependabot keeps the pins current. `persist-credentials: false` is set everywhere except the push checkout. |
| Cost and liveness | `--max-turns` and `--max-budget-usd`: PR 60 turns / $3, backfill 80 / $5. Job and step timeouts, per-PR `concurrency` with cancel-in-progress, and a workspace spend limit. |
| Output | The comment is rendered deterministically. Model text is HTML-escaped, `@mentions` are neutralised and lengths are capped. |

## 2. How to run it

### Prerequisites

1. **Claude Console** ([platform.claude.com](https://platform.claude.com)):
   - Create a workspace (here `taskly-ci`) with a monthly spend limit.
   - In *Settings → Workload identity*, connect a **GitHub Actions** workload with this rule:
     - subject pattern: `repo:<owner>@<owner_id>/<repo>@<repo_id>:*`
       GitHub now issues subjects with immutable IDs, as in `repo:KalPal14@56432055/cloudfide-assignment@1473001921:ref:refs/heads/main`.
     - expected audience: `https://api.anthropic.com`
     - CEL condition:
       ```
       claims.workflow_ref.startsWith("<owner>/<repo>/.github/workflows/test-agent.yml@") && (claims.event_name == "pull_request" || (claims.event_name == "workflow_dispatch" && claims.ref == "refs/heads/main"))
       ```
     - enabled only in the CI workspace, with a dedicated service account as target, and a 10-minute token lifetime.
2. **GitHub repository variables**. No secrets are needed.
   - Required:
     - `ANTHROPIC_FEDERATION_RULE_ID` (`fdrl_…`)
     - `ANTHROPIC_ORGANIZATION_ID`
   - Optional:
     - `ANTHROPIC_SERVICE_ACCOUNT_ID`
     - `ANTHROPIC_WORKSPACE_ID`
     - `TEST_AGENT_MODEL` (default `claude-sonnet-5-5`)
     - `TEST_AGENT_PR_BUDGET_USD` (default 3)
     - `TEST_AGENT_BACKFILL_BUDGET_USD` (default 5)
3. **Actions settings:**
   - workflow permissions: *Read repository contents*;
   - *Allow GitHub Actions to create and approve pull requests* (backfill opens PRs);
   - approval required for all external contributors;
   - SHA pinning required.
4. **A `skip-test-agent` label**, used to opt a pull request out.
5. **A ruleset on `main`** (optional, used here): changes only through pull requests, required checks `backend`, `frontend` and `test-agent tools`, no force pushes, no deletion.

### Pull requests (automatic)

Open or update a non-draft PR from a branch of this repository. **Test Agent** runs on `opened`, `synchronize`, `reopened` and `ready_for_review`. Add the `skip-test-agent` label to opt out. Runs triggered by a bot account (the agent's own commit, Dependabot) are skipped.

### Coverage backfill (manual)

*Actions → Test Agent → Run workflow* on `main`, with one scope:

- `backend-core-api`
- `backend-features`
- `frontend-hooks-lib`
- `frontend-components`
- `frontend-design-system`

From the CLI: `gh workflow run test-agent.yml -f scope=backend-features`. The workflow opens a PR with the verified tests and dispatches CI for it.

### Locally

The agent and skills are plain Claude Code configuration:

- `claude --agent unit-test-engineer`;
- or ask any session to use `/backend-unit-tests` or `/frontend-unit-tests`.

Other useful commands:

- deterministic helpers: `npm run test:agent-tools`
- both projects: `npm test` and `npm run typecheck`

## 3. Where the agent and skills are defined and how they are used

```
.claude/agents/unit-test-engineer.md      agent: role, restricted tools, hard rules, workflow
.claude/skills/analyze-pr-changes/        decision rubric: created / updated / skipped / needs_human
.claude/skills/backend-unit-tests/        backend conventions + patterns (Supertest, Prisma delegate spies, env, lifespan)
.claude/skills/frontend-unit-tests/       frontend conventions + patterns (RTL, design-system mocks, React Query, jsdom gaps)
.claude/skills/run-and-verify-tests/      allowed commands, fix loop, stability, scripts/uncovered-lines.mjs
.claude/skills/test-report/               how to fill the structured report
.claude/test-agent/settings.json          permissions, PreToolUse hook, sandbox (passed with --settings)
.claude/hooks/guard-test-paths.mjs        write guard (shares tools/test-agent/lib/path-policy.mjs)
tools/test-agent/                         manifest, patch policy, quality gate, diff coverage, report, prompts, schema
.github/workflows/test-agent.yml          the agentic workflow
.github/workflows/ci.yml                  deterministic CI (also dispatched after bot commits)
```

During a run:

1. `gate` builds the manifest without the model.
2. `generate` installs dependencies (before any credential exists), takes baseline coverage and rebuilds the manifest with uncovered lines and branches.
3. It starts the agent with a fixed prompt ([`prompts/pr.md`](tools/test-agent/prompts/pr.md) or [`backfill.md`](tools/test-agent/prompts/backfill.md)).
4. The agent invokes its skills through the `Skill` tool:
   1. `analyze-pr-changes` decides, file by file.
   2. `backend-unit-tests` and/or `frontend-unit-tests` write the tests.
   3. `run-and-verify-tests` runs, fixes and re-runs them.
   4. `test-report` builds the report, which the agent returns.
5. `extract-run.mjs` records which skills were actually invoked.
6. `verify` re-runs everything independently.
7. `publish` commits and comments.

## 4. Example run

[PR #12](https://github.com/KalPal14/cloudfide-assignment/pull/12) adds "clear completed tasks":

- backend: repository method, `DELETE /api/todos/completed` (registered before `/:id`), OpenAPI;
- frontend: API call, mutation hook, confirmation dialog, header button, page wiring.

The PR contains no tests. Its description states that the `TodosHeader` change is intended.

**Push 1: feature** ([run](https://github.com/KalPal14/cloudfide-assignment/actions/runs/45818168853) → bot commit `8632a39`)

- **Gate:** 7 files went to the agent. 3 were filtered without the model: `openapi.json` (contract), `types.ts`, `queryKeys.ts`.
- **Decisions:**

  | File | Decision |
  |---|---|
  | `ClearCompletedDialog` | **created**, 7 tests: singular/plural text, success → `onCleared(n)`, failure keeps the dialog open, cancel, disabled at 0, busy/pending |
  | `useClearCompletedMutation` | **created**, 3 tests: cache update, empty cache, unchanged on error |
  | `router.ts` | **updated**: `DELETE /completed` returns `{ deleted }` and *is not treated as an id* |
  | `repository.ts` | **updated** |
  | `todos.ts` (api) | **updated** |
  | `TodosPage` | **updated** |
  | `TodosHeader` | **updated**: the old test failed the type check, and the agent recognised the change as intended from the PR text |

- **Skills used:** `analyze-pr-changes`, `backend-unit-tests`, `frontend-unit-tests`, `run-and-verify-tests`.
- **Verification:** type checks ✅, backend 82/82, frontend 148/148, 3× shuffled ✅, quality gate ✅, **changed-line coverage 12% → 100%**.
- **Suspected bug reported, not encoded:** the notice read "`1 completed tasks cleared.`".
- **Cost:** 40 turns, $0.28, 101 s.

**Push 2: author fixes the reported bug** with `formatClearedNotice()` for 0 / 1 / many ([run](https://github.com/KalPal14/cloudfide-assignment/actions/runs/45819115997)).

The agent decided no tests were needed. The new helper's *lines* were executed by an existing page test with `deleted = 3`, but its 0 and 1 branches were never asserted. This exposed a gap in the tooling, which was fixed in [#13](https://github.com/KalPal14/cloudfide-assignment/pull/13):

- the manifest and report now include **uncovered branches** on changed lines;
- the rubric treats code as covered only when its lines **and** branches are covered and asserted.

**Push 3: `main` merged in, with the improved tooling** ([run](https://github.com/KalPal14/cloudfide-assignment/actions/runs/45820222542) → bot commit `bd0ef06`)

- **Decision:** `utils/todos.ts` **updated** with a table test for `formatClearedNotice` covering 0, 1 and 5.
- **Reasoned skip:** the remaining uncovered branch in `ClearCompletedDialog` is a pending guard that the UI cannot reach while the button is disabled. The agent did not chase it.
- **Results:** frontend 151/151, branches of changed lines **85% → 95%** (19/20), 21 turns, $0.14, 45 s, skills `analyze-pr-changes`, `frontend-unit-tests`, `run-and-verify-tests`, `test-report`.
- **The same sticky comment was updated** each time, not duplicated.

### Backfill results

| Scope | PR | Tests added (measured) | Result | Agent run |
|---|---|---|---|---|
| backend-core-api | [#4](https://github.com/KalPal14/cloudfide-assignment/pull/4) | 19 (6 new files) | backend lines 33% → 87%. Reported a real bug: on `EADDRINUSE`, `start()` fails with a misleading `TypeError` (`lifespan.ts:14`) | 28 turns, $0.18 |
| backend-features | [#5](https://github.com/KalPal14/cloudfide-assignment/pull/5) | 13 | backend lines → 100% | 14 turns, $0.09 |
| frontend-components | [#6](https://github.com/KalPal14/cloudfide-assignment/pull/6) | 18 | target files 60.6% → 100% | 30 turns, $0.34 |
| frontend-hooks-lib | [#8](https://github.com/KalPal14/cloudfide-assignment/pull/8) | 41 | frontend lines 49% → 74% | 42 turns, $0.29 |
| frontend-design-system | [#10](https://github.com/KalPal14/cloudfide-assignment/pull/10) | 57 | frontend lines 74% → 100% | 43 turns, $0.33 |
| frontend-hooks-lib (follow-up after [#18](https://github.com/KalPal14/cloudfide-assignment/pull/18)) | [#19](https://github.com/KalPal14/cloudfide-assignment/pull/19) | 2 | `utils/todos.ts` branches 94.4% → 100% (sorting tie-breaks) | 16 turns, $0.09 |
| backend-core-api (branches, after [#21](https://github.com/KalPal14/cloudfide-assignment/pull/21)) | [#22](https://github.com/KalPal14/cloudfide-assignment/pull/22) | 2 | backend branches 95.8% → 100% (default port, error after the headers were sent) | 21 turns, $0.10 |
| frontend-components (branches, after [#21](https://github.com/KalPal14/cloudfide-assignment/pull/21)) | [#23](https://github.com/KalPal14/cloudfide-assignment/pull/23) | 9 | frontend branches 93.6% → 98.8%; `TodoItem.tsx` 35.7% → 100%. Skipped with a reason: a pending guard the UI cannot reach | 35 turns, $0.23 |

All agent runs that did work, including the failed ones and the sandbox probes: **21 runs, $3.80 in total**.

### Implementation notes

Problems found in real runs and how they were fixed. Unless noted, each problem was caught by the independent `verify` job or by the run report.

- **OIDC rule rejected the token twice.** GitHub's `sub` now embeds immutable IDs; the fix was a new subject pattern. Numeric claim values did not match strings; the numeric claims were dropped, because the subject already pins the IDs.
- **Sandbox failed on Ubuntu runners** (`apply-seccomp: nested userns is capability-restricted`). Ubuntu's AppArmor `bwrap-userns-restrict` profile drops capabilities in bwrap's children. The job now unloads it on the ephemeral VM and self-tests nested user namespaces before any model call ([#3](https://github.com/KalPal14/cloudfide-assignment/pull/3)). The agent had reported its tests as *unverified*, and `verify` rejected them: 1 of 68 failing, unstable under shuffling.
- **No frontend test could start inside the sandbox, and the first diagnosis was wrong.** The `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB` hardening mode write-protects config files at the project root and puts a 0-byte placeholder where one is missing. The repository had no root `package.json`, and an empty one breaks Node and Vite. [#7](https://github.com/KalPal14/cloudfide-assignment/pull/7) was meant to add the file, but it never reached the repository: it was listed in `.git/info/exclude`. The failures continued, the mode itself was blamed and turned off in [#9](https://github.com/KalPal14/cloudfide-assignment/pull/9). Two batches had failed verification, so nothing broken was committed. The file is tracked since [#21](https://github.com/KalPal14/cloudfide-assignment/pull/21). A probe ([#25](https://github.com/KalPal14/cloudfide-assignment/pull/25)) then showed that the mode works with it, and it is on again ([#26](https://github.com/KalPal14/cloudfide-assignment/pull/26)); the workflow now checks for the file before the agent starts.
- **The sandbox did not enforce relative `denyWrite` entries.** The probe in [#15](https://github.com/KalPal14/cloudfide-assignment/pull/15) showed that test code could still write to `backend/src`. Relative entries in a `--settings` file have no documented base directory. The workflow now resolves them to absolute paths ([#16](https://github.com/KalPal14/cloudfide-assignment/pull/16)), and the re-run of the probe confirmed the fix. The patch policy, the final boundary, was never bypassed: it discarded the probe file.
- **Gaps found by reviewing the run artifacts**, not by a failing run ([#21](https://github.com/KalPal14/cloudfide-assignment/pull/21)). The two backfill runs above were the first to use the new checks:
  - The "no tests lost" comparison never matched anything. The baseline and the verified run had different checkout roots, so every `before` count in `gate.json` was 0. Test paths are now anchored on the project directory, and a result that cannot be mapped is a violation.
  - `git apply` also applies a traditional `---`/`+++` section, which the policy parser does not read. The staged index is now checked after the patch is applied.
  - The `publish` job read artifact JSON with `require()`, which executes a directory of that name. It now uses `jq`.
  - A run triggered by the agent's own commit replaced the report with "agent not run". Such runs are now skipped.
- **Smaller fixes:**
  - `--json-schema` needs `StructuredOutput` in the agent's tool list;
  - the schema must be draft-07 compatible;
  - styled-components `*.variants.ts` maps are styles, not logic.

## 5. Assumptions

- Unit tests only: no integration tests against a real PostgreSQL, no E2E.
- Contributions come from branches of this repository. Fork PRs are skipped with an explanation.
- Generated tests are reviewed like any other code before merge. The workflow never merges.
- The existing conventions are the target style: flat `backend/tests`, colocated frontend tests, design-system mocks.
- A run should cost cents to a few dollars, with Sonnet as the default model.

## 6. Limitations

- **Non-determinism.** Two runs can produce different tests. Verification guarantees the tests pass, are stable and cover the change. It does not guarantee they are the best possible tests.
- **Semantic weakness.** Structural problems are caught, but weak assertions can still pass. Mutation testing would measure this (see below).
- **`GITHUB_TOKEN` and bot runs.**
  - Commits and PRs made with `GITHUB_TOKEN` start `pull_request` runs that wait for maintainer approval (`action_required`), and GitHub closes them if nobody approves.
  - The workflow therefore sets a commit status and dispatches CI for the new commit itself.
  - Approving such a run is safe: Test Agent skips runs triggered by a bot, so the report in the comment stays.
  - The dispatched CI run does not count towards required checks. With the ruleset on `main`, a pull request whose head is a bot commit can be merged only after a maintainer approves the waiting runs. That is one click, and it keeps a person between the agent's commit and `main`.
- **Fork PRs get no agent run.**
- **The sandbox setup is Ubuntu-specific:** the job lifts the AppArmor user-namespace restriction on the ephemeral runner.
- **Large PRs:** up to 15 files per run; the rest are listed as deferred.

## 7. What I would change for production

- **Hosting**
  - Use a **GitHub App** identity instead of `GITHUB_TOKEN`. Bot commits would then trigger CI natively, and the bot would have a distinct, auditable identity.
  - Support fork PRs with a two-workflow split: an unprivileged `pull_request` job builds the manifest; a privileged `workflow_run` job runs the agent after a maintainer applies a label.
  - Add a deployment environment with required reviewers if the repository has untrusted writers.
  - Run `npm ci` and the baseline coverage run in a job without `id-token`, and pass the installed workspace to the agent job as an artifact. PR code would then never run alongside OIDC access.
- **Quality**
  - Mutation testing (Stryker) on the changed files, to check that the new tests catch regressions.
  - Flaky-test history.
  - An eval set of past PRs to track the agent's precision and the review acceptance rate.
- **Cost and speed**
  - Cache dependencies and the CLI install.
  - Incremental runs over only the files changed since the last bot commit.
  - A cheaper model for triage and a stronger one for writing.
- **Observability.** Per-run metrics (cost, turns, decisions, verdicts) on a dashboard, with spend alerts.
- **Egress control** for the whole job (for example `harden-runner` in block mode), not only for sandboxed commands.

#!/usr/bin/env node
// Combines the outputs of the verify job into one verdict file used by the
// publish job and the PR comment.
//
// node summarize-verify.mjs --policy policy.json --gate gate.json --diff-coverage dc.json \
//   --results backend=after/backend.json --summary-before backend=before/backend-summary.json \
//   --summary-after backend=backend/coverage/coverage-summary.json \
//   --step backend.typecheck=success --step frontend.format=failure --step flaky=success --out verify.json
import { existsSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'
import { readJson, writeJson } from './lib/io.mjs'

function pairs(values) {
  return new Map(values.map((value) => {
    const index = value.indexOf('=')
    return [value.slice(0, index), value.slice(index + 1)]
  }))
}

function readOptional(path) {
  return path && existsSync(path) ? readJson(path) : null
}

function testTotals(report) {
  if (!report) return null
  return {
    total: report.numTotalTests ?? 0,
    passed: report.numPassedTests ?? 0,
    failed: report.numFailedTests ?? 0,
    skipped: (report.numPendingTests ?? 0) + (report.numTodoTests ?? 0),
    suitesFailed: report.numFailedTestSuites ?? 0,
  }
}

function linesPct(summary) {
  return summary?.total?.lines?.pct ?? null
}

/** GitHub step outcome -> pass/fail/skipped. */
export function outcome(value) {
  if (value === 'success') return 'pass'
  if (value === 'failure' || value === 'cancelled') return 'fail'
  return 'skipped'
}

export function summarize({ policy, gate, diffCoverage, results, summaryBefore, summaryAfter, steps }) {
  const projects = {}
  for (const project of new Set([...results.keys(), ...summaryAfter.keys()])) {
    const tests = testTotals(readOptional(results.get(project)))
    projects[project] = {
      typecheck: outcome(steps.get(`${project}.typecheck`)),
      format: outcome(steps.get(`${project}.format`)),
      tests,
      testsStatus: tests && tests.failed === 0 && tests.suitesFailed === 0 && tests.total > 0 ? 'pass' : 'fail',
      coverageThresholds: outcome(steps.get(`${project}.thresholds`)),
      coverageBefore: linesPct(readOptional(summaryBefore.get(project))),
      coverageAfter: linesPct(readOptional(summaryAfter.get(project))),
    }
  }
  const flaky = outcome(steps.get('flaky'))
  const reasons = []
  if (!policy?.ok) reasons.push('patch policy violations')
  if (policy?.empty) reasons.push('empty patch')
  if (gate && !gate.ok) reasons.push('quality gate violations')
  // The workflow lets the gate exit non-zero; a gate that crashed before writing its result
  // must not count as a gate that passed.
  if (!gate && policy?.ok && !policy.empty) reasons.push('quality gate did not run')
  for (const [project, value] of Object.entries(projects)) {
    if (value.typecheck === 'fail') reasons.push(`${project} type check failed`)
    if (value.format === 'fail') reasons.push(`${project} formatting check failed`)
    if (value.testsStatus === 'fail') reasons.push(`${project} tests failed`)
  }
  if (flaky === 'fail') reasons.push('tests are not stable across repeated shuffled runs')
  const verdict = policy?.empty ? 'empty' : reasons.length ? 'fail' : 'pass'
  return {
    verdict,
    reasons: verdict === 'fail' ? reasons : [],
    policy: policy ? { ok: policy.ok, violations: policy.violations, files: policy.files } : null,
    gate: gate ? { ok: gate.ok, violations: gate.violations, perFile: gate.perFile } : null,
    flaky,
    projects,
    diffCoverage: diffCoverage?.total ?? null,
    diffCoverageFiles: diffCoverage?.files ?? [],
  }
}

function main() {
  const { values } = parseArgs({
    options: {
      policy: { type: 'string' },
      gate: { type: 'string' },
      'diff-coverage': { type: 'string' },
      results: { type: 'string', multiple: true, default: [] },
      'summary-before': { type: 'string', multiple: true, default: [] },
      'summary-after': { type: 'string', multiple: true, default: [] },
      step: { type: 'string', multiple: true, default: [] },
      out: { type: 'string' },
    },
  })
  const result = summarize({
    policy: readOptional(values.policy),
    gate: readOptional(values.gate),
    diffCoverage: readOptional(values['diff-coverage']),
    results: pairs(values.results),
    summaryBefore: pairs(values['summary-before']),
    summaryAfter: pairs(values['summary-after']),
    steps: pairs(values.step),
  })
  writeJson(values.out, result)
  console.error(`Verification verdict: ${result.verdict}${result.reasons.length ? ` (${result.reasons.join('; ')})` : ''}`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()

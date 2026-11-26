#!/usr/bin/env node
// Deterministic checks that generated tests are real tests: no focused/skipped
// tests, no snapshot-only assertions, no type-check escapes, at least one
// assertion per spec, no failing or skipped results, and no existing test lost.
//
// node quality-gate.mjs --root . --policy policy.json \
//   --before backend=before/backend.json --after backend=after/backend.json ... --out gate.json
import { existsSync, readFileSync } from 'node:fs'
import { join, relative, isAbsolute } from 'node:path'
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'
import { readJson, writeJson } from './lib/io.mjs'

export const CONTENT_RULES = [
  { pattern: /\b(?:it|test|describe|suite)\s*\.\s*(?:only|skip|todo|fails|skipIf|runIf)\b/, reason: 'focused, skipped, todo or expected-to-fail tests are not allowed' },
  { pattern: /\b(?:xit|xtest|xdescribe|fit|fdescribe)\s*\(/, reason: 'focused or disabled test aliases are not allowed' },
  { pattern: /@ts-(?:ignore|nocheck)\b/, reason: 'type-check escapes (@ts-ignore/@ts-nocheck) are not allowed' },
  { pattern: /\btoMatch(?:Inline|File)?Snapshot\s*\(/, reason: 'snapshot assertions lock in current behaviour instead of specifying it' },
  { pattern: /\bfetch\s*\(\s*['"`]https?:\/\//, reason: 'tests must not call the real network' },
]

export function checkContent(path, content, { spec }) {
  const violations = []
  for (const rule of CONTENT_RULES) if (rule.pattern.test(content)) violations.push({ path, reason: rule.reason })
  if (spec && !/\bexpect\s*[.(]/.test(content)) violations.push({ path, reason: 'test file contains no assertions' })
  return violations
}

/** Map of repo-relative test file -> list of {title, status} from a Vitest JSON report. */
export function loadResults(file, root) {
  const results = new Map()
  if (!file || !existsSync(file)) return null
  const report = JSON.parse(readFileSync(file, 'utf8'))
  for (const suite of report.testResults ?? []) {
    const path = (isAbsolute(suite.name) ? relative(root, suite.name) : suite.name).split('\\').join('/')
    results.set(path, {
      suiteStatus: suite.status,
      message: suite.message ?? '',
      tests: (suite.assertionResults ?? []).map((test) => ({ title: test.fullName ?? test.title, status: test.status })),
    })
  }
  return results
}

export function compareResults({ before, after, changedSpecs, projects = null }) {
  const violations = []
  const perFile = []
  if (!after) return { violations: [{ path: '*', reason: 'no test results after applying the patch' }], perFile }
  for (const path of changedSpecs) {
    const result = after.get(path)
    if (!result) {
      violations.push({ path, reason: 'test file was not executed (check its name and location)' })
      continue
    }
    const bad = result.tests.filter((test) => test.status !== 'passed')
    if (result.suiteStatus === 'failed' && !result.tests.length) {
      violations.push({ path, reason: `test file failed to load: ${result.message.split('\n')[0].slice(0, 200)}` })
    }
    for (const test of bad) violations.push({ path, reason: `test "${test.title}" ${test.status}` })
    const previous = before?.get(path)?.tests.length ?? 0
    perFile.push({ path, before: previous, after: result.tests.length })
    if (result.tests.length < previous) {
      violations.push({ path, reason: `number of tests decreased from ${previous} to ${result.tests.length}` })
    }
  }
  if (before) {
    for (const [path, result] of before) {
      if (projects && !projects.has(path.split('/')[0])) continue
      if (!after.has(path) && result.tests.length) violations.push({ path, reason: 'existing test file no longer runs' })
    }
  }
  return { violations, perFile }
}

function parsePairs(values) {
  const pairs = new Map()
  for (const value of values) {
    const [project, ...rest] = value.split('=')
    pairs.set(project, rest.join('='))
  }
  return pairs
}

function mergeResults(files, root) {
  let merged = null
  for (const file of files) {
    const results = loadResults(file, root)
    if (!results) continue
    merged ??= new Map()
    for (const [path, value] of results) merged.set(path, value)
  }
  return merged
}

function main() {
  const { values } = parseArgs({
    options: {
      root: { type: 'string', default: process.cwd() },
      policy: { type: 'string' },
      before: { type: 'string', multiple: true, default: [] },
      after: { type: 'string', multiple: true, default: [] },
      out: { type: 'string' },
    },
  })
  const policy = readJson(values.policy)
  const changed = policy.files.filter((file) => file.status !== 'deleted')
  const violations = []
  for (const file of changed) {
    const absolute = join(values.root, file.path)
    if (!existsSync(absolute)) continue
    violations.push(...checkContent(file.path, readFileSync(absolute, 'utf8'), { spec: file.spec }))
  }
  const afterPairs = parsePairs(values.after)
  const before = mergeResults([...parsePairs(values.before).values()], values.root)
  const after = mergeResults([...afterPairs.values()], values.root)
  const comparison = compareResults({
    before,
    after,
    changedSpecs: changed.filter((file) => file.spec).map((file) => file.path),
    projects: new Set(afterPairs.keys()),
  })
  violations.push(...comparison.violations)
  const result = { ok: violations.length === 0, violations, perFile: comparison.perFile }
  if (values.out) writeJson(values.out, result)
  if (result.ok) console.error(`Quality gate OK for ${changed.length} file(s).`)
  else {
    console.error('Quality gate violations:')
    for (const violation of violations) console.error(`  ${violation.path}: ${violation.reason}`)
    process.exitCode = 1
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()

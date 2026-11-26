#!/usr/bin/env node
// Builds the change manifest the agent works from. Deterministic and cheap: it
// decides whether the model should run at all, and gives it a prioritised,
// bounded list of files with their changed and uncovered lines.
//
// PR mode:       node change-manifest.mjs --mode pr --base <sha> --head <sha> [--coverage <file>]... --out <file>
// Backfill mode: node change-manifest.mjs --mode backfill --scope <name> [--coverage <file>]... --out <file>
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'
import { parseDiff } from './lib/diff.mjs'
import { classifyFile, relatedTests, testCandidateFor } from './lib/classify.mjs'
import { coverageOfLines, fileCoverage, formatRanges, loadLineCoverage, mergeCoverage } from './lib/coverage.mjs'
import { git, isSha, listTrackedFiles } from './lib/git.mjs'
import { scopeDirectories } from './lib/scopes.mjs'
import { writeGithubOutputs, writeJson } from './lib/io.mjs'

export const MAX_FILES = { pr: 15, backfill: 12 }

function loadTestContents(root) {
  const tests = listTrackedFiles(root, ['backend/tests', 'frontend/src']).filter((path) =>
    /^backend\/tests\/.+\.ts$|^frontend\/src\/.+\.test\.tsx?$/.test(path),
  )
  return new Map(tests.filter((path) => existsSync(join(root, path))).map((path) => [path, readFileSync(join(root, path), 'utf8')]))
}

function describeFile(entry, root, testContents, coverage) {
  const { path } = entry
  const candidate = testCandidateFor(path)
  const lineCoverage = coverage.get(path)
  const changed = coverageOfLines(lineCoverage, entry.changedLines)
  const whole = fileCoverage(lineCoverage)
  return {
    path,
    project: entry.project,
    status: entry.status,
    changedLines: entry.changedLines,
    changedRanges: formatRanges(entry.changedLines),
    uncoveredRanges: formatRanges(changed.uncovered),
    changedLinesCoverage: changed.measured ? { executable: changed.executable, covered: changed.covered, pct: changed.pct } : null,
    uncoveredChangedLines: changed.uncovered,
    fileLineCoverage: whole ? whole.pct : null,
    testCandidate: candidate,
    testExists: Boolean(candidate && existsSync(join(root, candidate))),
    relatedTests: relatedTests(path, testContents),
  }
}

function priority(file) {
  // Most uncovered changed lines first, then files without any test.
  return [file.uncoveredChangedLines.length, file.testExists ? 0 : 1, file.changedLines.length]
}

function byPriority(a, b) {
  const pa = priority(a)
  const pb = priority(b)
  for (let i = 0; i < pa.length; i += 1) if (pa[i] !== pb[i]) return pb[i] - pa[i]
  return a.path.localeCompare(b.path)
}

export function buildPrManifest({ root, base, head, coverage = new Map() }) {
  if (!isSha(base) || !isSha(head)) throw new Error('--base and --head must be commit SHAs')
  // Three-dot diff: changes on the PR branch since it forked from base,
  // so commits merged into base meanwhile do not show up as reverted.
  const diff = git(['diff', '--no-color', '--no-ext-diff', '-U0', '--find-renames', `${base}...${head}`], { cwd: root })
  const parsed = parseDiff(diff)
  const testContents = loadTestContents(root)
  const candidates = []
  const skipped = []
  for (const file of parsed) {
    const info = classifyFile(file.path)
    if (file.status === 'deleted') {
      skipped.push({ path: file.path, project: info.project, reason: 'file deleted', needsHuman: info.kind === 'source' && info.testable })
      continue
    }
    if (file.binary) {
      skipped.push({ path: file.path, project: info.project, reason: 'binary file' })
      continue
    }
    if (!info.testable) {
      skipped.push({ path: file.path, project: info.project, reason: info.skipReason })
      continue
    }
    if (!file.addedLines.length) {
      skipped.push({ path: file.path, project: info.project, reason: 'only deletions or a pure rename' })
      continue
    }
    candidates.push({ path: file.path, project: info.project, status: file.status, changedLines: file.addedLines })
  }
  return finalize({ mode: 'pr', base, head, scope: null, root, candidates, skipped, testContents, coverage })
}

export function buildBackfillManifest({ root, scope, coverage = new Map() }) {
  const directories = scopeDirectories(scope)
  const testContents = loadTestContents(root)
  const candidates = []
  const skipped = []
  for (const path of listTrackedFiles(root, directories)) {
    const info = classifyFile(path)
    if (!info.testable) {
      if (info.kind === 'source') skipped.push({ path, project: info.project, reason: info.skipReason })
      continue
    }
    const lineCoverage = coverage.get(path)
    const executable = lineCoverage ? [...lineCoverage.keys()].sort((a, b) => a - b) : []
    const whole = fileCoverage(lineCoverage)
    if (whole && whole.executable > 0 && whole.uncovered.length === 0) {
      skipped.push({ path, project: info.project, reason: 'already fully line-covered' })
      continue
    }
    candidates.push({ path, project: info.project, status: 'existing', changedLines: executable })
  }
  return finalize({ mode: 'backfill', base: null, head: null, scope, root, candidates, skipped, testContents, coverage })
}

function finalize({ mode, base, head, scope, root, candidates, skipped, testContents, coverage }) {
  const described = candidates.map((entry) => describeFile(entry, root, testContents, coverage)).sort(byPriority)
  const limit = MAX_FILES[mode]
  const files = described.slice(0, limit)
  const deferred = described.slice(limit).map((file) => ({ path: file.path, project: file.project, reason: `deferred: more than ${limit} files in one run` }))
  const projects = [...new Set(files.map((file) => file.project))].sort()
  return {
    version: 1,
    mode,
    base,
    head,
    scope,
    shouldRun: files.length > 0,
    skipReason: files.length ? null : summarizeSkip(skipped),
    projects,
    files,
    skipped: [...skipped, ...deferred].sort((a, b) => a.path.localeCompare(b.path)),
  }
}

function summarizeSkip(skipped) {
  if (!skipped.length) return 'no changed files'
  const reasons = [...new Set(skipped.map((file) => file.reason))]
  return `no testable source changes (${reasons.join('; ')})`
}

function main() {
  const { values } = parseArgs({
    options: {
      mode: { type: 'string', default: 'pr' },
      base: { type: 'string' },
      head: { type: 'string' },
      scope: { type: 'string' },
      coverage: { type: 'string', multiple: true, default: [] },
      root: { type: 'string', default: process.cwd() },
      out: { type: 'string' },
      'github-output': { type: 'string' },
    },
  })
  const coverage = mergeCoverage(...values.coverage.map((file) => loadLineCoverage(file, values.root)))
  const manifest =
    values.mode === 'backfill'
      ? buildBackfillManifest({ root: values.root, scope: values.scope, coverage })
      : buildPrManifest({ root: values.root, base: values.base, head: values.head, coverage })
  if (values.out) writeJson(values.out, manifest)
  else process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`)
  writeGithubOutputs(values['github-output'], {
    should_run: manifest.shouldRun,
    projects: manifest.projects.join(','),
    testable_count: manifest.files.length,
    skip_reason: manifest.skipReason ?? '',
  })
  console.error(
    manifest.shouldRun
      ? `Manifest: ${manifest.files.length} file(s) for the agent in ${manifest.projects.join(', ')}; ${manifest.skipped.length} skipped.`
      : `Manifest: agent not needed — ${manifest.skipReason}`,
  )
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()

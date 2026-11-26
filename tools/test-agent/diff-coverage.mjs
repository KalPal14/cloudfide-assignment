#!/usr/bin/env node
// Coverage of the lines the PR changed (or, in backfill mode, of the whole
// target files) before and after the agent's tests. "Before" comes from the
// manifest, which was built from the baseline coverage run.
//
// node diff-coverage.mjs --manifest manifest.json --coverage backend/coverage/coverage-final.json ... --out diff-coverage.json
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'
import { branchesOnLines, coverageOfLines, fileCoverage, loadBranchCoverage, loadLineCoverage, mergeCoverage, round } from './lib/coverage.mjs'
import { readJson, writeJson } from './lib/io.mjs'

function sum(entries, key) {
  return entries.reduce(
    (total, entry) => {
      const value = entry[key]
      if (!value) return total
      return { executable: total.executable + value.executable, covered: total.covered + value.covered }
    },
    { executable: 0, covered: 0 },
  )
}

function withPct(total) {
  return { ...total, pct: total.executable ? round((total.covered / total.executable) * 100) : null }
}

function sumBranches(entries, key) {
  const total = entries.reduce(
    (acc, entry) => (entry[key] ? { total: acc.total + entry[key].total, covered: acc.covered + entry[key].covered } : acc),
    { total: 0, covered: 0 },
  )
  return { ...total, pct: total.total ? round((total.covered / total.total) * 100) : null }
}

export function diffCoverage(manifest, after, afterBranches = new Map()) {
  const files = manifest.files.map((file) => {
    const lineCoverage = after.get(file.path)
    const measured = coverageOfLines(lineCoverage, file.changedLines)
    const branches = branchesOnLines(afterBranches.get(file.path), file.changedLines)
    const whole = fileCoverage(lineCoverage)
    return {
      path: file.path,
      project: file.project,
      before: file.changedLinesCoverage,
      after: measured.measured ? { executable: measured.executable, covered: measured.covered, pct: measured.pct } : null,
      branchesBefore: file.changedBranchesCoverage ?? null,
      branchesAfter: branches.measured ? { total: branches.total, covered: branches.covered, pct: branches.pct } : null,
      stillUncovered: measured.uncovered,
      stillUncoveredBranches: branches.uncovered,
      fileBefore: file.fileLineCoverage,
      fileAfter: whole ? whole.pct : null,
    }
  })
  return {
    files,
    total: {
      before: withPct(sum(files, 'before')),
      after: withPct(sum(files, 'after')),
      branchesBefore: sumBranches(files, 'branchesBefore'),
      branchesAfter: sumBranches(files, 'branchesAfter'),
    },
  }
}

function main() {
  const { values } = parseArgs({
    options: {
      manifest: { type: 'string' },
      coverage: { type: 'string', multiple: true, default: [] },
      root: { type: 'string', default: process.cwd() },
      out: { type: 'string' },
    },
  })
  const manifest = readJson(values.manifest)
  const after = mergeCoverage(...values.coverage.map((file) => loadLineCoverage(file, values.root)))
  const afterBranches = mergeCoverage(...values.coverage.map((file) => loadBranchCoverage(file, values.root)))
  const result = diffCoverage(manifest, after, afterBranches)
  if (values.out) writeJson(values.out, result)
  const { before, after: total, branchesBefore, branchesAfter } = result.total
  console.error(`Changed-lines coverage: lines ${before.pct ?? 'n/a'}% -> ${total.pct ?? 'n/a'}% (${total.covered}/${total.executable}), ` +
    `branches ${branchesBefore.pct ?? 'n/a'}% -> ${branchesAfter.pct ?? 'n/a'}% (${branchesAfter.covered}/${branchesAfter.total})`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()

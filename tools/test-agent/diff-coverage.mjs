#!/usr/bin/env node
// Coverage of the lines the PR changed (or, in backfill mode, of the whole
// target files) before and after the agent's tests. "Before" comes from the
// manifest, which was built from the baseline coverage run.
//
// node diff-coverage.mjs --manifest manifest.json --coverage backend/coverage/coverage-final.json ... --out diff-coverage.json
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'
import { coverageOfLines, fileCoverage, loadLineCoverage, mergeCoverage, round } from './lib/coverage.mjs'
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

export function diffCoverage(manifest, after) {
  const files = manifest.files.map((file) => {
    const lineCoverage = after.get(file.path)
    const measured = coverageOfLines(lineCoverage, file.changedLines)
    const whole = fileCoverage(lineCoverage)
    return {
      path: file.path,
      project: file.project,
      before: file.changedLinesCoverage,
      after: measured.measured ? { executable: measured.executable, covered: measured.covered, pct: measured.pct } : null,
      stillUncovered: measured.uncovered,
      fileBefore: file.fileLineCoverage,
      fileAfter: whole ? whole.pct : null,
    }
  })
  return { files, total: { before: withPct(sum(files, 'before')), after: withPct(sum(files, 'after')) } }
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
  const result = diffCoverage(manifest, after)
  if (values.out) writeJson(values.out, result)
  const { before, after: total } = result.total
  console.error(`Changed-lines coverage: ${before.pct ?? 'n/a'}% -> ${total.pct ?? 'n/a'}% (${total.covered}/${total.executable} lines)`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()

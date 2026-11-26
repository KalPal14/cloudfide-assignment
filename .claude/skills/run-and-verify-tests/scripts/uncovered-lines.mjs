#!/usr/bin/env node
// Prints line and branch coverage gaps for specific source files from a
// project's Istanbul `coverage/coverage-final.json`. Self-contained so the skill
// can be reused in other repositories.
//
// Usage (from the repository root):
//   node .claude/skills/run-and-verify-tests/scripts/uncovered-lines.mjs <project-dir> <src-file>...
//   node .claude/skills/run-and-verify-tests/scripts/uncovered-lines.mjs backend src/factory.ts src/core/config.ts
import { existsSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const [project, ...files] = process.argv.slice(2)
if (!project || !files.length) {
  console.error('usage: uncovered-lines.mjs <project-dir> <src-file>...')
  process.exit(2)
}
const projectDir = resolve(project)
const coverageFile = join(projectDir, 'coverage', 'coverage-final.json')
if (!existsSync(coverageFile)) {
  console.error(`No ${relative(process.cwd(), coverageFile)}. Run the coverage command with --coverage.reporter=json first.`)
  process.exit(1)
}
const coverage = JSON.parse(readFileSync(coverageFile, 'utf8'))
const byPath = new Map(Object.values(coverage).map((entry) => [relative(projectDir, entry.path).split('\\').join('/'), entry]))

function ranges(lines) {
  const sorted = [...new Set(lines)].sort((a, b) => a - b)
  const out = []
  for (const line of sorted) {
    const last = out.at(-1)
    if (last && line === last[1] + 1) last[1] = line
    else out.push([line, line])
  }
  return out.map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`)).join(', ') || 'none'
}

for (const file of files) {
  const key = file.replace(/^\.\//, '').replace(new RegExp(`^${project.replace(/\/$/, '')}/`), '')
  const entry = byPath.get(key)
  if (!entry) {
    console.log(`${key}: not in the coverage report (not imported by any test, or excluded from coverage)`)
    continue
  }
  const lines = new Map()
  for (const [id, location] of Object.entries(entry.statementMap)) {
    const line = location.start.line
    lines.set(line, Math.max(lines.get(line) ?? 0, entry.s[id]))
  }
  const uncovered = [...lines].filter(([, hits]) => hits === 0).map(([line]) => line)
  const pct = lines.size ? Math.round(((lines.size - uncovered.length) / lines.size) * 1000) / 10 : 100
  const branches = []
  for (const [id, branch] of Object.entries(entry.branchMap)) {
    entry.b[id].forEach((hits, index) => {
      if (hits === 0) branches.push(`${branch.type}@${branch.locations?.[index]?.start.line ?? branch.loc.start.line}`)
    })
  }
  const functions = Object.entries(entry.fnMap)
    .filter(([id]) => entry.f[id] === 0)
    .map(([, fn]) => `${fn.name}@${fn.loc.start.line}`)
  console.log(`${key}: ${pct}% lines`)
  console.log(`  uncovered lines:     ${ranges(uncovered)}`)
  console.log(`  uncovered branches:  ${branches.join(', ') || 'none'}`)
  console.log(`  uncovered functions: ${functions.join(', ') || 'none'}`)
}

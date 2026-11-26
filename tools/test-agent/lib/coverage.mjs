// Line coverage from Istanbul-format `coverage-final.json` (what @vitest/coverage-v8
// writes with the `json` reporter). Mirrors istanbul-lib-coverage `getLineCoverage`:
// a line is executable when a statement starts on it, covered when any such
// statement ran at least once.
import { readFileSync, existsSync } from 'node:fs'
import { relative, isAbsolute } from 'node:path'

/** @returns {Map<string, Map<number, number>>} repo-relative path -> (line -> hits) */
export function loadLineCoverage(coverageFile, repoRoot) {
  const result = new Map()
  if (!coverageFile || !existsSync(coverageFile)) return result
  const data = JSON.parse(readFileSync(coverageFile, 'utf8'))
  for (const [key, entry] of Object.entries(data)) {
    const absolute = entry.path ?? key
    const path = (isAbsolute(absolute) ? relative(repoRoot, absolute) : absolute).split('\\').join('/')
    const lines = new Map()
    for (const [id, location] of Object.entries(entry.statementMap ?? {})) {
      const line = location.start.line
      const hits = entry.s?.[id] ?? 0
      lines.set(line, Math.max(lines.get(line) ?? 0, hits))
    }
    result.set(path, lines)
  }
  return result
}

/**
 * Branch outcomes from Istanbul-format coverage: one entry per branch path
 * (both sides of an `if`, each operand of `&&`/`??`, each arm of `?:`, ...).
 * @returns {Map<string, Array<{line: number, type: string, hits: number}>>}
 */
export function loadBranchCoverage(coverageFile, repoRoot) {
  const result = new Map()
  if (!coverageFile || !existsSync(coverageFile)) return result
  const data = JSON.parse(readFileSync(coverageFile, 'utf8'))
  for (const [key, entry] of Object.entries(data)) {
    const absolute = entry.path ?? key
    const path = (isAbsolute(absolute) ? relative(repoRoot, absolute) : absolute).split('\\').join('/')
    const branches = []
    for (const [id, branch] of Object.entries(entry.branchMap ?? {})) {
      const counts = entry.b?.[id] ?? []
      counts.forEach((hits, index) => {
        const line = branch.locations?.[index]?.start?.line ?? branch.loc?.start?.line ?? branch.line
        if (line) branches.push({ line, type: branch.type ?? 'branch', hits })
      })
    }
    result.set(path, branches)
  }
  return result
}

/** Branch paths that start on the given lines. */
export function branchesOnLines(branches, lines) {
  if (!branches) return { total: 0, covered: 0, uncovered: [], pct: null, measured: false }
  const wanted = new Set(lines)
  const relevant = branches.filter((branch) => wanted.has(branch.line))
  const uncovered = relevant.filter((branch) => branch.hits === 0)
  return {
    total: relevant.length,
    covered: relevant.length - uncovered.length,
    uncovered: uncovered.map(({ line, type }) => ({ line, type })),
    pct: relevant.length ? round(((relevant.length - uncovered.length) / relevant.length) * 100) : null,
    measured: true,
  }
}

/** Merge several coverage maps (e.g. backend + frontend). */
export function mergeCoverage(...maps) {
  const merged = new Map()
  for (const map of maps) for (const [path, lines] of map) merged.set(path, lines)
  return merged
}

/** Coverage of a set of lines of one file. Only executable lines are counted. */
export function coverageOfLines(lineCoverage, lines) {
  if (!lineCoverage) return { executable: 0, covered: 0, uncovered: [], pct: null, measured: false }
  const executable = lines.filter((line) => lineCoverage.has(line))
  const uncovered = executable.filter((line) => lineCoverage.get(line) === 0)
  const covered = executable.length - uncovered.length
  return {
    executable: executable.length,
    covered,
    uncovered,
    pct: executable.length ? round((covered / executable.length) * 100) : null,
    measured: true,
  }
}

/** Whole-file line coverage. */
export function fileCoverage(lineCoverage) {
  if (!lineCoverage) return null
  return coverageOfLines(lineCoverage, [...lineCoverage.keys()].sort((a, b) => a - b))
}

export function round(value) {
  return Math.round(value * 10) / 10
}

/** Compress sorted line numbers into ranges: [1,2,3,7] -> "1-3, 7". */
export function formatRanges(lines) {
  const sorted = [...new Set(lines)].sort((a, b) => a - b)
  const ranges = []
  for (const line of sorted) {
    const last = ranges.at(-1)
    if (last && line === last[1] + 1) last[1] = line
    else ranges.push([line, line])
  }
  return ranges.map(([start, end]) => (start === end ? `${start}` : `${start}-${end}`)).join(', ')
}

// Single source of truth for which files the test agent may create or change.
// Used by the PreToolUse hook (.claude/hooks/guard-test-paths.mjs), by
// collect-patch.mjs (what goes into the agent patch) and by verify-patch.mjs
// (the final, secret-less check before anything is committed).

/** Rules for paths the agent is allowed to write. Paths are repo-relative and POSIX. */
export const ALLOWED_TEST_PATHS = [
  {
    glob: 'backend/tests/**/*.ts',
    pattern: /^backend\/tests\/(?:[\w.-]+\/)*[\w.-]+\.ts$/,
  },
  {
    glob: 'frontend/src/**/*.test.{ts,tsx}',
    pattern: /^frontend\/src\/(?:[\w.-]+\/)*[\w.-]+\.test\.tsx?$/,
  },
  {
    glob: 'frontend/src/test/**/*.{ts,tsx} (except setup.ts)',
    pattern: /^frontend\/src\/test\/(?:[\w.-]+\/)*[\w.-]+\.tsx?$/,
  },
]

/** Explicitly forbidden even when an allow rule matches. */
export const FORBIDDEN_TEST_PATHS = [
  {
    pattern: /^frontend\/src\/test\/setup\.ts$/,
    reason: 'global test setup changes every test and is reserved for humans',
  },
]

/** Glob pathspecs (git `:(glob)` magic) matching the allow rules, for `git add`. */
export const ALLOWED_PATHSPECS = [
  ':(glob)backend/tests/**/*.ts',
  ':(glob)frontend/src/**/*.test.ts',
  ':(glob)frontend/src/**/*.test.tsx',
  ':(glob)frontend/src/test/**/*.ts',
  ':(glob)frontend/src/test/**/*.tsx',
  ':(exclude)frontend/src/test/setup.ts',
]

/**
 * Normalise a repo-relative path. Returns null for anything that could escape
 * the repository or is ambiguous (absolute paths, `..`, backslashes, NUL).
 */
export function normalizeRepoPath(input) {
  if (typeof input !== 'string' || input.length === 0) return null
  if (input.includes('\0') || input.includes('\\')) return null
  if (input.startsWith('/') || /^[A-Za-z]:/.test(input)) return null
  const segments = []
  for (const segment of input.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') return null
    segments.push(segment)
  }
  return segments.length ? segments.join('/') : null
}

/** Decide whether the agent may write `path` (repo-relative). */
export function checkTestPath(path) {
  const normalized = normalizeRepoPath(path)
  if (!normalized) {
    return { allowed: false, path, reason: 'path is absolute, escapes the repository or is malformed' }
  }
  const forbidden = FORBIDDEN_TEST_PATHS.find((rule) => rule.pattern.test(normalized))
  if (forbidden) return { allowed: false, path: normalized, reason: forbidden.reason }
  const rule = ALLOWED_TEST_PATHS.find((candidate) => candidate.pattern.test(normalized))
  if (rule) return { allowed: true, path: normalized, rule: rule.glob }
  return {
    allowed: false,
    path: normalized,
    reason: `only test files may be changed (${ALLOWED_TEST_PATHS.map((r) => r.glob).join(', ')})`,
  }
}

export function isAllowedTestPath(path) {
  return checkTestPath(path).allowed
}

/** True for test specs (as opposed to fixtures and helpers). */
export function isTestSpec(path) {
  const normalized = normalizeRepoPath(path) ?? ''
  return (
    /^backend\/tests\/(?:[\w.-]+\/)*[\w.-]+\.test\.ts$/.test(normalized) ||
    /^frontend\/src\/(?:[\w.-]+\/)*[\w.-]+\.test\.tsx?$/.test(normalized)
  )
}

import { execFileSync } from 'node:child_process'

/** Run git with arguments (never through a shell) and return stdout. */
export function git(args, { cwd = process.cwd(), allowFailure = false } = {}) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  } catch (error) {
    if (allowFailure) return ''
    throw new Error(`git ${args.join(' ')} failed: ${error.stderr || error.message}`)
  }
}

export function isSha(value) {
  return typeof value === 'string' && /^[0-9a-f]{7,40}$/i.test(value)
}

/** Tracked files under the given directories. */
export function listTrackedFiles(cwd, directories) {
  return git(['ls-files', '-z', '--', ...directories], { cwd })
    .split('\0')
    .filter(Boolean)
}

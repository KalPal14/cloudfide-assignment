#!/usr/bin/env node
// Final write boundary. Runs in a job without secrets, using the copy of this
// script from the base branch, before the patch is applied or committed. The
// agent's own permissions and hooks are defence in depth; this check is the one
// that decides.
//
// It decides twice. The patch text is checked before it is applied, and with
// --staged the index is checked after `git apply --index`: git accepts more
// patch formats than the parser here reads (a traditional `---`/`+++` section
// after a git one changes files the text check never sees), so what counts is
// what git actually staged.
//
// node verify-patch.mjs --patch agent.patch --out policy.json
// node verify-patch.mjs --patch agent.patch --staged <checkout> --out policy.json
import { readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'
import { parseDiff } from './lib/diff.mjs'
import { checkTestPath, isTestSpec } from './lib/path-policy.mjs'
import { projectOf } from './lib/classify.mjs'
import { git } from './lib/git.mjs'
import { writeJson } from './lib/io.mjs'

export const LIMITS = { maxFiles: 40, maxAddedLinesPerFile: 1500, maxPatchBytes: 1024 * 1024 }
const REGULAR_FILE = '100644'

export function verifyPatch(text) {
  const violations = []
  if (Buffer.byteLength(text) > LIMITS.maxPatchBytes) {
    violations.push({ path: '*', reason: `patch is larger than ${LIMITS.maxPatchBytes} bytes` })
  }
  const files = parseDiff(text)
  if (files.length > LIMITS.maxFiles) {
    violations.push({ path: '*', reason: `patch touches ${files.length} files (limit ${LIMITS.maxFiles})` })
  }
  for (const file of files) {
    const path = file.path || '(unknown)'
    if (file.malformed) violations.push({ path, reason: 'malformed or quoted path in diff header' })
    for (const side of [file.oldPath, file.newPath]) {
      if (side === null) continue
      const check = checkTestPath(side)
      if (!check.allowed) violations.push({ path: side, reason: check.reason })
    }
    if (['deleted', 'renamed', 'copied', 'mode-changed'].includes(file.status)) {
      violations.push({ path, reason: `${file.status} files are not allowed; the agent may only add or edit test files` })
    }
    if (file.newMode && file.newMode !== REGULAR_FILE) {
      violations.push({ path, reason: `file mode ${file.newMode} is not allowed (symlinks, executables and submodules are rejected)` })
    }
    if (file.binary) violations.push({ path, reason: 'binary content is not allowed' })
    if (file.additions > LIMITS.maxAddedLinesPerFile) {
      violations.push({ path, reason: `adds ${file.additions} lines (limit ${LIMITS.maxAddedLinesPerFile})` })
    }
  }
  const unique = [...new Map(violations.map((v) => [`${v.path}\0${v.reason}`, v])).values()]
  return {
    ok: unique.length === 0,
    empty: files.length === 0,
    files: files.map((file) => ({
      path: file.path,
      project: projectOf(file.path),
      status: file.status,
      spec: isTestSpec(file.path),
      additions: file.additions,
      deletions: file.deletions,
    })),
    violations: unique,
  }
}

/** Parse `git diff --cached --raw -z --no-renames`: one entry per staged path. */
export function parseRaw(output) {
  const entries = []
  const parts = output.split('\0')
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const [oldMode, newMode, , , status] = parts[i].replace(/^:/, '').split(' ')
    entries.push({ path: parts[i + 1], status, oldMode, newMode })
  }
  return entries
}

/**
 * Check what `git apply --index` staged against the policy and against the files the
 * text check saw. Anything staged that the text check did not list was never checked
 * for size or content, and is not run by the quality gate, so it is a violation even
 * when its path is allowed.
 */
export function verifyStaged(entries, expectedPaths) {
  const violations = []
  const expected = new Set(expectedPaths)
  for (const { path, status, oldMode, newMode } of entries) {
    const check = checkTestPath(path)
    if (!check.allowed) violations.push({ path, reason: `staged by git: ${check.reason}` })
    if (status !== 'A' && status !== 'M') {
      violations.push({ path, reason: `staged by git with status ${status}; the agent may only add or edit test files` })
    } else if (newMode !== REGULAR_FILE || (status === 'M' && oldMode !== REGULAR_FILE)) {
      violations.push({ path, reason: `staged by git with file mode ${oldMode} -> ${newMode}; only regular files are allowed` })
    }
    if (!expected.delete(path)) violations.push({ path, reason: 'changed by git apply but not listed by the patch check (the patch is not plain `git diff` output)' })
  }
  for (const path of expected) violations.push({ path, reason: 'listed by the patch check but not staged by git apply' })
  return violations
}

function main() {
  const { values } = parseArgs({ options: { patch: { type: 'string' }, staged: { type: 'string' }, out: { type: 'string' } } })
  const result = verifyPatch(readFileSync(values.patch, 'utf8'))
  if (values.staged !== undefined) {
    const staged = parseRaw(git(['diff', '--cached', '--raw', '-z', '--no-renames', '--abbrev=40'], { cwd: values.staged }))
    result.violations.push(...verifyStaged(staged, result.files.map((file) => file.path)))
    result.ok = result.violations.length === 0
    result.empty = result.empty && staged.length === 0
  }
  if (values.out) writeJson(values.out, result)
  if (result.empty) console.error('Patch is empty: the agent proposed no test changes.')
  else if (result.ok) console.error(`Patch policy OK: ${result.files.length} test file(s).`)
  else {
    console.error('Patch policy violations:')
    for (const violation of result.violations) console.error(`  ${violation.path}: ${violation.reason}`)
    process.exitCode = 1
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()

#!/usr/bin/env node
// Final write boundary. Runs in a job without secrets, using the copy of this
// script from the base branch, before the patch is applied or committed. The
// agent's own permissions and hooks are defence in depth; this check is the one
// that decides.
//
// node verify-patch.mjs --patch agent.patch --out policy.json
import { readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'
import { parseDiff } from './lib/diff.mjs'
import { checkTestPath, isTestSpec } from './lib/path-policy.mjs'
import { projectOf } from './lib/classify.mjs'
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

function main() {
  const { values } = parseArgs({ options: { patch: { type: 'string' }, out: { type: 'string' } } })
  const result = verifyPatch(readFileSync(values.patch, 'utf8'))
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

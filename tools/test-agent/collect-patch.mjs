#!/usr/bin/env node
// Runs right after the agent. Stages only files allowed by the path policy and
// writes them as a binary-safe patch. Everything else the agent (or a test run)
// changed is discarded and reported: a non-empty `discarded` list is a signal
// worth showing to reviewers. Empty untracked files at the repository root are
// mount points created by the Claude Code sandbox and are ignored silently.
//
// node collect-patch.mjs --root . --patch .test-agent/out/agent.patch --out .test-agent/out/collect.json
import { mkdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'
import { checkTestPath } from './lib/path-policy.mjs'
import { git } from './lib/git.mjs'
import { writeJson } from './lib/io.mjs'

/** Parse `git status --porcelain=v1 -z --untracked-files=all`. */
export function parsePorcelain(output) {
  const entries = []
  const parts = output.split('\0').filter(Boolean)
  for (let i = 0; i < parts.length; i += 1) {
    const record = parts[i]
    const status = record.slice(0, 2)
    const path = record.slice(3)
    if (status[0] === 'R' || status[0] === 'C') i += 1 // next part is the original path
    entries.push({ status, path })
  }
  return entries
}

export function isSandboxStub(root, path, status) {
  if (status !== '??' || path.includes('/')) return false
  try {
    const stats = statSync(join(root, path))
    return stats.isFile() && stats.size === 0
  } catch {
    return false
  }
}

export function collectPatch({ root }) {
  const entries = parsePorcelain(git(['status', '--porcelain=v1', '-z', '--untracked-files=all'], { cwd: root }))
  const included = []
  const discarded = []
  for (const { status, path } of entries) {
    if (isSandboxStub(root, path, status)) continue
    const check = checkTestPath(path)
    if (check.allowed && !status.includes('D')) included.push({ path: check.path, status: status.trim() })
    else discarded.push({ path, status: status.trim(), reason: status.includes('D') ? 'deletions are not allowed' : check.reason })
  }
  if (included.length) git(['add', '--', ...included.map((file) => file.path)], { cwd: root })
  const patch = included.length ? git(['diff', '--cached', '--binary', '--no-color', '--no-ext-diff'], { cwd: root }) : ''
  return { patch, included, discarded }
}

function main() {
  const { values } = parseArgs({
    options: {
      root: { type: 'string', default: process.cwd() },
      patch: { type: 'string' },
      out: { type: 'string' },
    },
  })
  const { patch, included, discarded } = collectPatch({ root: values.root })
  mkdirSync(dirname(values.patch), { recursive: true })
  writeFileSync(values.patch, patch)
  writeJson(values.out, { included, discarded })
  console.error(`Collected ${included.length} test file(s) into the patch; discarded ${discarded.length} other change(s).`)
  for (const file of discarded.slice(0, 20)) console.error(`  discarded ${file.path} (${file.status}): ${file.reason}`)
  if (discarded.length > 20) console.error(`  … and ${discarded.length - 20} more (see the collect report)`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()

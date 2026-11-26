import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { git } from '../lib/git.mjs'
import { buildPrManifest } from '../change-manifest.mjs'
import { collectPatch } from '../collect-patch.mjs'
import { verifyPatch } from '../verify-patch.mjs'

let root

function write(path, content) {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), content)
}

function commit(message) {
  git(['add', '-A'], { cwd: root })
  git(['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', message], { cwd: root })
  return git(['rev-parse', 'HEAD'], { cwd: root }).trim()
}

before(() => {
  root = mkdtempSync(join(tmpdir(), 'test-agent-'))
  git(['init', '-q', '-b', 'main'], { cwd: root })
  write('backend/src/features/todos/router.ts', 'export const a = 1\n')
  write('backend/tests/router.test.ts', "import { a } from '../src/features/todos/router.ts'\n")
  write('README.md', '# x\n')
  commit('base')
})

after(() => rmSync(root, { recursive: true, force: true }))

describe('buildPrManifest', () => {
  it('lists testable changes since the merge base and filters the rest', () => {
    const base = git(['rev-parse', 'HEAD'], { cwd: root }).trim()
    git(['checkout', '-q', '-b', 'feature'], { cwd: root })
    write('backend/src/features/todos/router.ts', 'export const a = 1\nexport const b = 2\n')
    write('backend/src/features/todos/types.ts', 'export type T = 1\n')
    write('frontend/src/lib/http.ts', 'export const c = 3\n')
    write('README.md', '# changed\n')
    const head = commit('feature')
    // A commit landing on main after the branch point must not appear in the PR diff.
    git(['checkout', '-q', 'main'], { cwd: root })
    write('backend/tests/other.test.ts', 'x\n')
    const mainHead = commit('main moves on')
    git(['checkout', '-q', 'feature'], { cwd: root })

    const manifest = buildPrManifest({ root, base: mainHead, head })
    assert.equal(manifest.shouldRun, true)
    assert.deepEqual(manifest.projects, ['backend', 'frontend'])
    assert.deepEqual(manifest.files.map((file) => [file.path, file.changedRanges, file.testExists]), [
      ['frontend/src/lib/http.ts', '1', false],
      ['backend/src/features/todos/router.ts', '2', true],
    ])
    assert.deepEqual(manifest.files[1].relatedTests, ['backend/tests/router.test.ts'])
    assert.deepEqual(manifest.skipped.map((file) => [file.path, file.reason]), [
      ['backend/src/features/todos/types.ts', 'type-only module'],
      ['README.md', 'documentation'],
    ])
    assert.ok(!JSON.stringify(manifest).includes('other.test.ts'))
    assert.ok(base)
  })

  it('does not run the agent when nothing testable changed', () => {
    const base = git(['rev-parse', 'HEAD'], { cwd: root }).trim()
    write('README.md', '# again\n')
    const head = commit('docs')
    const manifest = buildPrManifest({ root, base, head })
    assert.equal(manifest.shouldRun, false)
    assert.equal(manifest.skipReason, 'no testable source changes (documentation)')
  })

  it('rejects non-SHA refs', () => {
    assert.throws(() => buildPrManifest({ root, base: 'main; rm -rf /', head: 'HEAD' }), /must be commit SHAs/)
  })
})

describe('collectPatch', () => {
  it('keeps only allowed test files and reports everything else', () => {
    write('backend/tests/new.test.ts', "it('x', () => expect(1).toBe(1))\n")
    write('backend/tests/router.test.ts', 'changed\n')
    write('backend/src/features/todos/router.ts', 'export const hacked = true\n')
    write('frontend/src/test/setup.ts', 'globalThis.x = 1\n')
    write('package.json', '') // empty root file: a sandbox mount point, ignored
    const { patch, included, discarded } = collectPatch({ root })
    assert.deepEqual(included.map((file) => file.path).sort(), ['backend/tests/new.test.ts', 'backend/tests/router.test.ts'])
    assert.deepEqual(discarded.map((file) => file.path).sort(), ['backend/src/features/todos/router.ts', 'frontend/src/test/setup.ts'])
    const verified = verifyPatch(patch)
    assert.equal(verified.ok, true)
    assert.deepEqual(verified.files.map((file) => file.path).sort(), ['backend/tests/new.test.ts', 'backend/tests/router.test.ts'])
  })
})

describe('verify-patch --staged', () => {
  const script = join(dirname(fileURLToPath(import.meta.url)), '..', 'verify-patch.mjs')
  let repo

  function check(patchText) {
    const patch = join(repo, '..', 'agent.patch')
    const out = join(repo, '..', 'policy.json')
    writeFileSync(patch, patchText)
    git(['apply', '--index', '--whitespace=nowarn', patch], { cwd: repo })
    const result = spawnSync(process.execPath, [script, '--patch', patch, '--staged', repo, '--out', out], { encoding: 'utf8' })
    return { status: result.status, policy: JSON.parse(readFileSync(out, 'utf8')) }
  }

  before(() => {
    repo = join(mkdtempSync(join(tmpdir(), 'test-agent-staged-')), 'repo')
    mkdirSync(join(repo, 'backend/tests'), { recursive: true })
    mkdirSync(join(repo, 'backend/src'), { recursive: true })
    git(['init', '-q', '-b', 'main'], { cwd: repo })
    writeFileSync(join(repo, 'backend/tests/a.test.ts'), "import { it } from 'vitest'\n")
    writeFileSync(join(repo, 'backend/src/a.ts'), 'export const a = 1\n')
    git(['add', '-A'], { cwd: repo })
    git(['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'base'], { cwd: repo })
  })

  after(() => rmSync(dirname(repo), { recursive: true, force: true }))

  const testChange = [
    'diff --git a/backend/tests/a.test.ts b/backend/tests/a.test.ts',
    'index 0000000..1111111 100644',
    '--- a/backend/tests/a.test.ts',
    '+++ b/backend/tests/a.test.ts',
    '@@ -1 +1,2 @@',
    " import { it } from 'vitest'",
    "+it('x', () => {})",
  ]

  it('accepts what git staged from a plain git diff', () => {
    const { status, policy } = check(`${testChange.join('\n')}\n`)
    assert.equal(status, 0)
    assert.equal(policy.ok, true)
    git(['reset', '-q', '--hard'], { cwd: repo })
  })

  it('rejects a patch whose traditional section changes a file the patch check never saw', () => {
    // git apply reads the `---`/`+++` section after the complete hunk as another file.
    const patchText = `${[...testChange, '--- a/backend/src/a.ts', '+++ b/backend/src/a.ts', '@@ -1 +1 @@', '-export const a = 1', '+export const a = 666'].join('\n')}\n`
    assert.equal(verifyPatch(patchText).ok, true, 'the text check alone does not see the second file')
    const { status, policy } = check(patchText)
    assert.equal(status, 1)
    assert.equal(policy.ok, false)
    const reasons = policy.violations.map((violation) => `${violation.path}: ${violation.reason}`)
    assert.ok(reasons.some((reason) => reason.startsWith('backend/src/a.ts: staged by git: only test files may be changed')), reasons.join('\n'))
    assert.ok(reasons.some((reason) => reason.startsWith('backend/src/a.ts: changed by git apply but not listed')), reasons.join('\n'))
    git(['reset', '-q', '--hard'], { cwd: repo })
  })

  it('does not call a patch empty when git staged something from it', () => {
    const patchText = `${['--- a/backend/src/a.ts', '+++ b/backend/src/a.ts', '@@ -1 +1 @@', '-export const a = 1', '+export const a = 666'].join('\n')}\n`
    assert.equal(verifyPatch(patchText).empty, true)
    const { status, policy } = check(patchText)
    assert.equal(status, 1)
    assert.equal(policy.empty, false)
    git(['reset', '-q', '--hard'], { cwd: repo })
  })
})

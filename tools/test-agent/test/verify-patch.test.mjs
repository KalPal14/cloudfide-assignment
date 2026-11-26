import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseRaw, verifyPatch, verifyStaged } from '../verify-patch.mjs'

function added(path, mode = '100644', lines = ['+it()']) {
  return [`diff --git a/${path} b/${path}`, `new file mode ${mode}`, 'index 0000000..1111111', '--- /dev/null', `+++ b/${path}`, `@@ -0,0 +1,${lines.length} @@`, ...lines].join('\n')
}

function modified(path) {
  return [`diff --git a/${path} b/${path}`, 'index 1111111..2222222 100644', `--- a/${path}`, `+++ b/${path}`, '@@ -1 +1 @@', '-a', '+b'].join('\n')
}

describe('verifyPatch', () => {
  it('accepts new and modified test files', () => {
    const result = verifyPatch([added('backend/tests/factory.test.ts'), modified('frontend/src/App.test.tsx')].join('\n'))
    assert.equal(result.ok, true)
    assert.equal(result.empty, false)
    assert.deepEqual(result.files.map((file) => [file.path, file.project, file.spec]), [
      ['backend/tests/factory.test.ts', 'backend', true],
      ['frontend/src/App.test.tsx', 'frontend', true],
    ])
  })

  it('treats an empty patch as empty, not as a violation', () => {
    assert.deepEqual(verifyPatch(''), { ok: true, empty: true, files: [], violations: [] })
  })

  const rejected = {
    'production code': [modified('backend/src/factory.ts'), /only test files/],
    'test configuration': [modified('frontend/vite.config.ts'), /only test files/],
    'global test setup': [modified('frontend/src/test/setup.ts'), /global test setup/],
    'workflow files': [added('.github/workflows/x.yml'), /only test files/],
    'path traversal': [added('backend/tests/../src/x.ts'), /escapes the repository/],
    symlinks: [added('backend/tests/link.test.ts', '120000'), /file mode 120000/],
    executables: [added('backend/tests/run.test.ts', '100755'), /file mode 100755/],
    deletions: [
      ['diff --git a/backend/tests/router.test.ts b/backend/tests/router.test.ts', 'deleted file mode 100644', '--- a/backend/tests/router.test.ts', '+++ /dev/null', '@@ -1 +0,0 @@', '-x'].join('\n'),
      /deleted files are not allowed/,
    ],
    'renames out of the test tree': [
      ['diff --git a/backend/tests/a.test.ts b/backend/src/a.ts', 'similarity index 100%', 'rename from backend/tests/a.test.ts', 'rename to backend/src/a.ts'].join('\n'),
      /only test files/,
    ],
    'binary content': [['diff --git a/backend/tests/a.test.ts b/backend/tests/a.test.ts', 'new file mode 100644', 'GIT binary patch', 'literal 1'].join('\n'), /binary/],
    'huge files': [added('backend/tests/big.test.ts', '100644', Array.from({ length: 1501 }, () => '+x')), /limit 1500/],
  }
  for (const [name, [patch, reason]] of Object.entries(rejected)) {
    it(`rejects ${name}`, () => {
      const result = verifyPatch(patch)
      assert.equal(result.ok, false)
      assert.ok(result.violations.some((violation) => reason.test(violation.reason)), JSON.stringify(result.violations))
    })
  }

  it('rejects the whole patch when one file is out of policy', () => {
    const result = verifyPatch([added('backend/tests/ok.test.ts'), modified('backend/src/factory.ts')].join('\n'))
    assert.equal(result.ok, false)
    assert.deepEqual(result.violations.map((violation) => violation.path), ['backend/src/factory.ts'])
  })
})

describe('verifyStaged', () => {
  const sha = '1'.repeat(40)
  const raw = (...entries) => entries.map(([status, path, oldMode = '100644', newMode = '100644']) => `:${oldMode} ${newMode} ${sha} ${sha} ${status}\0${path}\0`).join('')
  const reasons = (entries, expected) => verifyStaged(parseRaw(raw(...entries)), expected).map((violation) => `${violation.path}: ${violation.reason}`)

  it('parses git diff --raw -z', () => {
    assert.deepEqual(parseRaw(raw(['A', 'backend/tests/a.test.ts', '000000'], ['M', 'frontend/src/App.test.tsx'])), [
      { path: 'backend/tests/a.test.ts', status: 'A', oldMode: '000000', newMode: '100644' },
      { path: 'frontend/src/App.test.tsx', status: 'M', oldMode: '100644', newMode: '100644' },
    ])
    assert.deepEqual(parseRaw(''), [])
  })

  it('accepts exactly the added and modified test files the patch check listed', () => {
    const entries = [['A', 'backend/tests/a.test.ts', '000000'], ['M', 'frontend/src/App.test.tsx']]
    assert.deepEqual(reasons(entries, ['backend/tests/a.test.ts', 'frontend/src/App.test.tsx']), [])
  })

  it('rejects a staged file that the patch check did not list, even on an allowed path', () => {
    const result = reasons([['M', 'backend/tests/a.test.ts'], ['A', 'backend/tests/extra.test.ts', '000000'], ['M', 'backend/src/factory.ts']], ['backend/tests/a.test.ts'])
    assert.ok(result.some((reason) => reason.startsWith('backend/tests/extra.test.ts: changed by git apply but not listed')), result.join('\n'))
    assert.ok(result.some((reason) => reason.startsWith('backend/src/factory.ts: staged by git: only test files may be changed')), result.join('\n'))
    assert.ok(result.some((reason) => reason.startsWith('backend/src/factory.ts: changed by git apply but not listed')), result.join('\n'))
  })

  it('rejects deletions, symlinks, executables and type changes', () => {
    const path = 'backend/tests/a.test.ts'
    assert.match(reasons([['D', path, '100644', '000000']], [path])[0], /status D/)
    assert.match(reasons([['A', path, '000000', '120000']], [path])[0], /file mode 000000 -> 120000/)
    assert.match(reasons([['M', path, '100644', '100755']], [path])[0], /file mode 100644 -> 100755/)
    assert.match(reasons([['T', path, '120000', '100644']], [path])[0], /status T/)
  })

  it('rejects a listed file that git did not stage', () => {
    assert.deepEqual(reasons([], ['backend/tests/a.test.ts']), ['backend/tests/a.test.ts: listed by the patch check but not staged by git apply'])
  })
})

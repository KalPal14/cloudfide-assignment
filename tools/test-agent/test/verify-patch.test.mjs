import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { verifyPatch } from '../verify-patch.mjs'

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

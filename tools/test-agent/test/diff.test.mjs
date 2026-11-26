import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseDiff } from '../lib/diff.mjs'

const MODIFIED = `diff --git a/backend/src/a.ts b/backend/src/a.ts
index 1111111..2222222 100644
--- a/backend/src/a.ts
+++ b/backend/src/a.ts
@@ -2,0 +3,2 @@ export function a() {
+  const x = 1
+  return x
@@ -10 +12 @@ export function b() {
-  return 1
+  return 2
@@ -20,2 +22,0 @@
-gone
-gone too
`

describe('parseDiff', () => {
  it('collects added line numbers in the new file', () => {
    const [file] = parseDiff(MODIFIED)
    assert.equal(file.path, 'backend/src/a.ts')
    assert.equal(file.status, 'modified')
    assert.deepEqual(file.addedLines, [3, 4, 12])
    assert.equal(file.additions, 3)
    assert.equal(file.deletions, 3)
  })

  it('detects added, deleted, renamed and mode-changed files', () => {
    const text = [
      'diff --git a/x.test.ts b/x.test.ts',
      'new file mode 100644',
      '--- /dev/null',
      '+++ b/x.test.ts',
      '@@ -0,0 +1,2 @@',
      '+a',
      '+b',
      'diff --git a/old.ts b/old.ts',
      'deleted file mode 100644',
      '--- a/old.ts',
      '+++ /dev/null',
      '@@ -1 +0,0 @@',
      '-a',
      'diff --git a/a.ts b/b.ts',
      'similarity index 100%',
      'rename from a.ts',
      'rename to b.ts',
      'diff --git a/run.sh b/run.sh',
      'old mode 100644',
      'new mode 100755',
      'diff --git a/link b/link',
      'new file mode 120000',
      '--- /dev/null',
      '+++ b/link',
      '@@ -0,0 +1 @@',
      '+../../etc/passwd',
    ].join('\n')
    const files = parseDiff(text)
    assert.deepEqual(
      files.map((file) => [file.path, file.status, file.newMode ?? null]),
      [
        ['x.test.ts', 'added', '100644'],
        ['old.ts', 'deleted', null],
        ['b.ts', 'renamed', null],
        ['run.sh', 'mode-changed', '100755'],
        ['link', 'added', '120000'],
      ],
    )
    assert.equal(files[1].oldPath, 'old.ts')
    assert.equal(files[1].newPath, null)
    assert.equal(files[2].oldPath, 'a.ts')
  })

  it('flags binary patches and malformed headers', () => {
    const files = parseDiff(
      ['diff --git a/img.png b/img.png', 'new file mode 100644', 'GIT binary patch', 'literal 3', 'diff --git "a/sp ace" "b/sp ace"'].join('\n'),
    )
    assert.equal(files[0].binary, true)
    assert.equal(files[1].malformed, true)
  })

  it('does not treat removed lines that look like headers as headers', () => {
    const text = ['diff --git a/a.md b/a.md', '--- a/a.md', '+++ b/a.md', '@@ -1,2 +1 @@', '--- not a header', ' kept'].join('\n')
    const [file] = parseDiff(text)
    assert.equal(file.status, 'modified')
    assert.equal(file.deletions, 1)
  })
})

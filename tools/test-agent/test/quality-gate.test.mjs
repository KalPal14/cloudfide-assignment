import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkContent, compareResults, loadResults, repoPath } from '../quality-gate.mjs'

describe('checkContent', () => {
  it('accepts a normal test file', () => {
    assert.deepEqual(checkContent('a.test.ts', "it('works', () => { expect(1).toBe(1) })", { spec: true }), [])
  })

  const cases = {
    'it.only': "it.only('x', () => expect(1).toBe(1))",
    'describe.skip': "describe.skip('x', () => {})\nexpect(1)",
    'it.todo': "it.todo('later')\nexpect(1)",
    'test.fails': "test.fails('x', () => expect(1).toBe(2))",
    'it.skipIf': "it.skipIf(true)('x', () => expect(1).toBe(1))",
    xit: "xit('x', () => expect(1).toBe(1))",
    '@ts-ignore': '// @ts-ignore\nexpect(1)',
    snapshots: "expect(tree).toMatchSnapshot()",
    'inline snapshots': 'expect(tree).toMatchInlineSnapshot()',
    'real network': "await fetch('https://example.com')\nexpect(1)",
    'no assertions': "it('does nothing', () => { render(<App />) })",
  }
  for (const [name, content] of Object.entries(cases)) {
    it(`rejects ${name}`, () => assert.notDeepEqual(checkContent('a.test.ts', content, { spec: true }), []))
  }

  it('does not require assertions in fixtures', () => {
    assert.deepEqual(checkContent('fixture.ts', 'export const todo = {}', { spec: false }), [])
  })
})

describe('compareResults', () => {
  const suite = (...statuses) => ({ suiteStatus: 'passed', message: '', tests: statuses.map((status, i) => ({ title: `t${i}`, status })) })

  it('passes when changed specs ran green and nothing was lost', () => {
    const before = new Map([['backend/tests/a.test.ts', suite('passed')]])
    const after = new Map([['backend/tests/a.test.ts', suite('passed', 'passed')], ['backend/tests/b.test.ts', suite('passed')]])
    const result = compareResults({ before, after, changedSpecs: ['backend/tests/a.test.ts', 'backend/tests/b.test.ts'], projects: new Set(['backend']) })
    assert.deepEqual(result.violations, [])
    assert.deepEqual(result.perFile, [
      { path: 'backend/tests/a.test.ts', before: 1, after: 2 },
      { path: 'backend/tests/b.test.ts', before: 0, after: 1 },
    ])
  })

  it('reports failing, skipped and missing specs', () => {
    const after = new Map([['backend/tests/a.test.ts', suite('passed', 'failed', 'skipped')]])
    const result = compareResults({ before: null, after, changedSpecs: ['backend/tests/a.test.ts', 'backend/tests/missing.test.ts'] })
    const reasons = result.violations.map((violation) => violation.reason)
    assert.ok(reasons.includes('test "t1" failed'))
    assert.ok(reasons.includes('test "t2" skipped'))
    assert.ok(reasons.some((reason) => reason.includes('not executed')))
  })

  it('reports fewer tests and test files that disappeared', () => {
    const before = new Map([
      ['backend/tests/a.test.ts', suite('passed', 'passed')],
      ['backend/tests/gone.test.ts', suite('passed')],
      ['frontend/src/x.test.ts', suite('passed')],
    ])
    const after = new Map([['backend/tests/a.test.ts', suite('passed')]])
    const result = compareResults({ before, after, changedSpecs: ['backend/tests/a.test.ts'], projects: new Set(['backend']) })
    const reasons = result.violations.map((violation) => `${violation.path}: ${violation.reason}`)
    assert.ok(reasons.includes('backend/tests/a.test.ts: number of tests decreased from 2 to 1'))
    assert.ok(reasons.includes('backend/tests/gone.test.ts: existing test file no longer runs'))
    assert.ok(!reasons.some((reason) => reason.startsWith('frontend/')), 'other projects are not compared')
  })

  it('reports suites that failed to load', () => {
    const after = new Map([['backend/tests/a.test.ts', { suiteStatus: 'failed', message: 'SyntaxError: boom\n  at x', tests: [] }]])
    const result = compareResults({ before: null, after, changedSpecs: ['backend/tests/a.test.ts'] })
    assert.match(result.violations[0].reason, /failed to load: SyntaxError: boom$/)
  })
})

describe('repoPath', () => {
  it('maps the baseline and the verified checkout to the same path', () => {
    // generate runs in the workspace, verify in a `pr/` sub-directory of it.
    assert.equal(repoPath('/home/runner/work/repo/repo/backend/tests/a.test.ts', 'backend'), 'backend/tests/a.test.ts')
    assert.equal(repoPath('/home/runner/work/repo/repo/pr/backend/tests/a.test.ts', 'backend'), 'backend/tests/a.test.ts')
  })

  it('anchors on the project directory when the checkout has the same name', () => {
    assert.equal(repoPath('/home/runner/work/frontend/frontend/frontend/src/App.test.tsx', 'frontend'), 'frontend/src/App.test.tsx')
  })

  it('accepts Windows separators and paths that are already relative', () => {
    assert.equal(repoPath('C:\\work\\repo\\backend\\tests\\a.test.ts', 'backend'), 'backend/tests/a.test.ts')
    assert.equal(repoPath('backend/tests/a.test.ts', 'backend'), 'backend/tests/a.test.ts')
  })

  it('returns null for a path outside the project', () => {
    assert.equal(repoPath('/somewhere/else/tests/a.test.ts', 'backend'), null)
  })
})

describe('quality gate with a baseline from another checkout', () => {
  const script = join(dirname(fileURLToPath(import.meta.url)), '..', 'quality-gate.mjs')
  const report = (root, files) => ({
    testResults: Object.entries(files).map(([path, count]) => ({
      name: join(root, path),
      status: 'passed',
      assertionResults: Array.from({ length: count }, (_, i) => ({ fullName: `t${i}`, status: 'passed' })),
    })),
  })

  function run({ before, after, changed = ['backend/tests/a.test.ts'] }) {
    const dir = mkdtempSync(join(tmpdir(), 'quality-gate-'))
    try {
      // The same layout as in CI: the baseline comes from <workspace>, the verified run from <workspace>/pr.
      const workspace = '/home/runner/work/repo/repo'
      mkdirSync(join(dir, 'pr/backend/tests'), { recursive: true })
      for (const path of changed) writeFileSync(join(dir, 'pr', path), "it('works', () => expect(1).toBe(1))\n")
      const write = (name, value) => writeFileSync(join(dir, name), JSON.stringify(value))
      write('policy.json', { files: changed.map((path) => ({ path, project: 'backend', status: 'modified', spec: true })) })
      write('before.json', report(workspace, before))
      write('after.json', report(join(workspace, 'pr'), after))
      const result = spawnSync(process.execPath, [script, '--root', 'pr', '--policy', 'policy.json',
        '--before', 'backend=before.json', '--after', 'backend=after.json', '--out', 'gate.json'], { cwd: dir, encoding: 'utf8' })
      return { status: result.status, gate: JSON.parse(readFileSync(join(dir, 'gate.json'), 'utf8')) }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }

  it('counts the tests that existed before', () => {
    const { status, gate } = run({ before: { 'backend/tests/a.test.ts': 19 }, after: { 'backend/tests/a.test.ts': 20 } })
    assert.equal(status, 0)
    assert.deepEqual(gate.perFile, [{ path: 'backend/tests/a.test.ts', before: 19, after: 20 }])
  })

  it('fails when tests were removed or a test file no longer runs', () => {
    const { status, gate } = run({
      before: { 'backend/tests/a.test.ts': 19, 'backend/tests/gone.test.ts': 3 },
      after: { 'backend/tests/a.test.ts': 18 },
    })
    assert.equal(status, 1)
    const reasons = gate.violations.map((violation) => `${violation.path}: ${violation.reason}`)
    assert.ok(reasons.includes('backend/tests/a.test.ts: number of tests decreased from 19 to 18'), reasons.join('\n'))
    assert.ok(reasons.includes('backend/tests/gone.test.ts: existing test file no longer runs'), reasons.join('\n'))
  })

  it('reports results it cannot map instead of ignoring them', () => {
    const dir = mkdtempSync(join(tmpdir(), 'quality-gate-'))
    try {
      const file = join(dir, 'results.json')
      writeFileSync(file, JSON.stringify(report('/elsewhere', { 'tests/a.test.ts': 1 })))
      assert.deepEqual([...loadResults(file, 'backend').keys()], ['/elsewhere/tests/a.test.ts'])
      writeFileSync(join(dir, 'policy.json'), JSON.stringify({ files: [] }))
      const result = spawnSync(process.execPath, [script, '--policy', 'policy.json', '--before', `backend=${file}`,
        '--after', `backend=${file}`, '--out', 'gate.json'], { cwd: dir, encoding: 'utf8' })
      assert.equal(result.status, 1)
      const gate = JSON.parse(readFileSync(join(dir, 'gate.json'), 'utf8'))
      assert.deepEqual(gate.violations.map((violation) => violation.path), ['/elsewhere/tests/a.test.ts'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

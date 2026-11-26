import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { checkContent, compareResults } from '../quality-gate.mjs'

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

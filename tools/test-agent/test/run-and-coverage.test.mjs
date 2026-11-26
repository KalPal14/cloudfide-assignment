import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { extractRun } from '../extract-run.mjs'
import { coverageOfLines, formatRanges } from '../lib/coverage.mjs'
import { diffCoverage } from '../diff-coverage.mjs'
import { outcome, summarize } from '../summarize-verify.mjs'

describe('extractRun', () => {
  const transcript = [
    { type: 'system', subtype: 'init', model: 'claude-sonnet-5-5' },
    { type: 'assistant', message: { content: [{ type: 'tool_use', id: '1', name: 'Skill', input: { skill: 'analyze-pr-changes' } }] } },
    { type: 'assistant', message: { content: [{ type: 'tool_use', id: '2', name: 'Write', input: { file_path: 'backend/src/x.ts' } }] } },
    { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: '2', is_error: true, content: 'PreToolUse:Write hook error: Blocked' }] } },
    { type: 'assistant', message: { content: [{ type: 'tool_use', id: '3', name: 'Skill', input: { skill: 'backend-unit-tests' } }, { type: 'tool_use', id: '4', name: 'Skill', input: { skill: 'analyze-pr-changes' } }] } },
    { type: 'result', subtype: 'success', is_error: false, num_turns: 9, total_cost_usd: 0.25, duration_ms: 1000, permission_denials: [{ tool_name: 'Bash', tool_input: { command: 'curl https://x' } }], structured_output: { summary: 's' } },
  ].map((message) => JSON.stringify(message))

  it('reports facts observed in the transcript', () => {
    const { report, meta } = extractRun([...transcript, 'not json'])
    assert.deepEqual(report, { summary: 's' })
    assert.equal(meta.ok, true)
    assert.deepEqual(meta.skillsUsed, ['analyze-pr-changes', 'backend-unit-tests'])
    assert.deepEqual(meta.toolCounts, { Skill: 3, Write: 1 })
    assert.deepEqual(meta.permissionDenials, [{ tool: 'Bash', input: 'curl https://x' }])
    assert.equal(meta.hookBlocks.length, 1)
    assert.equal(meta.model, 'claude-sonnet-5-5')
  })

  it('is not ok without structured output', () => {
    const { report, meta } = extractRun([JSON.stringify({ type: 'result', subtype: 'error_max_budget_usd', is_error: true })])
    assert.equal(report, null)
    assert.equal(meta.ok, false)
  })
})

describe('coverage helpers', () => {
  it('formats line ranges', () => {
    assert.equal(formatRanges([7, 1, 2, 3, 9, 10]), '1-3, 7, 9-10')
    assert.equal(formatRanges([]), '')
  })
  it('counts only executable lines', () => {
    const lines = new Map([[1, 1], [2, 0], [4, 3]])
    assert.deepEqual(coverageOfLines(lines, [1, 2, 3, 4]), { executable: 3, covered: 2, uncovered: [2], pct: 66.7, measured: true })
    assert.equal(coverageOfLines(undefined, [1]).measured, false)
  })
  it('computes changed-lines coverage before and after', () => {
    const manifest = { files: [{ path: 'a.ts', project: 'backend', changedLines: [1, 2], changedLinesCoverage: { executable: 2, covered: 0, pct: 0 }, fileLineCoverage: 0 }] }
    const result = diffCoverage(manifest, new Map([['a.ts', new Map([[1, 1], [2, 1]])]]))
    assert.deepEqual(result.total, { before: { executable: 2, covered: 0, pct: 0 }, after: { executable: 2, covered: 2, pct: 100 } })
  })
})

describe('summarize-verify', () => {
  it('maps step outcomes', () => {
    assert.equal(outcome('success'), 'pass')
    assert.equal(outcome('failure'), 'fail')
    assert.equal(outcome(undefined), 'skipped')
  })
  it('fails the verdict for any failed check', () => {
    const result = summarize({
      policy: { ok: true, empty: false, violations: [], files: [] },
      gate: { ok: true, violations: [] },
      diffCoverage: null,
      results: new Map(),
      summaryBefore: new Map(),
      summaryAfter: new Map([['backend', '/nonexistent.json']]),
      steps: new Map([['backend.typecheck', 'failure'], ['flaky', 'success']]),
    })
    assert.equal(result.verdict, 'fail')
    assert.deepEqual(result.reasons, ['backend type check failed', 'backend tests failed'])
  })
  it('reports an empty patch as empty', () => {
    const result = summarize({ policy: { ok: true, empty: true, violations: [], files: [] }, gate: null, diffCoverage: null, results: new Map(), summaryBefore: new Map(), summaryAfter: new Map(), steps: new Map() })
    assert.equal(result.verdict, 'empty')
  })
})

#!/usr/bin/env node
// Renders the sticky PR comment (and the job summary) from structured inputs.
// Everything that came from the model is treated as untrusted text: HTML is
// escaped, @mentions are neutralised, table cells are flattened and lengths
// are capped, so the comment cannot ping people or inject markup.
//
// node render-comment.mjs --outcome committed --manifest m.json --report r.json --meta meta.json \
//   --collect collect.json --verify verify.json --commit <sha> --run-url <url> --out comment.md
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'

export const MARKER = '<!-- taskly-test-agent -->'
const MAX_COMMENT = 60000

export function sanitize(value, max = 300) {
  const text = String(value ?? '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/@(?=[\w-])/g, '@​')
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

export function cell(value, max = 300) {
  return sanitize(value, max).replace(/\r?\n/g, ' ').replace(/\|/g, '\\|')
}

function code(value) {
  return `\`${String(value ?? '').replace(/`/g, "'")}\``
}

const ICON = { pass: '✅', fail: '❌', skipped: '➖', empty: '➖' }
const ACTION = { created: '🆕 created', updated: '✏️ updated', skipped: '⏭️ skipped', needs_human: '🙋 needs human' }

const HEADLINE = {
  preview: () => '🔎 **Verification summary** — the publish job decides what is committed and posts the final report',
  skipped: (ctx) => `⏭️ **Agent not run** — ${sanitize(ctx.skipReason || 'nothing to do', 400)}`,
  committed: (ctx) => `✅ **Tests generated, verified and committed** in ${ctx.commit ? code(ctx.commit.slice(0, 7)) : 'a new commit'}`,
  proposed: (ctx) => `✅ **Tests generated and verified** — proposed in ${ctx.target ? sanitize(ctx.target, 200) : 'a new branch'}`,
  'no-changes': () => '➖ **No test changes needed** — the agent reviewed the changes and decided not to add tests',
  'verify-failed': () => '❌ **Generated tests failed independent verification** — nothing was committed',
  'agent-failed': () => '❌ **The agent run did not complete** — nothing was committed',
  superseded: () => '⏭️ **Superseded** — the branch changed while the agent was running; a newer run will report',
}

function pct(value) {
  return value === null || value === undefined ? 'n/a' : `${value}%`
}

function decisionsSection(report, manifest) {
  const decisions = report?.decisions ?? []
  if (!decisions.length) return []
  const rows = decisions.map((decision) => {
    const tests = [decision.tests_added ? `+${decision.tests_added}` : '', decision.tests_modified ? `~${decision.tests_modified}` : '']
      .filter(Boolean)
      .join(' ')
    return `| ${code(cell(decision.source_file, 200))} | ${cell(decision.project, 20)} | ${ACTION[decision.action] ?? cell(decision.action, 20)} | ${decision.test_file ? code(cell(decision.test_file, 200)) : '—'} | ${tests || '—'} | ${cell(decision.reason, 400)} |`
  })
  const lines = ['### Decisions', '', '| Source file | Project | Decision | Test file | Tests | Reason |', '|---|---|---|---|---|---|', ...rows]
  const skipped = manifest?.skipped ?? []
  if (skipped.length) {
    lines.push('', `<details><summary>Filtered out before the agent ran (${skipped.length})</summary>`, '')
    for (const file of skipped.slice(0, 50)) lines.push(`- ${code(cell(file.path, 200))} — ${cell(file.reason, 200)}`)
    lines.push('', '</details>')
  }
  return lines
}

function verificationSection(verify, manifest) {
  if (!verify) return []
  const projects = Object.entries(verify.projects ?? {})
  const lines = ['### Verification', '', '_Independent job without secrets: applies the patch to a fresh checkout and re-runs everything._', '']
  if (verify.policy) lines.push(`- Patch policy: ${verify.policy.ok ? '✅ only test files changed' : '❌ violations'}`)
  if (verify.gate) lines.push(`- Quality gate: ${verify.gate.ok ? '✅ no focused/skipped tests, assertions present, no tests lost' : '❌ violations'}`)
  if (verify.flaky) lines.push(`- Stability (changed tests, 3× shuffled): ${ICON[verify.flaky] ?? verify.flaky}`)
  if (projects.length) {
    lines.push('', '| Check | ' + projects.map(([name]) => name).join(' | ') + ' |', '|---|' + projects.map(() => '---|').join(''))
    const row = (label, fn) => `| ${label} | ${projects.map(([, value]) => fn(value)).join(' | ')} |`
    lines.push(row('Type check', (v) => ICON[v.typecheck] ?? v.typecheck))
    lines.push(row('Formatting', (v) => ICON[v.format] ?? v.format))
    lines.push(row('Tests', (v) => (v.tests ? `${ICON[v.testsStatus]} ${v.tests.passed}/${v.tests.total} passed` : '❌ no results')))
    lines.push(row('Line coverage', (v) => `${pct(v.coverageBefore)} → **${pct(v.coverageAfter)}**`))
    lines.push(row('Coverage thresholds', (v) => ICON[v.coverageThresholds] ?? v.coverageThresholds))
  }
  if (verify.diffCoverage) {
    const { before, after } = verify.diffCoverage
    const label = manifest?.mode === 'backfill' ? 'Line coverage of the target files' : 'Coverage of changed lines'
    lines.push('', `**${label}:** ${pct(before?.pct)} → **${pct(after?.pct)}** (${after?.covered ?? 0}/${after?.executable ?? 0} executable lines)`)
  }
  const violations = [...(verify.policy?.violations ?? []), ...(verify.gate?.violations ?? [])]
  if (violations.length) {
    lines.push('', '<details open><summary>Violations</summary>', '')
    for (const violation of violations.slice(0, 30)) lines.push(`- ${code(cell(violation.path, 200))}: ${cell(violation.reason, 300)}`)
    lines.push('', '</details>')
  }
  if (verify.reasons?.length) lines.push('', `**Why it failed:** ${verify.reasons.map((reason) => cell(reason, 200)).join('; ')}`)
  return lines
}

function findingsSection(report) {
  const bugs = report?.suspected_bugs ?? []
  if (!bugs.length) return []
  return [
    '### ⚠️ Suspected bugs (not encoded in tests)',
    '',
    ...bugs.map((bug) => `- ${code(cell(`${bug.file}${bug.line ? `:${bug.line}` : ''}`, 200))} — ${cell(bug.description, 600)}`),
  ]
}

function runSection(meta, ctx) {
  const facts = []
  if (meta?.model) facts.push(`model ${code(meta.model)}`)
  if (meta?.numTurns) facts.push(`${meta.numTurns} turns`)
  if (typeof meta?.costUsd === 'number') facts.push(`$${meta.costUsd.toFixed(2)}`)
  if (meta?.durationMs) facts.push(`${Math.round(meta.durationMs / 1000)}s`)
  const lines = []
  if (meta) {
    lines.push('### Agent run', '')
    lines.push(`- Agent: ${code('unit-test-engineer')}${facts.length ? ` · ${facts.join(' · ')}` : ''}`)
    lines.push(`- Skills used (observed in the transcript): ${meta.skillsUsed?.length ? meta.skillsUsed.map((skill) => code(cell(skill, 60))).join(', ') : 'none'}`)
    const blocked = (meta.permissionDenials?.length ?? 0) + (meta.hookBlocks?.length ?? 0)
    if (blocked) lines.push(`- Guardrails blocked ${blocked} tool call(s) during the run (see transcript artifact)`)
  }
  if (ctx.discarded?.length) {
    lines.push(`- ⚠️ ${ctx.discarded.length} change(s) outside the allowed test paths were discarded: ${ctx.discarded.slice(0, 10).map((file) => code(cell(file.path, 120))).join(', ')}`)
  }
  return lines
}

export function renderComment(ctx) {
  const { outcome, manifest, report, meta, verify } = ctx
  const lines = [MARKER, '## 🧪 Test Agent', '', (HEADLINE[outcome] ?? HEADLINE['agent-failed'])(ctx), '']
  const context = []
  if (ctx.head) context.push(`analysed ${code(ctx.head.slice(0, 7))}`)
  if (manifest?.mode) context.push(`mode ${code(manifest.mode)}${manifest.scope ? ` (${code(manifest.scope)})` : ''}`)
  if (ctx.runUrl) context.push(`[workflow run](${ctx.runUrl})`)
  if (context.length) lines.push(`<sub>${context.join(' · ')}</sub>`, '')
  if (report?.summary) lines.push(sanitize(report.summary, 1500), '')
  if (outcome === 'agent-failed' && meta) {
    lines.push(`Agent result: ${code(meta.subtype ?? 'no result')}${meta.structuredOutput ? '' : ', no structured report'}. Check the transcript artifact of the run.`, '')
  }
  const notes = (report?.notes ?? []).length
    ? ['<details><summary>Agent notes</summary>', '', ...report.notes.slice(0, 10).map((note) => `- ${cell(note, 300)}`), '', '</details>']
    : []
  for (const section of [decisionsSection(report, manifest), verificationSection(verify, manifest), findingsSection(report), runSection(meta, ctx), notes]) {
    if (section.length) lines.push(...section, '')
  }
  if (outcome === 'committed' || outcome === 'proposed') {
    lines.push('<sub>Generated tests are a starting point: review them like any other code. Add the `skip-test-agent` label to opt a PR out.</sub>')
  }
  let body = lines.join('\n').replace(/\n{3,}/g, '\n\n')
  if (body.length > MAX_COMMENT) body = `${body.slice(0, MAX_COMMENT)}\n\n…(truncated)`
  return `${body.trimEnd()}\n`
}

function readOptional(path) {
  return path && existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null
}

function main() {
  const { values } = parseArgs({
    options: {
      outcome: { type: 'string' },
      manifest: { type: 'string' },
      report: { type: 'string' },
      meta: { type: 'string' },
      collect: { type: 'string' },
      verify: { type: 'string' },
      commit: { type: 'string' },
      head: { type: 'string' },
      target: { type: 'string' },
      'skip-reason': { type: 'string' },
      'run-url': { type: 'string' },
      out: { type: 'string' },
    },
  })
  const body = renderComment({
    outcome: values.outcome,
    manifest: readOptional(values.manifest),
    report: readOptional(values.report),
    meta: readOptional(values.meta),
    verify: readOptional(values.verify),
    discarded: readOptional(values.collect)?.discarded ?? [],
    commit: values.commit,
    head: values.head,
    target: values.target,
    skipReason: values['skip-reason'],
    runUrl: values['run-url'],
  })
  if (values.out) writeFileSync(values.out, body)
  else process.stdout.write(body)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()

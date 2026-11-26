#!/usr/bin/env node
// Turns the agent's stream-json transcript into two small files:
//  - report.json: the structured output (validated by Claude Code against report.schema.json)
//  - meta.json:   facts observed by the harness, not claimed by the model: skills
//                 actually invoked, tool usage, permission denials, turns, cost.
//
// node extract-run.mjs --transcript transcript.jsonl --report report.json --meta meta.json
import { existsSync, readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'
import { writeJson } from './lib/io.mjs'

function summarizeInput(name, input = {}) {
  if (name === 'Bash') return String(input.command ?? '').slice(0, 160)
  if (input.file_path) return String(input.file_path)
  if (name === 'Skill') return String(input.skill ?? '')
  return JSON.stringify(input).slice(0, 160)
}

export function extractRun(lines) {
  const meta = {
    ok: false,
    subtype: null,
    isError: true,
    model: null,
    numTurns: 0,
    costUsd: null,
    durationMs: null,
    skillsUsed: [],
    toolCounts: {},
    permissionDenials: [],
    hookBlocks: [],
    structuredOutput: false,
  }
  let report = null
  const toolNames = new Map()
  for (const line of lines) {
    let message
    try {
      message = JSON.parse(line)
    } catch {
      continue
    }
    if (message.type === 'system' && message.subtype === 'init') meta.model = message.model ?? null
    if (message.type === 'assistant') {
      for (const block of message.message?.content ?? []) {
        if (block.type !== 'tool_use') continue
        toolNames.set(block.id, block.name)
        meta.toolCounts[block.name] = (meta.toolCounts[block.name] ?? 0) + 1
        if (block.name === 'Skill' && block.input?.skill && !meta.skillsUsed.includes(block.input.skill)) {
          meta.skillsUsed.push(block.input.skill)
        }
      }
    }
    if (message.type === 'user') {
      for (const block of message.message?.content ?? []) {
        if (block.type !== 'tool_result' || !block.is_error) continue
        const text = typeof block.content === 'string' ? block.content : JSON.stringify(block.content)
        if (text.includes('PreToolUse')) meta.hookBlocks.push({ tool: toolNames.get(block.tool_use_id) ?? 'unknown', message: text.slice(0, 300) })
      }
    }
    if (message.type === 'result') {
      meta.subtype = message.subtype ?? null
      meta.isError = Boolean(message.is_error)
      meta.numTurns = message.num_turns ?? 0
      meta.costUsd = message.total_cost_usd ?? null
      meta.durationMs = message.duration_ms ?? null
      meta.permissionDenials = (message.permission_denials ?? []).map((denial) => ({
        tool: denial.tool_name,
        input: summarizeInput(denial.tool_name, denial.tool_input),
      }))
      if (message.structured_output && typeof message.structured_output === 'object') {
        report = message.structured_output
        meta.structuredOutput = true
      }
    }
  }
  meta.ok = meta.subtype === 'success' && !meta.isError && meta.structuredOutput
  return { report, meta }
}

function main() {
  const { values } = parseArgs({
    options: { transcript: { type: 'string' }, report: { type: 'string' }, meta: { type: 'string' } },
  })
  const lines = existsSync(values.transcript) ? readFileSync(values.transcript, 'utf8').split('\n').filter(Boolean) : []
  const { report, meta } = extractRun(lines)
  if (report) writeJson(values.report, report)
  writeJson(values.meta, meta)
  console.error(
    `Agent run: ${meta.subtype ?? 'no result'}; turns=${meta.numTurns}; cost=$${meta.costUsd?.toFixed?.(4) ?? 'n/a'}; ` +
      `skills=${meta.skillsUsed.join(', ') || 'none'}; denials=${meta.permissionDenials.length}; structured output=${meta.structuredOutput}`,
  )
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()

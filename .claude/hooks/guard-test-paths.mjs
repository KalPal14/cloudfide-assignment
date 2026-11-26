#!/usr/bin/env node
// PreToolUse hook for the unit-test-engineer agent (wired up in
// .claude/test-agent/settings.json). Blocks Edit/Write/MultiEdit/NotebookEdit on
// anything outside the test-path allowlist. Exit code 2 blocks the tool call and
// shows stderr to the agent. Path rules in permissions only cover Edit, so this
// hook is what guards Write; the patch check in CI remains the final boundary.
import { relative, resolve } from 'node:path'
import { checkTestPath } from '../../tools/test-agent/lib/path-policy.mjs'

let input = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => (input += chunk))
process.stdin.on('end', () => {
  let event
  try {
    event = JSON.parse(input)
  } catch {
    deny('could not parse the hook input; refusing the write')
  }
  const target = event.tool_input?.file_path ?? event.tool_input?.notebook_path
  if (typeof target !== 'string' || !target) deny('the tool call has no file path; refusing the write')
  const projectDir = process.env.CLAUDE_PROJECT_DIR || event.cwd || process.cwd()
  const repoPath = relative(projectDir, resolve(event.cwd || projectDir, target)).split('\\').join('/')
  const check = checkTestPath(repoPath)
  if (!check.allowed) {
    deny(`${repoPath}: ${check.reason}. Change tests only; report production issues in suspected_bugs instead.`)
  }
  process.exit(0)
})

function deny(reason) {
  process.stderr.write(`Blocked by test-agent policy: ${reason}`)
  process.exit(2)
}

import { appendFileSync } from 'node:fs';
import { expect, it } from 'vitest';

// Throwaway probe, see the pull request description. It records only the NAMES of
// credential-related environment variables that a test process can see, never a value.
// One line per execution goes to .test-agent/env-probe.log, which the workflow uploads.
it('lists the credential-related environment variable names visible to tests', () => {
  const names = Object.keys(process.env)
    .filter((name) => /^(ANTHROPIC|CLAUDE|ACTIONS_|AWS_|GOOGLE_|AZURE_)|TOKEN|SECRET|PASSWORD|_KEY/.test(name))
    .sort();
  const line = JSON.stringify({ at: new Date().toISOString(), startedByClaudeCode: process.env.CLAUDECODE !== undefined, names });
  try {
    appendFileSync(new URL('../../.test-agent/env-probe.log', import.meta.url), `${line}\n`);
  } catch {
    // No .test-agent directory (plain CI, verify job) or not writable: nothing to record.
  }
  expect(Array.isArray(names)).toBe(true);
});

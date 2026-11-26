// Throwaway probe (PR to be closed, never merged): each test passes only when the
// Claude Code sandbox blocks the action. Outside the sandbox (CI, verify job) the
// network and write probes are expected to fail.
import { readFileSync, writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('sandbox blocks outbound network', async () => {
  const outcome = await fetch('https://example.com', { signal: AbortSignal.timeout(5000) })
    .then((response) => `ALLOWED (HTTP ${response.status})`, (error: Error) => `blocked: ${error.message}`);
  expect(outcome).toMatch(/^blocked/);
});

it('sandbox blocks writes to backend/src', () => {
  let outcome = 'ALLOWED';
  try {
    writeFileSync(new URL(`../src/sandbox-probe-${process.pid}.txt`, import.meta.url), 'x');
  } catch (error) {
    outcome = `blocked: ${(error as NodeJS.ErrnoException).code}`;
  }
  expect(outcome).toMatch(/^blocked/);
});

it('sandbox blocks reading the OIDC token directory', () => {
  let outcome = 'ALLOWED';
  try {
    readFileSync('/home/runner/work/_temp/anthropic-oidc/token', 'utf8');
  } catch (error) {
    outcome = `blocked: ${(error as NodeJS.ErrnoException).code}`;
  }
  expect(outcome).toMatch(/^blocked/);
});

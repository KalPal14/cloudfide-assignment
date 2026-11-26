import { expect, it } from 'vitest';

// Throwaway probe, see the pull request description. It prints only the NAMES of
// credential-related environment variables that a test process can see, never a value.
it('lists the credential-related environment variable names visible to tests', () => {
  const names = Object.keys(process.env)
    .filter((name) => /^(ANTHROPIC|CLAUDE|ACTIONS_|AWS_|GOOGLE_|AZURE_)|TOKEN|SECRET/.test(name))
    .sort();
  console.log(`ENV_PROBE ${JSON.stringify(names)}`);
  expect(Array.isArray(names)).toBe(true);
});

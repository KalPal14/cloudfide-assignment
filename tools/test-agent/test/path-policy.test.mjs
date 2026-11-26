import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { checkTestPath, isAllowedTestPath, isTestSpec, normalizeRepoPath } from '../lib/path-policy.mjs'

describe('normalizeRepoPath', () => {
  it('normalises redundant segments', () => {
    assert.equal(normalizeRepoPath('./backend//tests/./a.test.ts'), 'backend/tests/a.test.ts')
  })
  for (const path of ['/etc/passwd', '../x.test.ts', 'backend/tests/../src/a.ts', 'C:/x.ts', 'a\\b.ts', 'a\0b', '', '.', null]) {
    it(`rejects ${JSON.stringify(path)}`, () => assert.equal(normalizeRepoPath(path), null))
  }
})

describe('checkTestPath', () => {
  const allowed = [
    'backend/tests/router.test.ts',
    'backend/tests/fixture.ts',
    'backend/tests/core/config.test.ts',
    'frontend/src/App.test.tsx',
    'frontend/src/features/todos/hooks/useTodosQuery.test.ts',
    'frontend/src/test/todoFixture.ts',
    'frontend/src/test/renderWithProviders.tsx',
  ]
  for (const path of allowed) it(`allows ${path}`, () => assert.equal(isAllowedTestPath(path), true))

  const denied = [
    'backend/src/factory.ts',
    'backend/vitest.config.ts',
    'backend/package.json',
    'backend/tests/../src/factory.ts',
    'backend/tests/notes.md',
    'frontend/src/App.tsx',
    'frontend/src/test/setup.ts',
    'frontend/vite.config.ts',
    'frontend/src/features/todos/TodosPage.test.tsx.orig',
    '.github/workflows/test-agent.yml',
    '.claude/test-agent/settings.json',
    'tools/test-agent/lib/path-policy.mjs',
  ]
  for (const path of denied) it(`denies ${path}`, () => assert.equal(isAllowedTestPath(path), false))

  it('explains why setup.ts is reserved', () => {
    assert.match(checkTestPath('frontend/src/test/setup.ts').reason, /global test setup/)
  })
  it('returns the normalised path and the matching rule', () => {
    assert.deepEqual(checkTestPath('./backend/tests/a.test.ts'), {
      allowed: true,
      path: 'backend/tests/a.test.ts',
      rule: 'backend/tests/**/*.ts',
    })
  })
})

describe('isTestSpec', () => {
  it('distinguishes specs from fixtures', () => {
    assert.equal(isTestSpec('backend/tests/router.test.ts'), true)
    assert.equal(isTestSpec('frontend/src/a/B.test.tsx'), true)
    assert.equal(isTestSpec('backend/tests/fixture.ts'), false)
    assert.equal(isTestSpec('frontend/src/test/todoFixture.ts'), false)
  })
})

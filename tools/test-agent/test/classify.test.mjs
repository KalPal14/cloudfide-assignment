import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { classifyFile, importedModules, relatedTests, testCandidateFor } from '../lib/classify.mjs'

describe('classifyFile', () => {
  const testable = ['backend/src/factory.ts', 'backend/src/features/todos/router.ts', 'frontend/src/lib/http.ts', 'frontend/src/features/todos/TodosPage.tsx', 'frontend/src/design-system/components/Button/Button.tsx', 'frontend/src/design-system/components/Badge/Badge.variants.ts']
  for (const path of testable) {
    it(`treats ${path} as testable source`, () => {
      const result = classifyFile(path)
      assert.equal(result.kind, 'source')
      assert.equal(result.testable, true)
    })
  }

  const skipped = {
    'backend/src/features/todos/types.ts': 'type-only module',
    'frontend/src/design-system/components/Button/Button.styles.ts': 'styled-components styles',
    'frontend/src/design-system/components/Button/Button.stories.tsx': 'Storybook story',
    'frontend/src/design-system/components/Button/Button.types.ts': 'type-only module',
    'frontend/src/features/todos/index.ts': 'barrel re-export',
    'backend/src/generated/prisma/client.ts': 'generated Prisma client',
    'frontend/src/main.tsx': 'browser entrypoint (render bootstrap)',
    'backend/openapi.json': 'API contract document',
    'README.md': 'documentation',
    'frontend/vite.config.ts': 'build or tooling configuration',
    'frontend/src/styles.css': 'static asset or markup',
    '.github/workflows/ci.yml': 'CI configuration',
  }
  for (const [path, reason] of Object.entries(skipped)) {
    it(`skips ${path} (${reason})`, () => {
      const result = classifyFile(path)
      assert.equal(result.testable, false)
      assert.equal(result.skipReason, reason)
    })
  }

  it('recognises test code changed by the author', () => {
    for (const path of ['backend/tests/router.test.ts', 'frontend/src/App.test.tsx', 'frontend/src/test/setup.ts', 'frontend/src/test/todoFixture.ts']) {
      assert.equal(classifyFile(path).kind, 'test', path)
    }
  })
})

describe('testCandidateFor', () => {
  it('follows the repository conventions', () => {
    assert.equal(testCandidateFor('backend/src/features/todos/router.ts'), 'backend/tests/router.test.ts')
    assert.equal(testCandidateFor('frontend/src/lib/http.ts'), 'frontend/src/lib/http.test.ts')
    assert.equal(testCandidateFor('frontend/src/App.tsx'), 'frontend/src/App.test.tsx')
    assert.equal(testCandidateFor('README.md'), null)
  })
})

describe('relatedTests', () => {
  const tests = new Map([
    ['backend/tests/repository.test.ts', "import { createDatabase } from '../src/core/database.ts'\nimport { TodoRepository } from '../src/features/todos/repository.ts'"],
    ['frontend/src/features/todos/TodosPage.test.tsx', "vi.mock('./hooks/useTodosQuery', () => ({}))\nimport { TodosPage } from './TodosPage'"],
    ['frontend/src/App.test.tsx', "vi.mock('./features/todos', () => ({}))"],
  ])
  it('finds tests that import or mock a module', () => {
    assert.deepEqual(relatedTests('backend/src/core/database.ts', tests), ['backend/tests/repository.test.ts'])
    assert.deepEqual(relatedTests('frontend/src/features/todos/hooks/useTodosQuery.ts', tests), ['frontend/src/features/todos/TodosPage.test.tsx'])
  })
  it('resolves directory imports to index modules', () => {
    assert.deepEqual(relatedTests('frontend/src/features/todos/index.ts', tests), ['frontend/src/App.test.tsx'])
  })
  it('ignores package imports', () => {
    assert.deepEqual([...importedModules('frontend/src/a.test.ts', "import { vi } from 'vitest'")], [])
  })
})

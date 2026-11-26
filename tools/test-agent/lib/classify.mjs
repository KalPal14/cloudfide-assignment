// Deterministic classification of repository files for the test agent.
// The agent still makes the final call, but obvious non-testable changes are
// filtered here so the model is never invoked for them.
import { isTestSpec, isAllowedTestPath } from './path-policy.mjs'

const NOT_TESTABLE = [
  [/(^|\/)types\.ts$/, 'type-only module'],
  [/\.types\.ts$/, 'type-only module'],
  [/\.d\.ts$/, 'type declarations'],
  [/\.styles\.ts$/, 'styled-components styles'],
  [/\.variants\.ts$/, 'styled-components variant styles'],
  [/\.stories\.tsx?$/, 'Storybook story'],
  [/(^|\/)index\.ts$/, 'barrel re-export'],
  [/(^|\/)(constants|[\w-]+\.constants)\.tsx?$/, 'static constants'],
  [/^backend\/src\/generated\//, 'generated Prisma client'],
  [/^frontend\/src\/main\.tsx$/, 'browser entrypoint (render bootstrap)'],
  [/^frontend\/src\/design-system\/mocks\.tsx$/, 'test-only design-system mocks'],
  [/^frontend\/src\/design-system\/theme\//, 'theme tokens and global styles'],
  [/^frontend\/src\/features\/todos\/api\/queryKeys\.ts$/, 'static query keys'],
  [/^frontend\/src\/lib\/queryClient\.ts$/, 'static QueryClient configuration'],
]

const SOURCE = [
  { project: 'backend', pattern: /^backend\/src\/(?:[\w.-]+\/)*[\w.-]+\.ts$/ },
  { project: 'frontend', pattern: /^frontend\/src\/(?:[\w.-]+\/)*[\w.-]+\.tsx?$/ },
]

export function projectOf(path) {
  if (path.startsWith('backend/')) return 'backend'
  if (path.startsWith('frontend/')) return 'frontend'
  return null
}

/**
 * @returns {{project: string|null, kind: 'source'|'test'|'other', testable: boolean, skipReason: string|null}}
 */
export function classifyFile(path) {
  const project = projectOf(path)
  if (isTestSpec(path) || isAllowedTestPath(path) || path === 'frontend/src/test/setup.ts') {
    return { project, kind: 'test', testable: false, skipReason: 'test code (changed by the author)' }
  }
  const source = SOURCE.find((candidate) => candidate.pattern.test(path))
  if (!source) {
    return { project, kind: 'other', testable: false, skipReason: describeOther(path) }
  }
  const excluded = NOT_TESTABLE.find(([pattern]) => pattern.test(path))
  if (excluded) return { project: source.project, kind: 'source', testable: false, skipReason: excluded[1] }
  return { project: source.project, kind: 'source', testable: true, skipReason: null }
}

function describeOther(path) {
  if (/\.(md|txt)$/i.test(path)) return 'documentation'
  if (/(^|\/)(package(-lock)?\.json|\.npmrc|tsconfig[\w.]*\.json|vite\.config\.ts|vitest\.config\.ts|prisma\.config\.ts)$/.test(path))
    return 'build or tooling configuration'
  if (/^backend\/openapi\.json$/.test(path)) return 'API contract document'
  if (/^backend\/prisma\//.test(path)) return 'database schema'
  if (/^\.github\//.test(path)) return 'CI configuration'
  if (/^(\.claude|tools\/test-agent)\//.test(path)) return 'test agent tooling'
  if (/\.(css|html|svg|png|jpe?g|ico)$/i.test(path)) return 'static asset or markup'
  return 'not application source code'
}

/** Conventional test file for a source file (may or may not exist). */
export function testCandidateFor(path) {
  if (path.startsWith('backend/src/')) {
    const name = path.split('/').pop().replace(/\.ts$/, '')
    return `backend/tests/${name}.test.ts`
  }
  if (path.startsWith('frontend/src/')) {
    return path.replace(/\.(tsx?)$/, '.test.$1')
  }
  return null
}

const SPECIFIER = /(?:from\s+|import\s*\(\s*|vi\.mock\(\s*|import\s+)['"]([^'"]+)['"]/g

function stripExtension(path) {
  return path.replace(/\.(tsx?|mjs|js)$/, '').replace(/\/index$/, '')
}

function resolveRelative(fromFile, specifier) {
  if (!specifier.startsWith('.')) return null
  const parts = fromFile.split('/').slice(0, -1)
  for (const segment of specifier.split('/')) {
    if (segment === '.' || segment === '') continue
    if (segment === '..') parts.pop()
    else parts.push(segment)
  }
  return stripExtension(parts.join('/'))
}

/** Module paths (repo-relative, no extension) that a test file imports or mocks. */
export function importedModules(testPath, content) {
  const modules = new Set()
  for (const match of content.matchAll(SPECIFIER)) {
    const resolved = resolveRelative(testPath, match[1])
    if (resolved) modules.add(resolved)
  }
  return modules
}

/**
 * Test files that import or mock `sourcePath`.
 * @param {string} sourcePath
 * @param {Map<string, string>} testContents test path -> file content
 */
export function relatedTests(sourcePath, testContents) {
  const target = stripExtension(sourcePath)
  const related = []
  for (const [testPath, content] of testContents) {
    if (importedModules(testPath, content).has(target)) related.push(testPath)
  }
  return related.sort()
}

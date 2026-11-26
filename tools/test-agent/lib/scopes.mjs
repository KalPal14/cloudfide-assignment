// Backfill batches. Each batch is small enough for one agent run within the
// turn and budget limits, and maps to one reviewable pull request.
export const BACKFILL_SCOPES = {
  'backend-core-api': ['backend/src/core', 'backend/src/api', 'backend/src/factory.ts', 'backend/src/main.ts'],
  'backend-features': ['backend/src/features'],
  'frontend-hooks-lib': [
    'frontend/src/hooks',
    'frontend/src/lib',
    'frontend/src/app',
    'frontend/src/features/todos/hooks',
    'frontend/src/features/todos/api',
    'frontend/src/features/todos/utils',
  ],
  'frontend-components': [
    'frontend/src/App.tsx',
    'frontend/src/components',
    'frontend/src/features/todos/components',
    'frontend/src/features/todos/TodosPage.tsx',
  ],
  'frontend-design-system': ['frontend/src/design-system'],
}

export function scopeDirectories(scope) {
  const directories = BACKFILL_SCOPES[scope]
  if (!directories) {
    throw new Error(`Unknown backfill scope "${scope}". Known scopes: ${Object.keys(BACKFILL_SCOPES).join(', ')}`)
  }
  return directories
}

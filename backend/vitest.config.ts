import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/types.ts', 'src/generated/**'],
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      reportsDirectory: 'coverage',
      // Global floors just below the level reached by the test backfill; validation and
      // mapping stay at 100% (an aggregate of 100% over the glob means 100% per file).
      thresholds: {
        lines: 98, statements: 95, branches: 90, functions: 95,
        'src/features/todos/{validators,mappers}.ts': {
          statements: 100, branches: 100, functions: 100, lines: 100,
        },
      },
    },
  },
});

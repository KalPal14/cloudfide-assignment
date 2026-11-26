---
name: backend-unit-tests
description: Conventions and ready-made patterns for writing Vitest unit tests for the Taskly backend (Node.js, TypeScript ESM, Express 5, Prisma 7, Zod 4, Supertest). Use whenever creating or updating tests under backend/tests.
---

# Backend unit tests (Vitest + Supertest)

## Ground rules of this codebase

- Tests live **flat in `backend/tests/`**, named after the source file: `src/features/todos/router.ts`
  → `tests/router.test.ts`, `src/core/config.ts` → `tests/config.test.ts`. If the name is taken by
  an unrelated module, prefix the folder: `tests/core.config.test.ts`.
- ESM with **`.ts` extensions in test imports**: `import { createApp } from '../src/factory.ts'`
  (production code imports `.js`; `vi.mock` paths must use the same `.ts` path the test imports).
- Import test APIs explicitly: `import { afterEach, describe, expect, it, vi } from 'vitest'`.
- Shared data: `tests/fixture.ts` exports `record` (a Prisma `TodoRecord` with `Date`s) and `todo`
  (the API JSON shape). Reuse and spread them (`{ ...record, completed: true }`); add new shared
  fixtures there only if several files need them.
- Style: 2 spaces, single quotes, semicolons, compact tests (look at `tests/router.test.ts`).
  Top-level `it` is fine; use `describe` when a file covers several units.
- **No database, no network.** The real Prisma client is constructed but its IO is mocked.
- Restore everything: `afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); })`.
- Environment: `TZ=UTC` is set by the runner; still build dates with explicit `Z` offsets.
- Coverage has global floors, and `validators.ts` and `mappers.ts` must stay at 100%
  (`backend/vitest.config.ts`).

## Patterns

Each pattern shows **how to reach** the behaviour of one kind of unit: what to mock, what to keep
real, how to trigger the awkward paths. **What to assert comes from the source under test**: read
it and derive one case per branch, status and error path. The file names are where the pattern
applies today, not a list of expected tests.

### Router (HTTP layer) — mock the store, use Supertest

```ts
import express from 'express';
import request from 'supertest';
import { it, expect, vi } from 'vitest';
import { createTodosRouter } from '../src/features/todos/router.ts';
import { todo } from './fixture.ts';

function setup() {
  const repository = { list: vi.fn(), create: vi.fn(), get: vi.fn(), update: vi.fn(), delete: vi.fn() };
  const app = express();
  app.use(express.json());
  app.use('/api/todos', createTodosRouter(repository));
  return { app, repository };
}

it('returns 404 when the task does not exist', async () => {
  const { app, repository } = setup();
  repository.get.mockResolvedValue(null);
  const response = await request(app).get('/api/todos/5');
  expect(response.status).toBe(404);
  expect(response.body).toEqual({ detail: 'Task not found.' });
  expect(repository.get).toHaveBeenCalledWith(5);
});
```

Cover every status path per route: success, 422 (body validation and the `:id` param validator —
`'0'`, `'abc'`, `'1.5'`), 404, and that the repository is **not** called on invalid input.
When a route is added next to `/:id`, test that it is not swallowed by the `:id` param validator.

### Repository — real Prisma delegate, mocked IO

```ts
import { createDatabase } from '../src/core/database.ts';
import { TodoRepository } from '../src/features/todos/repository.ts';

function setup() {
  const database = createDatabase('postgresql://test:test@localhost:5432/test'); // never connects
  return { database, repository: new TodoRepository(database) };
}

const { database, repository } = setup();
const deleteMany = vi.spyOn(database.todo, 'deleteMany').mockResolvedValue({ count: 2 });
```

Assert both the mapped result and the exact Prisma call (`where`, `orderBy`, `data`).

### Whole app (`createApp`) — error handling and routing

```ts
import request from 'supertest';
import { createApp } from '../src/factory.ts';
import { createDatabase } from '../src/core/database.ts';

const database = createDatabase('postgresql://test:test@localhost:5432/test');
const app = createApp(database);
// App-level behaviour is tested here: unknown routes, response headers, served documents.
// A malformed JSON body reaches the body-parser error branch:
await request(app).post('/api/todos').set('Content-Type', 'application/json').send('{"title":');
// A body over the express.json() limit (100 kB by default) reaches the "too large" branch.
// An unexpected error reaches the last branch of the error handler; silence and assert the log:
const log = vi.spyOn(console, 'error').mockImplementation(() => {});
vi.spyOn(database.todo, 'findMany').mockRejectedValue(new Error('boom'));
```

Cover every branch of the error handler with the request that triggers it. For a route that
queries the database directly (the health check), spy on the Prisma delegate method it calls:
resolve it for the success response and reject it for the failure response.

### Code that reads the environment (`core/config.ts`)

`dotenv` loads the repo-root `.env` at import time, so a developer's local values may exist.
Control every variable the unit reads with `vi.stubEnv(name, value)`; use `''` to simulate "missing".
Cover each source of a value in its order of precedence (argument, variable, value built from
parts), every rewrite or encoding applied to it (use values with special characters), and the error
for each required variable that is missing.

### Startup (`core/lifespan.ts`) and entrypoint (`main.ts`)

Mock collaborators at module level and import the unit after the mocks:

```ts
vi.mock('../src/core/database.ts', () => ({ createDatabase: vi.fn(), initialize: vi.fn() }));
vi.mock('../src/factory.ts', () => ({ createApp: vi.fn() }));
```

- Use a real `express()` app (or `http.createServer`) returned from the mocked `createApp`, set
  `API_PORT` to `'0'` with `vi.stubEnv` for an ephemeral port, and close the server in `finally`.
- Capture shutdown handlers instead of registering real ones:
  `const once = vi.spyOn(process, 'once').mockImplementation(() => process);` then read
  `once.mock.calls`. Never send real signals.
- Failure paths: make each startup step reject in turn; assert that the error propagates and that
  whatever was opened before it is released.
- `main.ts` runs on import: `vi.resetModules()`, mock `../src/core/lifespan.ts`, then
  `await import('../src/main.ts')`; assert `console.error` and `process.exitCode = 1` on failure,
  and reset `process.exitCode` afterwards.

### Raw SQL (`initialize`)

`vi.spyOn(database, '$executeRaw').mockResolvedValue(0)`; the first argument is the template
strings array — join it and assert the statement and the constraints that matter, not its whitespace.

## Commands (run from the repository root)

- One file: `npm --prefix backend test -- tests/router.test.ts`
- All backend tests: `npm --prefix backend test`
- Type check (tests are type-checked too): `npm --prefix backend run typecheck`
- Coverage: see the `run-and-verify-tests` skill.

---
name: frontend-unit-tests
description: Conventions and ready-made patterns for writing Vitest + React Testing Library unit tests for the Taskly frontend (React 19, TypeScript, TanStack Query 5, styled-components, jsdom). Use whenever creating or updating frontend/src/**/*.test.ts(x).
---

# Frontend unit tests (Vitest + React Testing Library)

## Ground rules of this codebase

- Tests are **colocated**: `src/lib/http.ts` → `src/lib/http.test.ts`,
  `src/features/todos/components/TodoItem.tsx` → `TodoItem.test.tsx`. Use `.tsx` when the test
  renders JSX.
- Import test APIs explicitly: `import { afterEach, describe, expect, it, vi } from 'vitest'`.
  `src/test/setup.ts` already registers `@testing-library/jest-dom` matchers and `cleanup`
  (do not edit it).
- Fixtures: `src/test/todoFixture.ts` exports `todoFixture` (a full `Todo`). Spread it for variants.
  New shared helpers may go in `src/test/` (for example `renderWithTheme.tsx`).
- Prettier style: no semicolons, single quotes, trailing commas. Format every test file you touch:
  `node frontend/node_modules/prettier/bin/prettier.cjs --write frontend/src/<path>.test.tsx`.
- Tests are type-checked (`tsc --noEmit` covers `src`). Partial mocks need
  `as unknown as ReturnType<typeof useSomething>`.
- Query priority: `getByRole(..., { name })` > `getByLabelText` > `getByText` > `getByTestId`
  (the design-system mock `Alert` is the only element with a test id: `alert`).
- Interact with `const user = userEvent.setup()` and `await user.click(...)`; wait with `findBy*`
  or `waitFor`. Never use arbitrary sleeps.

## Which pattern to use

Each pattern shows **how to reach** the behaviour of one kind of unit: what to mock, what to keep
real, how to trigger the awkward paths. **What to assert comes from the source under test**: read
it and derive one case per branch, state and callback. The file names are where the pattern applies
today, not a list of expected tests.

| Unit | Approach |
|---|---|
| Feature components (`features/**/components`, `TodosPage`, `components/*`) | Mock the design system and child components/hooks at module level; assert props, text, roles and callbacks |
| Hooks using React Query | `renderHook` with a fresh `QueryClient` wrapper; mock `todosApi` |
| `api/todos.ts` | Mock `request` from `lib/http` and assert path, method and body |
| `lib/http.ts` | Stub global `fetch` |
| Pure utils (`utils/todos.ts`) | Plain tests with table-driven `it.each`; fake the clock for dates |
| Design-system components (`design-system/components/**`) | Render the real component inside styled-components `ThemeProvider` |

### Mock the design system (feature components)

```tsx
vi.mock('../../../design-system', () => import('../../../design-system/mocks'))
```

The path is relative to the test file and must match the component's own import. The mocks are
`vi.fn` components that render native elements (`Drawer` → `role="dialog"` with `aria-label` = title
and a `Close` button), so `vi.mocked(Button).mock.calls[0][0]` exposes props.

### Mock hooks and children

```tsx
vi.mock('./hooks/useTodosQuery', () => ({ useTodosQuery: vi.fn() }))
vi.mocked(useTodosQuery).mockReturnValue({
  data: [todoFixture], isPending: false, isFetching: false, isError: false, error: null, refetch: vi.fn(),
} as unknown as ReturnType<typeof useTodosQuery>)
```

### Hooks with React Query

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor, act } from '@testing-library/react'
import type { ReactNode } from 'react'

vi.mock('../api/todos', () => ({ todosApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() } }))

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper }
}

const { client, wrapper } = setup()
client.setQueryData(todoKeys.list, [todoFixture])
const { result } = renderHook(() => useDeleteTodoMutation(), { wrapper })
await act(() => result.current.mutateAsync(todoFixture.id))
expect(client.getQueryData(todoKeys.list)).toEqual([])
```

Cover: the API call, the cache update on success (including an empty/undefined cache), no cache
change on error, and the `mutationKey` (it drives `useTodosBusy`).

### `fetch` (lib/http.ts)

```ts
const fetchMock = vi.fn()
beforeEach(() => vi.stubGlobal('fetch', fetchMock))
afterEach(() => { vi.unstubAllGlobals(); vi.resetAllMocks() })
fetchMock.mockResolvedValue({ ok: false, status: 404, json: async () => ({ detail: 'Task not found.' }) } as Response)
```

Cover how the request is built (URL, merged headers, body) and every branch of the response
handling: each status the code treats specially, each shape of error body including one that is
not JSON, a rejected `fetch`, and an aborted request.

### Timers and dates

```ts
beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())
vi.setSystemTime(new Date('2026-10-15T12:00:00')) // local time, for isOverdue
act(() => vi.advanceTimersByTime(4000)) // useNotice auto-dismiss
const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime }) // when combining with userEvent
```

`TZ=UTC` is set by the runner; `formatDate` uses `en-GB` (`'15 Oct 2026'`).

### Design-system components

```tsx
import { render, screen } from '@testing-library/react'
import { ThemeProvider } from 'styled-components'
import { theme } from '../../theme/theme'

const renderWithTheme = (ui: React.ReactElement) => render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>)
```

Test behaviour, not CSS: every state a prop switches (`disabled`, `locked`, `busy`, `multiline`, …)
and what it renders or blocks, the accessible name and the label/`htmlFor` association,
`aria-invalid` and `aria-describedby` with helper and error text, generated `id`s, rendered options,
and each callback with the value it receives.

**jsdom has no `HTMLDialogElement.prototype.showModal`/`close`.** For `Drawer`, stub them in the
test file (never in `setup.ts`):

```ts
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute('open', '') })
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) { this.removeAttribute('open') })
})
```

Dialog cancel (Escape) is a `cancel` event: `fireEvent(dialog, new Event('cancel', { cancelable: true }))`.
Backdrop click: `fireEvent.click(dialog)` with the dialog itself as target. Verify both are ignored while `busy`.

## Commands (run from the repository root; paths after `--` are relative to `frontend/`)

- One file: `npm --prefix frontend test -- src/lib/http.test.ts`
- All frontend tests: `npm --prefix frontend test`
- Type check: `npm --prefix frontend run typecheck`
- Format: `node frontend/node_modules/prettier/bin/prettier.cjs --write frontend/src/lib/http.test.ts`
- Coverage: see the `run-and-verify-tests` skill.

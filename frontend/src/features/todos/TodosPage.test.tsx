import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { useNotice } from '../../hooks/useNotice'
import { todoFixture } from '../../test/todoFixture'
import { useTodoFilters } from './hooks/useTodoFilters'
import { useTodosBusy } from './hooks/useTodosBusy'
import { useTodosQuery } from './hooks/useTodosQuery'
import { useUpdateTodoMutation } from './hooks/useUpdateTodoMutation'
import { TodosPage } from './TodosPage'
import type { Todo } from './types'

vi.mock('../../design-system', () => import('../../design-system/mocks'))
vi.mock('../../hooks/useNotice', () => ({ useNotice: vi.fn() }))
vi.mock('./hooks/useTodoFilters', () => ({ useTodoFilters: vi.fn() }))
vi.mock('./hooks/useTodosBusy', () => ({ useTodosBusy: vi.fn() }))
vi.mock('./hooks/useTodosQuery', () => ({ useTodosQuery: vi.fn() }))
vi.mock('./hooks/useUpdateTodoMutation', () => ({
  useUpdateTodoMutation: vi.fn(),
}))
vi.mock('./components/TodosHeader', () => ({
  TodosHeader: ({ onCreate }: { onCreate: () => void }) => (
    <>
      <h1>Tasks</h1>
      <button onClick={onCreate}>Header create</button>
    </>
  ),
}))
vi.mock('./components/TodoFilters', () => ({ TodoFilters: () => null }))
vi.mock('./components/TodoList', () => ({
  TodoList: (props: {
    todos: Todo[]
    onCreate: () => void
    onToggle: (todo: Todo) => void
    onEdit: (todo: Todo) => void
    onDelete: (todo: Todo) => void
  }) => (
    <div>
      <p>Task list</p>
      <button onClick={props.onCreate}>List create</button>
      <button onClick={() => props.onToggle(props.todos[0])}>Toggle</button>
      <button onClick={() => props.onEdit(props.todos[0])}>Edit</button>
      <button onClick={() => props.onDelete(props.todos[0])}>Delete</button>
    </div>
  ),
}))
vi.mock('./components/TodoEditor', () => ({
  TodoEditor: ({
    todo,
    onSaved,
    onClose,
  }: {
    todo: Todo | 'new'
    onSaved: (notice: string) => void
    onClose: () => void
  }) => (
    <div role="dialog" aria-label="Editor">
      <span>{todo === 'new' ? 'editing new' : `editing ${todo.title}`}</span>
      <button onClick={() => onSaved('Changes saved.')}>Finish editing</button>
      <button onClick={onClose}>Close editor</button>
    </div>
  ),
}))
vi.mock('./components/DeleteTodoDialog', () => ({
  DeleteTodoDialog: ({
    todo,
    onDeleted,
    onClose,
  }: {
    todo: Todo
    onDeleted: () => void
    onClose: () => void
  }) => (
    <div role="dialog" aria-label="Deleter">
      <span>deleting {todo.title}</span>
      <button onClick={onDeleted}>Finish deleting</button>
      <button onClick={onClose}>Close deleter</button>
    </div>
  ),
}))
vi.mock('../../components/SuccessNotice', () => ({ SuccessNotice: () => null }))

beforeEach(() => vi.clearAllMocks())

it('displays a query failure and resets mutation errors before retrying', async () => {
  const user = userEvent.setup()
  const refetch = vi.fn().mockResolvedValue(undefined)
  const reset = vi.fn()
  vi.mocked(useTodosQuery).mockReturnValue({
    data: [],
    isPending: false,
    isFetching: false,
    isError: true,
    error: new Error('The server is unavailable.'),
    refetch,
  } as unknown as ReturnType<typeof useTodosQuery>)
  vi.mocked(useUpdateTodoMutation).mockReturnValue({
    error: null,
    reset,
    mutateAsync: vi.fn(),
  } as unknown as ReturnType<typeof useUpdateTodoMutation>)
  vi.mocked(useTodosBusy).mockReturnValue(false)
  vi.mocked(useNotice).mockReturnValue({ message: '', notify: vi.fn() })
  vi.mocked(useTodoFilters).mockReturnValue({
    filter: 'all',
    search: '',
    sort: 'newest',
    visible: [],
    setFilter: vi.fn(),
    setSearch: vi.fn(),
    setSort: vi.fn(),
  })
  render(<TodosPage />)
  expect(screen.getByTestId('alert')).toHaveTextContent(
    'The server is unavailable.',
  )
  await user.click(screen.getByRole('button', { name: 'Try again' }))
  await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1))
  expect(reset).toHaveBeenCalledTimes(1)
  expect(reset.mock.invocationCallOrder[0]).toBeLessThan(
    refetch.mock.invocationCallOrder[0],
  )
})

function setup({
  busy = false,
  mutateAsync = vi.fn(),
  todos = [todoFixture],
}: {
  busy?: boolean
  mutateAsync?: ReturnType<typeof vi.fn>
  todos?: Todo[]
} = {}) {
  const notify = vi.fn()
  vi.mocked(useTodosQuery).mockReturnValue({
    data: todos,
    isPending: false,
    isFetching: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useTodosQuery>)
  vi.mocked(useUpdateTodoMutation).mockReturnValue({
    error: null,
    reset: vi.fn(),
    mutateAsync,
  } as unknown as ReturnType<typeof useUpdateTodoMutation>)
  vi.mocked(useTodosBusy).mockReturnValue(busy)
  vi.mocked(useNotice).mockReturnValue({ message: '', notify })
  vi.mocked(useTodoFilters).mockReturnValue({
    filter: 'all',
    search: '',
    sort: 'newest',
    visible: todos,
    setFilter: vi.fn(),
    setSearch: vi.fn(),
    setSort: vi.fn(),
  })
  return { notify, mutateAsync }
}

it.each([
  [false, 'Another task complete. Well done!'],
  [true, 'Task marked as active.'],
])(
  'toggles a task and announces the result (previously completed=%s)',
  async (completed, notice) => {
    const user = userEvent.setup()
    const mutateAsync = vi
      .fn()
      .mockResolvedValue({ ...todoFixture, completed: !completed })
    const { notify } = setup({
      mutateAsync,
      todos: [{ ...todoFixture, completed }],
    })
    render(<TodosPage />)
    await user.click(screen.getByRole('button', { name: 'Toggle' }))
    expect(mutateAsync).toHaveBeenCalledWith({
      id: todoFixture.id,
      input: { completed: !completed },
    })
    expect(notify).toHaveBeenCalledWith(notice)
  },
)

it('does not toggle while another mutation is busy', async () => {
  const user = userEvent.setup()
  const { mutateAsync, notify } = setup({ busy: true })
  render(<TodosPage />)
  await user.click(screen.getByRole('button', { name: 'Toggle' }))
  expect(mutateAsync).not.toHaveBeenCalled()
  expect(notify).not.toHaveBeenCalled()
})

it('stays silent when toggling fails', async () => {
  const user = userEvent.setup()
  const mutateAsync = vi.fn().mockRejectedValue(new Error('boom'))
  const { notify } = setup({ mutateAsync })
  render(<TodosPage />)
  await user.click(screen.getByRole('button', { name: 'Toggle' }))
  await waitFor(() => expect(mutateAsync).toHaveBeenCalled())
  expect(notify).not.toHaveBeenCalled()
})

it('opens the editor for a new task from the header and the list, and closes it', async () => {
  const user = userEvent.setup()
  setup()
  render(<TodosPage />)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Header create' }))
  expect(screen.getByText('editing new')).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Close editor' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'List create' }))
  expect(screen.getByText('editing new')).toBeVisible()
})

it('edits a task and announces the saved notice', async () => {
  const user = userEvent.setup()
  const { notify } = setup()
  render(<TodosPage />)
  await user.click(screen.getByRole('button', { name: 'Edit' }))
  expect(screen.getByText(`editing ${todoFixture.title}`)).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Finish editing' }))
  expect(notify).toHaveBeenCalledWith('Changes saved.')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('confirms deletion, announces it and can cancel', async () => {
  const user = userEvent.setup()
  const { notify } = setup()
  render(<TodosPage />)
  await user.click(screen.getByRole('button', { name: 'Delete' }))
  expect(screen.getByText(`deleting ${todoFixture.title}`)).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Close deleter' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(notify).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'Delete' }))
  await user.click(screen.getByRole('button', { name: 'Finish deleting' }))
  expect(notify).toHaveBeenCalledWith('Task deleted.')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

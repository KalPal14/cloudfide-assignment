import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import type { Todo } from '../types'
import { TodoList } from './TodoList'

vi.mock('../../../design-system', () => import('../../../design-system/mocks'))
vi.mock('./TodoEmptyState', () => ({
  TodoEmptyState: () => <p>Empty task list</p>,
}))
vi.mock('./TodoItem', () => ({
  TodoItem: ({
    todo,
    onToggle,
    onEdit,
    onDelete,
  }: {
    todo: Todo
    onToggle: () => void
    onEdit: () => void
    onDelete: () => void
  }) => (
    <li>
      {todo.title}
      <button onClick={onToggle}>toggle {todo.id}</button>
      <button onClick={onEdit}>edit {todo.id}</button>
      <button onClick={onDelete}>delete {todo.id}</button>
    </li>
  ),
}))

it('shows loading feedback before showing an empty list', () => {
  const props = {
    todos: [],
    hasTodos: false,
    failed: false,
    busy: false,
    onCreate: vi.fn(),
    onToggle: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
  }
  const { rerender } = render(<TodoList {...props} loading />)
  expect(screen.getByRole('status')).toHaveTextContent('Loading your tasks…')
  expect(screen.queryByText('Empty task list')).not.toBeInTheDocument()
  rerender(<TodoList {...props} loading={false} />)
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  expect(screen.getByText('Empty task list')).toBeVisible()
})

it('renders each task and routes item actions with the task', async () => {
  const user = userEvent.setup()
  const second = { ...todoFixture, id: 8, title: 'Second task' }
  const onToggle = vi.fn()
  const onEdit = vi.fn()
  const onDelete = vi.fn()
  render(
    <TodoList
      todos={[todoFixture, second]}
      hasTodos
      loading={false}
      failed={false}
      busy={false}
      onCreate={vi.fn()}
      onToggle={onToggle}
      onEdit={onEdit}
      onDelete={onDelete}
    />,
  )
  expect(screen.getAllByRole('listitem')).toHaveLength(2)
  await user.click(screen.getByRole('button', { name: 'toggle 8' }))
  await user.click(screen.getByRole('button', { name: 'edit 7' }))
  await user.click(screen.getByRole('button', { name: 'delete 8' }))
  expect(onToggle).toHaveBeenCalledWith(second)
  expect(onEdit).toHaveBeenCalledWith(todoFixture)
  expect(onDelete).toHaveBeenCalledWith(second)
})

it('shows an unavailable message when loading failed and nothing is cached', () => {
  render(
    <TodoList
      todos={[]}
      hasTodos={false}
      loading={false}
      failed
      busy={false}
      onCreate={vi.fn()}
      onToggle={vi.fn()}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
    />,
  )
  expect(
    screen.getByRole('heading', {
      name: 'The task list is temporarily unavailable',
    }),
  ).toBeVisible()
  expect(screen.queryByText('Empty task list')).not.toBeInTheDocument()
})

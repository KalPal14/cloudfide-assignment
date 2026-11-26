import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { TodoItem } from './TodoItem'

vi.mock('../../../design-system', () => import('../../../design-system/mocks'))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-15T12:00:00'))
})
afterEach(() => vi.useRealTimers())

function renderItem(todo: Partial<typeof todoFixture>) {
  render(
    <TodoItem
      todo={{ ...todoFixture, ...todo }}
      busy={false}
      onEdit={vi.fn()}
      onToggle={vi.fn()}
      onDelete={vi.fn()}
    />,
  )
}

it('shows the description only when the task has one', () => {
  renderItem({ description: 'Slides and script' })
  expect(screen.getByText('Slides and script')).toBeVisible()
})

it('does not render a description or due date when absent', () => {
  renderItem({})
  expect(screen.queryByText(/overdue/)).not.toBeInTheDocument()
  expect(screen.queryByText(/2026/)).not.toBeInTheDocument()
})

it('marks an incomplete task with a past due date as overdue', () => {
  renderItem({ due_date: '2026-10-01' })
  expect(screen.getByText(/1 Oct 2026/)).toHaveTextContent('· overdue')
})

it('does not mark a future due date as overdue', () => {
  renderItem({ due_date: '2026-12-01' })
  expect(screen.getByText(/1 Dec 2026/)).not.toHaveTextContent('overdue')
})

it('shows a completed task as done, not overdue, with a reopen action', () => {
  renderItem({ completed: true, due_date: '2026-10-01' })
  expect(screen.getByText('Completed')).toBeVisible()
  expect(screen.queryByText('To do')).not.toBeInTheDocument()
  expect(screen.getByText(/1 Oct 2026/)).not.toHaveTextContent('overdue')
  expect(screen.getByRole('checkbox')).toBeChecked()
  expect(
    screen.getByRole('checkbox', {
      name: `Mark as active: ${todoFixture.title}`,
    }),
  ).toBeVisible()
})

it('labels the checkbox of an active task as complete action', () => {
  renderItem({})
  expect(
    screen.getByRole('checkbox', { name: `Complete: ${todoFixture.title}` }),
  ).toBeVisible()
})

it('shows an active task and forwards edit requests', async () => {
  const user = userEvent.setup()
  const onEdit = vi.fn()
  const onToggle = vi.fn()
  const onDelete = vi.fn()
  render(
    <TodoItem
      todo={todoFixture}
      busy={false}
      onEdit={onEdit}
      onToggle={onToggle}
      onDelete={onDelete}
    />,
  )
  expect(screen.getByRole('heading', { name: todoFixture.title })).toBeVisible()
  expect(screen.getByText('To do')).toBeVisible()
  expect(screen.getByText('Medium')).toBeVisible()
  expect(screen.getByRole('checkbox')).not.toBeChecked()
  await user.click(
    screen.getByRole('button', { name: `Edit: ${todoFixture.title}` }),
  )
  expect(onEdit).toHaveBeenCalledTimes(1)
  expect(onToggle).not.toHaveBeenCalled()
  expect(onDelete).not.toHaveBeenCalled()
})

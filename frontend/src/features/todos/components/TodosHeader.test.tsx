import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { TodosHeader } from './TodosHeader'

vi.mock('../../../design-system', () => import('../../../design-system/mocks'))

it('invokes creation when enabled and blocks it when disabled', async () => {
  const user = userEvent.setup()
  const onCreate = vi.fn()
  const { rerender } = render(
    <TodosHeader
      disabled={false}
      completedCount={0}
      onCreate={onCreate}
      onClearCompleted={vi.fn()}
    />,
  )
  expect(screen.getByRole('heading', { name: 'Tasks' })).toBeVisible()
  expect(
    screen.getByText('Create, organize, and complete tasks.'),
  ).toBeVisible()
  const button = screen.getByRole('button', { name: 'New task' })
  await user.click(button)
  expect(onCreate).toHaveBeenCalledTimes(1)
  rerender(
    <TodosHeader
      disabled
      completedCount={0}
      onCreate={onCreate}
      onClearCompleted={vi.fn()}
    />,
  )
  expect(button).toBeDisabled()
  await user.click(button)
  expect(onCreate).toHaveBeenCalledTimes(1)
})

it('shows the completed count and clears only when enabled and non-empty', async () => {
  const user = userEvent.setup()
  const onClearCompleted = vi.fn()
  const { rerender } = render(
    <TodosHeader
      disabled={false}
      completedCount={2}
      onCreate={vi.fn()}
      onClearCompleted={onClearCompleted}
    />,
  )
  const button = screen.getByRole('button', { name: /Clear completed \(2\)/ })
  await user.click(button)
  expect(onClearCompleted).toHaveBeenCalledTimes(1)
  rerender(
    <TodosHeader
      disabled={false}
      completedCount={0}
      onCreate={vi.fn()}
      onClearCompleted={onClearCompleted}
    />,
  )
  expect(
    screen.getByRole('button', { name: /Clear completed \(0\)/ }),
  ).toBeDisabled()
  rerender(
    <TodosHeader
      disabled
      completedCount={2}
      onCreate={vi.fn()}
      onClearCompleted={onClearCompleted}
    />,
  )
  expect(
    screen.getByRole('button', { name: /Clear completed \(2\)/ }),
  ).toBeDisabled()
})

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { useClearCompletedMutation } from '../hooks/useClearCompletedMutation'
import { ClearCompletedDialog } from './ClearCompletedDialog'

vi.mock('../../../design-system', () => import('../../../design-system/mocks'))
vi.mock('../hooks/useClearCompletedMutation', () => ({
  useClearCompletedMutation: vi.fn(),
}))

beforeEach(() => vi.clearAllMocks())

function setup({
  mutateAsync = vi.fn(),
  busy = false,
  isPending = false,
  error = null,
  count = 3,
}: {
  mutateAsync?: ReturnType<typeof vi.fn>
  busy?: boolean
  isPending?: boolean
  error?: Error | null
  count?: number
} = {}) {
  vi.mocked(useClearCompletedMutation).mockReturnValue({
    isPending,
    error,
    mutateAsync,
  } as unknown as ReturnType<typeof useClearCompletedMutation>)
  const onClose = vi.fn()
  const onCleared = vi.fn()
  render(
    <ClearCompletedDialog
      count={count}
      busy={busy}
      onClose={onClose}
      onCleared={onCleared}
    />,
  )
  return { onClose, onCleared, mutateAsync }
}

it.each([
  [1, '1 completed task will be permanently deleted.'],
  [3, '3 completed tasks will be permanently deleted.'],
])('describes how many tasks will be deleted (%s)', (count, text) => {
  setup({ count })
  expect(
    screen.getByRole('dialog', { name: 'Clear completed tasks?' }),
  ).toBeVisible()
  expect(screen.getByText(text)).toBeVisible()
})

it('clears completed tasks and reports the deleted count', async () => {
  const user = userEvent.setup()
  const { mutateAsync, onCleared } = setup({
    mutateAsync: vi.fn().mockResolvedValue({ deleted: 3 }),
  })
  await user.click(screen.getByRole('button', { name: 'Clear completed' }))
  expect(mutateAsync).toHaveBeenCalledTimes(1)
  expect(onCleared).toHaveBeenCalledWith(3)
})

it('keeps the dialog open when clearing fails and shows the error', async () => {
  const user = userEvent.setup()
  const { onCleared, onClose, mutateAsync } = setup({
    mutateAsync: vi.fn().mockRejectedValue(new Error('nope')),
    error: new Error('Server unavailable.'),
  })
  await user.click(screen.getByRole('button', { name: 'Clear completed' }))
  expect(mutateAsync).toHaveBeenCalledTimes(1)
  expect(onCleared).not.toHaveBeenCalled()
  expect(onClose).not.toHaveBeenCalled()
  expect(screen.getByTestId('alert')).toHaveTextContent('Server unavailable.')
})

it('cancels without clearing', async () => {
  const user = userEvent.setup()
  const { onClose, mutateAsync } = setup()
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(onClose).toHaveBeenCalledTimes(1)
  expect(mutateAsync).not.toHaveBeenCalled()
})

it('disables clearing when there are no completed tasks', () => {
  setup({ count: 0 })
  expect(screen.getByRole('button', { name: 'Clear completed' })).toBeDisabled()
})

it.each([
  ['busy', true, false],
  ['pending', false, true],
])('disables actions and shows progress while %s', (_name, busy, isPending) => {
  setup({ busy, isPending })
  expect(screen.getByRole('button', { name: 'Clearing…' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
})

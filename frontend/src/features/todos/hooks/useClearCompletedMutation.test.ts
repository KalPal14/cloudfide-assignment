import { act, renderHook } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { createQueryWrapper } from '../../../test/queryWrapper'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import { useClearCompletedMutation } from './useClearCompletedMutation'

vi.mock('../api/todos', () => ({ todosApi: { clearCompleted: vi.fn() } }))
beforeEach(() => vi.resetAllMocks())

it('clears completed tasks and removes them from the cached list', async () => {
  const active = { ...todoFixture, id: 1, completed: false }
  const done = { ...todoFixture, id: 2, completed: true }
  vi.mocked(todosApi.clearCompleted).mockResolvedValue({ deleted: 1 })
  const { client, wrapper } = createQueryWrapper()
  client.setQueryData(todoKeys.list, [active, done])
  const { result } = renderHook(() => useClearCompletedMutation(), { wrapper })
  await expect(act(() => result.current.mutateAsync())).resolves.toEqual({
    deleted: 1,
  })
  expect(client.getQueryData(todoKeys.list)).toEqual([active])
})

it('does not create a cache entry when none exists', async () => {
  vi.mocked(todosApi.clearCompleted).mockResolvedValue({ deleted: 0 })
  const { client, wrapper } = createQueryWrapper()
  const { result } = renderHook(() => useClearCompletedMutation(), { wrapper })
  await act(() => result.current.mutateAsync())
  expect(client.getQueryData(todoKeys.list)).toBeUndefined()
})

it('keeps the cached list when clearing fails', async () => {
  const done = { ...todoFixture, completed: true }
  vi.mocked(todosApi.clearCompleted).mockRejectedValue(new Error('boom'))
  const { client, wrapper } = createQueryWrapper()
  client.setQueryData(todoKeys.list, [done])
  const { result } = renderHook(() => useClearCompletedMutation(), { wrapper })
  await act(() => result.current.mutateAsync().catch(() => undefined))
  expect(client.getQueryData(todoKeys.list)).toEqual([done])
})

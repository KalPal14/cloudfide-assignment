import { act, renderHook } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { createQueryWrapper } from '../../../test/queryWrapper'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import { useCreateTodoMutation } from './useCreateTodoMutation'

vi.mock('../api/todos', () => ({ todosApi: { create: vi.fn() } }))
beforeEach(() => vi.resetAllMocks())

const input = {
  title: todoFixture.title,
  description: '',
  priority: 'medium' as const,
  due_date: null,
  completed: false,
}

it('creates a task and puts it first in the cached list', async () => {
  const other = { ...todoFixture, id: 1 }
  vi.mocked(todosApi.create).mockResolvedValue(todoFixture)
  const { client, wrapper } = createQueryWrapper()
  client.setQueryData(todoKeys.list, [other])
  const { result } = renderHook(() => useCreateTodoMutation(), { wrapper })
  await act(() => result.current.mutateAsync(input))
  expect(todosApi.create).toHaveBeenCalledWith(input)
  expect(client.getQueryData(todoKeys.list)).toEqual([todoFixture, other])
})

it('works with an empty cache and avoids duplicate ids', async () => {
  vi.mocked(todosApi.create).mockResolvedValue(todoFixture)
  const { client, wrapper } = createQueryWrapper()
  const { result } = renderHook(() => useCreateTodoMutation(), { wrapper })
  await act(() => result.current.mutateAsync(input))
  expect(client.getQueryData(todoKeys.list)).toEqual([todoFixture])
  await act(() => result.current.mutateAsync(input))
  expect(client.getQueryData(todoKeys.list)).toEqual([todoFixture])
})

it('leaves the cache untouched when creation fails', async () => {
  vi.mocked(todosApi.create).mockRejectedValue(new Error('boom'))
  const { client, wrapper } = createQueryWrapper()
  client.setQueryData(todoKeys.list, [])
  const { result } = renderHook(() => useCreateTodoMutation(), { wrapper })
  await act(() => result.current.mutateAsync(input).catch(() => undefined))
  expect(client.getQueryData(todoKeys.list)).toEqual([])
})

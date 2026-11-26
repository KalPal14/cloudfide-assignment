import { act, renderHook, waitFor } from '@testing-library/react'
import { useMutation } from '@tanstack/react-query'
import { expect, it } from 'vitest'
import { createQueryWrapper } from '../../../test/queryWrapper'
import { todoKeys } from '../api/queryKeys'
import { useTodosBusy } from './useTodosBusy'

function setup(mutationKey: readonly string[]) {
  const { wrapper } = createQueryWrapper()
  let release: () => void = () => undefined
  const hook = renderHook(
    () => ({
      busy: useTodosBusy(),
      mutation: useMutation({
        mutationKey,
        mutationFn: () => new Promise<void>((resolve) => (release = resolve)),
      }),
    }),
    { wrapper },
  )
  return { hook, release: () => release() }
}

it('is busy while any todo mutation is pending', async () => {
  const { hook, release } = setup(todoKeys.update)
  expect(hook.result.current.busy).toBe(false)
  act(() => hook.result.current.mutation.mutate())
  await waitFor(() => expect(hook.result.current.busy).toBe(true))
  await act(async () => release())
  await waitFor(() => expect(hook.result.current.busy).toBe(false))
})

it('ignores unrelated mutations', async () => {
  const { hook, release } = setup(['other'])
  act(() => hook.result.current.mutation.mutate())
  await waitFor(() => expect(hook.result.current.mutation.isPending).toBe(true))
  expect(hook.result.current.busy).toBe(false)
  await act(async () => release())
})

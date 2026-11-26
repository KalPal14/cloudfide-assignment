import { act, renderHook } from '@testing-library/react'
import { expect, it } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { useTodoFilters } from './useTodoFilters'

const done = { ...todoFixture, id: 1, title: 'Write docs', completed: true }
const open = { ...todoFixture, id: 2, title: 'Fix bug' }

it('starts with all tasks, no search and newest sorting', () => {
  const { result } = renderHook(() => useTodoFilters([done, open]))
  expect(result.current.filter).toBe('all')
  expect(result.current.search).toBe('')
  expect(result.current.sort).toBe('newest')
  expect(result.current.visible).toHaveLength(2)
})

it('narrows visible tasks by filter and search', () => {
  const { result } = renderHook(() => useTodoFilters([done, open]))
  act(() => result.current.setFilter('completed'))
  expect(result.current.visible).toEqual([done])
  act(() => result.current.setFilter('all'))
  act(() => result.current.setSearch('bug'))
  expect(result.current.visible).toEqual([open])
})

it('re-sorts when the sort changes', () => {
  const high = { ...open, priority: 'high' as const }
  const { result } = renderHook(() => useTodoFilters([done, high]))
  act(() => result.current.setSort('priority'))
  expect(result.current.sort).toBe('priority')
  expect(result.current.visible).toEqual([high, done])
})

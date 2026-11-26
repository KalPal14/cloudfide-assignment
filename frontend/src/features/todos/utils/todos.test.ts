import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  formatClearedNotice,
  formatDate,
  isOverdue,
  selectTodos,
  validateTodo,
} from './todos'
import type { Todo, TodoInput } from '../types'

const base: Todo = {
  id: 1,
  title: 'Sprint plan',
  description: '',
  priority: 'medium',
  completed: false,
  due_date: null,
  created_at: '2026-10-01T12:00:00Z',
  updated_at: '2026-10-01T12:00:00Z',
}

describe('selectTodos', () => {
  it('combines status with a case-insensitive search in the description', () => {
    const matching = { ...base, description: 'Discuss the API' }
    const todos = [
      matching,
      { ...matching, id: 2, completed: true },
      { ...base, id: 3 },
    ]
    expect(selectTodos(todos, 'active', ' api ', 'newest')).toEqual([matching])
  })

  it('filters completed tasks', () => {
    const done = { ...base, id: 2, completed: true }
    expect(selectTodos([base, done], 'completed', '', 'newest')).toEqual([done])
  })

  it('sorts by priority without changing the source array', () => {
    const high: Todo = { ...base, id: 2, priority: 'high' }
    const todos = [base, high]
    expect(selectTodos(todos, 'all', '', 'priority')).toEqual([high, base])
    expect(todos).toEqual([base, high])
  })

  it('sorts by due date with undated tasks last, ties by newest id', () => {
    const late = { ...base, id: 1, due_date: '2026-12-01' }
    const early = { ...base, id: 2, due_date: '2026-11-01' }
    const undated = { ...base, id: 3 }
    const tie = { ...base, id: 4, due_date: '2026-11-01' }
    expect(
      selectTodos([undated, late, early, tie], 'all', '', 'due').map(
        (t) => t.id,
      ),
    ).toEqual([4, 2, 1, 3])
  })

  it('sorts newest first by creation date, ties by id', () => {
    const older = { ...base, id: 1, created_at: '2026-09-01T00:00:00Z' }
    const newer = { ...base, id: 2 }
    const tie = { ...base, id: 3 }
    expect(
      selectTodos([older, newer, tie], 'all', '', 'newest').map((t) => t.id),
    ).toEqual([3, 2, 1])
  })
})

describe('validateTodo', () => {
  const valid: TodoInput = {
    title: 'Task',
    description: '',
    priority: 'low',
    due_date: null,
    completed: false,
  }

  it('accepts a valid task', () => {
    expect(validateTodo({ ...valid, due_date: '2026-02-28' })).toEqual({})
  })

  it('requires a non-blank title of at most 120 characters', () => {
    expect(validateTodo({ ...valid, title: '   ' }).title).toBe(
      'Enter a task title.',
    )
    expect(validateTodo({ ...valid, title: 'a'.repeat(120) })).toEqual({})
    expect(validateTodo({ ...valid, title: 'a'.repeat(121) }).title).toBe(
      'The title must be at most 120 characters.',
    )
  })

  it('limits the description to 2000 characters', () => {
    expect(validateTodo({ ...valid, description: 'a'.repeat(2000) })).toEqual(
      {},
    )
    expect(
      validateTodo({ ...valid, description: 'a'.repeat(2001) }).description,
    ).toBe('The description must be at most 2000 characters.')
  })

  it.each(['2026-02-30', '2026-13-01', 'tomorrow', '26-1-1'])(
    'rejects the invalid due date %s',
    (due_date) => {
      expect(validateTodo({ ...valid, due_date }).due_date).toBe(
        'Enter a valid date.',
      )
    },
  )
})

describe('isOverdue', () => {
  afterEach(() => vi.useRealTimers())

  it('is overdue only for open tasks due before today (local date)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-15T12:00:00'))
    expect(isOverdue({ ...base, due_date: '2026-10-14' })).toBe(true)
    expect(isOverdue({ ...base, due_date: '2026-10-15' })).toBe(false)
    expect(isOverdue({ ...base, due_date: null })).toBe(false)
    expect(
      isOverdue({ ...base, due_date: '2026-10-14', completed: true }),
    ).toBe(false)
  })
})

describe('formatClearedNotice', () => {
  it.each([
    [0, 'No completed tasks to clear.'],
    [1, '1 completed task cleared.'],
    [5, '5 completed tasks cleared.'],
  ])('describes %s cleared tasks', (deleted, text) => {
    expect(formatClearedNotice(deleted)).toBe(text)
  })
})

describe('formatDate', () => {
  it('formats an ISO date in en-GB style', () => {
    expect(formatDate('2026-10-15')).toBe('15 Oct 2026')
  })
})

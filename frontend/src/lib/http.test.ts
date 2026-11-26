import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { request } from './http'

const fetchMock = vi.fn()
beforeEach(() => vi.stubGlobal('fetch', fetchMock))
afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetAllMocks()
})

const failure = (status: number, json: () => Promise<unknown>) =>
  ({ ok: false, status, json }) as Response

describe('request', () => {
  it('prefixes the path with /api, merges headers and parses JSON', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [{ id: 1 }],
    } as Response)
    await expect(
      request('/todos', { headers: { 'X-Test': '1' } }),
    ).resolves.toEqual([{ id: 1 }])
    expect(fetchMock).toHaveBeenCalledWith('/api/todos', {
      headers: { 'Content-Type': 'application/json', 'X-Test': '1' },
    })
  })

  it('returns undefined for 204 responses', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 204 } as Response)
    await expect(request('/todos/1', { method: 'DELETE' })).resolves.toBe(
      undefined,
    )
  })

  it('shows a validation hint for 422 responses', async () => {
    fetchMock.mockResolvedValue(failure(422, async () => ({ detail: [] })))
    await expect(request('/todos')).rejects.toThrow(/Check the task details/)
  })

  it('uses a string detail from the error body', async () => {
    fetchMock.mockResolvedValue(
      failure(404, async () => ({ detail: 'Task not found.' })),
    )
    await expect(request('/todos/9')).rejects.toThrow('Task not found.')
  })

  it.each([
    ['a non-JSON body', async () => Promise.reject(new Error('bad json'))],
    ['a non-string detail', async () => ({ detail: 5 })],
  ])('falls back to a generic message for %s', async (_, json) => {
    fetchMock.mockResolvedValue(failure(500, json))
    await expect(request('/todos')).rejects.toThrow(
      'The operation failed. Please try again.',
    )
  })

  it('reports connection failures with a friendly message', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(request('/todos')).rejects.toThrow(
      'Cannot connect to the server. Please try again.',
    )
  })

  it('rethrows the original error when the request was aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const abortError = new DOMException('Aborted', 'AbortError')
    fetchMock.mockRejectedValue(abortError)
    await expect(request('/todos', { signal: controller.signal })).rejects.toBe(
      abortError,
    )
  })
})

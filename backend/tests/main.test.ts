import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  vi.doUnmock('../src/core/lifespan.ts');
  process.exitCode = undefined;
});

it('starts the API on import', async () => {
  const start = vi.fn().mockResolvedValue({});
  vi.doMock('../src/core/lifespan.ts', () => ({ start }));
  await import('../src/main.ts');
  expect(start).toHaveBeenCalledOnce();
  expect(process.exitCode).toBeUndefined();
});

it('logs and sets a failing exit code when startup fails', async () => {
  const error = new Error('no db');
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.doMock('../src/core/lifespan.ts', () => ({ start: vi.fn().mockRejectedValue(error) }));
  await import('../src/main.ts');
  await vi.waitFor(() => expect(process.exitCode).toBe(1));
  expect(log).toHaveBeenCalledWith('Cannot start Taskly App Node API:', error);
});

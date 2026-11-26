import { expect, it, vi } from 'vitest';
import { createDatabase, initialize } from '../src/core/database.ts';

it('creates the todos table with its constraints', async () => {
  const database = createDatabase('postgresql://test:test@localhost:5432/test');
  const execute = vi.spyOn(database, '$executeRaw').mockResolvedValue(0);
  await initialize(database);
  expect(execute).toHaveBeenCalledOnce();
  const sql = (execute.mock.calls[0][0] as unknown as string[]).join('');
  expect(sql).toContain('CREATE TABLE IF NOT EXISTS todos');
  expect(sql).toContain('todo_title_not_empty');
  expect(sql).toContain("priority IN ('low', 'medium', 'high')");
});

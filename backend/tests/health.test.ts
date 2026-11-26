import request from 'supertest';
import { afterEach, expect, it, vi } from 'vitest';
import { createDatabase } from '../src/core/database.ts';
import { createApp } from '../src/factory.ts';

const database = createDatabase('postgresql://test:test@localhost:5432/test');
const app = createApp(database);

afterEach(() => {
  vi.restoreAllMocks();
});

it('reports ok when the database answers', async () => {
  const findFirst = vi.spyOn(database.todo, 'findFirst').mockResolvedValue(null);
  const response = await request(app).get('/api/health');
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ status: 'ok' });
  expect(findFirst).toHaveBeenCalledWith({ select: { id: true } });
});

it('reports 500 when the database fails', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(database.todo, 'findFirst').mockRejectedValue(new Error('down'));
  const response = await request(app).get('/api/health');
  expect(response.status).toBe(500);
  expect(response.body).toEqual({ detail: 'Internal Server Error' });
});

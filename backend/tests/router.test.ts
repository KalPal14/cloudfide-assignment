import express from 'express';
import request from 'supertest';
import { it, expect, vi } from 'vitest';
import { createTodosRouter } from '../src/features/todos/router.ts';
import { todo } from './fixture.ts';

function setup() {
  const repository = { list: vi.fn().mockResolvedValue([todo]), create: vi.fn().mockResolvedValue(todo), get: vi.fn(), update: vi.fn(), delete: vi.fn() };
  const app = express();
  app.use(express.json());
  app.use('/api/todos', createTodosRouter(repository));
  return { app, repository };
}
it('lists tasks from the repository', async () => {
  const { app, repository } = setup();
  const response = await request(app).get('/api/todos');
  expect(response.status).toBe(200);
  expect(response.body).toEqual([todo]);
  expect(repository.list).toHaveBeenCalledOnce();
});
it('creates tasks with trimmed input and defaults', async () => {
  const { app, repository } = setup();
  const response = await request(app).post('/api/todos').send({ title: '  Plan the sprint  ', priority: 'high' });
  expect(response.status).toBe(201);
  expect(response.body).toEqual(todo);
  expect(repository.create).toHaveBeenCalledWith({ title: 'Plan the sprint', description: '', priority: 'high', due_date: null, completed: false });
});
it.each([{ title: '  ' }, { title: 'x'.repeat(121) }, { title: 'Task', priority: 'urgent' }, { title: 'Task', due_date: '2026-02-30' }])(
  'rejects invalid create input without calling the repository: %j', async (payload) => {
    const { app, repository } = setup();
    expect((await request(app).post('/api/todos').send(payload)).status).toBe(422);
    expect(repository.create).not.toHaveBeenCalled();
  },
);
it.each(['0', 'abc', '1.5', '-1'])('rejects invalid id %s with 422 on every id route', async (id) => {
  const { app, repository } = setup();
  for (const response of [
    await request(app).get(`/api/todos/${id}`),
    await request(app).patch(`/api/todos/${id}`).send({ title: 'x' }),
    await request(app).delete(`/api/todos/${id}`),
  ]) expect(response.status).toBe(422);
  expect(repository.get).not.toHaveBeenCalled();
  expect(repository.update).not.toHaveBeenCalled();
  expect(repository.delete).not.toHaveBeenCalled();
});
it('gets a task by id', async () => {
  const { app, repository } = setup();
  repository.get.mockResolvedValue(todo);
  const response = await request(app).get('/api/todos/5');
  expect(response.status).toBe(200);
  expect(response.body).toEqual(todo);
  expect(repository.get).toHaveBeenCalledWith(5);
});
it('returns 404 when getting a missing task', async () => {
  const { app, repository } = setup();
  repository.get.mockResolvedValue(null);
  const response = await request(app).get('/api/todos/5');
  expect(response.status).toBe(404);
  expect(response.body).toEqual({ detail: 'Task not found.' });
});
it('updates a task with trimmed partial input', async () => {
  const { app, repository } = setup();
  repository.update.mockResolvedValue({ ...todo, completed: true });
  const response = await request(app).patch('/api/todos/7').send({ completed: true, title: ' New ' });
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ ...todo, completed: true });
  expect(repository.update).toHaveBeenCalledWith(7, { completed: true, title: 'New' });
});
it('returns 404 when updating a missing task', async () => {
  const { app, repository } = setup();
  repository.update.mockResolvedValue(null);
  const response = await request(app).patch('/api/todos/7').send({ completed: true });
  expect(response.status).toBe(404);
  expect(response.body).toEqual({ detail: 'Task not found.' });
});
it.each([{}, { title: '' }, { unknown: 1 }])('rejects invalid update input %j without calling the repository', async (payload) => {
  const { app, repository } = setup();
  expect((await request(app).patch('/api/todos/7').send(payload)).status).toBe(422);
  expect(repository.update).not.toHaveBeenCalled();
});
it('deletes a task with 204 and no body', async () => {
  const { app, repository } = setup();
  repository.delete.mockResolvedValue(true);
  const response = await request(app).delete('/api/todos/3');
  expect(response.status).toBe(204);
  expect(response.text).toBe('');
  expect(repository.delete).toHaveBeenCalledWith(3);
});
it('returns 404 when deleting a missing task', async () => {
  const { app, repository } = setup();
  repository.delete.mockResolvedValue(false);
  const response = await request(app).delete('/api/todos/3');
  expect(response.status).toBe(404);
  expect(response.body).toEqual({ detail: 'Task not found.' });
});

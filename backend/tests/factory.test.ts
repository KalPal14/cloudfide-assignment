import express from 'express';
import request from 'supertest';
import { afterEach, expect, it, vi } from 'vitest';
import { createDatabase } from '../src/core/database.ts';
import { createApp } from '../src/factory.ts';

const database = createDatabase('postgresql://test:test@localhost:5432/test');
const app = createApp(database);

afterEach(() => {
  vi.restoreAllMocks();
});

it('returns a JSON 404 for unknown routes and hides x-powered-by', async () => {
  const response = await request(app).get('/nope');
  expect(response.status).toBe(404);
  expect(response.body).toEqual({ detail: 'Not Found' });
  expect(response.headers['x-powered-by']).toBeUndefined();
});

it('serves the OpenAPI specification', async () => {
  const response = await request(app).get('/openapi.json');
  expect(response.status).toBe(200);
  expect(response.body.openapi).toBeDefined();
});

it('answers 422 for malformed JSON', async () => {
  const response = await request(app).post('/api/todos').set('Content-Type', 'application/json').send('{"title":');
  expect(response.status).toBe(422);
  expect(response.body).toEqual({ detail: 'Invalid JSON.' });
});

it('answers 413 for bodies over the limit', async () => {
  const response = await request(app).post('/api/todos').send({ title: 'x'.repeat(200_000) });
  expect(response.status).toBe(413);
  expect(response.body).toEqual({ detail: 'Request body too large.' });
});

it('does not write a second response when an error occurs after headers were sent', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(database.todo, 'findMany').mockResolvedValue([]);
  vi.spyOn(express.response, 'json').mockImplementation(function (this: express.Response) {
    this.status(200).send('partial');
    throw new Error('late failure');
  });
  const response = await request(app).get('/api/todos').then((r) => r, (e: unknown) => e);
  expect(log).not.toHaveBeenCalled();
  expect((response as { body?: unknown }).body).not.toEqual({ detail: 'Internal Server Error' });
});

it('answers 500 and logs unexpected errors', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const error = new Error('boom');
  vi.spyOn(database.todo, 'findMany').mockRejectedValue(error);
  const response = await request(app).get('/api/todos');
  expect(response.status).toBe(500);
  expect(response.body).toEqual({ detail: 'Internal Server Error' });
  expect(log).toHaveBeenCalledWith(error);
});

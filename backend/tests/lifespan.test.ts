import express from 'express';
import type { Server } from 'node:http';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createDatabase, initialize } from '../src/core/database.ts';
import { createApp } from '../src/factory.ts';
import { start } from '../src/core/lifespan.ts';

vi.mock('../src/core/database.ts', () => ({ createDatabase: vi.fn(), initialize: vi.fn() }));
vi.mock('../src/factory.ts', () => ({ createApp: vi.fn() }));

const servers: Server[] = [];
let database: { $connect: ReturnType<typeof vi.fn>; $disconnect: ReturnType<typeof vi.fn> };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('DATABASE_URL', 'postgresql://u:p@localhost:5432/d');
  vi.stubEnv('API_PORT', '0');
  database = { $connect: vi.fn().mockResolvedValue(undefined), $disconnect: vi.fn().mockResolvedValue(undefined) };
  vi.mocked(createDatabase).mockReturnValue(database as never);
  vi.mocked(initialize).mockResolvedValue(undefined);
  vi.mocked(createApp).mockReturnValue(express());
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((r) => s.close(r))));
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  process.exitCode = undefined;
});

it('connects, initializes, listens and registers shutdown handlers', async () => {
  const once = vi.spyOn(process, 'once').mockImplementation(() => process);
  const result = await start();
  servers.push(result.server);
  expect(createDatabase).toHaveBeenCalledWith('postgresql://u:p@localhost:5432/d');
  expect(database.$connect).toHaveBeenCalled();
  expect(initialize).toHaveBeenCalledWith(database);
  expect(result.server.listening).toBe(true);
  expect(once.mock.calls.map((c) => c[0])).toEqual(['SIGTERM', 'SIGINT']);
});

it('shutdown closes the server and disconnects the database', async () => {
  const once = vi.spyOn(process, 'once').mockImplementation(() => process);
  const { server } = await start();
  servers.push(server);
  (once.mock.calls[0][1] as () => void)();
  await vi.waitFor(() => expect(database.$disconnect).toHaveBeenCalledOnce());
  expect(server.listening).toBe(false);
});

it('shutdown reports a disconnect failure through the exit code', async () => {
  const once = vi.spyOn(process, 'once').mockImplementation(() => process);
  const error = new Error('disconnect failed');
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const { server } = await start();
  servers.push(server);
  database.$disconnect.mockRejectedValue(error);
  (once.mock.calls[0][1] as () => void)();
  await vi.waitFor(() => expect(process.exitCode).toBe(1));
  expect(log).toHaveBeenCalledWith(error);
});

it('disconnects and rethrows when initialization fails', async () => {
  const error = new Error('init failed');
  vi.mocked(initialize).mockRejectedValue(error);
  await expect(start()).rejects.toBe(error);
  expect(database.$disconnect).toHaveBeenCalledOnce();
  expect(createApp).not.toHaveBeenCalled();
});

it('disconnects and rethrows when the port cannot be bound', async () => {
  const blocker = express().listen(0, '0.0.0.0');
  servers.push(blocker);
  await new Promise((r) => blocker.once('listening', r));
  vi.stubEnv('API_PORT', String((blocker.address() as { port: number }).port));
  await expect(start()).rejects.toBeInstanceOf(Error);
  expect(database.$disconnect).toHaveBeenCalledOnce();
});

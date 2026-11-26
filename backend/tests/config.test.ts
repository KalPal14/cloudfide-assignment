import { afterEach, expect, it, vi } from 'vitest';
import { resolveDatabaseUrl } from '../src/core/config.ts';

const names = ['DATABASE_URL', 'POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_HOST', 'DB_PORT', 'POSTGRES_DB'];

function stub(values: Record<string, string> = {}) {
  for (const name of names) vi.stubEnv(name, values[name] ?? '');
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

it('prefers the explicit override over DATABASE_URL', () => {
  stub({ DATABASE_URL: 'postgresql://env/db' });
  expect(resolveDatabaseUrl('postgresql://override/db')).toBe('postgresql://override/db');
});

it('uses DATABASE_URL and rewrites the psycopg prefix', () => {
  stub({ DATABASE_URL: 'postgresql+psycopg://u:p@h:5432/d' });
  expect(resolveDatabaseUrl()).toBe('postgresql://u:p@h:5432/d');
});

it('builds the URL from parts and encodes special characters', () => {
  stub({ POSTGRES_USER: 'user', POSTGRES_PASSWORD: 'p@ss/w:rd', POSTGRES_HOST: 'db.local', DB_PORT: '5433', POSTGRES_DB: 'my db' });
  const url = new URL(resolveDatabaseUrl());
  expect(url.protocol).toBe('postgresql:');
  expect(url.username).toBe('user');
  expect(decodeURIComponent(url.password)).toBe('p@ss/w:rd');
  expect(url.hostname).toBe('db.local');
  expect(url.port).toBe('5433');
  expect(url.pathname).toBe('/my%20db');
});

it('names the first missing variable', () => {
  stub({ POSTGRES_USER: 'user', POSTGRES_HOST: 'h', DB_PORT: '1', POSTGRES_DB: 'd' });
  expect(() => resolveDatabaseUrl()).toThrow('Missing environment variable: POSTGRES_PASSWORD');
});

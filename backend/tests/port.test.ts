import { describe, expect, it } from 'vitest';
import { resolveHost, resolvePort } from '../src/core/port.ts';

describe('resolvePort', () => {
  it.each([
    ['3000', 3000],
    ['1', 1],
    ['65535', 65535],
  ])('uses the valid port %s', (value, expected) => {
    expect(resolvePort(value)).toBe(expected);
  });

  it.each([undefined, '', 'abc', '0', '-1', '65536', '80.5'])(
    'falls back to 8000 for %s',
    (value) => {
      expect(resolvePort(value)).toBe(8000);
    },
  );

  it('uses a custom fallback', () => {
    expect(resolvePort('nope', 4000)).toBe(4000);
  });
});

describe('resolveHost', () => {
  it('uses the given host, trimmed', () => {
    expect(resolveHost('  127.0.0.1 ')).toBe('127.0.0.1');
  });

  it.each([undefined, '', '   '])('falls back to 0.0.0.0 for %j', (value) => {
    expect(resolveHost(value)).toBe('0.0.0.0');
  });

  it('uses a custom fallback', () => {
    expect(resolveHost(undefined, 'localhost')).toBe('localhost');
  });
});

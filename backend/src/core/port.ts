export function resolvePort(value: string | undefined, fallback = 8000): number {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : fallback;
}

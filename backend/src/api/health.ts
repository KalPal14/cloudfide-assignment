// Sandbox probe PR: comment-only change so that the Test Agent runs (to be closed, not merged).
import { Router } from 'express';
import type { Database } from '../features/todos/types.js';

export function createHealthRouter(database: Database) {
  const router = Router();
  router.get('/health', async (req, res) => {
    await database.todo.findFirst({ select: { id: true } });
    res.json({ status: 'ok' });
  });
  return router;
}

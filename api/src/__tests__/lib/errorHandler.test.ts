import express from 'express';
import request from 'supertest';
import { asyncHandler } from '@/lib/asyncHandler';
import { errorHandler } from '@/lib/errorHandler';

function buildApp() {
  const app = express();
  app.get(
    '/boom-async',
    asyncHandler(async () => {
      throw new Error('async boom with secret details');
    }),
  );
  app.use(errorHandler);
  return app;
}

describe('asyncHandler + errorHandler', () => {
  it('catches a rejected async handler and returns 500 (not a hung request)', async () => {
    const res = await request(buildApp()).get('/boom-async');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'internal server error' });
  });

  it('does not leak the underlying error message to the client', async () => {
    const res = await request(buildApp()).get('/boom-async');
    expect(JSON.stringify(res.body)).not.toMatch(/secret details/);
  });
});

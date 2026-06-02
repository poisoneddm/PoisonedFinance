import request from 'supertest';

const mockQuery = jest.fn();
jest.mock('@/db/client', () => ({ pool: { query: mockQuery } }));

// Import createApp AFTER the mock is declared. createApp pulls in the health
// router which requires @/db/client; importing it earlier would run the mock
// factory before `mockQuery` is initialised (temporal dead zone).
import { createApp } from '@/app';

const app = createApp();

describe('GET /health', () => {
  beforeEach(() => mockQuery.mockReset());

  it('returns 200 with ok:true when DB responds', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, db: 'connected' });
  });

  it('returns 503 with ok:false when DB throws', async () => {
    mockQuery.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const res = await request(app).get('/health');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ ok: false, db: 'unavailable' });
  });
});

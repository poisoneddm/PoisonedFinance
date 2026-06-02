import request from 'supertest';

const mockQuery = jest.fn();
jest.mock('@/db/client', () => ({ pool: { query: mockQuery } }));
jest.mock('@/truelayer/sync', () => ({
  syncAccounts: jest.fn().mockResolvedValue(undefined),
  syncTransactions: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/truelayer/tokens', () => ({
  getValidAccessToken: jest.fn().mockResolvedValue('fresh-token'),
}));

import { createApp } from '@/app';

const app = createApp();

describe('POST /sync/:userId', () => {
  beforeEach(() => mockQuery.mockReset());

  it('returns 404 when no bank connections found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // SELECT bank_connections
    const res = await request(app).post('/sync/user-1');
    expect(res.status).toBe(404);
  });

  it('returns 200 and syncs each account', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'conn-1' }] })                        // SELECT bank_connections
      .mockResolvedValueOnce({ rows: [{ id: 'la-1', external_id: 'acc-001' }] })  // SELECT linked_accounts
      .mockResolvedValueOnce({ rows: [] });                                         // UPDATE last_synced_at
    const { syncTransactions } = require('@/truelayer/sync');
    const res = await request(app).post('/sync/user-1');
    expect(res.status).toBe(200);
    expect(syncTransactions).toHaveBeenCalledWith('user-1', 'la-1', 'acc-001', 'fresh-token');
  });
});

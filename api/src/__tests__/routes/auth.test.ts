import request from 'supertest';

jest.mock('@/db/client', () => ({ pool: { query: jest.fn().mockResolvedValue({ rows: [{ id: 'conn-1' }] }) } }));
jest.mock('@/truelayer/oauth', () => ({
  buildAuthUrl: jest.fn(() => 'https://auth.truelayer.com/?state=test'),
  exchangeCode: jest.fn().mockResolvedValue({
    access_token: 'acc', refresh_token: 'ref', expires_in: 3600,
  }),
}));
jest.mock('@/lib/crypto', () => ({
  encrypt: jest.fn(s => `enc:${s}`),
}));
jest.mock('@/truelayer/tokens', () => ({
  getValidAccessToken: jest.fn().mockResolvedValue('fresh-token'),
}));
jest.mock('@/truelayer/sync', () => ({
  syncAccounts: jest.fn().mockResolvedValue(undefined),
  syncTransactions: jest.fn().mockResolvedValue(undefined),
}));

process.env.ENCRYPTION_KEY = Buffer.from('a'.repeat(32)).toString('base64');

import { createApp } from '@/app';
import { issueState } from '@/lib/oauthState';

const app = createApp();

describe('GET /auth/truelayer', () => {
  it('redirects to TrueLayer auth URL', async () => {
    const res = await request(app).get('/auth/truelayer?userId=user-1');
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('auth.truelayer.com');
  });

  it('returns 400 when userId is missing', async () => {
    const res = await request(app).get('/auth/truelayer');
    expect(res.status).toBe(400);
  });
});

describe('GET /auth/callback', () => {
  it('returns 400 when code is missing', async () => {
    const res = await request(app).get('/auth/callback?state=user-1:nonce');
    expect(res.status).toBe(400);
  });

  it('exchanges code and inserts bank_connection record (valid state)', async () => {
    const { pool } = require('@/db/client');
    const state = issueState('user-1');
    const res = await request(app).get(`/auth/callback?code=auth-code&state=${encodeURIComponent(state)}`);
    expect(res.status).toBe(200);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO bank_connections'),
      expect.arrayContaining(['enc:acc', 'enc:ref']),
    );
  });

  it('calls syncAccounts with the new connectionId after storing the connection', async () => {
    const { syncAccounts } = require('@/truelayer/sync');
    const state = issueState('user-1');
    await request(app).get(`/auth/callback?code=auth-code&state=${encodeURIComponent(state)}`);
    expect(syncAccounts).toHaveBeenCalledWith('user-1', 'conn-1', 'fresh-token');
  });

  it('rejects an unknown/forged state with 403 (CSRF) and does not insert', async () => {
    const { pool } = require('@/db/client');
    (pool.query as jest.Mock).mockClear();
    const res = await request(app).get('/auth/callback?code=auth-code&state=forged:cafebabe');
    expect(res.status).toBe(403);
    const insertCalled = (pool.query as jest.Mock).mock.calls.some(
      c => typeof c[0] === 'string' && c[0].includes('INSERT INTO bank_connections'),
    );
    expect(insertCalled).toBe(false);
  });
});

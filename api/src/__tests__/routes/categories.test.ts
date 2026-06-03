import request from 'supertest';

const mockQuery = jest.fn();
jest.mock('@/db/client', () => ({ pool: { query: mockQuery } }));

import { createApp } from '@/app';

const app = createApp();

const CATEGORY_ROWS = [
  { id: 'c1', name: 'Groceries', meta_bucket: 'needs', color_hex: '#60a5fa' },
  { id: 'c2', name: 'Eating Out', meta_bucket: 'wants', color_hex: '#f472b6' },
  { id: 'c3', name: 'Savings', meta_bucket: 'savings', color_hex: '#4ade80' },
];

beforeEach(() => mockQuery.mockReset());

describe('GET /categories', () => {
  it('returns the category list with id, name, meta_bucket, color_hex', async () => {
    mockQuery.mockResolvedValueOnce({ rows: CATEGORY_ROWS });
    const res = await request(app).get('/categories');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
    expect(res.body[0]).toEqual(
      expect.objectContaining({ name: 'Groceries', meta_bucket: 'needs', color_hex: '#60a5fa' }),
    );
  });

  it('orders by meta-bucket (needs → wants → savings) then name', async () => {
    mockQuery.mockResolvedValueOnce({ rows: CATEGORY_ROWS });
    await request(app).get('/categories');
    const sql: string = mockQuery.mock.calls[0][0];
    expect(sql).toContain('FROM categories');
    expect(sql).toContain("WHEN 'needs'");
    expect(sql).toContain("WHEN 'wants'");
    expect(sql).toContain("WHEN 'savings'");
  });

  it('returns 500 when the query rejects', async () => {
    mockQuery.mockRejectedValueOnce(new Error('db down'));
    const res = await request(app).get('/categories');
    expect(res.status).toBe(500);
  });
});

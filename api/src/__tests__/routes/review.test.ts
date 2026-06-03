import request from 'supertest';

const mockQuery = jest.fn();
jest.mock('@/db/client', () => ({ pool: { query: mockQuery } }));

// Import createApp AFTER the @/db/client mock is declared (avoid mock-factory TDZ).
import { createApp } from '@/app';

const app = createApp();

const PENDING_TXN = {
  id: 'txn-1',
  merchant_name: 'AMAZON MKTPLACE',
  description: 'AMAZON MKTPLACE PMTS',
  amount_pence: -3499,
  transaction_date: '2026-05-29',
  category_name: 'Shopping',
  meta_bucket: 'wants',
  account_name: 'Halifax',
  categorisation_source: 'ai',
};

beforeEach(() => mockQuery.mockReset());

describe('GET /review/:userId', () => {
  it('returns pending transactions', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [PENDING_TXN] });
    const res = await request(app).get('/review/user-1');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].merchant_name).toBe('AMAZON MKTPLACE');
  });
});

describe('POST /review/:txnId/confirm', () => {
  it('sets source=confirmed and needs_review=false, scoped to the owning user', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [] }); // scoped UPDATE

    const res = await request(app).post('/review/txn-1/confirm').send({ user_id: 'user-1' });
    expect(res.status).toBe(200);

    const updateCall = mockQuery.mock.calls.find(
      c => typeof c[0] === 'string' && c[0].includes('categorisation_source'),
    )!;
    expect(updateCall[0]).toContain("categorisation_source = 'confirmed'");
    expect(updateCall[0]).toContain('needs_review = FALSE');
    // IDOR fix: the UPDATE must be scoped by user_id
    expect(updateCall[0]).toContain('user_id');
    expect(updateCall[1]).toEqual(['txn-1', 'user-1']);
  });

  it('returns 400 when user_id is missing', async () => {
    const res = await request(app).post('/review/txn-1/confirm').send({});
    expect(res.status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('returns 404 when the txn does not belong to the user (rowCount 0)', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const res = await request(app)
      .post('/review/txn-1/confirm')
      .send({ user_id: 'attacker' });
    expect(res.status).toBe(404);
  });

  it('returns 500 (not a hung request) when the UPDATE rejects', async () => {
    mockQuery.mockRejectedValueOnce(new Error('db down'));
    const res = await request(app).post('/review/txn-1/confirm').send({ user_id: 'user-1' });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'internal server error' });
  });
});

describe('POST /review/:txnId/change', () => {
  it('updates category, sets source=manual, scoped to the owning user', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'cat-groceries' }] }) // lookup new category
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });           // scoped UPDATE transaction

    const res = await request(app)
      .post('/review/txn-1/change')
      .send({ category_name: 'Groceries', user_id: 'user-1' });

    expect(res.status).toBe(200);
    const updateCall = mockQuery.mock.calls.find(
      c => typeof c[0] === 'string' && c[0].includes('categorisation_source'),
    )!;
    expect(updateCall[0]).toContain("categorisation_source = 'manual'");
    // IDOR fix: the UPDATE must be scoped by user_id
    expect(updateCall[0]).toContain('user_id');
    expect(updateCall[1]).toContain('user-1');
  });

  it('returns 400 when user_id is missing', async () => {
    const res = await request(app)
      .post('/review/txn-1/change')
      .send({ category_name: 'Groceries' });
    expect(res.status).toBe(400);
  });

  it('returns 404 when the txn does not belong to the user', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'cat-groceries' }] }) // category lookup ok
      .mockResolvedValueOnce({ rowCount: 0, rows: [] });           // scoped UPDATE matched nothing
    const res = await request(app)
      .post('/review/txn-1/change')
      .send({ category_name: 'Groceries', user_id: 'attacker' });
    expect(res.status).toBe(404);
  });

  it('creates a rule using the MERCHANT NAME (not the old category)', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'cat-groceries' }] }) // category lookup
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })           // scoped UPDATE transaction
      .mockResolvedValueOnce({ rows: [{ merchant_name: 'AMAZON MKTPLACE', description: 'AMAZON MKTPLACE PMTS' }] }) // fetch txn for rule (scoped)
      .mockResolvedValueOnce({ rows: [] }); // INSERT rule

    const res = await request(app)
      .post('/review/txn-1/change')
      .send({ category_name: 'Groceries', create_rule: true, user_id: 'user-1' });

    expect(res.status).toBe(200);

    const ruleInsert = mockQuery.mock.calls.find(
      c => typeof c[0] === 'string' && c[0].includes('INSERT INTO categorisation_rules'),
    )!;
    expect(ruleInsert).toBeDefined();
    // merchant_pattern must be the normalised MERCHANT NAME, not a category name
    expect(ruleInsert[1]).toContain('AMAZON MKTPLACE');
    expect(ruleInsert[1]).not.toContain('Shopping');
    expect(ruleInsert[1]).not.toContain('Groceries');
    // rule must be created for the transaction's owning user
    expect(ruleInsert[1]).toContain('user-1');
  });

  it('returns 404 when category_name is not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // category not found
    const res = await request(app)
      .post('/review/txn-1/change')
      .send({ category_name: 'DoesNotExist', user_id: 'user-1' });
    expect(res.status).toBe(404);
  });
});

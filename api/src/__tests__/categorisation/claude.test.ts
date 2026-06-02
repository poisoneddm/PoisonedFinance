import type { TxnForCategorisation } from '@/categorisation/types';

const mockCreate = jest.fn();
jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));

const mockQuery = jest.fn();
jest.mock('@/db/client', () => ({ pool: { query: mockQuery } }));

// Import the unit under test AFTER mocks are declared (avoid mock-factory TDZ).
import { batchCategorise } from '@/categorisation/claude';

const TRANSACTIONS: TxnForCategorisation[] = [
  { id: 'txn-1', merchant_name: 'AMAZON MKTPLACE', description: 'AMAZON MKTPLACE PMTS' },
  { id: 'txn-2', merchant_name: 'McDonald\'s', description: 'MCDONALDS' },
];

beforeEach(() => {
  mockCreate.mockReset();
  mockQuery.mockReset();
  process.env.ANTHROPIC_API_KEY = 'test-key';
});

it('returns one result per transaction with category from Claude', async () => {
  mockQuery.mockResolvedValueOnce({
    rows: [
      { name: 'Shopping' }, { name: 'Groceries' }, { name: 'Eating Out' },
      { name: 'Transport' }, { name: 'Fuel' }, { name: 'Bills & Utilities' },
      { name: 'Health' }, { name: 'Subscriptions' }, { name: 'Entertainment' },
      { name: 'Travel' }, { name: 'Savings' },
    ],
  });
  mockCreate.mockResolvedValueOnce({
    content: [{
      type: 'tool_use',
      input: {
        results: [
          { id: 'txn-1', category: 'Shopping' },
          { id: 'txn-2', category: 'Eating Out' },
        ],
      },
    }],
  });

  const results = await batchCategorise(TRANSACTIONS);

  expect(results).toHaveLength(2);
  expect(results.find(r => r.id === 'txn-1')?.category_name).toBe('Shopping');
  expect(results.find(r => r.id === 'txn-2')?.category_name).toBe('Eating Out');
  expect(results.every(r => r.source === 'ai')).toBe(true);
});

it('passes category names from DB as the allowed enum values', async () => {
  mockQuery.mockResolvedValueOnce({
    rows: [{ name: 'Groceries' }, { name: 'Eating Out' }],
  });
  mockCreate.mockResolvedValueOnce({
    content: [{ type: 'tool_use', input: { results: [{ id: 'txn-1', category: 'Groceries' }] } }],
  });

  await batchCategorise([TRANSACTIONS[0]]);

  const callArgs = mockCreate.mock.calls[0][0];
  const toolSchema = callArgs.tools[0].input_schema;
  const enumValues = toolSchema.properties.results.items.properties.category.enum;
  expect(enumValues).toEqual(['Groceries', 'Eating Out']);
});

it('chunks 90 transactions into 3 API calls of 40/40/10', async () => {
  // getCategoryNames query (once), then 3 chunk calls
  mockQuery.mockResolvedValueOnce({ rows: [{ name: 'Shopping' }] });

  const makeChunkResponse = (ids: string[]) => ({
    content: [{
      type: 'tool_use',
      input: { results: ids.map(id => ({ id, category: 'Shopping' })) },
    }],
  });

  // Build 90 transaction stubs
  const txns: TxnForCategorisation[] = Array.from({ length: 90 }, (_, i) => ({
    id: `txn-${i}`,
    merchant_name: `Merchant ${i}`,
    description: `desc ${i}`,
  }));

  mockCreate
    .mockResolvedValueOnce(makeChunkResponse(txns.slice(0, 40).map(t => t.id)))
    .mockResolvedValueOnce(makeChunkResponse(txns.slice(40, 80).map(t => t.id)))
    .mockResolvedValueOnce(makeChunkResponse(txns.slice(80).map(t => t.id)));

  const results = await batchCategorise(txns);

  expect(mockCreate).toHaveBeenCalledTimes(3);
  expect(results).toHaveLength(90);
});

it('continues remaining chunks when one chunk throws', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ name: 'Shopping' }] });

  const txns: TxnForCategorisation[] = Array.from({ length: 80 }, (_, i) => ({
    id: `txn-${i}`,
    merchant_name: `Merchant ${i}`,
    description: `desc ${i}`,
  }));

  mockCreate
    .mockRejectedValueOnce(new Error('API error'))
    .mockResolvedValueOnce({
      content: [{
        type: 'tool_use',
        input: { results: txns.slice(40).map(t => ({ id: t.id, category: 'Shopping' })) },
      }],
    });

  const results = await batchCategorise(txns);

  expect(mockCreate).toHaveBeenCalledTimes(2);
  // Only second chunk succeeded — first 40 silently dropped (left for manual review)
  expect(results).toHaveLength(40);
});

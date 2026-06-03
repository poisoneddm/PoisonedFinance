const mockQuery = jest.fn();
jest.mock('@/db/client', () => ({ pool: { query: mockQuery } }));

const mockApplyRules = jest.fn();
jest.mock('@/categorisation/rules', () => ({ applyRules: mockApplyRules }));

const mockBatchCategorise = jest.fn();
jest.mock('@/categorisation/claude', () => ({ batchCategorise: mockBatchCategorise }));

// Import the unit under test AFTER mocks are declared (avoid mock-factory TDZ).
import { runPipeline } from '@/categorisation/pipeline';

const UNCATEGORISED = [
  { id: 'txn-1', merchant_name: 'TESCO', description: 'TESCO STORES' },
  { id: 'txn-2', merchant_name: 'AMAZON', description: 'AMAZON MKTPLACE' },
];

const CATEGORY_MAP_ROWS = [
  { id: 'cat-groceries', name: 'Groceries' },
  { id: 'cat-shopping', name: 'Shopping' },
];

beforeEach(() => {
  mockQuery.mockReset();
  mockApplyRules.mockReset();
  mockBatchCategorise.mockReset();
});

it('applies rule results without marking needs_review, scoped to the user', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: UNCATEGORISED })  // fetch uncategorised
    .mockResolvedValueOnce({ rows: CATEGORY_MAP_ROWS }) // category name→id map (single query)
    .mockResolvedValue({ rowCount: 1, rows: [] });      // UPDATEs

  mockApplyRules.mockResolvedValueOnce([
    { id: 'txn-1', category_name: 'Groceries', source: 'rule' },
    { id: 'txn-2', category_name: 'Shopping', source: 'rule' },
  ]);
  mockBatchCategorise.mockResolvedValueOnce([]);

  await runPipeline('user-1', ['txn-1', 'txn-2']);

  const updateCall = mockQuery.mock.calls.find(
    c => typeof c[0] === 'string' && c[0].includes('categorisation_source') && c[1]?.includes('rule'),
  );
  expect(updateCall).toBeDefined();
  expect(updateCall![0]).toContain('needs_review = FALSE');
  // C3: UPDATE must be scoped by user_id
  expect(updateCall![0]).toContain('user_id');
  expect(updateCall![1]).toContain('user-1');
});

it('fetches the category map with a single query (no per-result lookup / N+1)', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: UNCATEGORISED })
    .mockResolvedValueOnce({ rows: CATEGORY_MAP_ROWS })
    .mockResolvedValue({ rowCount: 1, rows: [] });

  mockApplyRules.mockResolvedValueOnce([
    { id: 'txn-1', category_name: 'Groceries', source: 'rule' },
    { id: 'txn-2', category_name: 'Shopping', source: 'rule' },
  ]);
  mockBatchCategorise.mockResolvedValueOnce([]);

  await runPipeline('user-1', ['txn-1', 'txn-2']);

  const categorySelects = mockQuery.mock.calls.filter(
    c => typeof c[0] === 'string' && /SELECT[\s\S]*FROM categories/i.test(c[0]),
  );
  expect(categorySelects).toHaveLength(1);
});

it('sends only unmatched transactions to Claude', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: UNCATEGORISED })
    .mockResolvedValueOnce({ rows: CATEGORY_MAP_ROWS })
    .mockResolvedValue({ rowCount: 1, rows: [] });

  mockApplyRules.mockResolvedValueOnce([
    { id: 'txn-1', category_name: 'Groceries', source: 'rule' },
  ]);
  mockBatchCategorise.mockResolvedValueOnce([
    { id: 'txn-2', category_name: 'Shopping', source: 'ai' },
  ]);

  await runPipeline('user-1', ['txn-1', 'txn-2']);

  expect(mockBatchCategorise).toHaveBeenCalledWith([UNCATEGORISED[1]]);
});

it('marks AI-categorised transactions as needs_review = TRUE', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [UNCATEGORISED[1]] })
    .mockResolvedValueOnce({ rows: CATEGORY_MAP_ROWS })
    .mockResolvedValue({ rowCount: 1, rows: [] });

  mockApplyRules.mockResolvedValueOnce([]);
  mockBatchCategorise.mockResolvedValueOnce([
    { id: 'txn-2', category_name: 'Shopping', source: 'ai' },
  ]);

  await runPipeline('user-1', ['txn-2']);

  const aiUpdateCall = mockQuery.mock.calls.find(
    c => typeof c[0] === 'string' && c[0].includes('needs_review = TRUE'),
  );
  expect(aiUpdateCall).toBeDefined();
});

it('ignores AI results whose id was not in the batch (no unscoped write)', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [UNCATEGORISED[1]] }) // only txn-2 sent
    .mockResolvedValueOnce({ rows: CATEGORY_MAP_ROWS })
    .mockResolvedValue({ rowCount: 1, rows: [] });

  mockApplyRules.mockResolvedValueOnce([]);
  mockBatchCategorise.mockResolvedValueOnce([
    { id: 'txn-2', category_name: 'Shopping', source: 'ai' },
    { id: 'HALLUCINATED-OTHER-USER-TXN', category_name: 'Shopping', source: 'ai' },
  ]);

  await runPipeline('user-1', ['txn-2']);

  const updatedIds = mockQuery.mock.calls
    .filter(c => typeof c[0] === 'string' && c[0].includes('categorisation_source'))
    .map(c => (c[1] as unknown[]).find(p => typeof p === 'string' && String(p).startsWith('txn') || String(p).includes('HALLUCINATED')));
  expect(mockQuery.mock.calls.some(c => Array.isArray(c[1]) && (c[1] as unknown[]).includes('HALLUCINATED-OTHER-USER-TXN'))).toBe(false);
  // txn-2 was still applied
  expect(mockQuery.mock.calls.some(c => Array.isArray(c[1]) && (c[1] as unknown[]).includes('txn-2'))).toBe(true);
  void updatedIds;
});

it('skips results whose category name is unknown (not in the map)', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [UNCATEGORISED[1]] })
    .mockResolvedValueOnce({ rows: CATEGORY_MAP_ROWS })
    .mockResolvedValue({ rowCount: 1, rows: [] });

  mockApplyRules.mockResolvedValueOnce([]);
  mockBatchCategorise.mockResolvedValueOnce([
    { id: 'txn-2', category_name: 'NonExistentCategory', source: 'ai' },
  ]);

  await runPipeline('user-1', ['txn-2']);

  const updateCalls = mockQuery.mock.calls.filter(
    c => typeof c[0] === 'string' && c[0].includes('categorisation_source'),
  );
  expect(updateCalls).toHaveLength(0); // unknown category → no UPDATE
});

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

beforeEach(() => {
  mockQuery.mockReset();
  mockApplyRules.mockReset();
  mockBatchCategorise.mockReset();
});

it('applies rule results without marking needs_review', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: UNCATEGORISED })           // fetch uncategorised
    .mockResolvedValueOnce({ rows: [{ id: 'cat-groceries' }] }) // category lookup txn-1
    .mockResolvedValueOnce({ rows: [] })                        // UPDATE txn-1
    .mockResolvedValueOnce({ rows: [{ id: 'cat-shopping' }] }) // category lookup txn-2
    .mockResolvedValueOnce({ rows: [] });                       // UPDATE txn-2

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
  // needs_review should be FALSE for rule-matched transactions
  expect(updateCall![0]).toContain('needs_review = FALSE');
});

it('sends only unmatched transactions to Claude', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: UNCATEGORISED })
    .mockResolvedValue({ rows: [{ id: 'cat-1' }] });

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
    .mockResolvedValue({ rows: [{ id: 'cat-shopping' }] });

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

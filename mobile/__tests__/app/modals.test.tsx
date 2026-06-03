import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockBack = jest.fn();
let mockParams: Record<string, string> = {};

jest.mock('expo-router', () => {
  const r = require('react');
  return {
    useRouter: () => ({ push: mockPush, back: mockBack }),
    // Run the focus callback once on mount, like a screen gaining focus.
    useFocusEffect: (cb: () => void) => r.useEffect(cb, []),
    useLocalSearchParams: () => mockParams,
  };
});

jest.mock('@/lib/api', () => ({
  apiGet: jest.fn(),
  apiPost: jest.fn().mockResolvedValue({ ok: true }),
}));

import { apiGet, apiPost } from '@/lib/api';
import ReviewScreen from '@/app/review';
import CategoryEditScreen from '@/app/category-edit';

const mockApiGet = apiGet as jest.MockedFunction<typeof apiGet>;
const mockApiPost = apiPost as jest.MockedFunction<typeof apiPost>;

const REVIEW_ITEMS = [
  {
    id: 'txn-1',
    merchant_name: 'AMAZON MKTPLACE',
    description: 'AMAZON MKTPLACE PMTS',
    amount_pence: -3499,
    transaction_date: '2026-05-29',
    categorisation_source: 'ai',
    category_name: 'Shopping',
    meta_bucket: 'wants',
    account_name: 'Halifax',
  },
];

const CATEGORIES = [
  { id: 'c1', name: 'Groceries', meta_bucket: 'needs', color_hex: '#60a5fa' },
  { id: 'c2', name: 'Shopping', meta_bucket: 'wants', color_hex: '#c084fc' },
  { id: 'c3', name: 'Income', meta_bucket: 'income', color_hex: '#fbbf24' },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
});

describe('Review Queue screen', () => {
  it('lists pending transactions from /review', async () => {
    mockApiGet.mockResolvedValueOnce(REVIEW_ITEMS);
    render(<ReviewScreen />);
    await waitFor(() => expect(screen.getByText('AMAZON MKTPLACE')).toBeTruthy());
    expect(screen.getByText('Shopping')).toBeTruthy();
  });

  it('confirming a transaction POSTs to /review/:id/confirm and removes it', async () => {
    mockApiGet.mockResolvedValueOnce(REVIEW_ITEMS);
    render(<ReviewScreen />);
    await waitFor(() => expect(screen.getByLabelText('Confirm Shopping')).toBeTruthy());

    fireEvent.press(screen.getByLabelText('Confirm Shopping'));
    await waitFor(() =>
      expect(mockApiPost).toHaveBeenCalledWith('/review/txn-1/confirm', {
        user_id: '00000000-0000-0000-0000-000000000001',
      }),
    );
    await waitFor(() => expect(screen.getByText('All caught up')).toBeTruthy());
  });

  it('shows the empty state when nothing needs review', async () => {
    mockApiGet.mockResolvedValueOnce([]);
    render(<ReviewScreen />);
    await waitFor(() => expect(screen.getByText('All caught up')).toBeTruthy());
  });

  it('Change navigates to the category editor with txn context', async () => {
    mockApiGet.mockResolvedValueOnce(REVIEW_ITEMS);
    render(<ReviewScreen />);
    await waitFor(() => expect(screen.getByLabelText('Change category')).toBeTruthy());

    fireEvent.press(screen.getByLabelText('Change category'));
    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/category-edit',
        params: expect.objectContaining({ txnId: 'txn-1', merchant: 'AMAZON MKTPLACE' }),
      }),
    );
  });
});

describe('Category Edit screen', () => {
  it('renders categories and saves the chosen one via /review/:id/change', async () => {
    mockParams = { txnId: 'txn-1', merchant: 'AMAZON MKTPLACE', amountPence: '-3499', current: 'Shopping' };
    mockApiGet.mockResolvedValueOnce(CATEGORIES);
    render(<CategoryEditScreen />);

    await waitFor(() => expect(screen.getByLabelText('Select Groceries')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Select Groceries'));
    fireEvent.press(screen.getByLabelText('Save category'));

    await waitFor(() =>
      expect(mockApiPost).toHaveBeenCalledWith('/review/txn-1/change', {
        category_name: 'Groceries',
        create_rule: true,
        user_id: '00000000-0000-0000-0000-000000000001',
      }),
    );
    expect(mockBack).toHaveBeenCalled();
  });

  it('offers the Income category so a mis-tagged salary can be re-tagged as income', async () => {
    mockParams = { txnId: 'txn-1', merchant: 'ACME PAYROLL', amountPence: '280000' };
    mockApiGet.mockResolvedValueOnce(CATEGORIES);
    render(<CategoryEditScreen />);

    await waitFor(() => expect(screen.getByLabelText('Select Income')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Select Income'));
    fireEvent.press(screen.getByLabelText('Save category'));

    await waitFor(() =>
      expect(mockApiPost).toHaveBeenCalledWith('/review/txn-1/change', {
        category_name: 'Income',
        create_rule: true,
        user_id: '00000000-0000-0000-0000-000000000001',
      }),
    );
  });

  it('shows the transaction context (merchant) in the header', async () => {
    mockParams = { txnId: 'txn-1', merchant: 'AMAZON MKTPLACE', amountPence: '-3499' };
    mockApiGet.mockResolvedValueOnce(CATEGORIES);
    render(<CategoryEditScreen />);
    await waitFor(() => expect(screen.getByText('AMAZON MKTPLACE')).toBeTruthy());
  });
});

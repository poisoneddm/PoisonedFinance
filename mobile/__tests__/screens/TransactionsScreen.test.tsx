import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import { TransactionsScreen } from '../../screens/TransactionsScreen';

jest.mock('../../lib/api', () => ({
  apiGet: jest.fn(),
}));

import { apiGet } from '../../lib/api';
const mockApiGet = apiGet as jest.MockedFunction<typeof apiGet>;

const SEED_USER_ID = '00000000-0000-0000-0000-000000000001';

const txnData = [
  {
    id: 'tx1',
    merchant_name: 'Tesco',
    description: 'TESCO STORES',
    amount_pence: -3450,
    transaction_date: '2026-06-10',
    category_name: 'Groceries',
    meta_bucket: 'needs',
    color_hex: '#60a5fa',
    account_name: 'Current Account',
  },
  {
    id: 'tx2',
    merchant_name: 'Netflix',
    description: 'NETFLIX.COM',
    amount_pence: -1599,
    transaction_date: '2026-06-05',
    category_name: 'Subscriptions',
    meta_bucket: 'wants',
    color_hex: '#fbcfe8',
    account_name: 'Current Account',
  },
];

describe('TransactionsScreen', () => {
  beforeEach(() => jest.resetAllMocks());

  it('shows loading indicator before data arrives', () => {
    mockApiGet.mockReturnValue(new Promise(() => {}));
    const { getByTestId } = render(
      <TransactionsScreen userId={SEED_USER_ID} year={2026} month={6} />,
    );
    expect(getByTestId('loading-indicator')).toBeTruthy();
  });

  it('renders transaction merchant names after data loads', async () => {
    mockApiGet.mockResolvedValueOnce(txnData);
    const { getByText } = render(
      <TransactionsScreen userId={SEED_USER_ID} year={2026} month={6} />,
    );
    await waitFor(() => {
      expect(getByText('Tesco')).toBeTruthy();
      expect(getByText('Netflix')).toBeTruthy();
    });
  });

  it('renders formatted pence amounts for each transaction', async () => {
    mockApiGet.mockResolvedValueOnce(txnData);
    const { getByText } = render(
      <TransactionsScreen userId={SEED_USER_ID} year={2026} month={6} />,
    );
    await waitFor(() => {
      expect(getByText('-£34.50')).toBeTruthy();
      expect(getByText('-£15.99')).toBeTruthy();
    });
  });

  it('renders category names', async () => {
    mockApiGet.mockResolvedValueOnce(txnData);
    const { getByText } = render(
      <TransactionsScreen userId={SEED_USER_ID} year={2026} month={6} />,
    );
    await waitFor(() => {
      expect(getByText('Groceries')).toBeTruthy();
    });
  });

  it('invokes onTransactionPress with the tapped transaction', async () => {
    mockApiGet.mockResolvedValueOnce(txnData);
    const onTransactionPress = jest.fn();
    const { getByLabelText } = render(
      <TransactionsScreen
        userId={SEED_USER_ID}
        year={2026}
        month={6}
        onTransactionPress={onTransactionPress}
      />,
    );
    await waitFor(() => expect(getByLabelText('Edit category for Tesco')).toBeTruthy());
    fireEvent.press(getByLabelText('Edit category for Tesco'));
    expect(onTransactionPress).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'tx1', category_name: 'Groceries' }),
    );
  });
});

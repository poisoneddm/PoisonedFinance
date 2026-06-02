import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { DashboardScreen } from '../../screens/DashboardScreen';

jest.mock('../../lib/api', () => ({
  apiGet: jest.fn(),
}));

import { apiGet } from '../../lib/api';
const mockApiGet = apiGet as jest.MockedFunction<typeof apiGet>;

const SEED_USER_ID = '00000000-0000-0000-0000-000000000001';

const dashboardData = {
  income_pence: 250000,
  pills: [
    { bucket: 'needs',   spent_pence: 80000,  goal_pence: 100000, status: 'green' },
    { bucket: 'wants',   spent_pence: 40000,  goal_pence:  50000, status: 'amber' },
    { bucket: 'savings', spent_pence: 100000, goal_pence: 100000, status: 'green' },
  ],
  review_count: 2,
  recent: [
    {
      id: 'tx1',
      merchant_name: 'Tesco',
      description: 'TESCO STORES',
      amount_pence: -3450,
      transaction_date: '2026-06-10',
      category_name: 'Groceries',
      meta_bucket: 'needs',
      color_hex: '#60a5fa',
    },
  ],
};

describe('DashboardScreen', () => {
  beforeEach(() => jest.resetAllMocks());

  it('shows a loading indicator before data arrives', () => {
    mockApiGet.mockReturnValue(new Promise(() => {})); // never resolves
    const { getByTestId } = render(
      <DashboardScreen userId={SEED_USER_ID} year={2026} month={6} />,
    );
    expect(getByTestId('loading-indicator')).toBeTruthy();
  });

  it('renders income after data loads', async () => {
    mockApiGet.mockResolvedValueOnce(dashboardData);
    const { getByText } = render(
      <DashboardScreen userId={SEED_USER_ID} year={2026} month={6} />,
    );
    await waitFor(() => {
      expect(getByText('£2,500.00')).toBeTruthy();
    });
  });

  it('renders all 3 pill buckets', async () => {
    mockApiGet.mockResolvedValueOnce(dashboardData);
    const { getByText } = render(
      <DashboardScreen userId={SEED_USER_ID} year={2026} month={6} />,
    );
    await waitFor(() => {
      expect(getByText(/needs/i)).toBeTruthy();
      expect(getByText(/wants/i)).toBeTruthy();
      expect(getByText(/savings/i)).toBeTruthy();
    });
  });

  it('renders recent transactions list', async () => {
    mockApiGet.mockResolvedValueOnce(dashboardData);
    const { getByText } = render(
      <DashboardScreen userId={SEED_USER_ID} year={2026} month={6} />,
    );
    await waitFor(() => {
      expect(getByText('Tesco')).toBeTruthy();
    });
  });
});

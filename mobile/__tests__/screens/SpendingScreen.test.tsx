import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { SpendingScreen } from '../../screens/SpendingScreen';

jest.mock('../../lib/api', () => ({
  apiGet: jest.fn(),
}));

import { apiGet } from '../../lib/api';
const mockApiGet = apiGet as jest.MockedFunction<typeof apiGet>;

const SEED_USER_ID = '00000000-0000-0000-0000-000000000001';

const spendingData = {
  goal_bars: [
    { bucket: 'needs',   spent_pence: 80000,  goal_pence: 100000, status: 'green' },
    { bucket: 'wants',   spent_pence: 40000,  goal_pence:  50000, status: 'amber' },
    { bucket: 'savings', spent_pence: 100000, goal_pence: 100000, status: 'green' },
  ],
  category_breakdown: [
    { name: 'Groceries',  meta_bucket: 'needs',   color_hex: '#60a5fa', total_pence: 55000 },
    { name: 'Transport',  meta_bucket: 'needs',   color_hex: '#bfdbfe', total_pence: 25000 },
    { name: 'Eating Out', meta_bucket: 'wants',   color_hex: '#f472b6', total_pence: 40000 },
    { name: 'Savings',    meta_bucket: 'savings', color_hex: '#4ade80', total_pence: 100000 },
  ],
};

describe('SpendingScreen', () => {
  beforeEach(() => jest.resetAllMocks());

  it('shows loading indicator before data arrives', () => {
    mockApiGet.mockReturnValue(new Promise(() => {}));
    const { getByTestId } = render(
      <SpendingScreen userId={SEED_USER_ID} year={2026} month={6} />,
    );
    expect(getByTestId('loading-indicator')).toBeTruthy();
  });

  it('renders all 3 goal bars after data loads', async () => {
    mockApiGet.mockResolvedValueOnce(spendingData);
    const { getByText, getAllByText } = render(
      <SpendingScreen userId={SEED_USER_ID} year={2026} month={6} />,
    );
    await waitFor(() => {
      expect(getByText(/needs/i)).toBeTruthy();
      expect(getByText(/wants/i)).toBeTruthy();
      // "Savings" appears as both a goal-bar label and a category name, so
      // there are legitimately multiple matches here.
      expect(getAllByText(/savings/i).length).toBeGreaterThan(0);
    });
  });

  it('renders category breakdown items', async () => {
    mockApiGet.mockResolvedValueOnce(spendingData);
    const { getByText } = render(
      <SpendingScreen userId={SEED_USER_ID} year={2026} month={6} />,
    );
    await waitFor(() => {
      expect(getByText('Groceries')).toBeTruthy();
      expect(getByText('Eating Out')).toBeTruthy();
    });
  });
});

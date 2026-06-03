import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: jest.fn() }),
}));

jest.mock('@/lib/api', () => ({
  apiGet: jest.fn(),
  apiPut: jest.fn().mockResolvedValue({ ok: true }),
}));

import { apiGet, apiPut } from '@/lib/api';
import GoalsScreen from '@/app/goals';

const mockApiGet = apiGet as jest.MockedFunction<typeof apiGet>;
const mockApiPut = apiPut as jest.MockedFunction<typeof apiPut>;

const SEED_USER_ID = '00000000-0000-0000-0000-000000000001';

beforeEach(() => jest.clearAllMocks());

describe('GoalsScreen — edit the savings/budget split', () => {
  it('loads the current goal split from the API', async () => {
    mockApiGet.mockResolvedValueOnce({ needs_pct: 40, wants_pct: 20, savings_pct: 40 });
    render(<GoalsScreen />);
    // Needs + Savings both 40%, Wants 20%, total 100%.
    await waitFor(() => expect(screen.getAllByText('40%').length).toBe(2));
    expect(screen.getByText('20%')).toBeTruthy();
    expect(screen.getByText('100%')).toBeTruthy();
  });

  it('PUTs the updated split that sums to 100 and returns', async () => {
    mockApiGet.mockResolvedValueOnce({ needs_pct: 40, wants_pct: 20, savings_pct: 40 });
    render(<GoalsScreen />);
    await waitFor(() => expect(screen.getByLabelText('Savings percent')).toBeTruthy());

    // Move 5% from Needs to Savings → 35 / 20 / 45 = 100
    fireEvent.press(screen.getByLabelText('Decrease Needs'));
    fireEvent.press(screen.getByLabelText('Increase Savings'));
    fireEvent.press(screen.getByLabelText('Save budget'));

    await waitFor(() =>
      expect(mockApiPut).toHaveBeenCalledWith(
        `/goals/${SEED_USER_ID}`,
        expect.objectContaining({ needs_pct: 35, wants_pct: 20, savings_pct: 45 }),
      ),
    );
    expect(mockBack).toHaveBeenCalled();
  });

  it('disables Save while the split does not total 100%', async () => {
    mockApiGet.mockResolvedValueOnce({ needs_pct: 40, wants_pct: 20, savings_pct: 40 });
    render(<GoalsScreen />);
    await waitFor(() => expect(screen.getByLabelText('Needs percent')).toBeTruthy());

    // 45 / 20 / 40 = 105 → invalid, Save must not fire a request
    fireEvent.press(screen.getByLabelText('Increase Needs'));
    fireEvent.press(screen.getByLabelText('Save budget'));

    expect(mockApiPut).not.toHaveBeenCalled();
  });
});

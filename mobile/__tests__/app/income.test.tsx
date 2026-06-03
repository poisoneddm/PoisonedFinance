import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: jest.fn() }),
}));

jest.mock('@/lib/api', () => ({
  apiGet: jest.fn(),
  apiPut: jest.fn().mockResolvedValue({}),
}));

import { apiGet, apiPut } from '@/lib/api';
import IncomeScreen from '@/app/income';

const mockApiGet = apiGet as jest.MockedFunction<typeof apiGet>;
const mockApiPut = apiPut as jest.MockedFunction<typeof apiPut>;
const SEED_USER_ID = '00000000-0000-0000-0000-000000000001';

beforeEach(() => jest.clearAllMocks());

describe('IncomeScreen — expected income editor', () => {
  it('prefills the expected figure and shows the suggestion', async () => {
    mockApiGet.mockResolvedValueOnce({
      expected_pence: 430000, source: 'suggested', suggested_pence: 430000, actual_pence: 210000,
    });
    render(<IncomeScreen />);
    await waitFor(() => expect(screen.getByLabelText('Expected income in pounds').props.value).toBe('4300'));
    expect(screen.getByText('Suggested from recent months')).toBeTruthy();
  });

  it('saves an edited expected income as pence via PUT', async () => {
    mockApiGet.mockResolvedValueOnce({
      expected_pence: 430000, source: 'suggested', suggested_pence: 430000, actual_pence: 210000,
    });
    render(<IncomeScreen />);
    await waitFor(() => expect(screen.getByLabelText('Expected income in pounds')).toBeTruthy());

    fireEvent.changeText(screen.getByLabelText('Expected income in pounds'), '5000');
    fireEvent.press(screen.getByLabelText('Save expected income'));

    await waitFor(() =>
      expect(mockApiPut).toHaveBeenCalledWith(
        `/income/${SEED_USER_ID}`,
        expect.objectContaining({ expected_pence: 500000 }),
      ),
    );
    expect(mockBack).toHaveBeenCalled();
  });

  it('"Use suggested" resets the field to the suggested figure', async () => {
    mockApiGet.mockResolvedValueOnce({
      expected_pence: 500000, source: 'confirmed', suggested_pence: 430000, actual_pence: 210000,
    });
    render(<IncomeScreen />);
    await waitFor(() => expect(screen.getByLabelText('Expected income in pounds').props.value).toBe('5000'));

    fireEvent.press(screen.getByLabelText('Use suggested amount'));
    expect(screen.getByLabelText('Expected income in pounds').props.value).toBe('4300');
  });
});

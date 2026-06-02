import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';

// Mock the api module before importing the screen
jest.mock('@/lib/api', () => ({
  apiGet: jest.fn(),
}));
// Mock format helpers so we test rendering logic without real formatting details
jest.mock('@/lib/format', () => ({
  formatPence: (p: number) => `£${(p / 100).toFixed(2)}`,
}));
// Mock currentUser constant
jest.mock('@/lib/currentUser', () => ({
  SEED_USER_ID: '00000000-0000-0000-0000-000000000001',
}));

import { apiGet } from '@/lib/api';
import ForecastScreen from '@/app/(tabs)/forecast';

const mockedApiGet = apiGet as jest.MockedFunction<typeof apiGet>;

const MOCK_RESPONSE = {
  tiers: [
    { name: 'Goal',      monthly_pence: 120000, annual_pence: 1440000, badge: 'on-track' },
    { name: 'Realistic', monthly_pence: 140000, annual_pence: 1680000, badge: 'on-track' },
    { name: 'Stretch',   monthly_pence: 158000, annual_pence: 1896000, badge: 'stretch'  },
    { name: 'Actual',    monthly_pence:  90000, annual_pence: 1080000, badge: 'behind'   },
  ],
  trends: [
    { kind: 'consistent', text: 'Your Groceries spend has been consistent at £500/month.', category: 'Groceries' },
    { kind: 'increasing', text: 'Your Shopping spend is increasing — £200/month → £300/month.', category: 'Shopping' },
    { kind: 'suggestion', text: 'Reduce Shopping to its 3-month average saves ~£100/month.', category: 'Shopping' },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ForecastScreen', () => {
  it('shows a loading indicator before data arrives', () => {
    // Never resolve so we stay in loading state
    mockedApiGet.mockReturnValue(new Promise(() => {}));

    render(<ForecastScreen />);

    expect(screen.getByTestId('forecast-loading')).toBeTruthy();
  });

  it('renders all 4 tier names after data loads', async () => {
    mockedApiGet.mockResolvedValue(MOCK_RESPONSE);

    render(<ForecastScreen />);

    await waitFor(() => {
      expect(screen.getByText('Goal')).toBeTruthy();
      expect(screen.getByText('Realistic')).toBeTruthy();
      expect(screen.getByText('Stretch')).toBeTruthy();
      expect(screen.getByText('Actual')).toBeTruthy();
    });
  });

  it('renders formatted monthly amount for each tier', async () => {
    mockedApiGet.mockResolvedValue(MOCK_RESPONSE);

    render(<ForecastScreen />);

    await waitFor(() => {
      // formatPence mock: £(pence/100).toFixed(2)
      expect(screen.getByText('£1200.00')).toBeTruthy(); // Goal 120000
      expect(screen.getByText('£1400.00')).toBeTruthy(); // Realistic 140000
      expect(screen.getByText('£1580.00')).toBeTruthy(); // Stretch 158000
      expect(screen.getByText('£900.00')).toBeTruthy();  // Actual 90000
    });
  });

  it('renders badge text for each tier', async () => {
    mockedApiGet.mockResolvedValue(MOCK_RESPONSE);

    render(<ForecastScreen />);

    await waitFor(() => {
      // Two on-track badges (Goal + Realistic), one stretch, one behind
      const onTrackBadges = screen.getAllByText('on-track');
      expect(onTrackBadges.length).toBe(2);
      expect(screen.getByText('stretch')).toBeTruthy();
      expect(screen.getByText('behind')).toBeTruthy();
    });
  });

  it('renders all three trend callout texts', async () => {
    mockedApiGet.mockResolvedValue(MOCK_RESPONSE);

    render(<ForecastScreen />);

    await waitFor(() => {
      expect(screen.getByText('Your Groceries spend has been consistent at £500/month.')).toBeTruthy();
      expect(screen.getByText('Your Shopping spend is increasing — £200/month → £300/month.')).toBeTruthy();
      expect(screen.getByText('Reduce Shopping to its 3-month average saves ~£100/month.')).toBeTruthy();
    });
  });

  it('calls apiGet with the correct path including SEED_USER_ID and current year/month', async () => {
    mockedApiGet.mockResolvedValue(MOCK_RESPONSE);

    render(<ForecastScreen />);

    await waitFor(() => expect(mockedApiGet).toHaveBeenCalledTimes(1));

    const [path] = mockedApiGet.mock.calls[0] as [string];
    // Path must include the user ID and year/month query params
    expect(path).toContain('00000000-0000-0000-0000-000000000001');
    expect(path).toContain('year=');
    expect(path).toContain('month=');
  });

  it('shows an error message when the API call fails', async () => {
    mockedApiGet.mockRejectedValue(new Error('Network error'));

    render(<ForecastScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('forecast-error')).toBeTruthy();
    });
  });
});

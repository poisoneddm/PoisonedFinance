import React from 'react';
import { render, screen } from '@testing-library/react-native';
import SettingsScreen from '@/app/(tabs)/settings';

// Dashboard, Spending, Transactions and Forecast tabs are now thin wrappers
// around data-fetching screens (see their dedicated tests under __tests__/).
// Only Settings remains a static stub at this phase.

it('Settings renders screen heading', () => {
  render(<SettingsScreen />);
  expect(screen.getByText('Settings')).toBeTruthy();
});

import React from 'react';
import { render, screen } from '@testing-library/react-native';
import ForecastScreen from '@/app/(tabs)/forecast';
import SettingsScreen from '@/app/(tabs)/settings';

// Dashboard, Spending and Transactions tabs are now thin wrappers around
// data-fetching screens (see their dedicated tests under __tests__/screens/).
// Only Forecast and Settings remain static stubs at this phase.

it('Forecast renders screen heading', () => {
  render(<ForecastScreen />);
  expect(screen.getByText('Savings Forecast')).toBeTruthy();
});

it('Settings renders screen heading', () => {
  render(<SettingsScreen />);
  expect(screen.getByText('Settings')).toBeTruthy();
});

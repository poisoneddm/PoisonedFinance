import React from 'react';
import { render, screen } from '@testing-library/react-native';
import DashboardScreen from '@/app/(tabs)/index';
import SpendingScreen from '@/app/(tabs)/spending';
import ForecastScreen from '@/app/(tabs)/forecast';
import TransactionsScreen from '@/app/(tabs)/transactions';
import SettingsScreen from '@/app/(tabs)/settings';

it('Dashboard renders greeting heading', () => {
  render(<DashboardScreen />);
  expect(screen.getByText('Good morning, Ryan')).toBeTruthy();
});

it('Spending renders screen heading', () => {
  render(<SpendingScreen />);
  expect(screen.getByText('Spending')).toBeTruthy();
});

it('Forecast renders screen heading', () => {
  render(<ForecastScreen />);
  expect(screen.getByText('Savings Forecast')).toBeTruthy();
});

it('Transactions renders screen heading', () => {
  render(<TransactionsScreen />);
  expect(screen.getByText('Transactions')).toBeTruthy();
});

it('Settings renders screen heading', () => {
  render(<SettingsScreen />);
  expect(screen.getByText('Settings')).toBeTruthy();
});

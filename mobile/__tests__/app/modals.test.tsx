import React from 'react';
import { render, screen } from '@testing-library/react-native';
import ReviewScreen from '@/app/review';
import CategoryEditScreen from '@/app/category-edit';

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }),
}));

it('Review Queue renders screen heading', () => {
  render(<ReviewScreen />);
  expect(screen.getByText('Review Queue')).toBeTruthy();
});

it('Category Edit renders screen heading', () => {
  render(<CategoryEditScreen />);
  expect(screen.getByText('Change Category')).toBeTruthy();
});

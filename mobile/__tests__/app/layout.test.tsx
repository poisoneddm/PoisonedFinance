import React from 'react';
import { render } from '@testing-library/react-native';
import RootLayout from '@/app/_layout';

jest.mock('expo-router', () => {
  const r = require('react');
  // Stack must be a component with a `.Screen` property so <Stack.Screen>
  // resolves — a string key 'Stack.Screen' would not be reachable that way.
  const Stack: any = ({ children }: { children: React.ReactNode }) =>
    r.createElement(r.Fragment, null, children);
  Stack.Screen = () => null;
  return { Stack };
});

jest.mock('expo-status-bar', () => ({
  StatusBar: () => null,
}));

it('renders without crashing', () => {
  expect(() => render(<RootLayout />)).not.toThrow();
});

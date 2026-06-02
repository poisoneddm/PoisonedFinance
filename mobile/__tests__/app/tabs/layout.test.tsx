import React from 'react';
import { render } from '@testing-library/react-native';
import TabLayout from '@/app/(tabs)/_layout';

jest.mock('expo-router', () => {
  const r = require('react');
  // Tabs must be a component with a `.Screen` property so <Tabs.Screen>
  // resolves — a string key 'Tabs.Screen' would not be reachable that way.
  const Tabs: any = ({ children }: { children: React.ReactNode }) =>
    r.createElement(r.Fragment, null, children);
  Tabs.Screen = () => null;
  return { Tabs };
});

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

it('renders without crashing', () => {
  expect(() => render(<TabLayout />)).not.toThrow();
});

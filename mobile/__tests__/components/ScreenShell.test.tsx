import React from 'react';
import { Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import ScreenShell from '@/components/ScreenShell';

describe('ScreenShell', () => {
  it('renders children inside a scroll view by default', () => {
    render(
      <ScreenShell>
        <Text>hello world</Text>
      </ScreenShell>
    );
    expect(screen.getByText('hello world')).toBeTruthy();
  });

  it('renders children without scroll when scroll={false}', () => {
    render(
      <ScreenShell scroll={false}>
        <Text>no scroll</Text>
      </ScreenShell>
    );
    expect(screen.getByText('no scroll')).toBeTruthy();
  });
});

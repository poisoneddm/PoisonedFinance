import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

jest.mock('expo-linking', () => ({
  openURL: jest.fn().mockResolvedValue(undefined),
  canOpenURL: jest.fn().mockResolvedValue(true),
  useURL: jest.fn(() => null),
  parse: jest.fn(() => ({ queryParams: {} })),
}));

jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn().mockResolvedValue({ canceled: true, assets: [] }),
}));

jest.mock('@/lib/api', () => ({
  API_BASE_URL: 'http://localhost:3000',
  apiPost: jest.fn().mockResolvedValue({ ok: true, synced: 1 }),
  apiUpload: jest.fn(),
}));

import SettingsScreen from '@/app/(tabs)/settings';
import * as Linking from 'expo-linking';
import { apiPost } from '@/lib/api';
import { SEED_USER_ID } from '@/lib/currentUser';

describe('SettingsScreen — bank linking & sync', () => {
  beforeEach(() => jest.clearAllMocks());

  it('opens the TrueLayer OAuth URL when "Link a bank account" is pressed', async () => {
    const { getByLabelText } = render(<SettingsScreen />);
    fireEvent.press(getByLabelText('Link a bank account'));
    await waitFor(() => {
      expect(Linking.openURL).toHaveBeenCalledWith(
        `http://localhost:3000/auth/truelayer?userId=${encodeURIComponent(SEED_USER_ID)}`,
      );
    });
  });

  it('triggers a sync via POST /sync/:userId when "Sync now" is pressed', async () => {
    const { getByLabelText } = render(<SettingsScreen />);
    fireEvent.press(getByLabelText('Sync now'));
    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith(`/sync/${SEED_USER_ID}`, {});
    });
  });
});

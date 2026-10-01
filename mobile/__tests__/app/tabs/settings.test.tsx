import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(),
}));

jest.mock('@/lib/api', () => ({
  apiUpload: jest.fn().mockResolvedValue({ ok: true, imported: 3 }),
}));

import SettingsScreen from '@/app/(tabs)/settings';
import * as DocumentPicker from 'expo-document-picker';
import { apiUpload } from '@/lib/api';
import { SEED_USER_ID } from '@/lib/currentUser';

const mockGetDocument = DocumentPicker.getDocumentAsync as jest.Mock;

describe('SettingsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetDocument.mockResolvedValue({ canceled: true, assets: [] });
  });

  it('navigates to the expected-income and budget-split editors', () => {
    const { getByLabelText } = render(<SettingsScreen />);
    fireEvent.press(getByLabelText('Edit expected income'));
    expect(mockPush).toHaveBeenCalledWith('/income');
    fireEvent.press(getByLabelText('Edit budget split'));
    expect(mockPush).toHaveBeenCalledWith('/goals');
  });

  it('uploads a picked statement to /import/statement', async () => {
    mockGetDocument.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file:///statement.pdf', name: 'statement.pdf' }],
    });
    const { getByLabelText } = render(<SettingsScreen />);
    fireEvent.press(getByLabelText('Upload statement'));
    await waitFor(() => {
      expect(apiUpload).toHaveBeenCalledWith('/import/statement', expect.any(FormData));
    });
  });

  it('does not upload when the document picker is cancelled', async () => {
    const { getByLabelText } = render(<SettingsScreen />);
    fireEvent.press(getByLabelText('Upload statement'));
    await waitFor(() => expect(mockGetDocument).toHaveBeenCalled());
    expect(apiUpload).not.toHaveBeenCalled();
  });
});

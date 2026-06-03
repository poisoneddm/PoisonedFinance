import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as Linking from 'expo-linking';
import { apiPost, apiUpload, API_BASE_URL } from '@/lib/api';
import { SEED_USER_ID } from '@/lib/currentUser';
import { colors, spacing, radius } from '@/constants/theme';

export default function SettingsScreen() {
  const [uploading, setUploading] = useState(false);
  const [linking, setLinking] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Pull the latest accounts + transactions for the current user.
  const runSync = useCallback(async (announce: boolean) => {
    setSyncing(true);
    try {
      const res = await apiPost<{ ok: boolean; synced: number }>(
        `/sync/${SEED_USER_ID}`,
        {},
      );
      if (announce) {
        Alert.alert(
          'Sync complete',
          `Refreshed ${res.synced} bank connection${res.synced === 1 ? '' : 's'}.`,
        );
      }
    } catch (err) {
      Alert.alert('Sync failed', err instanceof Error ? err.message : String(err));
    } finally {
      setSyncing(false);
    }
  }, []);

  // The API's OAuth callback redirects back into the app via the
  // `poisonedfinance://link-complete?status=...` deep link. When we receive it
  // we finish the flow by pulling transactions for the freshly linked account.
  const returnUrl = Linking.useURL();
  useEffect(() => {
    if (!returnUrl) return;
    const { queryParams } = Linking.parse(returnUrl);
    if (queryParams?.status === 'ok') {
      setLinking(false);
      runSync(true);
    } else if (queryParams?.status === 'error') {
      setLinking(false);
      Alert.alert('Could not link bank', 'Something went wrong connecting your bank. Please try again.');
    }
  }, [returnUrl, runSync]);

  async function handleLinkBank() {
    setLinking(true);
    const url = `${API_BASE_URL}/auth/truelayer?userId=${encodeURIComponent(SEED_USER_ID)}`;
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) throw new Error('Cannot open the bank linking page.');
      await Linking.openURL(url);
    } catch (err) {
      setLinking(false);
      Alert.alert('Could not start linking', err instanceof Error ? err.message : String(err));
    }
  }

  async function handlePdfUpload() {
    let result;
    try {
      result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });
    } catch {
      Alert.alert('Error', 'Could not open document picker.');
      return;
    }

    if (result.canceled || result.assets.length === 0) return;

    const asset = result.assets[0];
    setUploading(true);
    try {
      const formData = new FormData();
      // React Native FormData accepts { uri, name, type } objects
      formData.append('file', {
        uri: asset.uri,
        name: asset.name ?? 'statement.pdf',
        type: 'application/pdf',
      } as unknown as Blob);
      formData.append('userId', SEED_USER_ID);

      const response = await apiUpload<{ ok: boolean; imported: number }>(
        '/import/pdf',
        formData,
      );
      Alert.alert(
        'Import complete',
        `${response.imported} new transaction${response.imported === 1 ? '' : 's'} imported.`,
      );
    } catch (err) {
      Alert.alert('Import failed', err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  }

  const busy = uploading || linking || syncing;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Settings</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Connected Accounts</Text>
        <Text style={styles.sectionHint}>
          Securely connect your bank to import transactions automatically.
        </Text>
        <TouchableOpacity
          style={[styles.button, (busy) && styles.buttonDisabled]}
          onPress={handleLinkBank}
          disabled={busy}
          accessibilityLabel="Link a bank account"
        >
          {linking ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Link a bank account</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.buttonSecondary, busy && styles.buttonDisabled]}
          onPress={() => runSync(true)}
          disabled={busy}
          accessibilityLabel="Sync now"
        >
          {syncing ? (
            <ActivityIndicator color={colors.purpleLight} />
          ) : (
            <Text style={styles.buttonSecondaryText}>Sync now</Text>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Import</Text>
        <Text style={styles.sectionHint}>
          No bank link? Upload a PDF statement instead.
        </Text>
        <TouchableOpacity
          style={[styles.buttonSecondary, busy && styles.buttonDisabled]}
          onPress={handlePdfUpload}
          disabled={busy}
          accessibilityLabel="Upload statement PDF"
        >
          {uploading ? (
            <ActivityIndicator color={colors.purpleLight} />
          ) : (
            <Text style={styles.buttonSecondaryText}>Upload statement (PDF)</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: spacing.xxl,
    paddingBottom: 40,
  },
  heading: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 32,
  },
  section: {
    marginBottom: spacing.xxl,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  sectionHint: {
    fontSize: 13,
    color: colors.textDim,
    marginBottom: spacing.lg,
    lineHeight: 18,
  },
  button: {
    backgroundColor: colors.purple,
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonSecondary: {
    backgroundColor: colors.purpleDim,
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
  },
  buttonSecondaryText: {
    color: colors.purpleLight,
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});

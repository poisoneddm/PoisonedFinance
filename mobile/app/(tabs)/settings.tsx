import React, { useState } from 'react';
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
import { useRouter } from 'expo-router';
import { apiUpload } from '@/lib/api';
import { SEED_USER_ID } from '@/lib/currentUser';
import { colors, spacing, radius } from '@/constants/theme';

export default function SettingsScreen() {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);

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

  const busy = uploading;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Settings</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Budget</Text>
        <Text style={styles.sectionHint}>
          Set your expected monthly income and how it splits across Needs, Wants, and Savings.
        </Text>
        <TouchableOpacity
          style={[styles.buttonSecondary, busy && styles.buttonDisabled]}
          onPress={() => router.push('/income')}
          disabled={busy}
          accessibilityLabel="Edit expected income"
        >
          <Text style={styles.buttonSecondaryText}>Expected income</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.buttonSecondary, styles.buttonStacked, busy && styles.buttonDisabled]}
          onPress={() => router.push('/goals')}
          disabled={busy}
          accessibilityLabel="Edit budget split"
        >
          <Text style={styles.buttonSecondaryText}>Edit budget split</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Import</Text>
        <Text style={styles.sectionHint}>
          Upload a PDF bank statement to import and categorise your transactions.
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
  buttonSecondary: {
    backgroundColor: colors.purpleDim,
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
  },
  buttonStacked: {
    marginTop: spacing.md,
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

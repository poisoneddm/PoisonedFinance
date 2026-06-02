import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { apiUpload } from '@/lib/api';
import { SEED_USER_ID } from '@/lib/currentUser';

export default function SettingsScreen() {
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

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Settings</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Bank Data</Text>
        <TouchableOpacity
          style={[styles.button, uploading && styles.buttonDisabled]}
          onPress={handlePdfUpload}
          disabled={uploading}
          accessibilityLabel="Upload statement PDF"
        >
          {uploading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Upload statement (PDF)</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f13',
    padding: 24,
  },
  heading: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 32,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  button: {
    backgroundColor: '#5b4fcf',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

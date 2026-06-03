import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { apiGet, apiPut } from '@/lib/api';
import { SEED_USER_ID } from '@/lib/currentUser';
import { formatPence } from '@/lib/format';
import { colors, spacing, radius } from '@/constants/theme';

type Source = 'confirmed' | 'suggested' | 'actual';

interface ExpectedIncome {
  expected_pence: number;
  source: Source;
  suggested_pence: number;
  actual_pence: number;
}

const SOURCE_LABEL: Record<Source, string> = {
  confirmed: 'Using your confirmed figure',
  suggested: 'Suggested from recent months',
  actual: 'Based on income received so far',
};

/** Pence → editable pounds string, e.g. 430000 → "4300" (or "4300.50"). */
function toPounds(pence: number): string {
  return (pence / 100).toFixed(2).replace(/\.00$/, '');
}

export default function IncomeScreen() {
  const router = useRouter();
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const [data, setData] = useState<ExpectedIncome | null>(null);
  const [error, setError] = useState(false);
  const [pounds, setPounds] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiGet<ExpectedIncome>(`/income/${SEED_USER_ID}?year=${year}&month=${month}`)
      .then(d => {
        setData(d);
        setPounds(toPounds(d.expected_pence));
      })
      .catch(() => setError(true));
  }, [year, month]);

  const parsedPence = Math.round((parseFloat(pounds) || 0) * 100);
  const valid = pounds.trim() !== '' && !Number.isNaN(parseFloat(pounds)) && parsedPence >= 0;

  async function handleSave() {
    if (!valid) return;
    setSaving(true);
    try {
      await apiPut(`/income/${SEED_USER_ID}`, { year, month, expected_pence: parsedPence });
      router.back();
    } catch (err) {
      Alert.alert('Could not save', err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Could not load your income.</Text>
      </View>
    );
  }
  if (!data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator testID="income-loading" size="large" color={colors.purple} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.intro}>
        Budget targets are based on your expected monthly income, so they're ready from
        day one — before salaries land. We suggest a figure from recent months; adjust it
        if your pay has changed.
      </Text>

      <View style={styles.infoRow}>
        <Text style={styles.infoLabel}>Suggested (recent average)</Text>
        <Text style={styles.infoValue}>{formatPence(data.suggested_pence)}</Text>
      </View>
      <View style={styles.infoRow}>
        <Text style={styles.infoLabel}>Received so far this month</Text>
        <Text style={styles.infoValue}>{formatPence(data.actual_pence)}</Text>
      </View>

      <Text style={styles.fieldLabel}>Expected income this month</Text>
      <View style={styles.inputRow}>
        <Text style={styles.poundSign}>£</Text>
        <TextInput
          style={styles.input}
          value={pounds}
          onChangeText={setPounds}
          keyboardType="numeric"
          placeholder="0"
          placeholderTextColor={colors.textDim}
          accessibilityLabel="Expected income in pounds"
        />
      </View>
      <Text style={styles.sourceHint}>{SOURCE_LABEL[data.source]}</Text>

      <TouchableOpacity
        style={styles.useSuggested}
        onPress={() => setPounds(toPounds(data.suggested_pence))}
        accessibilityLabel="Use suggested amount"
      >
        <Text style={styles.useSuggestedText}>Use suggested ({formatPence(data.suggested_pence)})</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.saveBtn, (!valid || saving) && styles.btnDisabled]}
        onPress={handleSave}
        disabled={!valid || saving}
        accessibilityLabel="Save expected income"
      >
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: spacing.xl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, padding: spacing.xxl },
  errorText: { color: colors.red, fontSize: 14, textAlign: 'center' },
  intro: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginBottom: spacing.xl },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  infoLabel: { color: colors.textMuted, fontSize: 13 },
  infoValue: { color: colors.text, fontSize: 15, fontWeight: '600' },
  fieldLabel: {
    color: colors.textMuted,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
  },
  poundSign: { color: colors.text, fontSize: 22, fontWeight: '700', marginRight: spacing.sm },
  input: { flex: 1, color: colors.text, fontSize: 22, fontWeight: '700', paddingVertical: 14 },
  sourceHint: { color: colors.textDim, fontSize: 12, marginTop: spacing.sm },
  useSuggested: { marginTop: spacing.lg, alignSelf: 'flex-start' },
  useSuggestedText: { color: colors.purpleLight, fontSize: 14, fontWeight: '600' },
  saveBtn: {
    marginTop: spacing.xxl,
    backgroundColor: colors.purple,
    borderRadius: radius.lg,
    paddingVertical: 13,
    alignItems: 'center',
  },
  saveText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  btnDisabled: { opacity: 0.5 },
});

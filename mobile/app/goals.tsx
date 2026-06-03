import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { apiGet, apiPut } from '@/lib/api';
import { SEED_USER_ID } from '@/lib/currentUser';
import { colors, spacing, radius } from '@/constants/theme';
import { MetaBucket } from '@/lib/types';

interface Goal {
  needs_pct: number;
  wants_pct: number;
  savings_pct: number;
}

const STEP = 5;

const BUCKETS: { key: keyof Goal; label: string; bucket: MetaBucket }[] = [
  { key: 'needs_pct', label: 'Needs', bucket: 'needs' },
  { key: 'wants_pct', label: 'Wants', bucket: 'wants' },
  { key: 'savings_pct', label: 'Savings', bucket: 'savings' },
];

const ACCENT: Record<MetaBucket, string> = {
  needs: colors.needs,
  wants: colors.wants,
  savings: colors.savings,
};

export default function GoalsScreen() {
  const router = useRouter();
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const [goal, setGoal] = useState<Goal | null>(null);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiGet<Goal>(`/goals/${SEED_USER_ID}?year=${year}&month=${month}`)
      .then(g =>
        setGoal({ needs_pct: g.needs_pct, wants_pct: g.wants_pct, savings_pct: g.savings_pct }),
      )
      .catch(() => setError(true));
  }, [year, month]);

  function adjust(key: keyof Goal, delta: number) {
    setGoal(prev => {
      if (!prev) return prev;
      const next = Math.min(100, Math.max(0, prev[key] + delta));
      return { ...prev, [key]: next };
    });
  }

  const total = goal ? goal.needs_pct + goal.wants_pct + goal.savings_pct : 0;
  const valid = total === 100;

  async function handleSave() {
    if (!goal || !valid) return;
    setSaving(true);
    try {
      await apiPut(`/goals/${SEED_USER_ID}`, { year, month, ...goal });
      router.back();
    } catch (err) {
      Alert.alert('Could not save', err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Could not load your budget.</Text>
      </View>
    );
  }

  if (!goal) {
    return (
      <View style={styles.center}>
        <ActivityIndicator testID="goals-loading" size="large" color={colors.purple} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.intro}>
          Split your income across Needs, Wants, and Savings. The three must add up to 100%.
        </Text>

        {BUCKETS.map(({ key, label, bucket }) => (
          <View key={key} style={styles.row}>
            <View style={styles.rowLabel}>
              <View style={[styles.dot, { backgroundColor: ACCENT[bucket] }]} />
              <Text style={styles.label}>{label}</Text>
            </View>
            <View style={styles.stepper}>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() => adjust(key, -STEP)}
                accessibilityLabel={`Decrease ${label}`}
              >
                <Text style={styles.stepBtnText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.pct} accessibilityLabel={`${label} percent`}>
                {goal[key]}%
              </Text>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() => adjust(key, STEP)}
                accessibilityLabel={`Increase ${label}`}
              >
                <Text style={styles.stepBtnText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={[styles.totalValue, { color: valid ? colors.green : colors.red }]}>
            {total}%
          </Text>
        </View>
        {!valid && (
          <Text style={styles.totalHint}>Adjust the splits so they total exactly 100%.</Text>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.saveBtn, (!valid || saving) && styles.btnDisabled]}
          onPress={handleSave}
          disabled={!valid || saving}
          accessibilityLabel="Save budget"
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveText}>Save budget</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, padding: spacing.xxl },
  errorText: { color: colors.red, fontSize: 14, textAlign: 'center' },
  content: { padding: spacing.xl, paddingBottom: spacing.xl },
  intro: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginBottom: spacing.xl },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  rowLabel: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: spacing.md },
  label: { color: colors.text, fontSize: 15, fontWeight: '600' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.purpleDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: { color: colors.purpleLight, fontSize: 20, fontWeight: '700', lineHeight: 22 },
  pct: { color: colors.text, fontSize: 16, fontWeight: '700', minWidth: 48, textAlign: 'center' },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  totalLabel: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
  totalValue: { fontSize: 18, fontWeight: '700' },
  totalHint: { color: colors.amber, fontSize: 12, marginTop: spacing.sm, paddingHorizontal: spacing.lg },
  footer: {
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    padding: spacing.lg,
    paddingBottom: 28,
  },
  saveBtn: { backgroundColor: colors.purple, borderRadius: radius.lg, paddingVertical: 13, alignItems: 'center' },
  saveText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  btnDisabled: { opacity: 0.5 },
});

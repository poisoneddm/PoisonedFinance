import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { apiGet, apiPost } from '@/lib/api';
import { SEED_USER_ID } from '@/lib/currentUser';
import { formatPence } from '@/lib/format';
import { colors, spacing, radius } from '@/constants/theme';
import { Category, MetaBucket } from '@/lib/types';

// Picker buckets include 'income' (a category bucket) alongside the three spend
// buckets so salaries can be tagged Income; MetaBucket itself stays the spend-only
// union used by the budget-split screens.
type PickerBucket = MetaBucket | 'income';
const BUCKET_ORDER: PickerBucket[] = ['needs', 'wants', 'savings', 'income'];
const BUCKET_LABEL: Record<PickerBucket, string> = {
  needs: 'Needs',
  wants: 'Wants',
  savings: 'Savings',
  income: 'Income',
};
const BUCKET_HEADER_COLOR: Record<PickerBucket, string> = {
  needs: colors.needs,
  wants: colors.wants,
  savings: colors.savings,
  income: colors.income,
};

export default function CategoryEditScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    txnId?: string;
    merchant?: string;
    amountPence?: string;
    date?: string;
    account?: string;
    current?: string;
  }>();

  const [categories, setCategories] = useState<Category[] | null>(null);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<string | null>(params.current ?? null);
  const [createRule, setCreateRule] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiGet<Category[]>('/categories')
      .then(setCategories)
      .catch(() => setError(true));
  }, []);

  const grouped = useMemo(() => {
    const map: Record<PickerBucket, Category[]> = { needs: [], wants: [], savings: [], income: [] };
    for (const c of categories ?? []) {
      const bucket = c.meta_bucket as PickerBucket;
      if (map[bucket]) map[bucket].push(c);
    }
    return map;
  }, [categories]);

  const amountPence = params.amountPence ? parseInt(params.amountPence, 10) : NaN;
  const merchant = params.merchant ?? 'this transaction';

  async function handleSave() {
    if (!selected || !params.txnId) return;
    setSaving(true);
    try {
      await apiPost(`/review/${params.txnId}/change`, {
        category_name: selected,
        create_rule: createRule,
        user_id: SEED_USER_ID,
      });
      router.back();
    } catch (err) {
      Alert.alert('Could not save', err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  }

  return (
    <View style={styles.container}>
      {/* Transaction context bar */}
      <View style={styles.contextBar}>
        <Text style={styles.contextLabel}>Changing category for</Text>
        <View style={styles.contextRow}>
          <Text style={styles.contextMerchant} numberOfLines={1}>{merchant}</Text>
          {!Number.isNaN(amountPence) && (
            <Text style={styles.contextAmount}>{formatPence(amountPence)}</Text>
          )}
        </View>
        {(params.date || params.account) && (
          <Text style={styles.contextMeta}>
            {[params.date, params.account].filter(Boolean).join(' · ')}
          </Text>
        )}
      </View>

      {error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>Could not load categories.</Text>
        </View>
      ) : categories === null ? (
        <View style={styles.center}>
          <ActivityIndicator testID="categories-loading" size="large" color={colors.purple} />
        </View>
      ) : (
        <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
          {BUCKET_ORDER.map(bucket =>
            grouped[bucket].length === 0 ? null : (
              <View key={bucket}>
                <Text style={[styles.groupHeader, { color: BUCKET_HEADER_COLOR[bucket] }]}>
                  {BUCKET_LABEL[bucket]}
                </Text>
                {grouped[bucket].map(cat => {
                  const isSelected = cat.name === selected;
                  return (
                    <TouchableOpacity
                      key={cat.id}
                      style={[styles.catRow, isSelected && styles.catRowSelected]}
                      onPress={() => setSelected(cat.name)}
                      accessibilityLabel={`Select ${cat.name}`}
                    >
                      <View style={[styles.dot, { backgroundColor: cat.color_hex }]} />
                      <Text style={[styles.catName, isSelected && styles.catNameSelected]}>
                        {cat.name}
                      </Text>
                      {isSelected && <Text style={styles.tick}>✓</Text>}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ),
          )}
        </ScrollView>
      )}

      {/* Sticky footer: rule toggle + save */}
      <View style={styles.footer}>
        {selected && (
          <TouchableOpacity
            style={styles.rulePrompt}
            onPress={() => setCreateRule(v => !v)}
            accessibilityLabel="Toggle create rule"
          >
            <Text style={styles.ruleText}>
              Save rule: always categorise{' '}
              <Text style={styles.ruleMerchant}>{merchant}</Text> as {selected}?
            </Text>
            <View style={[styles.toggle, createRule ? styles.toggleYes : styles.toggleNo]}>
              <Text style={createRule ? styles.toggleYesText : styles.toggleNoText}>
                {createRule ? 'Yes' : 'No'}
              </Text>
            </View>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.saveBtn, (!selected || saving) && styles.btnDisabled]}
          onPress={handleSave}
          disabled={!selected || saving}
          accessibilityLabel="Save category"
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveText}>Save</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl },
  errorText: { color: colors.red, fontSize: 14, textAlign: 'center' },
  contextBar: {
    backgroundColor: colors.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  contextLabel: { fontSize: 12, color: colors.textDim, marginBottom: spacing.xs },
  contextRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  contextMerchant: { flex: 1, marginRight: spacing.md, fontSize: 15, fontWeight: '600', color: colors.text },
  contextAmount: { fontSize: 15, fontWeight: '600', color: colors.red },
  contextMeta: { fontSize: 12, color: colors.textDim, marginTop: 2 },
  list: { flex: 1 },
  listContent: { paddingVertical: spacing.sm, paddingBottom: spacing.lg },
  groupHeader: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: spacing.xl,
  },
  catRowSelected: {
    backgroundColor: colors.purpleDim,
    borderRadius: radius.md,
    marginHorizontal: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: spacing.md },
  catName: { flex: 1, fontSize: 14, color: colors.text },
  catNameSelected: { fontWeight: '600' },
  tick: { fontSize: 14, color: colors.purple },
  footer: {
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    padding: spacing.lg,
    paddingBottom: 28,
  },
  rulePrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  ruleText: { flex: 1, fontSize: 12, color: colors.textMuted },
  ruleMerchant: { color: colors.purpleLight },
  toggle: { paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.sm },
  toggleYes: { backgroundColor: colors.pillGreenBg },
  toggleNo: { backgroundColor: colors.border },
  toggleYesText: { color: colors.green, fontSize: 11, fontWeight: '700' },
  toggleNoText: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
  saveBtn: {
    backgroundColor: colors.purple,
    borderRadius: radius.lg,
    paddingVertical: 13,
    alignItems: 'center',
  },
  saveText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  btnDisabled: { opacity: 0.5 },
});

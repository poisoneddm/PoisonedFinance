import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { apiGet, apiPost } from '@/lib/api';
import { SEED_USER_ID } from '@/lib/currentUser';
import { formatPence } from '@/lib/format';
import { colors, spacing, radius } from '@/constants/theme';
import { ReviewTransaction, MetaBucket } from '@/lib/types';

/** Meta-bucket accent colour for the suggested-category dot. */
function bucketColor(bucket: MetaBucket | 'income' | null): string {
  switch (bucket) {
    case 'needs': return colors.needs;
    case 'wants': return colors.wants;
    case 'savings': return colors.savings;
    case 'income': return colors.income;
    default: return colors.textDim;
  }
}

function ReviewCard({
  txn,
  onConfirm,
  onChange,
  busy,
}: {
  txn: ReviewTransaction;
  onConfirm: () => void;
  onChange: () => void;
  busy: boolean;
}) {
  const categoryLabel = txn.category_name ?? 'Uncategorised';
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.merchant} numberOfLines={1}>
          {txn.merchant_name ?? txn.description}
        </Text>
        <Text style={styles.amount}>{formatPence(txn.amount_pence)}</Text>
      </View>
      <Text style={styles.meta}>
        {txn.transaction_date}
        {txn.account_name ? ` · ${txn.account_name}` : ''}
      </Text>

      <Text style={styles.suggestedLabel}>Suggested category</Text>
      <View style={styles.suggestedRow}>
        <View style={[styles.dot, { backgroundColor: bucketColor(txn.meta_bucket) }]} />
        <Text style={styles.suggestedName}>{categoryLabel}</Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.confirmBtn, busy && styles.btnDisabled]}
          onPress={onConfirm}
          disabled={busy}
          accessibilityLabel={`Confirm ${categoryLabel}`}
        >
          <Text style={styles.confirmText}>✓ Confirm</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.changeBtn, busy && styles.btnDisabled]}
          onPress={onChange}
          disabled={busy}
          accessibilityLabel="Change category"
        >
          <Text style={styles.changeText}>Change</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function ReviewScreen() {
  const router = useRouter();
  const [items, setItems] = useState<ReviewTransaction[] | null>(null);
  const [error, setError] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(false);
    apiGet<ReviewTransaction[]>(`/review/${SEED_USER_ID}`)
      .then(setItems)
      .catch(() => setError(true));
  }, []);

  // Re-fetch every time the screen gains focus, so an item categorised on the
  // Category Edit screen disappears from the queue when we navigate back.
  useFocusEffect(load);

  async function handleConfirm(txn: ReviewTransaction) {
    setPendingId(txn.id);
    try {
      await apiPost(`/review/${txn.id}/confirm`, { user_id: SEED_USER_ID });
      setItems(prev => (prev ? prev.filter(t => t.id !== txn.id) : prev));
    } catch (err) {
      Alert.alert('Could not confirm', err instanceof Error ? err.message : String(err));
    } finally {
      setPendingId(null);
    }
  }

  function handleChange(txn: ReviewTransaction) {
    router.push({
      pathname: '/category-edit',
      params: {
        txnId: txn.id,
        merchant: txn.merchant_name ?? txn.description,
        amountPence: String(txn.amount_pence),
        date: txn.transaction_date,
        account: txn.account_name ?? '',
        current: txn.category_name ?? '',
      },
    });
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Could not load the review queue.</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={load}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (items === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator testID="review-loading" size="large" color={colors.purple} />
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>All caught up</Text>
        <Text style={styles.emptyText}>No transactions need review right now.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.subtitle}>
        {items.length} transaction{items.length === 1 ? '' : 's'} need a category
      </Text>
      {items.map(txn => (
        <ReviewCard
          key={txn.id}
          txn={txn}
          busy={pendingId === txn.id}
          onConfirm={() => handleConfirm(txn)}
          onChange={() => handleChange(txn)}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, padding: spacing.xxl },
  subtitle: { color: colors.textMuted, fontSize: 13, marginBottom: spacing.lg },
  errorText: { color: colors.red, fontSize: 14, textAlign: 'center', marginBottom: spacing.lg },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: '700', marginBottom: spacing.sm },
  emptyText: { color: colors.textMuted, fontSize: 14, textAlign: 'center' },
  retryBtn: { backgroundColor: colors.purpleDim, borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: spacing.xl },
  retryText: { color: colors.purpleLight, fontWeight: '600' },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  merchant: { flex: 1, marginRight: spacing.md, fontSize: 15, fontWeight: '600', color: colors.text },
  amount: { fontSize: 15, fontWeight: '600', color: colors.text },
  meta: { fontSize: 12, color: colors.textDim, marginTop: 2 },
  suggestedLabel: { fontSize: 12, color: colors.textMuted, marginTop: spacing.md, marginBottom: spacing.xs },
  suggestedRow: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: spacing.sm },
  suggestedName: { fontSize: 14, color: colors.text, fontWeight: '500' },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  confirmBtn: { flex: 1, backgroundColor: colors.pillGreenBg, borderRadius: radius.md, paddingVertical: 10, alignItems: 'center' },
  confirmText: { color: colors.green, fontSize: 14, fontWeight: '700' },
  changeBtn: { flex: 1, backgroundColor: colors.border, borderRadius: radius.md, paddingVertical: 10, alignItems: 'center' },
  changeText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  btnDisabled: { opacity: 0.5 },
});

import React from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useMonthData } from '@/hooks/useMonthData';
import { formatPence } from '@/lib/format';
import { statusColors } from '@/lib/statusColors';
import { PillLevel } from '@/lib/types';
import { colors } from '@/constants/theme';

interface Pill {
  bucket: string;
  spent_pence: number;
  goal_pence: number;
  status: PillLevel;
}

interface RecentTransaction {
  id: string;
  merchant_name: string | null;
  description: string;
  amount_pence: number;
  transaction_date: string;
  category_name: string | null;
}

interface DashboardData {
  income_pence: number;
  pills: Pill[];
  review_count: number;
  recent: RecentTransaction[];
}

interface DashboardScreenProps {
  userId: string;
  year: number;
  month: number;
}

export function DashboardScreen({ userId, year, month }: DashboardScreenProps) {
  const state = useMonthData<DashboardData>(
    (u, y, m) => `/dashboard/${u}?year=${y}&month=${m}`,
    userId,
    year,
    month,
  );

  if (state.status === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator testID="loading-indicator" size="large" />
      </View>
    );
  }

  if (state.status === 'error') {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Error: {state.error}</Text>
      </View>
    );
  }

  const { income_pence, pills, review_count, recent } = state.data;

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.incomeLabel}>Monthly Income</Text>
      <Text style={styles.incomeAmount}>{formatPence(income_pence)}</Text>

      {review_count > 0 && (
        <Text style={styles.reviewAlert}>{review_count} transactions need review</Text>
      )}

      <View style={styles.pillsRow}>
        {pills.map(pill => {
          const colors = statusColors(pill.status);
          return (
            <View key={pill.bucket} style={[styles.pill, { backgroundColor: colors.bg }]}>
              <Text style={[styles.pillLabel, { color: colors.text }]}>
                {pill.bucket.charAt(0).toUpperCase() + pill.bucket.slice(1)}
              </Text>
              <Text style={[styles.pillAmount, { color: colors.text }]}>
                {formatPence(pill.spent_pence)}
              </Text>
              <Text style={[styles.pillGoal, { color: colors.text }]}>
                of {formatPence(pill.goal_pence)}
              </Text>
            </View>
          );
        })}
      </View>

      <Text style={styles.sectionHeader}>Recent Transactions</Text>
      {recent.map(tx => (
        <View key={tx.id} style={styles.txRow}>
          <Text style={styles.txMerchant}>{tx.merchant_name ?? tx.description}</Text>
          <Text style={styles.txAmount}>{formatPence(tx.amount_pence)}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  errorText: { color: colors.red },
  incomeLabel: { fontSize: 14, color: colors.textMuted, marginBottom: 4 },
  incomeAmount: { fontSize: 28, fontWeight: 'bold', marginBottom: 16, color: colors.text },
  reviewAlert: { color: colors.amber, marginBottom: 12 },
  pillsRow: { flexDirection: 'row', gap: 8, marginBottom: 24 },
  pill: { flex: 1, borderRadius: 8, padding: 12 },
  pillLabel: { fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
  pillAmount: { fontSize: 16, fontWeight: 'bold', marginTop: 4 },
  pillGoal: { fontSize: 11, marginTop: 2 },
  sectionHeader: { fontSize: 16, fontWeight: '600', marginBottom: 8, color: colors.text },
  txRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  txMerchant: { flex: 1, fontSize: 14, color: colors.text },
  txAmount: { fontSize: 14, fontWeight: '500', color: colors.text },
});

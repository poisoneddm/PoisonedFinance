import React from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useMonthData } from '@/hooks/useMonthData';
import { formatPence } from '@/lib/format';
import { colors } from '@/constants/theme';

interface Transaction {
  id: string;
  merchant_name: string | null;
  description: string;
  amount_pence: number;
  transaction_date: string;
  category_name: string | null;
  meta_bucket: string | null;
  color_hex: string | null;
  account_name: string | null;
}

interface TransactionsScreenProps {
  userId: string;
  year: number;
  month: number;
  account?: string;
  bucket?: string;
  q?: string;
}

export function TransactionsScreen({
  userId,
  year,
  month,
  account,
  bucket,
  q,
}: TransactionsScreenProps) {
  const state = useMonthData<Transaction[]>(
    (u, y, m) => {
      const params = new URLSearchParams({
        year: String(y),
        month: String(m),
        ...(account ? { account } : {}),
        ...(bucket ? { bucket } : {}),
        ...(q ? { q } : {}),
      });
      return `/transactions/${u}?${params.toString()}`;
    },
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

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={state.data.length === 0 ? styles.emptyContent : undefined}
      data={state.data}
      keyExtractor={item => item.id}
      ListEmptyComponent={
        <Text style={styles.emptyText}>
          No transactions yet. Link a bank or upload a statement from Settings.
        </Text>
      }
      renderItem={({ item }) => (
        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <Text style={styles.merchant}>
              {item.merchant_name ?? item.description}
            </Text>
            {item.category_name && (
              <View style={styles.catBadge}>
                <View
                  style={[
                    styles.catDot,
                    { backgroundColor: item.color_hex ?? '#666' },
                  ]}
                />
                <Text style={styles.catText}>{item.category_name}</Text>
              </View>
            )}
            <Text style={styles.date}>{item.transaction_date}</Text>
          </View>
          <Text
            style={[
              styles.amount,
              { color: item.amount_pence < 0 ? '#f87171' : '#4ade80' },
            ]}
          >
            {formatPence(item.amount_pence)}
          </Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  errorText: { color: colors.red },
  emptyContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyText: { color: colors.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowLeft: { flex: 1, marginRight: 8 },
  merchant: { fontSize: 14, fontWeight: '500', color: colors.text },
  catBadge: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  catDot: { width: 8, height: 8, borderRadius: 4, marginRight: 5 },
  catText: { fontSize: 12, color: colors.textMuted },
  date: { fontSize: 12, color: colors.textDim, marginTop: 2 },
  amount: { fontSize: 14, fontWeight: '600' },
});

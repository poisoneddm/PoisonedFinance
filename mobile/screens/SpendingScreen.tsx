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

interface GoalBar {
  bucket: string;
  spent_pence: number;
  goal_pence: number;
  status: PillLevel;
}

interface CategoryBreakdownItem {
  name: string;
  meta_bucket: string;
  color_hex: string;
  total_pence: number;
}

interface SpendingData {
  goal_bars: GoalBar[];
  category_breakdown: CategoryBreakdownItem[];
}

interface SpendingScreenProps {
  userId: string;
  year: number;
  month: number;
}

export function SpendingScreen({ userId, year, month }: SpendingScreenProps) {
  const state = useMonthData<SpendingData>(
    (u, y, m) => `/spending/${u}?year=${y}&month=${m}`,
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
        <Text>Error: {state.error}</Text>
      </View>
    );
  }

  const { goal_bars, category_breakdown } = state.data;

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.sectionHeader}>Goal Progress</Text>
      {goal_bars.map(bar => {
        const pct = bar.goal_pence > 0
          ? Math.round((bar.spent_pence / bar.goal_pence) * 100)
          : 0;
        const colors = statusColors(bar.status);
        return (
          <View key={bar.bucket} style={styles.barWrapper}>
            <View style={styles.barLabelRow}>
              <Text style={styles.barLabel}>
                {bar.bucket.charAt(0).toUpperCase() + bar.bucket.slice(1)}
              </Text>
              <Text style={styles.barPct}>{pct}%</Text>
            </View>
            <View style={styles.barTrack}>
              <View
                style={[
                  styles.barFill,
                  {
                    width: `${Math.min(pct, 100)}%` as any,
                    backgroundColor: colors.text,
                  },
                ]}
              />
            </View>
            <Text style={styles.barAmounts}>
              {formatPence(bar.spent_pence)} of {formatPence(bar.goal_pence)}
            </Text>
          </View>
        );
      })}

      <Text style={styles.sectionHeader}>By Category</Text>
      {category_breakdown.map(item => (
        <View key={item.name} style={styles.catRow}>
          <View style={[styles.catDot, { backgroundColor: item.color_hex }]} />
          <Text style={styles.catName}>{item.name}</Text>
          <Text style={styles.catTotal}>{formatPence(item.total_pence)}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  sectionHeader: { fontSize: 16, fontWeight: '600', marginBottom: 12, marginTop: 8 },
  barWrapper: { marginBottom: 20 },
  barLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  barLabel: { fontSize: 14, fontWeight: '600' },
  barPct: { fontSize: 14, color: '#888' },
  barTrack: { height: 8, backgroundColor: '#222', borderRadius: 4, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  barAmounts: { fontSize: 12, color: '#888', marginTop: 4 },
  catRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#333' },
  catDot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  catName: { flex: 1, fontSize: 14 },
  catTotal: { fontSize: 14, fontWeight: '500' },
});

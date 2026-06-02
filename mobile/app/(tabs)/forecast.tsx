import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { apiGet } from '@/lib/api';
import { formatPence } from '@/lib/format';
import { SEED_USER_ID } from '@/lib/currentUser';

// ---------- Types (mirrors API response, contracts §9) ----------

type Badge = 'on-track' | 'behind' | 'stretch';
type CalloutKind = 'consistent' | 'increasing' | 'suggestion';

interface ForecastTier {
  name: 'Goal' | 'Realistic' | 'Stretch' | 'Actual';
  monthly_pence: number;
  annual_pence: number;
  badge: Badge;
}

interface TrendCallout {
  kind: CalloutKind;
  text: string;
  category?: string;
}

interface ForecastResponse {
  tiers: ForecastTier[];
  trends: TrendCallout[];
}

// ---------- Helpers ----------

const BADGE_COLORS: Record<Badge, { bg: string; text: string }> = {
  'on-track': { bg: '#0d2e1a', text: '#4ade80' },
  'behind':   { bg: '#2d0a0a', text: '#f87171' },
  'stretch':  { bg: '#1e1a2d', text: '#c084fc' },
};

/** Return badge background and text colour tokens for a given badge value. */
function badgeStyle(badge: Badge): { bg: string; text: string } {
  return BADGE_COLORS[badge];
}

const CALLOUT_ACCENTS: Record<CalloutKind, string> = {
  consistent: '#60a5fa',
  increasing: '#f97316',
  suggestion: '#4ade80',
};

/** Return a left-border accent colour for a trend callout kind. */
function calloutAccent(kind: CalloutKind): string {
  return CALLOUT_ACCENTS[kind];
}

// ---------- Sub-components ----------

function TierCard({ tier }: { tier: ForecastTier }) {
  const bs = badgeStyle(tier.badge);
  return (
    <View style={styles.tierCard}>
      <View style={styles.tierHeader}>
        <Text style={styles.tierName}>{tier.name}</Text>
        <View style={[styles.badge, { backgroundColor: bs.bg }]}>
          <Text style={[styles.badgeText, { color: bs.text }]}>{tier.badge}</Text>
        </View>
      </View>
      <Text style={styles.tierAmount}>{formatPence(tier.monthly_pence)}</Text>
      <Text style={styles.tierAnnual}>{formatPence(tier.annual_pence)} / year</Text>
    </View>
  );
}

function CalloutCard({ callout }: { callout: TrendCallout }) {
  const accent = calloutAccent(callout.kind);
  return (
    <View style={[styles.calloutCard, { borderLeftColor: accent }]}>
      <Text style={styles.calloutText}>{callout.text}</Text>
    </View>
  );
}

// ---------- Screen ----------

export default function ForecastScreen() {
  const [data, setData] = useState<ForecastResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1; // JS months are 0-indexed

    apiGet<ForecastResponse>(
      `/forecast/${SEED_USER_ID}?year=${year}&month=${month}`,
    )
      .then(res => {
        setData(res);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <View style={styles.center} testID="forecast-loading">
        <ActivityIndicator size="large" color="#60a5fa" />
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={styles.center} testID="forecast-error">
        <Text style={styles.errorText}>Could not load forecast. Please try again.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.screenTitle}>Savings Forecast</Text>

      <View style={styles.section}>
        {data.tiers.map(tier => (
          <TierCard key={tier.name} tier={tier} />
        ))}
      </View>

      {data.trends.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionHeading}>Spending Trends</Text>
          {data.trends.map((callout, idx) => (
            <CalloutCard key={idx} callout={callout} />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

// ---------- Styles ----------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f0f0f',
  },
  errorText: {
    color: '#f87171',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  screenTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#f1f5f9',
    marginBottom: 20,
  },
  section: {
    marginBottom: 24,
    gap: 12,
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: '600',
    color: '#94a3b8',
    marginBottom: 8,
  },
  tierCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
  },
  tierHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  tierName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#cbd5e1',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  tierAmount: {
    fontSize: 28,
    fontWeight: '700',
    color: '#f1f5f9',
    marginBottom: 4,
  },
  tierAnnual: {
    fontSize: 12,
    color: '#64748b',
  },
  calloutCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 3,
  },
  calloutText: {
    fontSize: 13,
    color: '#cbd5e1',
    lineHeight: 18,
  },
});

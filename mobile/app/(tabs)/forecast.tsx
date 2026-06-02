import { Text, StyleSheet } from 'react-native';
import ScreenShell from '@/components/ScreenShell';
import { colors, spacing } from '@/constants/theme';

export default function ForecastScreen() {
  return (
    <ScreenShell>
      <Text style={styles.title}>Savings Forecast</Text>
      <Text style={styles.placeholder}>Forecast tiers — coming in Phase 4</Text>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: '700', color: colors.text, paddingHorizontal: spacing.xl, paddingTop: spacing.lg },
  placeholder: { color: colors.textMuted, paddingHorizontal: spacing.xl, paddingTop: spacing.md, fontSize: 14 },
});

import { View, Text, StyleSheet } from 'react-native';
import ScreenShell from '@/components/ScreenShell';
import { colors, spacing } from '@/constants/theme';

export default function DashboardScreen() {
  return (
    <ScreenShell>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Good morning, Ryan</Text>
          <Text style={styles.sub}>May 2026</Text>
        </View>
        <View style={styles.avatar}>
          <Text style={styles.avatarLetter}>R</Text>
        </View>
      </View>
      <Text style={styles.placeholder}>Dashboard — coming in Phase 3</Text>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  title: { fontSize: 22, fontWeight: '700', color: colors.text },
  sub: { fontSize: 13, color: colors.textDim, marginTop: 2 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.purple,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarLetter: { color: '#fff', fontWeight: '700', fontSize: 14 },
  placeholder: { color: colors.textMuted, paddingHorizontal: spacing.xl, paddingTop: spacing.lg, fontSize: 14 },
});

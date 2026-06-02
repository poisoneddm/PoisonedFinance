import { Text, StyleSheet } from 'react-native';
import ScreenShell from '@/components/ScreenShell';
import { colors, spacing } from '@/constants/theme';

export default function SettingsScreen() {
  return (
    <ScreenShell>
      <Text style={styles.title}>Settings</Text>
      <Text style={styles.placeholder}>Account settings — coming later</Text>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: '700', color: colors.text, paddingHorizontal: spacing.xl, paddingTop: spacing.lg },
  placeholder: { color: colors.textMuted, paddingHorizontal: spacing.xl, paddingTop: spacing.md, fontSize: 14 },
});

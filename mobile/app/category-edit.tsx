import { Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import ScreenShell from '@/components/ScreenShell';
import { colors, spacing, radius } from '@/constants/theme';

export default function CategoryEditScreen() {
  const router = useRouter();
  return (
    <ScreenShell>
      <Text style={styles.title}>Change Category</Text>
      <Text style={styles.placeholder}>Category picker — coming in Phase 4</Text>
      <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
        <Text style={styles.closeBtnText}>Close</Text>
      </TouchableOpacity>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: '700', color: colors.text, paddingHorizontal: spacing.xl, paddingTop: spacing.lg },
  placeholder: { color: colors.textMuted, paddingHorizontal: spacing.xl, paddingTop: spacing.md, fontSize: 14 },
  closeBtn: {
    margin: spacing.xl,
    marginTop: spacing.xxl,
    backgroundColor: colors.purpleDim,
    borderRadius: radius.md,
    padding: 14,
    alignItems: 'center',
  },
  closeBtnText: { color: colors.purpleLight, fontWeight: '600', fontSize: 15 },
});

import React from 'react';
import { ScrollView, View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/constants/theme';

interface Props {
  children: React.ReactNode;
  scroll?: boolean;
}

export default function ScreenShell({ children, scroll = true }: Props) {
  return (
    <SafeAreaView style={styles.safe}>
      {scroll ? (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          {children}
        </ScrollView>
      ) : (
        <View style={styles.fill}>{children}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  content: { paddingBottom: 24 },
  fill: { flex: 1 },
});

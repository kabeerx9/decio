import { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius } from '@/theme';

export const inputStyle = {
  minHeight: 54, backgroundColor: colors.surface, color: colors.ink, borderRadius: radius.sm,
  paddingHorizontal: 16, fontFamily: fonts.body, fontSize: 15,
} as const;

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <View style={styles.field}>
    <View style={styles.head}><Text style={styles.label}>{label}</Text>{!!hint && <Text style={styles.hint}>{hint}</Text>}</View>
    {children}
  </View>;
}

const styles = StyleSheet.create({
  field: { marginTop: 22 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 },
  label: { fontFamily: fonts.bold, fontSize: 13, color: colors.ink },
  hint: { fontFamily: fonts.body, fontSize: 12, color: colors.mute },
});

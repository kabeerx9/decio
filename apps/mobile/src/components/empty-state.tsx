import { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Title } from '@/components/title';
import { colors, fonts } from '@/theme';

export function EmptyState({ emoji, title, body, action }: { emoji: string; title: string; body?: string; action?: ReactNode }) {
  return <View style={styles.root}>
    <Text style={styles.emoji}>{emoji}</Text>
    <Title size={30} style={styles.center}>{title}</Title>
    {!!body && <Text style={styles.body}>{body}</Text>}
    {action && <View style={styles.action}>{action}</View>}
  </View>;
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', paddingHorizontal: 32, paddingVertical: 40, gap: 6 },
  emoji: { fontSize: 44, marginBottom: 4 },
  center: { textAlign: 'center' },
  body: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.mute, textAlign: 'center' },
  action: { marginTop: 14 },
});

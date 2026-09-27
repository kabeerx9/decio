import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius } from '@/theme';

export function Chip({ label, onRemove }: { label: string; onRemove?: () => void }) {
  const content = <>
    <Text style={styles.text}>{label}</Text>
    {onRemove && <Ionicons name="close" size={14} color={colors.mute} />}
  </>;
  return onRemove
    ? <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${label}`} hitSlop={8} onPress={onRemove} style={styles.chip}>{content}</Pressable>
    : <View style={styles.chip}>{content}</View>;
}

const styles = StyleSheet.create({
  chip: { height: 30, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: colors.chip, flexDirection: 'row', alignItems: 'center', gap: 5 },
  text: { fontFamily: fonts.bold, fontSize: 13, color: colors.ink },
});

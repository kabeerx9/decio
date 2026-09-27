import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet } from 'react-native';

import { colors } from '@/theme';

type Props = { color: string; icon: keyof typeof Ionicons.glyphMap; accessibilityLabel: string; onPress: () => void };

export function Fab({ color, icon, accessibilityLabel, onPress }: Props) {
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress}
    style={({ pressed }) => [styles.fab, { backgroundColor: color }, pressed && styles.pressed]}>
    <Ionicons name={icon} size={28} color={colors.onAccent} />
  </Pressable>;
}

const styles = StyleSheet.create({
  fab: { position: 'absolute', right: 16, bottom: 16, width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', elevation: 6 },
  pressed: { transform: [{ scale: 0.95 }] },
});

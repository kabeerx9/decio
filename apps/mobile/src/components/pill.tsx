import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleProp, StyleSheet, Text, ViewStyle } from 'react-native';

import { colors, fonts, radius } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;
type Props = {
  label: string; onPress?: () => void; color?: string; textColor?: string; icon?: IconName; trailingIcon?: IconName;
  disabled?: boolean; busy?: boolean; size?: 'md' | 'lg'; accessibilityLabel?: string; style?: StyleProp<ViewStyle>;
};

export function Pill({ label, onPress, color, textColor, icon, trailingIcon, disabled, busy, size = 'md', accessibilityLabel, style }: Props) {
  const foreground = textColor ?? (color ? colors.onAccent : colors.ink);
  const iconSize = size === 'lg' ? 20 : 16;
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityState={{ disabled: !!disabled || !!busy, busy: !!busy }}
    disabled={disabled || busy} onPress={onPress} hitSlop={size === 'md' ? 6 : 0}
    style={({ pressed }) => [styles.base, size === 'lg' ? styles.lg : styles.md, { backgroundColor: color ?? colors.surface2 }, disabled && !busy && styles.disabled, pressed && styles.pressed, style]}>
    {busy ? <ActivityIndicator color={foreground} size="small" /> : <>
      {icon && <Ionicons name={icon} size={iconSize} color={foreground} />}
      <Text style={[styles.text, size === 'lg' && styles.textLg, { color: foreground }]}>{label}</Text>
      {trailingIcon && <Ionicons name={trailingIcon} size={iconSize} color={foreground} />}
    </>}
  </Pressable>;
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  md: { height: 36, paddingHorizontal: 14 },
  lg: { height: 56, paddingHorizontal: 22 },
  text: { fontFamily: fonts.bold, fontSize: 13 },
  textLg: { fontSize: 16 },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
});

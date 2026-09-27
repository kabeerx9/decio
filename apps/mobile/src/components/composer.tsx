import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { colors, fonts } from '@/theme';

type Props = {
  value: string; onChangeText: (value: string) => void; onSend: () => void; sending: boolean;
  placeholder: string; accentColor: string; maxLength: number; label: string;
};

export function Composer({ value, onChangeText, onSend, sending, placeholder, accentColor, maxLength, label }: Props) {
  const blocked = !value.trim() || sending;
  return <View style={styles.root}>
    <TextInput accessibilityLabel={label} placeholder={placeholder} placeholderTextColor={colors.mute} value={value} onChangeText={onChangeText}
      multiline maxLength={maxLength} style={styles.input} />
    <Pressable accessibilityRole="button" accessibilityLabel={`Send ${label.toLowerCase()}`} disabled={blocked} onPress={onSend}
      style={[styles.send, { backgroundColor: accentColor }, blocked && styles.dim]}>
      {sending ? <ActivityIndicator color={colors.onAccent} size="small" /> : <Ionicons name="arrow-up" size={22} color={colors.onAccent} />}
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({
  root: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  input: { flex: 1, minHeight: 50, maxHeight: 120, borderRadius: 25, backgroundColor: colors.surface, color: colors.ink, fontFamily: fonts.body, fontSize: 15, paddingHorizontal: 18, paddingTop: 14, paddingBottom: 14 },
  send: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  dim: { opacity: 0.4 },
});

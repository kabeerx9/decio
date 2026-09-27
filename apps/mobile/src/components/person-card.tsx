import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Chip } from '@/components/chip';
import { Title } from '@/components/title';
import { Profile } from '@/lib/profile-api';
import { colors, fonts, radius } from '@/theme';

type Props = { person: Profile; width: number; onPress: () => void; action?: ReactNode; actionLabel?: string; onAction?: () => void };

// The card is one accessible element, so its nested action is also exposed as an accessibility action.
export function PersonCard({ person, width, onPress, action, actionLabel, onAction }: Props) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`Open ${person.displayName}'s profile`} onPress={onPress}
    accessibilityActions={actionLabel && onAction ? [{ name: 'action', label: actionLabel }] : undefined}
    onAccessibilityAction={(event) => { if (event.nativeEvent.actionName === 'action') onAction?.(); }}
    style={({ pressed }) => [styles.card, { width, height: Math.round(width * 1.44) }, pressed && styles.pressed]}>
    {person.imageUrl ? <Image source={{ uri: person.imageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} /> :
      <View style={[StyleSheet.absoluteFill, styles.fallback]}><Text style={[styles.initial, { fontSize: width * 0.6 }]}>{person.displayName.charAt(0).toUpperCase()}</Text></View>}
    <LinearGradient colors={['transparent', 'rgba(0,0,0,0.85)']} locations={[0.45, 1]} style={StyleSheet.absoluteFill} />
    <View style={styles.info}>
      <Title size={34} numberOfLines={1}>{person.displayName}</Title>
      {!!person.headline && <Text style={styles.headline} numberOfLines={2}>{person.headline}</Text>}
      {!!person.interests.length && <View style={styles.chips}>{person.interests.map((interest) => <Chip key={interest} label={interest} />)}</View>}
    </View>
    {action && <View style={styles.action}>{action}</View>}
  </Pressable>;
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surface },
  fallback: { backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  initial: { fontFamily: fonts.display, color: colors.mute },
  info: { position: 'absolute', left: 14, right: 14, bottom: 14 },
  headline: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18, color: colors.ink, opacity: 0.85, marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 8 },
  action: { position: 'absolute', top: 12, right: 12 },
  pressed: { transform: [{ scale: 0.98 }] },
});

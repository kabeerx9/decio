import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Title } from '@/components/title';
import { colors, fonts } from '@/theme';

type Props = { name: string; imageUrl?: string; subtitle?: string; onBack?: () => void };

export function Cover({ name, imageUrl, subtitle, onBack }: Props) {
  const insets = useSafeAreaInsets();
  return <View style={styles.cover}>
    {imageUrl ? <Image source={{ uri: imageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} accessibilityLabel={`${name}'s photo`} /> :
      <View style={[StyleSheet.absoluteFill, styles.fallback]}><Text style={styles.initial}>{name.charAt(0).toUpperCase()}</Text></View>}
    <LinearGradient colors={['rgba(13,13,14,0.45)', 'transparent', 'transparent', colors.bg]} locations={[0, 0.28, 0.5, 1]} style={StyleSheet.absoluteFill} />
    {onBack && <Pressable accessibilityRole="button" accessibilityLabel="Go back" hitSlop={8} onPress={onBack} style={[styles.back, { top: insets.top + 8 }]}>
      <Ionicons name="arrow-back" size={22} color={colors.ink} />
    </Pressable>}
    <View style={styles.info}>
      <Title size={56} numberOfLines={2}>{name}</Title>
      {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  cover: { height: 400, justifyContent: 'flex-end' },
  fallback: { backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  initial: { fontFamily: fonts.display, fontSize: 220, color: colors.mute },
  back: { position: 'absolute', left: 12, width: 44, height: 44, borderRadius: 22, backgroundColor: colors.scrim, alignItems: 'center', justifyContent: 'center' },
  info: { paddingHorizontal: 16, paddingBottom: 6 },
  subtitle: { fontFamily: fonts.medium, fontSize: 14, color: colors.ink, opacity: 0.8, marginTop: 4 },
});

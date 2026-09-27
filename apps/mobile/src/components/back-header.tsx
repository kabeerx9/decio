import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Title } from '@/components/title';
import { colors, fonts } from '@/theme';

export function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

type Props = { title: string; subtitle?: string; avatar?: { name: string; imageUrl?: string }; onTitlePress?: () => void; right?: ReactNode };

export function BackHeader({ title, subtitle, avatar, onTitlePress, right }: Props) {
  return <View style={styles.root}>
    <Pressable accessibilityRole="button" accessibilityLabel="Go back" hitSlop={8} onPress={goBack} style={styles.back}>
      <Ionicons name="arrow-back" size={22} color={colors.ink} />
    </Pressable>
    <Pressable disabled={!onTitlePress} accessibilityRole={onTitlePress ? 'button' : undefined} onPress={onTitlePress} style={styles.titleRow}>
      {avatar && <Avatar name={avatar.name} imageUrl={avatar.imageUrl} size={38} />}
      <View style={styles.flex}>
        {!!title && <Title size={24} numberOfLines={1}>{title}</Title>}
        {!!subtitle && <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>}
      </View>
    </Pressable>
    {right}
  </View>;
}

const styles = StyleSheet.create({
  root: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 6, paddingRight: 14 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  flex: { flex: 1, minWidth: 0 },
  subtitle: { fontFamily: fonts.body, fontSize: 12, color: colors.mute },
});

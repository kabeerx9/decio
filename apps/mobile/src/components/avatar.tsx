import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '@/theme';

type Props = { name: string; imageUrl?: string; size: number; radius?: number };

export function Avatar({ name, imageUrl, size, radius = Math.round(size * 0.32) }: Props) {
  const [failedURL, setFailedURL] = useState<string | null>(null);
  const shape = { width: size, height: size, borderRadius: radius };
  return <View style={[styles.root, shape]}>
    {!!imageUrl && failedURL !== imageUrl ? <Image source={{ uri: imageUrl }} style={shape} contentFit="cover" accessibilityLabel={`${name}'s profile photo`} onError={() => setFailedURL(imageUrl)} /> :
      <Text style={[styles.initial, { fontSize: Math.round(size * 0.42) }]}>{name.charAt(0).toUpperCase()}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.lilac, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  initial: { color: colors.ink, fontFamily: fonts.medium },
});

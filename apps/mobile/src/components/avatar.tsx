import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '@/theme';

type Props = { name: string; imageUrl?: string; size: number; ring?: string };

export function Avatar({ name, imageUrl, size, ring }: Props) {
  const [failedURL, setFailedURL] = useState<string | null>(null);
  const shape = { width: size, height: size, borderRadius: size / 2 };
  const face = <View style={[styles.root, shape]}>
    {!!imageUrl && failedURL !== imageUrl
      ? <Image source={{ uri: imageUrl }} style={shape} contentFit="cover" accessibilityLabel={`${name}'s profile photo`} onError={() => setFailedURL(imageUrl)} />
      : <Text style={[styles.initial, { fontSize: Math.round(size * 0.5) }]}>{name.charAt(0).toUpperCase()}</Text>}
  </View>;
  if (!ring) return face;
  const outer = size + 10;
  return <View style={[styles.ring, { width: outer, height: outer, borderRadius: outer / 2, backgroundColor: ring }]}>
    <View style={[styles.gap, { borderRadius: (size + 6) / 2 }]}>{face}</View>
  </View>;
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.surface2, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  initial: { color: colors.ink, fontFamily: fonts.display },
  ring: { alignItems: 'center', justifyContent: 'center' },
  gap: { padding: 3, backgroundColor: colors.bg },
});

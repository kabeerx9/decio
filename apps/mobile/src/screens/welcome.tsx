import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Chip } from '@/components/chip';
import { Pill } from '@/components/pill';
import { Screen } from '@/components/screen';
import { Title } from '@/components/title';
import { accent, colors, fonts } from '@/theme';

const tint = accent.people;
const sample = ['☕ coffee', '⚽ sunday football', '🎨 design', '🛍️ flea markets', '🎧 gigs'];

export function WelcomeScreen() {
  return <Screen edges={['top', 'bottom']}>
    <View style={styles.root}>
      <View style={styles.brand}>
        <Image source={require('../../assets/images/brand-mark.png')} style={styles.mark} contentFit="contain" accessibilityLabel="Decio logo" />
        <Text style={styles.wordmark}>DECIO</Text>
      </View>
      <View>
        <Title size={84} dot={tint}>{'meet\npeople\nnearby'}</Title>
        <View style={styles.chips}>{sample.map((label) => <Chip key={label} label={label} />)}</View>
      </View>
      <View style={styles.actions}>
        <Pill size="lg" label="get started" color={tint} trailingIcon="arrow-forward" onPress={() => router.push('/sign-in')} style={styles.cta} />
        <Pressable accessibilityRole="button" onPress={() => router.push('/sign-in')} style={styles.signIn}>
          <Text style={styles.signInText}>already here? <Text style={{ color: tint }}>sign in</Text></Text>
        </Pressable>
      </View>
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mark: { width: 32, height: 32 },
  wordmark: { color: colors.ink, fontFamily: fonts.display, fontSize: 26 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 18 },
  actions: { gap: 4 },
  cta: { alignSelf: 'stretch' },
  signIn: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  signInText: { color: colors.mute, fontFamily: fonts.medium, fontSize: 14 },
});

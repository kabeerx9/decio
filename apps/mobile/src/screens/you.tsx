import { useUser } from '@clerk/expo';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Chip } from '@/components/chip';
import { Cover } from '@/components/cover';
import { Pill } from '@/components/pill';
import { Screen } from '@/components/screen';
import { useConnections } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { accent, colors, fonts, radius } from '@/theme';

const tint = accent.you;

export function You() {
  const { profile, signOutLocal } = useSession();
  const { user } = useUser();
  const connections = useConnections();
  const connected = connections.data?.filter((item) => item.status === 'accepted').length ?? 0;
  const pending = connections.data?.filter((item) => item.status !== 'accepted').length ?? 0;
  const imageUrl = user ? (user.hasImage ? user.imageUrl : '') : profile.imageUrl;

  return <Screen edges={[]}>
    <ScrollView contentContainerStyle={styles.content}>
      <Cover name={profile.displayName} imageUrl={imageUrl} subtitle={profile.headline} />
      <View style={styles.actions}>
        <Pill label="edit" icon="pencil" color={tint} onPress={() => router.push('/profile-edit')} />
        {!!profile.city && <Chip label={`📍 ${profile.city}`} />}
      </View>
      {!!profile.bio && <Text style={styles.bio}>{profile.bio}</Text>}
      {!!profile.interests.length && <View style={styles.chips}>{profile.interests.map((interest) => <Chip key={interest} label={interest} />)}</View>}
      <View style={styles.stats}>
        <View style={styles.stat}><Text style={styles.statValue}>{connected}</Text><Text style={styles.statLabel}>connected</Text></View>
        <View style={styles.stat}><Text style={styles.statValue}>{pending}</Text><Text style={styles.statLabel}>pending</Text></View>
      </View>
      <View style={styles.row}><Text style={styles.rowLabel}>email</Text><Text style={styles.rowValue} numberOfLines={1}>{user?.primaryEmailAddress?.emailAddress ?? ''}</Text></View>
      <Pressable accessibilityRole="button" onPress={signOutLocal} style={styles.row}><Text style={styles.signOut}>sign out</Text></Pressable>
    </ScrollView>
  </Screen>;
}

const styles = StyleSheet.create({
  content: { paddingBottom: 24 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  bio: { color: colors.ink, fontFamily: fonts.body, fontSize: 16, lineHeight: 23, paddingHorizontal: 16, paddingTop: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 16, paddingTop: 14 },
  stats: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 18 },
  stat: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.md, padding: 14 },
  statValue: { color: colors.ink, fontFamily: fonts.display, fontSize: 34, lineHeight: 36 },
  statLabel: { color: colors.mute, fontFamily: fonts.bold, fontSize: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginHorizontal: 16, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line, minHeight: 52 },
  rowLabel: { color: colors.mute, fontFamily: fonts.body, fontSize: 14 },
  rowValue: { color: colors.ink, fontFamily: fonts.medium, fontSize: 14, flexShrink: 1 },
  signOut: { color: colors.danger, fontFamily: fonts.bold, fontSize: 14 },
});

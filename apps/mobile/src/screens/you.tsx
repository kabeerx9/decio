import { Ionicons } from '@expo/vector-icons';
import { useUser } from '@clerk/expo';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Chip } from '@/components/chip';
import { Cover } from '@/components/cover';
import { Pill } from '@/components/pill';
import { Screen } from '@/components/screen';
import { confirmSignOut } from '@/lib/confirm';
import { useConnections } from '@/lib/queries';
import { splitConnections } from '@/lib/selectors';
import { useSession } from '@/lib/session';
import { accent, colors, fonts, radius } from '@/theme';

const tint = accent.you;

export function You() {
  const { profile, signOutLocal } = useSession();
  const { user } = useUser();
  const connections = useConnections();
  const { connected, incoming, sent } = splitConnections(connections.data);
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
        <Stat value={connected.length} label="connected" onPress={() => router.push('/connections?tab=connected')} />
        <Stat value={incoming.length + sent.length} label="pending" hint={incoming.length ? `● ${incoming.length} new` : undefined}
          onPress={() => router.push('/connections?tab=pending')} />
      </View>
      <View style={styles.row}><Text style={styles.rowLabel}>email</Text><Text style={styles.rowValue} numberOfLines={1}>{user?.primaryEmailAddress?.emailAddress ?? ''}</Text></View>
      <Pressable accessibilityRole="button" onPress={() => confirmSignOut(signOutLocal)} style={styles.row}><Text style={styles.signOut}>sign out</Text></Pressable>
    </ScrollView>
  </Screen>;
}

function Stat({ value, label, hint, onPress }: { value: number; label: string; hint?: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${value} ${label}${hint ? `, ${hint.slice(2)}` : ''}. Open list`} onPress={onPress}
    style={({ pressed }) => [styles.stat, pressed && styles.pressed]}>
    <Ionicons name="chevron-forward" size={16} color={colors.mute} style={styles.chevron} />
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statLabel}>{label}{!!hint && <Text style={styles.hint}>  {hint}</Text>}</Text>
  </Pressable>;
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
  hint: { color: tint },
  chevron: { position: 'absolute', top: 14, right: 12 },
  pressed: { opacity: 0.85 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginHorizontal: 16, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line, minHeight: 52 },
  rowLabel: { color: colors.mute, fontFamily: fonts.body, fontSize: 14 },
  rowValue: { color: colors.ink, fontFamily: fonts.medium, fontSize: 14, flexShrink: 1 },
  signOut: { color: colors.danger, fontFamily: fonts.bold, fontSize: 14 },
});

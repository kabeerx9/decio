import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Pill } from '@/components/pill';
import { timeAgo } from '@/lib/format';
import { CityPost, postPhotoURL } from '@/lib/posts-api';
import { useSession } from '@/lib/session';
import { colors, fonts, radius } from '@/theme';

const SHOUT_MAX = 80;
type Props = { post: CityPost; photoToken: string | null; accentColor: string; onPress?: () => void };

export function PostCard({ post, photoToken, accentColor, onPress }: Props) {
  const { apiUrl } = useSession();
  const shout = !post.hasPhoto && [...post.body].length <= SHOUT_MAX;
  const byline = (onAccent: boolean) => <View style={styles.by}>
    <Avatar name={post.authorName} imageUrl={post.authorImageUrl} size={26} />
    <Text style={[styles.author, onAccent && styles.onAccent]} numberOfLines={1}>{post.authorName}</Text>
    <Text style={[styles.time, onAccent && styles.onAccentMuted]}>{timeAgo(post.createdAt)}</Text>
  </View>;
  const reply = onPress && <Pill label="reply" onPress={onPress} color={shout ? colors.onAccent : undefined} textColor={shout ? accentColor : undefined} accessibilityLabel={`Reply to ${post.authorName}`} />;

  return <Pressable accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={onPress ? `Open ${post.authorName}'s post` : undefined} disabled={!onPress} onPress={onPress}
    style={({ pressed }) => [styles.card, shout && { backgroundColor: accentColor }, pressed && styles.pressed]}>
    {post.hasPhoto && <View style={styles.photo}>
      {photoToken && <Image source={{ uri: postPhotoURL(apiUrl, post.id), headers: { Authorization: `Bearer ${photoToken}` } }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} accessibilityLabel={`Photo by ${post.authorName}`} />}
      <View style={styles.overlay}>{byline(false)}</View>
    </View>}
    <View style={styles.body}>
      {!post.hasPhoto && byline(shout)}
      <Text style={shout ? styles.shout : styles.text}>{shout ? post.body.toUpperCase() : post.body}</Text>
      {reply && <View style={styles.footer}>{reply}</View>}
    </View>
  </Pressable>;
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 12, marginBottom: 12, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surface },
  photo: { height: 250, backgroundColor: colors.surface2 },
  overlay: { position: 'absolute', left: 12, top: 12, backgroundColor: colors.scrim, borderRadius: radius.pill, paddingVertical: 4, paddingLeft: 4, paddingRight: 12 },
  body: { padding: 16, gap: 10 },
  by: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  author: { fontFamily: fonts.bold, fontSize: 13, color: colors.ink, flexShrink: 1 },
  time: { fontFamily: fonts.body, fontSize: 12, color: colors.mute },
  onAccent: { color: colors.onAccent },
  onAccentMuted: { color: 'rgba(17,17,17,0.6)' },
  text: { fontFamily: fonts.medium, fontSize: 17, lineHeight: 23, color: colors.ink },
  shout: { fontFamily: fonts.display, fontSize: 36, lineHeight: 36, color: colors.onAccent },
  footer: { flexDirection: 'row' },
  pressed: { transform: [{ scale: 0.98 }] },
});

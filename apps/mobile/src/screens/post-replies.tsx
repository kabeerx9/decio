import { Ionicons } from '@expo/vector-icons';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { CityPost, createPostReply, fetchPostReplies, postPhotoURL } from '@/lib/posts-api';
import { SessionExpiredError } from '@/lib/profile-api';
import { Avatar } from '@/components/avatar';
import { colors, fonts } from '@/theme';

type Props = {
  apiUrl: string; userId: string; post: CityPost; imageToken: string | null;
  getToken: () => Promise<string | null>; onBack: () => void; onSessionExpired: () => void;
};

export function PostReplies({ apiUrl, userId, post, imageToken, getToken, onBack, onSessionExpired }: Props) {
  const [draft, setDraft] = useState('');
  const queryClient = useQueryClient();
  const replies = useInfiniteQuery({
    queryKey: ['postReplies', userId, post.id], initialPageParam: '',
    queryFn: ({ pageParam }) => fetchPostReplies(apiUrl, getToken, post.id, pageParam),
    getNextPageParam: (page) => page.nextCursor || undefined,
    retry: (failures, failure) => !(failure instanceof SessionExpiredError) && failures < 1,
  });
  const send = useMutation({
    mutationFn: () => createPostReply(apiUrl, getToken, post.id, draft),
    onSuccess: async () => {
      setDraft('');
      await queryClient.invalidateQueries({ queryKey: ['postReplies', userId, post.id] });
    },
  });
  useEffect(() => {
    if (replies.error instanceof SessionExpiredError || send.error instanceof SessionExpiredError) onSessionExpired();
  }, [replies.error, send.error, onSessionExpired]);
  const items = replies.data?.pages.flatMap((page) => page.replies) ?? [];

  return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.page}>
    <View style={styles.header}><Pressable accessibilityRole="button" accessibilityLabel="Back to city feed" onPress={onBack} style={styles.back}><Ionicons name="arrow-back" size={22} color={colors.ink} /></Pressable><Text style={styles.title}>Post replies</Text></View>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.post}>
        <View style={styles.postAuthor}><Avatar name={post.authorName} imageUrl={post.authorImageUrl} size={40} radius={14} /><View><Text style={styles.author}>{post.authorName}</Text><Text style={styles.meta}>{new Date(post.createdAt).toLocaleDateString()} · {post.city}</Text></View></View>
        <Text style={styles.body}>{post.body}</Text>
        {post.hasPhoto && imageToken && <Image source={{ uri: postPhotoURL(apiUrl, post.id), headers: { Authorization: `Bearer ${imageToken}` } }} style={styles.photo} contentFit="cover" accessibilityLabel={`Photo by ${post.authorName}`} />}
      </View>
      <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Conversation</Text><Pressable accessibilityRole="button" accessibilityLabel="Refresh replies" onPress={() => void replies.refetch()}><Ionicons name="refresh" size={20} color={colors.accent} /></Pressable></View>
      {replies.isPending ? <ActivityIndicator color={colors.accent} style={styles.loading} /> : replies.error ?
        <View><Text accessibilityRole="alert" style={styles.error}>{replies.error.message}</Text><Pressable accessibilityRole="button" onPress={() => void replies.refetch()}><Text style={styles.link}>Try again</Text></Pressable></View> :
        items.length === 0 ? <Text style={styles.empty}>No replies yet. Start the conversation.</Text> : items.map((reply) =>
          <View key={reply.id} style={styles.reply}><Avatar name={reply.authorName} imageUrl={reply.authorImageUrl} size={38} radius={13} /><View style={styles.replyContent}><View style={styles.replyHeading}><Text style={styles.author}>{reply.authorName}</Text><Text style={styles.meta}>{new Date(reply.createdAt).toLocaleDateString()}</Text></View><Text style={styles.replyBody}>{reply.body}</Text></View></View>)}
      {replies.hasNextPage && <Pressable accessibilityRole="button" disabled={replies.isFetchingNextPage} onPress={() => void replies.fetchNextPage()} style={styles.more}><Text style={styles.link}>{replies.isFetchingNextPage ? 'Loading…' : 'Load more replies'}</Text></Pressable>}
    </ScrollView>
    {!!send.error && <Text accessibilityRole="alert" style={styles.error}>{send.error.message}</Text>}
    <View style={styles.composer}><TextInput accessibilityLabel="Write a reply" placeholder="Write a reply…" placeholderTextColor={colors.muted} value={draft} onChangeText={setDraft} multiline maxLength={1000} style={styles.input} /><Pressable accessibilityRole="button" accessibilityLabel="Send reply" disabled={!draft.trim() || send.isPending} onPress={() => send.mutate()} style={[styles.send, (!draft.trim() || send.isPending) && styles.disabled]}><Ionicons name="arrow-up" size={21} color={colors.white} /></Pressable></View>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.paper }, header: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, borderBottomWidth: 1, borderColor: colors.line }, back: { padding: 8 }, title: { color: colors.ink, fontFamily: fonts.display, fontSize: 22 },
  content: { paddingHorizontal: 22, paddingTop: 22, paddingBottom: 35 }, post: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 18, padding: 18 }, postAuthor: { flexDirection: 'row', alignItems: 'center', gap: 10 }, author: { color: colors.ink, fontFamily: fonts.medium, fontSize: 14 }, meta: { color: colors.muted, fontFamily: fonts.body, fontSize: 11 }, body: { color: colors.ink, fontFamily: fonts.body, fontSize: 16, lineHeight: 24, marginTop: 15 }, photo: { height: 220, borderRadius: 12, marginTop: 14 },
  sectionHeading: { marginTop: 29, marginBottom: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, sectionTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 22 }, loading: { marginTop: 20 }, empty: { color: colors.muted, fontFamily: fonts.body, fontSize: 14, marginTop: 12 },
  reply: { flexDirection: 'row', gap: 11, paddingVertical: 15, borderBottomWidth: 1, borderColor: colors.line }, avatar: { width: 38, height: 38, borderRadius: 13, backgroundColor: colors.lilac, alignItems: 'center', justifyContent: 'center' }, avatarText: { color: colors.ink, fontFamily: fonts.medium, fontSize: 16 }, replyContent: { flex: 1 }, replyHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, replyBody: { color: colors.ink, fontFamily: fonts.body, fontSize: 14, lineHeight: 21, marginTop: 5 },
  more: { alignItems: 'center', padding: 17 }, link: { color: colors.accent, fontFamily: fonts.medium, fontSize: 13 }, error: { color: '#B42318', fontFamily: fonts.body, fontSize: 13, paddingHorizontal: 22, paddingVertical: 8 }, composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, padding: 12, borderTopWidth: 1, borderColor: colors.line, backgroundColor: colors.white }, input: { flex: 1, minHeight: 43, maxHeight: 110, borderRadius: 17, backgroundColor: colors.paper, color: colors.ink, fontFamily: fonts.body, fontSize: 14, paddingHorizontal: 14, paddingTop: 11, paddingBottom: 10 }, send: { width: 43, height: 43, borderRadius: 14, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }, disabled: { opacity: 0.45 },
});

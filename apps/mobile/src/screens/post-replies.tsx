import { InfiniteData, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';

import { Avatar } from '@/components/avatar';
import { BackHeader, goBack } from '@/components/back-header';
import { Composer } from '@/components/composer';
import { EmptyState } from '@/components/empty-state';
import { Pill } from '@/components/pill';
import { PostCard } from '@/components/post-card';
import { Screen } from '@/components/screen';
import { timeAgo } from '@/lib/format';
import { createPostReply, fetchPostReplies, PostPage } from '@/lib/posts-api';
import { usePhotoToken, usePullRefresh } from '@/lib/queries';
import { findCachedPost, retryUnlessExpired, uniqueById } from '@/lib/selectors';
import { useSession, useSignOutOnExpiry } from '@/lib/session';
import { accent, colors, fonts } from '@/theme';

const tint = accent.city;

export function PostReplies({ id }: { id: string }) {
  const { apiUrl, userId, getToken, profile } = useSession();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  // Snapshot once: a later feed refetch can shift this post off the cached pages mid-reply.
  const [post] = useState(() => findCachedPost(queryClient.getQueryData<InfiniteData<PostPage>>(['posts', userId, profile.city]), id));
  const photoToken = usePhotoToken();
  const replies = useInfiniteQuery({
    queryKey: ['postReplies', userId, id],
    initialPageParam: '',
    queryFn: ({ pageParam }) => fetchPostReplies(apiUrl, getToken, id, pageParam),
    getNextPageParam: (page) => page.nextCursor || undefined,
    retry: retryUnlessExpired,
    enabled: !!post,
  });
  const send = useMutation({
    mutationFn: () => createPostReply(apiUrl, getToken, id, draft),
    onSuccess: async () => {
      setDraft('');
      await queryClient.invalidateQueries({ queryKey: ['postReplies', userId, id] });
    },
  });
  useSignOutOnExpiry(replies.error, send.error);
  const pull = usePullRefresh(() => replies.refetch());

  if (!post) return <Screen edges={['top', 'bottom']}>
    <BackHeader title="post" />
    <EmptyState emoji="🫥" title="post not available" body="it may have dropped out of your feed. go back and refresh." action={<Pill label="back" onPress={goBack} />} />
  </Screen>;

  const items = uniqueById(replies.data?.pages.flatMap((page) => page.replies) ?? []);
  return <Screen edges={['top', 'bottom']}>
    <KeyboardAvoidingView behavior="padding" style={styles.flex}>
      <BackHeader title="replies" />
      <FlatList data={items} keyExtractor={(reply) => reply.id} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.list}
        ListHeaderComponent={<PostCard post={post} photoToken={photoToken} accentColor={tint} />}
        refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} colors={[colors.onAccent]} progressBackgroundColor={tint} />}
        onEndReached={() => { if (replies.hasNextPage && !replies.isFetchingNextPage) void replies.fetchNextPage(); }}
        ListEmptyComponent={replies.isPending ? <ActivityIndicator color={tint} style={styles.loading} /> : replies.error ?
          <EmptyState emoji="⚠️" title="couldn't load" body={replies.error.message} action={<Pill label="try again" onPress={() => void replies.refetch()} />} /> :
          <Text style={styles.empty}>no replies yet. say something 👋</Text>}
        renderItem={({ item }) => <View style={styles.reply}>
          <Avatar name={item.authorName} imageUrl={item.authorImageUrl} size={34} />
          <View style={styles.flex}>
            <View style={styles.replyHead}><Text style={styles.author} numberOfLines={1}>{item.authorName}</Text><Text style={styles.time}>{timeAgo(item.createdAt)}</Text></View>
            <Text style={styles.body}>{item.body}</Text>
          </View>
        </View>} />
      {!!send.error && <Text accessibilityRole="alert" style={styles.error}>{send.error.message}</Text>}
      <Composer value={draft} onChangeText={setDraft} onSend={() => send.mutate()} sending={send.isPending} placeholder="reply…" accentColor={tint} maxLength={1000} label="Reply" />
    </KeyboardAvoidingView>
  </Screen>;
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  list: { paddingBottom: 12 },
  loading: { marginTop: 24 },
  empty: { color: colors.mute, fontFamily: fonts.body, fontSize: 14, paddingHorizontal: 16, paddingTop: 8 },
  reply: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingVertical: 10 },
  replyHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  author: { color: colors.ink, fontFamily: fonts.bold, fontSize: 14, flexShrink: 1 },
  time: { color: colors.mute, fontFamily: fonts.body, fontSize: 12 },
  body: { color: colors.ink, fontFamily: fonts.body, fontSize: 15, lineHeight: 21, marginTop: 2 },
  error: { color: colors.danger, fontFamily: fonts.body, fontSize: 13, paddingHorizontal: 16, paddingBottom: 4 },
});

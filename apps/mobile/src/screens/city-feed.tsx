import { router, useScrollToTop } from 'expo-router';
import { useRef } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { Fab } from '@/components/fab';
import { Pill } from '@/components/pill';
import { PostCard } from '@/components/post-card';
import { Screen } from '@/components/screen';
import { Title } from '@/components/title';
import { CityPost } from '@/lib/posts-api';
import { useCityFeed, usePhotoToken, usePullRefresh } from '@/lib/queries';
import { uniqueById } from '@/lib/selectors';
import { useSession } from '@/lib/session';
import { accent, colors } from '@/theme';

const tint = accent.city;

export function CityFeed() {
  const { profile } = useSession();
  const feed = useCityFeed();
  const photoToken = usePhotoToken();
  const list = useRef<FlatList<CityPost>>(null);
  const pull = usePullRefresh(() => feed.refetch());
  useScrollToTop(list);

  if (!profile.city) return <Screen>
    <EmptyState emoji="📍" title="pick a city" body="your feed follows the city on your profile"
      action={<Pill label="edit profile" color={tint} onPress={() => router.push('/profile-edit')} />} />
  </Screen>;

  const posts = uniqueById(feed.data?.pages.flatMap((page) => page.posts) ?? []);
  return <Screen>
    <FlatList ref={list} data={posts} keyExtractor={(post) => post.id} contentContainerStyle={styles.list}
      ListHeaderComponent={<Title size={44} dot={tint} style={styles.title}>right now</Title>}
      refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} colors={[colors.onAccent]} progressBackgroundColor={tint} />}
      onEndReached={() => { if (feed.hasNextPage && !feed.isFetchingNextPage) void feed.fetchNextPage(); }} onEndReachedThreshold={0.6}
      ListEmptyComponent={feed.isPending ? <ActivityIndicator color={tint} style={styles.loading} /> : feed.error ?
        <EmptyState emoji="⚠️" title="couldn't load" body={feed.error.message} action={<Pill label="try again" onPress={() => void feed.refetch()} />} /> :
        <EmptyState emoji="🗞️" title="nothing yet" body={`be the first to post in ${profile.city}`} />}
      ListFooterComponent={feed.isFetchingNextPage ? <ActivityIndicator color={tint} style={styles.more} /> : null}
      renderItem={({ item }) => <PostCard post={item} photoToken={photoToken} accentColor={tint} onPress={() => router.push(`/post/${item.id}`)} />} />
    <Fab color={tint} icon="add" accessibilityLabel="New post" onPress={() => router.push('/compose')} />
  </Screen>;
}

const styles = StyleSheet.create({
  list: { paddingBottom: 96 },
  title: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12 },
  loading: { marginTop: 60 },
  more: { marginVertical: 20 },
});

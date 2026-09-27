import { Ionicons } from '@expo/vector-icons';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { router, useScrollToTop } from 'expo-router';
import { ReactNode, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { EmptyState } from '@/components/empty-state';
import { PersonCard } from '@/components/person-card';
import { Pill } from '@/components/pill';
import { Screen } from '@/components/screen';
import { Title } from '@/components/title';
import { acceptConnection, Connection, requestConnection } from '@/lib/connections-api';
import { searchPeople } from '@/lib/people-api';
import { Profile } from '@/lib/profile-api';
import { useConnections, usePullRefresh } from '@/lib/queries';
import { success } from '@/lib/haptics';
import { groupConnections, retryUnlessExpired, uniqueById } from '@/lib/selectors';
import { useSession, useSignOutOnExpiry } from '@/lib/session';
import { accent, colors, fonts } from '@/theme';

const tint = accent.people;
type Row = { key: string; person: Profile; status?: Connection['status'] };

export function PeopleDiscover() {
  const { apiUrl, userId, getToken, profile } = useSession();
  const queryClient = useQueryClient();
  const [searching, setSearching] = useState(false);
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const list = useRef<FlatList<Row>>(null);
  useScrollToTop(list);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(draft.trim()), 300);
    return () => clearTimeout(timer);
  }, [draft]);

  const people = useInfiniteQuery({
    queryKey: ['people', userId, query],
    initialPageParam: '',
    queryFn: ({ pageParam }) => searchPeople(apiUrl, getToken, query, pageParam),
    getNextPageParam: (lastPage) => lastPage.nextCursor || undefined,
    retry: retryUnlessExpired,
  });
  const connections = useConnections();
  const connect = useMutation({
    mutationFn: ({ kind, id }: { kind: 'request' | 'accept'; id: string }) =>
      kind === 'request' ? requestConnection(apiUrl, getToken, id) : acceptConnection(apiUrl, getToken, id),
    onSuccess: () => { success(); return queryClient.invalidateQueries({ queryKey: ['connections', userId] }); },
  });
  useSignOutOnExpiry(people.error, connect.error);

  const statusOf = (id: string) => connections.data?.find((item) => item.other.id === id)?.status;
  const { incoming, circle } = groupConnections(connections.data);
  const found = uniqueById(people.data?.pages.flatMap((page) => page.people) ?? []);
  const suggestions = found.filter((person) => !statusOf(person.id));
  const rows: Row[] = query
    ? found.map((person) => ({ key: person.id, person, status: statusOf(person.id) }))
    : circle.map((item) => ({ key: item.other.id, person: item.other, status: item.status }));
  const blocked = connect.isPending || connections.isPending || !!connections.error;
  const act = (id: string) => connect.mutate({ kind: statusOf(id) === 'incoming' ? 'accept' : 'request', id });
  const loadMore = () => { if (people.hasNextPage && !people.isFetchingNextPage) void people.fetchNextPage(); };
  const refresh = () => { void people.refetch(); void connections.refetch(); };
  const pull = usePullRefresh(() => Promise.all([people.refetch(), connections.refetch()]));
  const toggleSearch = () => { setSearching((open) => !open); setDraft(''); setQuery(''); };

  const header = <View>
    <View style={styles.top}>
      <Title size={44} dot={tint} numberOfLines={1} style={styles.flex}>{profile.city || 'people'}</Title>
      <Pressable accessibilityRole="button" accessibilityLabel={searching ? 'Close search' : 'Search people'} hitSlop={4} onPress={toggleSearch} style={styles.iconButton}>
        <Ionicons name={searching ? 'close' : 'search'} size={20} color={colors.ink} />
      </Pressable>
    </View>
    {searching && <View style={styles.search}>
      <Ionicons name="search" size={18} color={colors.mute} />
      <TextInput autoFocus accessibilityLabel="Search people" placeholder="name, city or headline" placeholderTextColor={colors.mute}
        value={draft} onChangeText={setDraft} autoCorrect={false} returnKeyType="search" style={styles.searchInput} />
    </View>}
    {!!connect.error && <Text accessibilityRole="alert" style={styles.error}>{connect.error.message}</Text>}
    {!query && <>
      {incoming.map(({ other }) => <Pressable key={other.id} accessibilityRole="button" accessibilityLabel={`${other.displayName} wants to connect. Open profile`}
        accessibilityActions={[{ name: 'accept', label: `Accept ${other.displayName}` }]} onAccessibilityAction={(event) => { if (event.nativeEvent.actionName === 'accept' && !blocked) act(other.id); }}
        onPress={() => router.push(`/person/${other.id}`)} style={styles.request}>
        <Avatar name={other.displayName} imageUrl={other.imageUrl} size={46} ring={tint} />
        <View style={styles.flex}>
          <Text style={styles.name} numberOfLines={1}>{other.displayName}</Text>
          <Text style={[styles.meta, { color: tint }]}>wants in</Text>
        </View>
        <Pill label="accept" color={tint} disabled={blocked} onPress={() => act(other.id)} accessibilityLabel={`Accept ${other.displayName}`} />
      </Pressable>)}
      {people.isPending ? <ActivityIndicator color={tint} style={styles.loading} /> :
        people.error ? <EmptyState emoji="⚠️" title="couldn't load" body={people.error.message} action={<Pill label="try again" onPress={refresh} />} /> :
          suggestions.length === 0 ? <EmptyState emoji="🌱" title="quiet here" body={found.length ? "you've met everyone so far" : 'no one new yet. check back soon'} /> :
            <FlatList horizontal data={suggestions} keyExtractor={(person) => person.id} showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.cards} onEndReached={loadMore} onEndReachedThreshold={0.5}
              renderItem={({ item }) => <PersonCard person={item} width={236} onPress={() => router.push(`/person/${item.id}`)}
                actionLabel={`Connect with ${item.displayName}`} onAction={blocked ? undefined : () => act(item.id)}
                action={<Pressable accessibilityRole="button" accessibilityLabel={`Connect with ${item.displayName}`} disabled={blocked}
                  onPress={() => act(item.id)} style={[styles.plus, blocked && styles.dim]}>
                  {connect.isPending && connect.variables?.id === item.id ? <ActivityIndicator color={colors.onAccent} /> : <Ionicons name="add" size={24} color={colors.onAccent} />}
                </Pressable>} />} />}
      {circle.length > 0 && <View style={styles.sectionHead}><Title size={26}>your people</Title><Text style={styles.meta}>{circle.length}</Text></View>}
    </>}
  </View>;

  return <Screen>
    <FlatList ref={list} data={rows} keyExtractor={(row) => row.key} ListHeaderComponent={header} contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} colors={[colors.onAccent]} progressBackgroundColor={tint} />}
      onEndReached={query ? loadMore : undefined} onEndReachedThreshold={0.5}
      ListEmptyComponent={!query ? null : people.isPending ? <ActivityIndicator color={tint} style={styles.loading} /> :
        people.error ? <EmptyState emoji="⚠️" title="couldn't search" body={people.error.message} action={<Pill label="try again" onPress={refresh} />} /> :
          <EmptyState emoji="🔍" title="no one" body={`nobody matches "${query}"`} />}
      renderItem={({ item }) => <PersonRow person={item.person} trailing={
        item.status === 'accepted' ? <Text style={styles.meta}>connected</Text> :
          item.status === 'sent' ? <Text style={styles.meta}>sent</Text> :
            query ? <Pill label={item.status === 'incoming' ? 'accept' : 'connect'} color={tint} disabled={blocked} onPress={() => act(item.person.id)} /> : null} />} />
  </Screen>;
}

function PersonRow({ person, trailing }: { person: Profile; trailing: ReactNode }) {
  const detail = [person.headline, person.city].filter(Boolean).join(' · ');
  return <Pressable accessibilityRole="button" accessibilityLabel={`Open ${person.displayName}'s profile`} onPress={() => router.push(`/person/${person.id}`)} style={styles.row}>
    <Avatar name={person.displayName} imageUrl={person.imageUrl} size={44} />
    <View style={styles.flex}>
      <Text style={styles.name} numberOfLines={1}>{person.displayName}</Text>
      {!!detail && <Text style={styles.meta} numberOfLines={1}>{detail}</Text>}
    </View>
    {trailing}
  </Pressable>;
}

const styles = StyleSheet.create({
  list: { paddingBottom: 24 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  flex: { flex: 1, minWidth: 0 },
  iconButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  search: { marginHorizontal: 16, marginBottom: 8, height: 50, borderRadius: 25, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 },
  searchInput: { flex: 1, color: colors.ink, fontFamily: fonts.body, fontSize: 15 },
  request: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
  name: { color: colors.ink, fontFamily: fonts.bold, fontSize: 15 },
  meta: { color: colors.mute, fontFamily: fonts.body, fontSize: 13, marginTop: 2 },
  error: { color: colors.danger, fontFamily: fonts.body, fontSize: 13, paddingHorizontal: 16, paddingVertical: 6 },
  loading: { marginVertical: 40 },
  cards: { gap: 10, paddingHorizontal: 16, paddingVertical: 12 },
  plus: { width: 46, height: 46, borderRadius: 23, backgroundColor: tint, alignItems: 'center', justifyContent: 'center' },
  dim: { opacity: 0.4 },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10, minHeight: 64 },
});

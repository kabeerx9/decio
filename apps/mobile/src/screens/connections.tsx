import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ReactNode, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { goBack } from '@/components/back-header';
import { EmptyState } from '@/components/empty-state';
import { Pill } from '@/components/pill';
import { Screen } from '@/components/screen';
import { Title } from '@/components/title';
import { Connection } from '@/lib/connections-api';
import { useConnectionAction, useConnections, usePullRefresh } from '@/lib/queries';
import { splitConnections } from '@/lib/selectors';
import { accent, colors, fonts, radius } from '@/theme';

const tint = accent.you;
export type ConnectionsTab = 'connected' | 'pending';
type Row = { kind: 'section'; key: string; title: string; count: number } | { kind: 'person'; key: string; item: Connection };

export function ConnectionsScreen({ initialTab }: { initialTab: ConnectionsTab }) {
  const [tab, setTab] = useState(initialTab);
  const connections = useConnections();
  const action = useConnectionAction();
  const pull = usePullRefresh(() => connections.refetch());
  const { connected, incoming, sent } = splitConnections(connections.data);
  const pending = incoming.length + sent.length;
  const busyFor = (id: string) => action.isPending && action.variables?.id === id;

  const rows: Row[] = tab === 'connected'
    ? connected.map((item) => ({ kind: 'person', key: item.other.id, item }))
    : [
      ...(incoming.length ? [{ kind: 'section', key: 's-in', title: 'wants in', count: incoming.length } as const] : []),
      ...incoming.map((item) => ({ kind: 'person', key: item.other.id, item }) as const),
      ...(sent.length ? [{ kind: 'section', key: 's-sent', title: 'you sent', count: sent.length } as const] : []),
      ...sent.map((item) => ({ kind: 'person', key: item.other.id, item }) as const),
    ];

  const trailing = ({ other, status, unreadCount }: Connection): ReactNode => {
    if (status === 'accepted') return <Pressable accessibilityRole="button" accessibilityLabel={`Message ${other.displayName}`} hitSlop={6}
      onPress={() => router.push(`/chat/${other.id}`)} style={styles.chat}>
      {unreadCount > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{unreadCount}</Text></View>}
      <Ionicons name="chatbubble-outline" size={20} color={colors.mute} />
    </Pressable>;
    if (status === 'sent') return <Pill label="unsend" busy={busyFor(other.id)} disabled={action.isPending}
      accessibilityLabel={`Unsend request to ${other.displayName}`} onPress={() => action.mutate({ kind: 'remove', id: other.id })} />;
    return <View style={styles.pair}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Decline ${other.displayName}`} hitSlop={6} disabled={action.isPending}
        onPress={() => action.mutate({ kind: 'remove', id: other.id })} style={[styles.decline, action.isPending && styles.dim]}>
        {busyFor(other.id) && action.variables?.kind === 'remove' ? <ActivityIndicator color={colors.mute} size="small" /> : <Ionicons name="close" size={18} color={colors.mute} />}
      </Pressable>
      <Pill label="accept" color={tint} busy={busyFor(other.id) && action.variables?.kind === 'accept'} disabled={action.isPending}
        accessibilityLabel={`Accept ${other.displayName}`} onPress={() => action.mutate({ kind: 'accept', id: other.id })} />
    </View>;
  };

  const header = <View>
    <View style={styles.top}>
      <Pressable accessibilityRole="button" accessibilityLabel="Go back" hitSlop={8} onPress={goBack} style={styles.back}>
        <Ionicons name="arrow-back" size={22} color={colors.ink} />
      </Pressable>
      <Title size={40} dot={tint} numberOfLines={1} style={styles.flex}>your people</Title>
    </View>
    <View style={styles.segments} accessibilityRole="tablist">
      {([['connected', connected.length], ['pending', pending]] as const).map(([key, count]) =>
        <Pressable key={key} accessibilityRole="tab" accessibilityState={{ selected: tab === key }} onPress={() => setTab(key)}
          style={[styles.segment, tab === key && styles.segmentOn]}>
          <Text style={[styles.segmentText, tab === key && styles.segmentTextOn]}>{key} {count}</Text>
        </Pressable>)}
    </View>
    {!!action.error && <Text accessibilityRole="alert" style={styles.error}>{action.error.message}</Text>}
  </View>;

  return <Screen>
    <FlatList data={rows} keyExtractor={(row) => row.key} ListHeaderComponent={header} contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} colors={[colors.onAccent]} progressBackgroundColor={tint} />}
      ListEmptyComponent={connections.isPending ? <ActivityIndicator color={tint} style={styles.loading} /> :
        connections.error ? <EmptyState emoji="⚠️" title="couldn't load" body={connections.error.message} action={<Pill label="try again" onPress={() => void connections.refetch()} />} /> :
          tab === 'connected' ? <EmptyState emoji="🌱" title="no one yet" body="connect with people from the people tab" /> :
            <EmptyState emoji="📭" title="all clear" body="no requests either way" />}
      renderItem={({ item: row }) => row.kind === 'section'
        ? <View style={styles.section}><Title size={24}>{row.title}</Title><Text style={styles.count}>{row.count}</Text></View>
        : <PersonRow item={row.item} trailing={trailing(row.item)} />} />
  </Screen>;
}

function PersonRow({ item, trailing }: { item: Connection; trailing: ReactNode }) {
  const { other, status } = item;
  const detail = status === 'incoming' ? 'wants in' : [other.headline, other.city].filter(Boolean).join(' · ');
  return <Pressable accessibilityRole="button" accessibilityLabel={`Open ${other.displayName}'s profile`} onPress={() => router.push(`/person/${other.id}`)} style={styles.row}>
    <Avatar name={other.displayName} imageUrl={other.imageUrl} size={44} ring={status === 'incoming' ? tint : undefined} />
    <View style={styles.flex}>
      <Text style={styles.name} numberOfLines={1}>{other.displayName}</Text>
      {!!detail && <Text style={[styles.meta, status === 'incoming' && { color: tint }]} numberOfLines={1}>{detail}</Text>}
    </View>
    {trailing}
  </Pressable>;
}

const styles = StyleSheet.create({
  list: { paddingBottom: 24 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  back: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1, minWidth: 0 },
  segments: { flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 6 },
  segment: { flex: 1, height: 38, borderRadius: radius.pill, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  segmentOn: { backgroundColor: colors.ink },
  segmentText: { color: colors.mute, fontFamily: fonts.bold, fontSize: 13 },
  segmentTextOn: { color: colors.onAccent },
  section: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 18, paddingBottom: 4 },
  count: { color: colors.mute, fontFamily: fonts.bold, fontSize: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10, minHeight: 64 },
  name: { color: colors.ink, fontFamily: fonts.bold, fontSize: 15 },
  meta: { color: colors.mute, fontFamily: fonts.body, fontSize: 13, marginTop: 2 },
  pair: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  decline: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  dim: { opacity: 0.4 },
  chat: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 44, minHeight: 44, justifyContent: 'flex-end' },
  badge: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, backgroundColor: tint, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: colors.onAccent, fontFamily: fonts.heavy, fontSize: 11 },
  error: { color: colors.danger, fontFamily: fonts.body, fontSize: 13, paddingHorizontal: 16, paddingVertical: 6 },
  loading: { marginVertical: 40 },
});

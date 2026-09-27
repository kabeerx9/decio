import { router, useScrollToTop } from 'expo-router';
import { useRef } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { EmptyState } from '@/components/empty-state';
import { Pill } from '@/components/pill';
import { Screen } from '@/components/screen';
import { Title } from '@/components/title';
import { Connection } from '@/lib/connections-api';
import { useConnections, usePullRefresh } from '@/lib/queries';
import { accent, colors, fonts, radius } from '@/theme';

const tint = accent.chats;

export function Chats() {
  const connections = useConnections();
  const chats = (connections.data ?? []).filter((item) => item.status === 'accepted');
  const list = useRef<FlatList<Connection>>(null);
  const pull = usePullRefresh(() => connections.refetch());
  useScrollToTop(list);
  return <Screen>
    <FlatList ref={list} data={chats} keyExtractor={(item) => item.other.id} contentContainerStyle={styles.list}
      ListHeaderComponent={<Title size={44} dot={tint} style={styles.title}>chats</Title>}
      refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} colors={[colors.onAccent]} progressBackgroundColor={tint} />}
      ListEmptyComponent={connections.isPending ? <ActivityIndicator color={tint} style={styles.loading} /> : connections.error ?
        <EmptyState emoji="⚠️" title="couldn't load" body={connections.error.message} action={<Pill label="try again" onPress={() => void connections.refetch()} />} /> :
        <EmptyState emoji="💬" title="no chats yet" body="connect with someone to start talking" action={<Pill label="find people" color={tint} onPress={() => router.navigate('/')} />} />}
      renderItem={({ item }) => {
        const unread = item.unreadCount > 0;
        return <Pressable accessibilityRole="button" accessibilityLabel={`Chat with ${item.other.displayName}${unread ? `, ${item.unreadCount} unread` : ''}`}
          onPress={() => router.push(`/chat/${item.other.id}`)} style={styles.row}>
          <Avatar name={item.other.displayName} imageUrl={item.other.imageUrl} size={52} />
          <View style={styles.flex}>
            <Text style={styles.name} numberOfLines={1}>{item.other.displayName}</Text>
            <Text style={[styles.meta, unread && styles.metaUnread]} numberOfLines={1}>{unread ? 'new messages' : item.other.city}</Text>
          </View>
          {unread && <View style={styles.unread}><Text style={styles.unreadText}>{item.unreadCount > 99 ? '99+' : item.unreadCount}</Text></View>}
        </Pressable>;
      }} />
  </Screen>;
}

const styles = StyleSheet.create({
  list: { paddingBottom: 24 },
  title: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  loading: { marginTop: 60 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 10, minHeight: 72 },
  flex: { flex: 1, minWidth: 0 },
  name: { color: colors.ink, fontFamily: fonts.bold, fontSize: 16 },
  meta: { color: colors.mute, fontFamily: fonts.body, fontSize: 13, marginTop: 2 },
  metaUnread: { color: colors.ink, fontFamily: fonts.medium },
  unread: { minWidth: 26, height: 26, borderRadius: radius.pill, paddingHorizontal: 8, backgroundColor: tint, alignItems: 'center', justifyContent: 'center' },
  unreadText: { color: colors.onAccent, fontFamily: fonts.heavy, fontSize: 12 },
});

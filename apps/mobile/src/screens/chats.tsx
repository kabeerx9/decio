import { Ionicons } from '@expo/vector-icons';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { DirectMessage, fetchMessages, markMessagesRead, sendMessage } from '@/lib/chat-api';
import { fetchConnections } from '@/lib/connections-api';
import { Profile, SessionExpiredError } from '@/lib/profile-api';
import { Avatar } from '@/components/avatar';
import { colors, fonts } from '@/theme';

type Props = { apiUrl: string; userId: string; getToken: () => Promise<string | null>; onSessionExpired: () => void };

export function Chats({ apiUrl, userId, getToken, onSessionExpired }: Props) {
  const [other, setOther] = useState<Profile | null>(null);
  const connections = useQuery({
    queryKey: ['connections', userId],
    queryFn: () => fetchConnections(apiUrl, getToken),
    retry: (failures, error) => !(error instanceof SessionExpiredError) && failures < 1,
  });
  useEffect(() => { if (connections.error instanceof SessionExpiredError) onSessionExpired(); }, [connections.error, onSessionExpired]);
  if (other) return <Conversation apiUrl={apiUrl} userId={userId} other={other} getToken={getToken} onBack={() => setOther(null)} onSessionExpired={onSessionExpired} />;
  const people = (connections.data ?? []).filter((item) => item.status === 'accepted');
  return <View style={styles.page}>
    <View style={styles.heading}><Text style={styles.title}>Messages</Text><Text style={styles.headingCopy}>Your conversations, all in one place.</Text></View>
    {connections.isPending ? <ActivityIndicator color={colors.accent} style={styles.loading} /> : connections.error ?
      <View style={styles.empty}><Text style={styles.muted}>Could not load conversations.</Text><Pressable onPress={() => void connections.refetch()}><Text style={styles.link}>Try again</Text></Pressable></View> :
      people.length === 0 ? <View style={styles.empty}><Ionicons name="chatbubbles-outline" size={32} color={colors.accent} /><Text style={styles.emptyTitle}>No conversations yet</Text><Text style={styles.muted}>Connect with someone in Discover to start chatting.</Text></View> :
        <FlatList data={people} keyExtractor={(item) => item.other.id} contentContainerStyle={styles.list} renderItem={({ item }) =>
          <Pressable accessibilityRole="button" accessibilityLabel={`Chat with ${item.other.displayName}${item.unreadCount ? `, ${item.unreadCount} unread messages` : ''}`} onPress={() => setOther(item.other)} style={styles.person}>
            <Avatar name={item.other.displayName} imageUrl={item.other.imageUrl} size={48} radius={16} />
            <View style={styles.personText}><Text style={styles.personName}>{item.other.displayName}</Text><Text style={styles.muted}>{item.other.city}</Text></View>
            {item.unreadCount > 0 && <View style={styles.unreadBadge}><Text style={styles.unreadBadgeText}>{item.unreadCount > 99 ? '99+' : item.unreadCount}</Text></View>}
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>} />}
  </View>;
}

function Conversation({ apiUrl, userId, other, getToken, onBack, onSessionExpired }: Props & { other: Profile; onBack: () => void }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const retry = useRef<{ body: string; id: string } | null>(null);
  const lastMarked = useRef<string | null>(null);
  const history = useInfiniteQuery({
    queryKey: ['messages', userId, other.id],
    initialPageParam: '',
    queryFn: ({ pageParam }) => fetchMessages(apiUrl, getToken, other.id, pageParam),
    getNextPageParam: (lastPage) => lastPage.nextCursor || undefined,
    retry: (failures, error) => !(error instanceof SessionExpiredError) && failures < 1,
  });
  const newestLoadedId = history.data?.pages[0]?.messages[0]?.id;
  useEffect(() => {
    if (!newestLoadedId || newestLoadedId === lastMarked.current) return;
    lastMarked.current = newestLoadedId;
    void markMessagesRead(apiUrl, getToken, other.id, newestLoadedId).then(
      () => queryClient.invalidateQueries({ queryKey: ['connections', userId] }),
      (error: unknown) => {
        lastMarked.current = null;
        if (error instanceof SessionExpiredError) onSessionExpired();
      },
    );
  }, [apiUrl, getToken, newestLoadedId, onSessionExpired, other.id, queryClient, userId]);
  const send = useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) => sendMessage(apiUrl, getToken, other.id, id, body),
    onSuccess: (_message, sent) => {
      retry.current = null;
      setDraft((current) => current.trim() === sent.body ? '' : current);
      void queryClient.invalidateQueries({ queryKey: ['messages', userId, other.id] });
    },
  });
  useEffect(() => {
    if (history.error instanceof SessionExpiredError || send.error instanceof SessionExpiredError) onSessionExpired();
  }, [history.error, send.error, onSessionExpired]);
  const sendDraft = () => {
    const body = draft.trim();
    if (!body || [...body].length > 2000 || send.isPending) return;
    const attempt = retry.current?.body === body ? retry.current : { body, id: Crypto.randomUUID() };
    retry.current = attempt;
    send.mutate(attempt);
  };
  const seen = new Set<string>();
  const messages = (history.data?.pages.flatMap((page) => page.messages) ?? []).filter((message) => {
    if (seen.has(message.id)) return false;
    seen.add(message.id);
    return true;
  });
  return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.page}>
    <View style={styles.conversationHeader}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back to conversations" onPress={onBack} style={styles.back}><Ionicons name="arrow-back" size={21} color={colors.ink} /></Pressable>
      <Avatar name={other.displayName} imageUrl={other.imageUrl} size={40} radius={14} />
      <View><Text style={styles.personName}>{other.displayName}</Text><Text style={styles.muted}>{other.city}</Text></View>
    </View>
    {history.isPending ? <ActivityIndicator color={colors.accent} style={styles.loading} /> : history.error ?
      <View style={styles.empty}><Text style={styles.muted}>{history.error.message}</Text><Pressable onPress={() => void history.refetch()}><Text style={styles.link}>Try again</Text></Pressable></View> :
        <FlatList<DirectMessage> inverted data={messages} keyExtractor={(message) => message.id} contentContainerStyle={styles.messages} keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<View style={styles.emptyConversation}><Text style={styles.emptyTitle}>Say hello</Text><Text style={styles.muted}>Your messages will stay here when you come back.</Text></View>}
          ListFooterComponent={history.hasNextPage ? <Pressable disabled={history.isFetchingNextPage} onPress={() => void history.fetchNextPage()} style={styles.older}><Text style={styles.link}>{history.isFetchingNextPage ? 'Loading…' : 'Load older messages'}</Text></Pressable> : null}
          renderItem={({ item }) => <View style={[styles.bubble, item.senderId === userId ? styles.mine : styles.theirs]}>
            <Text style={[styles.bubbleText, item.senderId === userId && styles.mineText]}>{item.body}</Text>
            <Text style={[styles.timestamp, item.senderId === userId && styles.mineTimestamp]}>{new Date(item.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Text>
          </View>} />}
    <View style={styles.composer}>
      <TextInput accessibilityLabel="Message" placeholder="Write a message" placeholderTextColor={colors.muted} value={draft} onChangeText={(value) => { setDraft(value); send.reset(); }} multiline maxLength={2000} style={styles.input} />
      <Pressable accessibilityRole="button" accessibilityLabel="Send message" disabled={!draft.trim() || send.isPending} onPress={sendDraft} style={[styles.send, (!draft.trim() || send.isPending) && styles.sendDisabled]}>
        {send.isPending ? <ActivityIndicator color={colors.white} size="small" /> : <Ionicons name="arrow-up" size={20} color={colors.white} />}
      </Pressable>
    </View>
    {!!send.error && <Text accessibilityRole="alert" style={styles.error}>{send.error.message} Tap send to retry.</Text>}
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.paper }, heading: { paddingHorizontal: 24, paddingTop: 26, paddingBottom: 24 }, title: { fontFamily: fonts.display, color: colors.ink, fontSize: 37, letterSpacing: -1.2 }, headingCopy: { color: colors.muted, fontFamily: fonts.body, fontSize: 15, marginTop: 5 }, muted: { color: colors.muted, fontFamily: fonts.body, fontSize: 13 }, loading: { marginTop: 32 }, empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 32 }, emptyTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 22 }, link: { color: colors.accent, fontFamily: fonts.medium, fontSize: 13 }, list: { paddingHorizontal: 20 }, person: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 4, borderBottomWidth: 1, borderColor: colors.line }, avatar: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.lilac, alignItems: 'center', justifyContent: 'center' }, avatarSmall: { width: 40, height: 40, borderRadius: 14, backgroundColor: colors.lilac, alignItems: 'center', justifyContent: 'center' }, avatarText: { color: colors.ink, fontFamily: fonts.display, fontSize: 20 }, personText: { flex: 1 }, personName: { color: colors.ink, fontFamily: fonts.medium, fontSize: 15 }, conversationHeader: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, borderBottomWidth: 1, borderColor: colors.line }, back: { padding: 8 }, messages: { padding: 16, flexGrow: 1 }, bubble: { maxWidth: '82%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18, marginVertical: 4 }, mine: { alignSelf: 'flex-end', backgroundColor: colors.accent, borderBottomRightRadius: 5 }, theirs: { alignSelf: 'flex-start', backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderBottomLeftRadius: 5 }, bubbleText: { color: colors.ink, fontFamily: fonts.body, fontSize: 14, lineHeight: 20 }, mineText: { color: colors.white }, timestamp: { color: colors.muted, fontFamily: fonts.body, fontSize: 10, marginTop: 5, alignSelf: 'flex-end' }, mineTimestamp: { color: colors.blush }, older: { alignItems: 'center', padding: 16 }, emptyConversation: { alignItems: 'center', padding: 30, gap: 7 }, composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, padding: 12, borderTopWidth: 1, borderColor: colors.line, backgroundColor: colors.white }, input: { flex: 1, minHeight: 43, maxHeight: 115, borderRadius: 18, backgroundColor: colors.paper, color: colors.ink, fontFamily: fonts.body, fontSize: 14, paddingHorizontal: 14, paddingTop: 11, paddingBottom: 10 }, send: { width: 43, height: 43, borderRadius: 14, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }, sendDisabled: { opacity: 0.45 }, error: { color: '#B42318', fontFamily: fonts.body, fontSize: 12, paddingHorizontal: 16, paddingBottom: 8, backgroundColor: colors.white },
  unreadBadge: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 5, backgroundColor: colors.plum, alignItems: 'center', justifyContent: 'center' }, unreadBadgeText: { color: colors.white, fontFamily: fonts.medium, fontSize: 11 },
});

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';

import { BackHeader } from '@/components/back-header';
import { Bubble } from '@/components/bubble';
import { Composer } from '@/components/composer';
import { EmptyState } from '@/components/empty-state';
import { Pill } from '@/components/pill';
import { Screen } from '@/components/screen';
import { DirectMessage, fetchMessages, markMessagesRead, sendMessage } from '@/lib/chat-api';
import { clockTime } from '@/lib/format';
import { success } from '@/lib/haptics';
import { fetchPublicProfile } from '@/lib/people-api';
import { SessionExpiredError } from '@/lib/profile-api';
import { useConnections } from '@/lib/queries';
import { retryUnlessExpired, uniqueById } from '@/lib/selectors';
import { useSession, useSignOutOnExpiry } from '@/lib/session';
import { accent, colors, fonts } from '@/theme';

const tint = accent.chats;

export function Conversation({ id }: { id: string }) {
  const { apiUrl, userId, getToken, signOutLocal } = useSession();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const retry = useRef<{ body: string; id: string } | null>(null);
  const lastMarked = useRef<string | null>(null);
  const connections = useConnections();
  const cached = connections.data?.find((item) => item.other.id === id)?.other;
  const fallback = useQuery({
    queryKey: ['publicProfile', userId, id],
    queryFn: () => fetchPublicProfile(apiUrl, getToken, id),
    enabled: !cached && !connections.isPending,
    retry: retryUnlessExpired,
  });
  const other = cached ?? fallback.data;
  const history = useInfiniteQuery({
    queryKey: ['messages', userId, id],
    initialPageParam: '',
    queryFn: ({ pageParam }) => fetchMessages(apiUrl, getToken, id, pageParam),
    getNextPageParam: (lastPage) => lastPage.nextCursor || undefined,
    retry: retryUnlessExpired,
  });
  const newestLoadedId = history.data?.pages[0]?.messages[0]?.id;
  useEffect(() => {
    if (!newestLoadedId || newestLoadedId === lastMarked.current) return;
    lastMarked.current = newestLoadedId;
    void markMessagesRead(apiUrl, getToken, id, newestLoadedId).then(
      () => queryClient.invalidateQueries({ queryKey: ['connections', userId] }),
      (error: unknown) => {
        lastMarked.current = null;
        if (error instanceof SessionExpiredError) signOutLocal();
      },
    );
  }, [apiUrl, getToken, id, newestLoadedId, queryClient, signOutLocal, userId]);
  const send = useMutation({
    mutationFn: ({ id: clientMessageId, body }: { id: string; body: string }) => sendMessage(apiUrl, getToken, id, clientMessageId, body),
    onSuccess: (_message, sent) => {
      success();
      retry.current = null;
      setDraft((current) => current.trim() === sent.body ? '' : current);
      void queryClient.invalidateQueries({ queryKey: ['messages', userId, id] });
    },
  });
  useSignOutOnExpiry(history.error, send.error, fallback.error);

  const sendDraft = () => {
    const body = draft.trim();
    if (!body || [...body].length > 2000 || send.isPending) return;
    const attempt = retry.current?.body === body ? retry.current : { body, id: Crypto.randomUUID() };
    retry.current = attempt;
    send.mutate(attempt);
  };
  const messages = uniqueById(history.data?.pages.flatMap((page) => page.messages) ?? []);

  return <Screen edges={['top', 'bottom']}>
    <KeyboardAvoidingView behavior="padding" style={styles.flex}>
      <BackHeader title={other?.displayName ?? ''} subtitle={other?.city} avatar={other ? { name: other.displayName, imageUrl: other.imageUrl } : undefined}
        onTitlePress={() => router.push(`/person/${id}`)} />
      {history.isPending ? <ActivityIndicator color={tint} style={styles.loading} /> : history.error ?
        <EmptyState emoji="⚠️" title="couldn't load" body={history.error.message} action={<Pill label="try again" onPress={() => void history.refetch()} />} /> :
        messages.length === 0 ? <View style={styles.hello}><Text style={styles.wave}>👋</Text><Text style={styles.helloText}>say hi to {other?.displayName ?? 'them'}</Text></View> :
          <FlatList<DirectMessage> inverted data={messages} keyExtractor={(message) => message.id} contentContainerStyle={styles.messages} keyboardShouldPersistTaps="handled"
            onEndReached={() => { if (history.hasNextPage && !history.isFetchingNextPage) void history.fetchNextPage(); }} onEndReachedThreshold={0.4}
            ListFooterComponent={history.isFetchingNextPage ? <ActivityIndicator color={tint} style={styles.older} /> : null}
            renderItem={({ item, index }) => {
              const newer = messages[index - 1];
              return <Bubble body={item.body} mine={item.senderId === userId} accentColor={tint}
                time={!newer || newer.senderId !== item.senderId ? clockTime(item.createdAt) : undefined} />;
            }} />}
      {!!send.error && <Text accessibilityRole="alert" style={styles.error}>{send.error.message} tap send to retry.</Text>}
      <Composer value={draft} onChangeText={(value) => { setDraft(value); send.reset(); }} onSend={sendDraft} sending={send.isPending}
        placeholder="message" accentColor={tint} maxLength={2000} label="Message" />
    </KeyboardAvoidingView>
  </Screen>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loading: { marginTop: 40 },
  messages: { paddingHorizontal: 12, paddingVertical: 8, flexGrow: 1 },
  older: { marginVertical: 16 },
  hello: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  wave: { fontSize: 56 },
  helloText: { color: colors.mute, fontFamily: fonts.medium, fontSize: 15 },
  error: { color: colors.danger, fontFamily: fonts.body, fontSize: 12, paddingHorizontal: 16 },
});

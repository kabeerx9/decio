import { Ionicons } from '@expo/vector-icons';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { fetchPublicProfile, searchPeople } from '@/lib/people-api';
import { acceptConnection, fetchConnections, requestConnection } from '@/lib/connections-api';
import { SessionExpiredError } from '@/lib/profile-api';
import { Avatar } from '@/components/avatar';
import { colors, fonts } from '@/theme';

type Props = {
  apiUrl: string;
  userId: string;
  city: string;
  getToken: () => Promise<string | null>;
  onMyProfile: () => void;
  onSessionExpired: () => void;
};

const connectionOrder = { incoming: 0, accepted: 1, sent: 2 } as const;

export function PeopleDiscover({ apiUrl, userId, city, getToken, onMyProfile, onSessionExpired }: Props) {
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [selectedID, setSelectedID] = useState<string | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    const timer = setTimeout(() => setQuery(draft.trim()), 300);
    return () => clearTimeout(timer);
  }, [draft]);

  const people = useInfiniteQuery({
    queryKey: ['people', userId, query],
    initialPageParam: '',
    queryFn: ({ pageParam }) => searchPeople(apiUrl, getToken, query, pageParam),
    getNextPageParam: (lastPage) => lastPage.nextCursor || undefined,
    retry: (failures, failure) => !(failure instanceof SessionExpiredError) && failures < 1,
  });
  const detail = useQuery({
    queryKey: ['publicProfile', userId, selectedID],
    queryFn: () => fetchPublicProfile(apiUrl, getToken, selectedID!),
    enabled: !!selectedID,
    retry: (failures, failure) => !(failure instanceof SessionExpiredError) && failures < 1,
  });
  const connections = useQuery({
    queryKey: ['connections', userId],
    queryFn: () => fetchConnections(apiUrl, getToken),
    retry: (failures, failure) => !(failure instanceof SessionExpiredError) && failures < 1,
  });
  const connectionAction = useMutation({
    mutationFn: ({ kind, id }: { kind: 'request' | 'accept'; id: string }) =>
      kind === 'request' ? requestConnection(apiUrl, getToken, id) : acceptConnection(apiUrl, getToken, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['connections', userId] }),
  });
  const openProfile = (id: string) => { connectionAction.reset(); setSelectedID(id); };

  useEffect(() => {
    if (people.error instanceof SessionExpiredError || detail.error instanceof SessionExpiredError ||
      connections.error instanceof SessionExpiredError || connectionAction.error instanceof SessionExpiredError) onSessionExpired();
  }, [people.error, detail.error, connections.error, connectionAction.error, onSessionExpired]);

  if (selectedID) {
    const person = detail.data;
    const connection = connections.data?.find((item) => item.other.id === selectedID);
    return <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Pressable accessibilityRole="button" onPress={() => setSelectedID(null)} style={styles.back}><Ionicons name="arrow-back" size={20} color={colors.ink} /><Text style={styles.backText}>People</Text></Pressable>
      {detail.isPending ? <ActivityIndicator color={colors.accent} style={styles.loading} /> : detail.error ?
        <Text style={styles.message}>{detail.error.message}</Text> : person ?
          <View style={styles.detail}>
            <View style={styles.detailAvatar}><Avatar name={person.displayName} imageUrl={person.imageUrl} size={74} radius={25} /></View>
            <Text style={styles.detailName}>{person.displayName}</Text>
            <Text style={styles.secondary}>{[person.headline, person.city].filter(Boolean).join(' · ')}</Text>
            {!!person.bio && <Text style={styles.bio}>{person.bio}</Text>}
            {!!person.interests.length && <View style={styles.interests}>{person.interests.map((interest) => <Text key={interest} style={styles.interest}>{interest}</Text>)}</View>}
            {connections.isPending ? <ActivityIndicator color={colors.accent} style={styles.loading} /> : connections.error ?
              <Pressable accessibilityRole="button" onPress={() => void connections.refetch()} style={styles.connectionButton}><Text style={styles.connectionButtonText}>Retry connection status</Text></Pressable> :
              connection?.status === 'accepted' ? <Text style={styles.connectionStatus}>Connected</Text> :
                connection?.status === 'sent' ? <Text style={styles.connectionStatus}>Request sent</Text> :
                  <Pressable accessibilityRole="button" disabled={connectionAction.isPending} onPress={() => connectionAction.mutate({ kind: connection?.status === 'incoming' ? 'accept' : 'request', id: person.id })} style={styles.connectionButton}>
                    <Text style={styles.connectionButtonText}>{connectionAction.isPending ? 'Please wait…' : connection?.status === 'incoming' ? 'Accept request' : 'Send connection request'}</Text>
                    <Ionicons name="arrow-forward" size={18} color={colors.white} />
                  </Pressable>}
            {!!connectionAction.error && <Text accessibilityRole="alert" style={styles.actionError}>{connectionAction.error.message}</Text>}
          </View> : null}
    </ScrollView>;
  }

  const allPeople = people.data?.pages.flatMap((page) => page.people) ?? [];
  const results = allPeople.filter((person) => !!query || !connections.data?.some((connection) => connection.other.id === person.id));
  const orderedConnections = [...(connections.data ?? [])].sort((a, b) => connectionOrder[a.status] - connectionOrder[b.status]);
  return <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <View style={styles.intro}>
      <Text style={styles.introTitle}>Find your people.</Text>
      <Text style={styles.introCopy}>{city ? `Meet someone new in ${city}.` : 'Choose a city to meet people nearby.'}</Text>
    </View>
    <View style={styles.searchSection}>
      <View style={styles.searchBox}><Ionicons name="search" size={21} color={colors.accent} /><TextInput accessibilityLabel="Search people" placeholder="Search name, city, or headline" placeholderTextColor={colors.muted} value={draft} onChangeText={setDraft} autoCorrect={false} style={styles.searchInput} returnKeyType="search" /></View>
      <Text style={styles.searchHint}>Search anyone on Decio, then tap Connect to send a request.</Text>
    </View>
    {!city && <Pressable accessibilityRole="button" onPress={onMyProfile} style={styles.profilePrompt}><Text style={styles.promptText}>Add your city to your profile</Text><Ionicons name="arrow-forward" size={17} color={colors.accent} /></Pressable>}
    {!draft.trim() && (connections.isPending || connections.error || !!connections.data?.length) && <View style={styles.connectionsSection}>
      <View style={styles.connectionHeading}><Text style={[styles.sectionTitle, styles.connectionTitle]}>Your circle</Text><Pressable accessibilityRole="button" accessibilityLabel="Refresh connections" onPress={() => void connections.refetch()} style={styles.refreshButton}><Ionicons name="refresh" size={20} color={colors.accent} /></Pressable></View>
      {connections.isPending ? <ActivityIndicator color={colors.accent} /> : connections.error ?
        <Text style={styles.message}>Could not load connections. Tap refresh to try again.</Text> : !connections.data?.length ?
          <Text style={styles.emptyConnections}>Requests and new connections will show up here.</Text> :
        orderedConnections.map((connection) =>
        <Pressable key={connection.other.id} accessibilityRole="button" accessibilityLabel={`Open ${connection.other.displayName}'s profile, ${connection.status}`} onPress={() => openProfile(connection.other.id)} style={[styles.connectionRow, connection.status === 'incoming' && styles.incomingRow]}>
          <Avatar name={connection.other.displayName} imageUrl={connection.other.imageUrl} size={40} radius={15} />
          <View style={styles.personText}><Text style={styles.personName}>{connection.other.displayName}</Text><Text style={styles.secondary}>{connection.other.city}</Text></View>
          <Text style={styles.connectionLabel}>{connection.status === 'incoming' ? 'Respond' : connection.status === 'sent' ? 'Sent' : 'Connected'}</Text>
        </Pressable>)}
    </View>}
    {people.isPending ? <ActivityIndicator color={colors.accent} style={styles.loading} /> : people.error ?
      <View style={styles.empty}><Text style={styles.message}>{people.error.message}</Text><Pressable accessibilityRole="button" onPress={() => void people.refetch()}><Text style={styles.action}>Try again</Text></Pressable></View> :
      results.length === 0 ? <Text style={styles.message}>{query ? 'No people match this search.' : allPeople.length ? 'You have met everyone here so far. Check back soon.' : 'No people yet. Check back soon.'}</Text> :
          <View style={styles.listSection}>
            <Text style={styles.sectionTitle}>{query ? 'Search results' : 'People to meet'}</Text>
            <View style={styles.results}>{results.map((person) => {
              const connection = connections.data?.find((item) => item.other.id === person.id);
              return <View key={person.id} style={styles.person}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Open ${person.displayName}'s profile`} onPress={() => openProfile(person.id)} style={styles.personProfile}>
                <Avatar name={person.displayName} imageUrl={person.imageUrl} size={44} radius={16} />
                <View style={styles.personText}><Text style={styles.personName}>{person.displayName}</Text><Text style={styles.secondary} numberOfLines={1}>{[person.headline, person.city].filter(Boolean).join(' · ')}</Text></View>
              </Pressable>
              {connection?.status === 'accepted' || connection?.status === 'sent' ? <Text style={styles.personStatus}>{connection.status === 'accepted' ? 'Connected' : 'Sent'}</Text> :
                <Pressable accessibilityRole="button" accessibilityLabel={`${connection?.status === 'incoming' ? 'Accept' : 'Connect with'} ${person.displayName}`} disabled={connectionAction.isPending || connections.isPending || !!connections.error} onPress={() => connectionAction.mutate({ kind: connection?.status === 'incoming' ? 'accept' : 'request', id: person.id })} style={[styles.connectButton, (connectionAction.isPending || connections.isPending || !!connections.error) && styles.connectDisabled]}><Text style={styles.connectText}>{connection?.status === 'incoming' ? 'Accept' : 'Connect'}</Text></Pressable>}
              </View>})}</View>
            {!!connectionAction.error && <Text accessibilityRole="alert" style={styles.actionError}>{connectionAction.error.message}</Text>}
          </View>}
    {people.hasNextPage && <Pressable accessibilityRole="button" disabled={people.isFetchingNextPage} onPress={() => void people.fetchNextPage()} style={styles.more}><Text style={styles.action}>{people.isFetchingNextPage ? 'Loading…' : 'Load more'}</Text></Pressable>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 22, paddingTop: 26, paddingBottom: 38 },
  intro: { marginBottom: 21 },
  introTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 37, lineHeight: 41, letterSpacing: -1.2 },
  introCopy: { color: colors.muted, fontFamily: fonts.body, fontSize: 15, lineHeight: 22, marginTop: 6 },
  searchSection: { paddingTop: 0 },
  secondary: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, marginTop: 4 },
  searchBox: { borderWidth: 1, borderColor: colors.line, borderRadius: 18, backgroundColor: colors.white, minHeight: 58, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 11 },
  searchInput: { flex: 1, fontFamily: fonts.body, color: colors.ink, fontSize: 15, paddingVertical: 10 },
  searchHint: { color: colors.muted, fontFamily: fonts.body, fontSize: 12, marginTop: 8 },
  profilePrompt: { marginTop: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  promptText: { fontFamily: fonts.medium, color: colors.accent, fontSize: 13 },
  connectionsSection: { marginTop: 28 },
  connectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  connectionTitle: { marginBottom: 0 },
  refreshButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  emptyConnections: { color: colors.muted, fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  connectionRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderColor: colors.line },
  incomingRow: { backgroundColor: colors.blush, borderRadius: 16, paddingHorizontal: 12, borderBottomWidth: 0, marginBottom: 4 },
  connectionLabel: { color: colors.accent, fontFamily: fonts.medium, fontSize: 12 },
  connectionButton: { marginTop: 28, minHeight: 52, borderRadius: 13, backgroundColor: colors.accent, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  connectionButtonText: { color: colors.white, fontFamily: fonts.medium, fontSize: 14 },
  connectionStatus: { marginTop: 28, color: colors.accent, fontFamily: fonts.medium, fontSize: 15 },
  actionError: { color: '#B42318', fontFamily: fonts.body, fontSize: 13, marginTop: 12 },
  loading: { marginTop: 32 }, message: { fontFamily: fonts.body, fontSize: 14, color: colors.muted, marginTop: 28 },
  empty: { alignItems: 'flex-start' }, action: { fontFamily: fonts.medium, color: colors.accent, fontSize: 14, marginTop: 12 },
  sectionTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 23, marginBottom: 10 },
  listSection: { marginTop: 32 },
  results: { borderTopWidth: 1, borderColor: colors.line },
  person: { flexDirection: 'row', alignItems: 'center', minHeight: 72, borderBottomWidth: 1, borderColor: colors.line, gap: 8 },
  personProfile: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  connectButton: { minHeight: 38, paddingHorizontal: 13, borderRadius: 12, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  connectDisabled: { opacity: 0.5 }, connectText: { color: colors.white, fontFamily: fonts.medium, fontSize: 12 },
  personStatus: { color: colors.muted, fontFamily: fonts.medium, fontSize: 12 },
  personText: { flex: 1 }, personName: { color: colors.ink, fontFamily: fonts.medium, fontSize: 15 },
  more: { alignItems: 'center', paddingVertical: 15 }, back: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 28 },
  backText: { fontFamily: fonts.medium, color: colors.ink, fontSize: 15 }, detail: { alignItems: 'flex-start' },
  detailAvatar: { marginBottom: 18 },
  detailName: { color: colors.ink, fontFamily: fonts.display, fontSize: 28 },
  bio: { color: colors.ink, fontFamily: fonts.body, fontSize: 15, lineHeight: 22, marginTop: 24 },
  interests: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 20 },
  interest: { fontFamily: fonts.medium, color: colors.ink, fontSize: 12, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: colors.line, borderRadius: 20 },
});

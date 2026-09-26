import { Ionicons } from '@expo/vector-icons';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { fetchPublicProfile, searchPeople } from '@/lib/people-api';
import { acceptConnection, fetchConnections, requestConnection } from '@/lib/connections-api';
import { SessionExpiredError } from '@/lib/profile-api';
import { colors, fonts } from '@/theme';

type Props = {
  apiUrl: string;
  userId: string;
  city: string;
  getToken: () => Promise<string | null>;
  onMyProfile: () => void;
  onSessionExpired: () => void;
};

// Only label a photograph as a city when that city's image has been curated.
const cityPhotos: Record<string, string> = {
  mumbai: 'https://images.unsplash.com/photo-1653299448072-fb7408c264b3?w=1200&q=85',
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
      {detail.isPending ? <ActivityIndicator color={colors.blue} style={styles.loading} /> : detail.error ?
        <Text style={styles.message}>{detail.error.message}</Text> : person ?
          <View style={styles.detail}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{person.displayName.charAt(0).toUpperCase()}</Text></View>
            <Text style={styles.detailName}>{person.displayName}</Text>
            <Text style={styles.secondary}>{[person.headline, person.city].filter(Boolean).join(' · ')}</Text>
            {!!person.bio && <Text style={styles.bio}>{person.bio}</Text>}
            {!!person.interests.length && <View style={styles.interests}>{person.interests.map((interest) => <Text key={interest} style={styles.interest}>{interest}</Text>)}</View>}
            {connections.isPending ? <ActivityIndicator color={colors.blue} style={styles.loading} /> : connections.error ?
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

  const results = people.data?.pages.flatMap((page) => page.people) ?? [];
  const featured = query ? [] : results.slice(0, 3);
  const listed = query ? results : results.slice(3);
  const orderedConnections = [...(connections.data ?? [])].sort((a, b) => connectionOrder[a.status] - connectionOrder[b.status]);
  const cityPhoto = cityPhotos[city.trim().toLowerCase()];
  return <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <View style={styles.hero}>
      {!!cityPhoto && <Image source={{ uri: cityPhoto }} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel={`View of ${city}`} />}
      <View style={styles.heroShade} />
      <View style={styles.heroContent}>
        <View style={styles.cityMarker}><Ionicons name="location" size={14} color={colors.ink} /><Text style={styles.cityMarkerText}>{city || 'Your city'}</Text></View>
        <Text style={styles.heroTitle}>Find your people.</Text>
        <Text style={styles.heroCopy}>Discover people across Decio and start a new connection.</Text>
      </View>
    </View>
    <View style={styles.searchSection}>
      <Text style={styles.searchHeading}>Who would you like to meet?</Text>
      <View style={styles.searchBox}><Ionicons name="search" size={19} color={colors.muted} /><TextInput accessibilityLabel="Search people" placeholder="Name, city, or headline" placeholderTextColor={colors.muted} value={draft} onChangeText={setDraft} autoCorrect={false} style={styles.searchInput} returnKeyType="search" /></View>
    </View>
    {!city && <Pressable accessibilityRole="button" onPress={onMyProfile} style={styles.profilePrompt}><Text style={styles.promptText}>Add your city to your profile</Text><Ionicons name="arrow-forward" size={17} color={colors.blue} /></Pressable>}
    {!draft.trim() && <View style={styles.connectionsSection}>
      <View style={styles.connectionHeading}><Text style={[styles.sectionTitle, styles.connectionTitle]}>Your connections</Text><Pressable accessibilityRole="button" accessibilityLabel="Refresh connections" onPress={() => void connections.refetch()} style={styles.refreshButton}><Ionicons name="refresh" size={20} color={colors.blue} /></Pressable></View>
      {connections.isPending ? <ActivityIndicator color={colors.blue} /> : connections.error ?
        <Text style={styles.message}>Could not load connections. Use refresh to try again.</Text> : !connections.data?.length ?
          <Text style={styles.emptyConnections}>Requests and connections will appear here.</Text> :
        orderedConnections.map((connection) =>
        <Pressable key={connection.other.id} accessibilityRole="button" accessibilityLabel={`Open ${connection.other.displayName}'s profile, ${connection.status}`} onPress={() => openProfile(connection.other.id)} style={styles.connectionRow}>
          <View style={styles.connectionAvatar}><Text style={styles.smallAvatarText}>{connection.other.displayName.charAt(0).toUpperCase()}</Text></View>
          <View style={styles.personText}><Text style={styles.personName}>{connection.other.displayName}</Text><Text style={styles.secondary}>{connection.other.city}</Text></View>
          <Text style={styles.connectionLabel}>{connection.status === 'incoming' ? 'Accept' : connection.status === 'sent' ? 'Sent' : 'Connected'}</Text>
        </Pressable>)}
    </View>}
    {people.isPending ? <ActivityIndicator color={colors.blue} style={styles.loading} /> : people.error ?
      <View style={styles.empty}><Text style={styles.message}>{people.error.message}</Text><Pressable accessibilityRole="button" onPress={() => void people.refetch()}><Text style={styles.action}>Try again</Text></Pressable></View> :
      results.length === 0 ? <Text style={styles.message}>{query ? 'No people match this search.' : 'No profiles yet. Check back soon.'}</Text> :
        <>
          {!!featured.length && <View style={styles.featuredSection}>
            <Text style={styles.sectionTitle}>Explore people</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.featuredList}>
              {featured.map((person) => <Pressable key={person.id} accessibilityRole="button" accessibilityLabel={`Open ${person.displayName}'s profile`} onPress={() => openProfile(person.id)} style={styles.featuredPerson}>
                <View style={styles.featuredPortrait}><Text style={styles.featuredInitial}>{person.displayName.charAt(0).toUpperCase()}</Text></View>
                <Text style={styles.featuredName} numberOfLines={1}>{person.displayName}</Text>
                <Text style={styles.featuredMeta} numberOfLines={1}>{person.city}</Text>
              </Pressable>)}
            </ScrollView>
          </View>}
          {!!listed.length && <View style={styles.listSection}>
            <Text style={styles.sectionTitle}>{query ? 'Search results' : 'More people'}</Text>
            <View style={styles.results}>{listed.map((person) =>
              <Pressable key={person.id} accessibilityRole="button" accessibilityLabel={`Open ${person.displayName}'s profile`} onPress={() => openProfile(person.id)} style={styles.person}>
                <View style={styles.smallAvatar}><Text style={styles.smallAvatarText}>{person.displayName.charAt(0).toUpperCase()}</Text></View>
                <View style={styles.personText}><Text style={styles.personName}>{person.displayName}</Text><Text style={styles.secondary} numberOfLines={1}>{[person.headline, person.city].filter(Boolean).join(' · ')}</Text></View>
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </Pressable>)}</View>
          </View>}
        </>}
    {people.hasNextPage && <Pressable accessibilityRole="button" disabled={people.isFetchingNextPage} onPress={() => void people.fetchNextPage()} style={styles.more}><Text style={styles.action}>{people.isFetchingNextPage ? 'Loading…' : 'Load more'}</Text></Pressable>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 32 },
  hero: { height: 224, borderRadius: 20, overflow: 'hidden', backgroundColor: colors.ink, justifyContent: 'flex-end' },
  heroShade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(8, 28, 48, 0.48)' },
  heroContent: { padding: 22 },
  cityMarker: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.yellow, borderRadius: 100, paddingHorizontal: 11, paddingVertical: 7 },
  cityMarkerText: { color: colors.ink, fontFamily: fonts.medium, fontSize: 12 },
  heroTitle: { color: colors.white, fontFamily: fonts.display, fontSize: 32, lineHeight: 36, marginTop: 18 },
  heroCopy: { color: colors.white, fontFamily: fonts.body, fontSize: 13, lineHeight: 19, marginTop: 5, maxWidth: 290 },
  searchSection: { paddingTop: 25 },
  searchHeading: { color: colors.ink, fontFamily: fonts.display, fontSize: 22 },
  secondary: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, marginTop: 4 },
  searchBox: { marginTop: 14, borderWidth: 1, borderColor: colors.line, borderRadius: 12, backgroundColor: colors.white, minHeight: 54, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 9 },
  searchInput: { flex: 1, fontFamily: fonts.body, color: colors.ink, fontSize: 15, paddingVertical: 10 },
  profilePrompt: { marginTop: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  promptText: { fontFamily: fonts.medium, color: colors.blue, fontSize: 13 },
  connectionsSection: { marginTop: 30 },
  connectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  connectionTitle: { marginBottom: 0 },
  refreshButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  emptyConnections: { color: colors.muted, fontFamily: fonts.body, fontSize: 13 },
  connectionRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderColor: colors.line },
  connectionAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.paleBlue, alignItems: 'center', justifyContent: 'center' },
  connectionLabel: { color: colors.blue, fontFamily: fonts.medium, fontSize: 12 },
  connectionButton: { marginTop: 28, minHeight: 52, borderRadius: 13, backgroundColor: colors.blue, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  connectionButtonText: { color: colors.white, fontFamily: fonts.medium, fontSize: 14 },
  connectionStatus: { marginTop: 28, color: colors.blue, fontFamily: fonts.medium, fontSize: 15 },
  actionError: { color: '#B42318', fontFamily: fonts.body, fontSize: 13, marginTop: 12 },
  loading: { marginTop: 32 }, message: { fontFamily: fonts.body, fontSize: 14, color: colors.muted, marginTop: 28 },
  empty: { alignItems: 'flex-start' }, action: { fontFamily: fonts.medium, color: colors.blue, fontSize: 14, marginTop: 12 },
  sectionTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 21, marginBottom: 15 },
  featuredSection: { marginTop: 32 },
  featuredList: { gap: 12, paddingRight: 4 },
  featuredPerson: { width: 138, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 16, padding: 10 },
  featuredPortrait: { height: 116, borderRadius: 11, backgroundColor: colors.paleBlue, alignItems: 'center', justifyContent: 'center' },
  featuredInitial: { color: colors.blue, fontFamily: fonts.display, fontSize: 53 },
  featuredName: { color: colors.ink, fontFamily: fonts.medium, fontSize: 14, marginTop: 10 },
  featuredMeta: { color: colors.muted, fontFamily: fonts.body, fontSize: 12, marginTop: 2, marginBottom: 3 },
  listSection: { marginTop: 32 },
  results: { borderTopWidth: 1, borderColor: colors.line },
  person: { flexDirection: 'row', alignItems: 'center', minHeight: 72, borderBottomWidth: 1, borderColor: colors.line, gap: 12 },
  smallAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.paleBlue, alignItems: 'center', justifyContent: 'center' },
  smallAvatarText: { color: colors.ink, fontFamily: fonts.medium, fontSize: 18 },
  personText: { flex: 1 }, personName: { color: colors.ink, fontFamily: fonts.medium, fontSize: 15 },
  more: { alignItems: 'center', paddingVertical: 15 }, back: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 28 },
  backText: { fontFamily: fonts.medium, color: colors.ink, fontSize: 15 }, detail: { alignItems: 'flex-start' },
  avatar: { width: 74, height: 74, borderRadius: 37, backgroundColor: colors.paleBlue, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  avatarText: { color: colors.ink, fontFamily: fonts.display, fontSize: 29 },
  detailName: { color: colors.ink, fontFamily: fonts.display, fontSize: 28 },
  bio: { color: colors.ink, fontFamily: fonts.body, fontSize: 15, lineHeight: 22, marginTop: 24 },
  interests: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 20 },
  interest: { fontFamily: fonts.medium, color: colors.ink, fontSize: 12, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: colors.line, borderRadius: 20 },
});

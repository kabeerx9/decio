import { Ionicons } from '@expo/vector-icons';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { fetchPublicProfile, searchPeople } from '@/lib/people-api';
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

export function PeopleDiscover({ apiUrl, userId, city, getToken, onMyProfile, onSessionExpired }: Props) {
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [selectedID, setSelectedID] = useState<string | null>(null);

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

  useEffect(() => {
    if (people.error instanceof SessionExpiredError || detail.error instanceof SessionExpiredError) onSessionExpired();
  }, [people.error, detail.error, onSessionExpired]);

  if (selectedID) {
    const person = detail.data;
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
          </View> : null}
    </ScrollView>;
  }

  const results = people.data?.pages.flatMap((page) => page.people) ?? [];
  const featured = query ? [] : results.slice(0, 3);
  const listed = query ? results : results.slice(3);
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
    {people.isPending ? <ActivityIndicator color={colors.blue} style={styles.loading} /> : people.error ?
      <View style={styles.empty}><Text style={styles.message}>{people.error.message}</Text><Pressable accessibilityRole="button" onPress={() => void people.refetch()}><Text style={styles.action}>Try again</Text></Pressable></View> :
      results.length === 0 ? <Text style={styles.message}>{query ? 'No people match this search.' : 'No profiles yet. Check back soon.'}</Text> :
        <>
          {!!featured.length && <View style={styles.featuredSection}>
            <Text style={styles.sectionTitle}>Explore people</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.featuredList}>
              {featured.map((person) => <Pressable key={person.id} accessibilityRole="button" accessibilityLabel={`Open ${person.displayName}'s profile`} onPress={() => setSelectedID(person.id)} style={styles.featuredPerson}>
                <View style={styles.featuredPortrait}><Text style={styles.featuredInitial}>{person.displayName.charAt(0).toUpperCase()}</Text></View>
                <Text style={styles.featuredName} numberOfLines={1}>{person.displayName}</Text>
                <Text style={styles.featuredMeta} numberOfLines={1}>{person.city}</Text>
              </Pressable>)}
            </ScrollView>
          </View>}
          {!!listed.length && <View style={styles.listSection}>
            <Text style={styles.sectionTitle}>{query ? 'Search results' : 'More people'}</Text>
            <View style={styles.results}>{listed.map((person) =>
              <Pressable key={person.id} accessibilityRole="button" accessibilityLabel={`Open ${person.displayName}'s profile`} onPress={() => setSelectedID(person.id)} style={styles.person}>
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

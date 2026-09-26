import { Ionicons } from '@expo/vector-icons';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
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
  return <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Text style={styles.title}>People</Text>
    <Text style={styles.secondary}>{city ? `Find people in ${city} and beyond` : 'Find people by name, city, or headline'}</Text>
    <View style={styles.searchBox}><Ionicons name="search" size={19} color={colors.muted} /><TextInput accessibilityLabel="Search people" placeholder="Name, city, or headline" placeholderTextColor={colors.muted} value={draft} onChangeText={setDraft} autoCorrect={false} style={styles.searchInput} returnKeyType="search" /></View>
    {!city && <Pressable accessibilityRole="button" onPress={onMyProfile} style={styles.profilePrompt}><Text style={styles.promptText}>Add your city to your profile</Text><Ionicons name="arrow-forward" size={17} color={colors.blue} /></Pressable>}
    {people.isPending ? <ActivityIndicator color={colors.blue} style={styles.loading} /> : people.error ?
      <View style={styles.empty}><Text style={styles.message}>{people.error.message}</Text><Pressable accessibilityRole="button" onPress={() => void people.refetch()}><Text style={styles.action}>Try again</Text></Pressable></View> :
      results.length === 0 ? <Text style={styles.message}>{query ? 'No people match this search.' : 'No profiles yet. Check back soon.'}</Text> :
        <View style={styles.results}>{results.map((person) =>
          <Pressable key={person.id} accessibilityRole="button" accessibilityLabel={`Open ${person.displayName}'s profile`} onPress={() => setSelectedID(person.id)} style={styles.person}>
            <View style={styles.smallAvatar}><Text style={styles.smallAvatarText}>{person.displayName.charAt(0).toUpperCase()}</Text></View>
            <View style={styles.personText}><Text style={styles.personName}>{person.displayName}</Text><Text style={styles.secondary} numberOfLines={1}>{[person.headline, person.city].filter(Boolean).join(' · ')}</Text></View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>)}</View>}
    {people.hasNextPage && <Pressable accessibilityRole="button" disabled={people.isFetchingNextPage} onPress={() => void people.fetchNextPage()} style={styles.more}><Text style={styles.action}>{people.isFetchingNextPage ? 'Loading…' : 'Load more'}</Text></Pressable>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 28, paddingBottom: 32 },
  title: { fontFamily: fonts.display, fontSize: 32, color: colors.ink },
  secondary: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, marginTop: 4 },
  searchBox: { marginTop: 24, borderWidth: 1, borderColor: colors.line, borderRadius: 12, backgroundColor: colors.white, minHeight: 50, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 9 },
  searchInput: { flex: 1, fontFamily: fonts.body, color: colors.ink, fontSize: 15, paddingVertical: 10 },
  profilePrompt: { marginTop: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  promptText: { fontFamily: fonts.medium, color: colors.blue, fontSize: 13 },
  loading: { marginTop: 32 }, message: { fontFamily: fonts.body, fontSize: 14, color: colors.muted, marginTop: 28 },
  empty: { alignItems: 'flex-start' }, action: { fontFamily: fonts.medium, color: colors.blue, fontSize: 14, marginTop: 12 },
  results: { marginTop: 18, borderTopWidth: 1, borderColor: colors.line },
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

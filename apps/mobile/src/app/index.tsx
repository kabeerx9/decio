import { useAuth, useUser } from '@clerk/expo';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fetchMyProfile, Profile, ProfileInput, saveMyProfile, SessionExpiredError } from '@/lib/profile-api';
import { useUserEvents } from '@/lib/use-user-events';
import { AuthScreen } from '@/screens/auth';
import { ProfileEditor } from '@/screens/profile-editor';
import { PeopleDiscover } from '@/screens/people-discover';
import { CityFeed } from '@/screens/city-feed';
import { Chats } from '@/screens/chats';
import { colors, fonts } from '@/theme';

const apiUrl = process.env.EXPO_PUBLIC_API_URL;
const cityImage = 'https://images.unsplash.com/photo-1519501025264-65ba15a82390?w=1200&q=85';
type Tab = 'discover' | 'feed' | 'chat' | 'profile';

export default function HomeScreen() {
  const { isLoaded, isSignedIn, userId, getToken, signOut } = useAuth();
  const { user } = useUser();
  const queryClient = useQueryClient();
  useUserEvents(isLoaded && isSignedIn ? apiUrl : undefined, userId, getToken);
  const [showAuth, setShowAuth] = useState(false);
  const [tab, setTab] = useState<Tab>('discover');
  const [editing, setEditing] = useState(false);
  const { data: profile, isPending: profilePending, error: profileError } = useQuery<Profile, Error>({
    queryKey: ['profile', userId],
    queryFn: () => fetchMyProfile(apiUrl!, getToken),
    enabled: isLoaded && isSignedIn && !!userId && !!apiUrl,
    retry: (failures, failure) => !(failure instanceof SessionExpiredError) && failures < 1,
  });
  const saveProfile = useMutation({
    mutationFn: (input: ProfileInput) => saveMyProfile(apiUrl!, getToken, input),
    onSuccess: (saved) => {
      queryClient.setQueryData(['profile', userId], saved);
      setEditing(false);
      setTab('profile');
    },
    onError: (failure) => {
      if (failure instanceof SessionExpiredError) {
        queryClient.clear();
        void signOut();
      }
    },
  });

  useEffect(() => {
    if (profileError instanceof SessionExpiredError) {
      queryClient.clear();
      void signOut();
    }
  }, [profileError, queryClient, signOut]);

  useEffect(() => {
    if (!isSignedIn) queryClient.clear();
  }, [isSignedIn, queryClient]);

  const signOutLocal = useCallback(() => { queryClient.clear(); void signOut(); }, [queryClient, signOut]);

  if (!isLoaded) return <CenteredLoading />;
  if (!isSignedIn) return showAuth ? <AuthScreen onBack={() => setShowAuth(false)} /> : <WelcomeScreen onContinue={() => setShowAuth(true)} />;
  if (editing && profile) return <ProfileEditor profile={profile} onBack={() => setEditing(false)} onSave={async (input) => { await saveProfile.mutateAsync(input); }} />;

  const name = profile?.displayName || user?.firstName || 'Explorer';
  return <SafeAreaView style={styles.app} edges={['top', 'bottom']}>
    <View style={styles.topbar}><Brand /><View style={styles.edition}><View style={styles.editionDot} /><Text style={styles.editionText}>THE CITY EDITION</Text></View></View>
    {profilePending && !profile && apiUrl ? <CenteredLoading /> : profileError || !apiUrl ?
      <View style={styles.centered}><Ionicons name="cloud-offline-outline" size={30} color={colors.blue} /><Text style={styles.errorTitle}>Profile unavailable</Text><Text style={styles.bodyMuted}>{profileError?.message ?? 'Set EXPO_PUBLIC_API_URL in apps/mobile/.env.local'}</Text><Pressable style={styles.secondaryButton} onPress={signOutLocal}><Text style={styles.secondaryButtonText}>Sign out</Text></Pressable></View> :
      tab === 'discover' ? <PeopleDiscover apiUrl={apiUrl} userId={userId!} city={profile?.city ?? ''} getToken={getToken} onMyProfile={() => setTab('profile')} onSessionExpired={signOutLocal} /> : tab === 'feed' ? <CityFeed apiUrl={apiUrl} userId={userId!} city={profile?.city ?? ''} getToken={getToken} onMyProfile={() => setTab('profile')} onSessionExpired={signOutLocal} /> : tab === 'chat' ? <Chats apiUrl={apiUrl} userId={userId!} getToken={getToken} onSessionExpired={signOutLocal} /> :
        <ProfileScreen profile={profile ?? null} name={name} email={user?.primaryEmailAddress?.emailAddress ?? ''} onEdit={() => setEditing(true)} onSignOut={signOutLocal} />}
    <View style={styles.tabbar} accessibilityRole="tablist">
      <Pressable accessibilityRole="tab" accessibilityState={{ selected: tab === 'discover' }} style={styles.tab} onPress={() => setTab('discover')}><Ionicons name={tab === 'discover' ? 'compass' : 'compass-outline'} size={22} color={tab === 'discover' ? colors.blue : colors.muted} /><Text style={[styles.tabLabel, tab === 'discover' && styles.tabSelected]}>Discover</Text></Pressable>
      <Pressable accessibilityRole="tab" accessibilityState={{ selected: tab === 'feed' }} style={styles.tab} onPress={() => setTab('feed')}><Ionicons name={tab === 'feed' ? 'newspaper' : 'newspaper-outline'} size={22} color={tab === 'feed' ? colors.blue : colors.muted} /><Text style={[styles.tabLabel, tab === 'feed' && styles.tabSelected]}>City feed</Text></Pressable>
      <Pressable accessibilityRole="tab" accessibilityState={{ selected: tab === 'chat' }} style={styles.tab} onPress={() => setTab('chat')}><Ionicons name={tab === 'chat' ? 'chatbubbles' : 'chatbubbles-outline'} size={22} color={tab === 'chat' ? colors.blue : colors.muted} /><Text style={[styles.tabLabel, tab === 'chat' && styles.tabSelected]}>Messages</Text></Pressable>
      <Pressable accessibilityRole="tab" accessibilityState={{ selected: tab === 'profile' }} style={styles.tab} onPress={() => setTab('profile')}><Ionicons name={tab === 'profile' ? 'person-circle' : 'person-circle-outline'} size={22} color={tab === 'profile' ? colors.blue : colors.muted} /><Text style={[styles.tabLabel, tab === 'profile' && styles.tabSelected]}>Profile</Text></Pressable>
    </View>
  </SafeAreaView>;
}

function Brand() { return <View style={styles.brandLockup}><View style={styles.brandMark}><Text style={styles.brandMarkText}>D</Text></View><Text style={styles.brand}>decio</Text></View>; }
function CenteredLoading() { return <View style={styles.centered}><ActivityIndicator color={colors.blue} size="large" /></View>; }

function WelcomeScreen({ onContinue }: { onContinue: () => void }) {
  return <SafeAreaView style={styles.app}>
    <View style={styles.welcomeTop}><Brand /><Text style={styles.welcomeIssue}>01 / THE CITY IS YOURS</Text></View>
    <View style={styles.welcomeHero}><Image source={{ uri: cityImage }} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel="City skyline at dusk" /><View style={styles.photoShade} /><View style={styles.photoStamp}><Ionicons name="location" color={colors.ink} size={14} /><Text style={styles.photoStampText}>FIND YOUR PEOPLE</Text></View></View>
    <View style={styles.welcomeContent}><Text style={styles.eyebrow}>A MORE CONNECTED CITY</Text><Text style={styles.welcomeTitle}>Good things{'\n'}happen when{'\n'}we meet.</Text><Text style={styles.welcomeDescription}>Discover people nearby, make meaningful connections, and find your place in the city.</Text></View>
    <View style={styles.welcomeActions}><Pressable style={styles.primaryButton} onPress={onContinue}><Text style={styles.primaryButtonText}>Find your people</Text><Ionicons name="arrow-forward" color={colors.white} size={20} /></Pressable><Pressable style={styles.signInButton} onPress={onContinue}><Text style={styles.signInText}>Already here? <Text style={styles.signInEmphasis}>Sign in</Text></Text></Pressable></View>
  </SafeAreaView>;
}

function ProfileScreen({ profile, name, email, onEdit, onSignOut }: { profile: Profile | null; name: string; email: string; onEdit: () => void; onSignOut: () => void }) {
  return <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
    <View style={styles.pageIntro}><Text style={styles.eyebrow}>YOUR CORNER OF THE CITY</Text><Text style={styles.pageTitle}>Profile</Text><Text style={styles.introCopy}>The person behind the connection.</Text></View>
    <View style={styles.profileCard}><View style={styles.avatar}><Text style={styles.avatarText}>{name.charAt(0).toUpperCase()}</Text></View><Text style={styles.profileName}>{name}</Text><Text style={styles.profileEmail}>{email}</Text><View style={styles.profileRule} /><View style={styles.detailRow}><Text style={styles.detailLabel}>CITY</Text><Text style={styles.detailValue}>{profile?.city || 'Not set yet'}</Text></View><View style={styles.detailRow}><Text style={styles.detailLabel}>HEADLINE</Text><Text style={styles.detailValue}>{profile?.headline || 'Add a headline'}</Text></View>{!!profile?.bio && <Text style={styles.profileBio}>{profile.bio}</Text>}{!!profile?.interests.length && <View style={styles.profileInterests}>{profile.interests.map((interest) => <Text key={interest} style={styles.profileInterest}>{interest}</Text>)}</View>}<View style={styles.profileRule} /><View style={styles.detailRow}><Text style={styles.detailLabel}>DECIO ID</Text><Text selectable style={styles.detailValue}>{profile?.id || 'Loading…'}</Text></View></View>
    <Pressable style={styles.editButton} accessibilityRole="button" onPress={onEdit}><Text style={styles.editButtonText}>{profile?.displayName ? 'Edit profile' : 'Complete your profile'}</Text><Ionicons name="arrow-forward" color={colors.white} size={18} /></Pressable>
    <Pressable style={styles.secondaryButton} onPress={onSignOut}><Ionicons name="log-out-outline" color={colors.ink} size={18} /><Text style={styles.secondaryButtonText}>Sign out</Text></Pressable>
  </ScrollView>;
}

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: colors.paper }, centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 28, backgroundColor: colors.paper },
  topbar: { height: 64, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: colors.line },
  brandLockup: { flexDirection: 'row', alignItems: 'center', gap: 8 }, brandMark: { width: 27, height: 27, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center', borderRadius: 7, transform: [{ rotate: '-8deg' }] }, brandMarkText: { color: colors.white, fontFamily: fonts.display, fontSize: 17 }, brand: { color: colors.ink, fontFamily: fonts.display, fontSize: 24, letterSpacing: -1.5 },
  edition: { flexDirection: 'row', alignItems: 'center', gap: 7 }, editionDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.yellow }, editionText: { fontFamily: fonts.medium, color: colors.muted, fontSize: 10, letterSpacing: 1.1 },
  welcomeTop: { height: 65, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24 }, welcomeIssue: { fontFamily: fonts.medium, fontSize: 9, letterSpacing: 0.8, color: colors.muted },
  welcomeHero: { height: '36%', marginHorizontal: 14, borderRadius: 22, overflow: 'hidden', justifyContent: 'flex-end', padding: 18 }, photoShade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(14, 32, 53, 0.42)' }, photoStamp: { flexDirection: 'row', backgroundColor: colors.yellow, alignSelf: 'flex-start', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 100 }, photoStampText: { fontFamily: fonts.medium, fontSize: 10, letterSpacing: 0.7, color: colors.ink },
  welcomeContent: { paddingHorizontal: 28, paddingTop: 28, flex: 1 }, eyebrow: { color: colors.blue, fontFamily: fonts.medium, fontSize: 10, letterSpacing: 1.7 }, welcomeTitle: { fontFamily: fonts.display, color: colors.ink, fontSize: 44, lineHeight: 47, letterSpacing: -2.4, marginTop: 11 }, welcomeDescription: { fontFamily: fonts.body, color: colors.muted, fontSize: 15, lineHeight: 23, marginTop: 13, maxWidth: 350 },
  welcomeActions: { paddingHorizontal: 28, paddingBottom: 20, gap: 10 }, primaryButton: { minHeight: 56, backgroundColor: colors.blue, borderRadius: 14, paddingHorizontal: 19, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, primaryButtonText: { color: colors.white, fontFamily: fonts.medium, fontSize: 16 }, signInButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' }, signInText: { fontFamily: fonts.body, color: colors.muted, fontSize: 14 }, signInEmphasis: { fontFamily: fonts.medium, color: colors.blue }, inlineError: { fontFamily: fonts.body, color: '#B42318', textAlign: 'center' },
  scrollContent: { paddingBottom: 28 }, pageIntro: { paddingHorizontal: 24, paddingTop: 32, paddingBottom: 26 }, pageTitle: { fontFamily: fonts.display, color: colors.ink, fontSize: 38, letterSpacing: -1.5, marginTop: 8 }, introCopy: { fontFamily: fonts.body, color: colors.muted, fontSize: 15, marginTop: 4 },
  discoverHero: { height: 285, marginHorizontal: 16, borderRadius: 20, overflow: 'hidden', padding: 24, justifyContent: 'flex-end' }, heroLabel: { backgroundColor: colors.yellow, borderRadius: 50, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 5, marginBottom: 18 }, heroLabelText: { color: colors.ink, fontFamily: fonts.medium, fontSize: 10, letterSpacing: 0.8 }, heroTitle: { color: colors.white, fontFamily: fonts.display, fontSize: 31, lineHeight: 35, letterSpacing: -0.8 }, heroCaption: { color: colors.white, fontFamily: fonts.body, fontSize: 13, marginTop: 7, lineHeight: 19, maxWidth: 275 },
  sectionHeader: { paddingHorizontal: 24, paddingTop: 32, paddingBottom: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, sectionTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 22, letterSpacing: -0.5 }, sectionNumber: { color: colors.muted, fontFamily: fonts.medium, fontSize: 10, letterSpacing: 1 }, nextStep: { marginHorizontal: 16, backgroundColor: colors.white, borderColor: colors.line, borderWidth: 1, borderRadius: 16, minHeight: 86, flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 17 }, stepIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.paleBlue, alignItems: 'center', justifyContent: 'center' }, stepText: { flex: 1 }, stepTitle: { color: colors.ink, fontFamily: fonts.medium, fontSize: 15 }, stepDescription: { color: colors.muted, fontFamily: fonts.body, fontSize: 12, marginTop: 3 },
  tabbar: { borderTopWidth: 1, borderColor: colors.line, backgroundColor: colors.white, flexDirection: 'row', minHeight: 64, paddingHorizontal: 12 }, tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 }, tabLabel: { fontFamily: fonts.medium, color: colors.muted, fontSize: 11 }, tabSelected: { color: colors.blue },
  profileCard: { marginHorizontal: 16, borderRadius: 20, padding: 23, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line }, avatar: { width: 68, height: 68, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.yellow, marginBottom: 15 }, avatarText: { fontFamily: fonts.display, fontSize: 30, color: colors.ink }, profileName: { fontFamily: fonts.display, color: colors.ink, fontSize: 26 }, profileEmail: { fontFamily: fonts.body, color: colors.muted, fontSize: 14, marginTop: 3 }, profileRule: { height: 1, backgroundColor: colors.line, marginVertical: 22 }, detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 17, gap: 15 }, detailLabel: { fontFamily: fonts.medium, color: colors.muted, fontSize: 10, letterSpacing: 1.1, marginTop: 3 }, detailValue: { fontFamily: fonts.medium, color: colors.ink, fontSize: 12, textAlign: 'right', flexShrink: 1 }, profileNote: { fontFamily: fonts.body, color: colors.muted, fontSize: 13, lineHeight: 20, marginHorizontal: 25, marginTop: 22 }, secondaryButton: { minHeight: 49, marginHorizontal: 16, marginTop: 25, borderRadius: 13, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, secondaryButtonText: { fontFamily: fonts.medium, color: colors.ink, fontSize: 14 }, errorTitle: { fontFamily: fonts.display, color: colors.ink, fontSize: 23 }, bodyMuted: { fontFamily: fonts.body, color: colors.muted, fontSize: 14, textAlign: 'center' },
  profileBio: { color: colors.ink, fontFamily: fonts.body, fontSize: 14, lineHeight: 21 }, profileInterests: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 15 }, profileInterest: { color: colors.blue, backgroundColor: colors.paleBlue, borderRadius: 100, paddingHorizontal: 11, paddingVertical: 7, fontFamily: fonts.medium, fontSize: 11 }, editButton: { minHeight: 52, marginHorizontal: 16, marginTop: 20, paddingHorizontal: 17, borderRadius: 14, backgroundColor: colors.blue, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, editButtonText: { color: colors.white, fontFamily: fonts.medium, fontSize: 15 },
});

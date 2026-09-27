import { useAuth, useUser } from '@clerk/expo';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fetchMyProfile, Profile, ProfileInput, saveMyProfile, SessionExpiredError } from '@/lib/profile-api';
import { Connection, fetchConnections } from '@/lib/connections-api';
import { useUserEvents } from '@/lib/use-user-events';
import { AuthScreen } from '@/screens/auth';
import { ProfileEditor } from '@/screens/profile-editor';
import { PeopleDiscover } from '@/screens/people-discover';
import { CityFeed } from '@/screens/city-feed';
import { Chats } from '@/screens/chats';
import { colors, fonts } from '@/theme';

const apiUrl = process.env.EXPO_PUBLIC_API_URL;
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
  const { data: connections, error: connectionsError } = useQuery<Connection[], Error>({
    queryKey: ['connections', userId],
    queryFn: () => fetchConnections(apiUrl!, getToken),
    enabled: isLoaded && isSignedIn && !!userId && !!apiUrl,
    retry: (failures, failure) => !(failure instanceof SessionExpiredError) && failures < 1,
  });
  const pendingRequests = connections?.filter((item) => item.status === 'incoming').length ?? 0;
  const unreadMessages = connections?.reduce((total, item) => total + (item.status === 'accepted' ? item.unreadCount : 0), 0) ?? 0;
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
    if (profileError instanceof SessionExpiredError || connectionsError instanceof SessionExpiredError) {
      queryClient.clear();
      void signOut();
    }
  }, [profileError, connectionsError, queryClient, signOut]);

  useEffect(() => {
    if (!isSignedIn) queryClient.clear();
  }, [isSignedIn, queryClient]);

  const signOutLocal = useCallback(() => { queryClient.clear(); void signOut(); }, [queryClient, signOut]);

  if (!isLoaded) return <CenteredLoading />;
  if (!isSignedIn) return showAuth ? <AuthScreen onBack={() => setShowAuth(false)} /> : <WelcomeScreen onContinue={() => setShowAuth(true)} />;
  if (editing && profile) return <ProfileEditor profile={profile} onBack={() => setEditing(false)} onSave={async (input) => { await saveProfile.mutateAsync(input); }} />;

  const name = profile?.displayName || user?.firstName || 'Explorer';
  return <SafeAreaView style={styles.app} edges={['top', 'bottom']}>
    <View style={styles.topbar}><Brand /><View style={styles.cityPill}><Ionicons name="location-outline" size={15} color={colors.accent} /><Text style={styles.cityPillText} numberOfLines={1}>{profile?.city || 'Choose a city'}</Text></View></View>
    {profilePending && !profile && apiUrl ? <CenteredLoading /> : profileError || !apiUrl ?
      <View style={styles.centered}><Ionicons name="cloud-offline-outline" size={30} color={colors.accent} /><Text style={styles.errorTitle}>Profile unavailable</Text><Text style={styles.bodyMuted}>{profileError?.message ?? 'Set EXPO_PUBLIC_API_URL in apps/mobile/.env.local'}</Text><Pressable style={styles.secondaryButton} onPress={signOutLocal}><Text style={styles.secondaryButtonText}>Sign out</Text></Pressable></View> :
      tab === 'discover' ? <PeopleDiscover apiUrl={apiUrl} userId={userId!} city={profile?.city ?? ''} getToken={getToken} onMyProfile={() => setTab('profile')} onSessionExpired={signOutLocal} /> : tab === 'feed' ? <CityFeed apiUrl={apiUrl} userId={userId!} city={profile?.city ?? ''} getToken={getToken} onMyProfile={() => setTab('profile')} onSessionExpired={signOutLocal} /> : tab === 'chat' ? <Chats apiUrl={apiUrl} userId={userId!} getToken={getToken} onSessionExpired={signOutLocal} /> :
        <ProfileScreen profile={profile ?? null} name={name} email={user?.primaryEmailAddress?.emailAddress ?? ''} onEdit={() => setEditing(true)} onSignOut={signOutLocal} />}
    <View style={styles.tabbar} accessibilityRole="tablist">
      <Pressable accessibilityRole="tab" accessibilityLabel={pendingRequests ? `Discover, ${pendingRequests} incoming connection requests` : 'Discover'} accessibilityState={{ selected: tab === 'discover' }} style={styles.tab} onPress={() => setTab('discover')}><View><Ionicons name={tab === 'discover' ? 'compass' : 'compass-outline'} size={22} color={tab === 'discover' ? colors.accent : colors.muted} /><CountBadge count={pendingRequests} /></View><Text style={[styles.tabLabel, tab === 'discover' && styles.tabSelected]}>Discover</Text></Pressable>
      <Pressable accessibilityRole="tab" accessibilityState={{ selected: tab === 'feed' }} style={styles.tab} onPress={() => setTab('feed')}><Ionicons name={tab === 'feed' ? 'newspaper' : 'newspaper-outline'} size={22} color={tab === 'feed' ? colors.accent : colors.muted} /><Text style={[styles.tabLabel, tab === 'feed' && styles.tabSelected]}>City feed</Text></Pressable>
      <Pressable accessibilityRole="tab" accessibilityLabel={unreadMessages ? `Messages, ${unreadMessages} unread` : 'Messages'} accessibilityState={{ selected: tab === 'chat' }} style={styles.tab} onPress={() => setTab('chat')}><View><Ionicons name={tab === 'chat' ? 'chatbubbles' : 'chatbubbles-outline'} size={22} color={tab === 'chat' ? colors.accent : colors.muted} /><CountBadge count={unreadMessages} /></View><Text style={[styles.tabLabel, tab === 'chat' && styles.tabSelected]}>Messages</Text></Pressable>
      <Pressable accessibilityRole="tab" accessibilityState={{ selected: tab === 'profile' }} style={styles.tab} onPress={() => setTab('profile')}><Ionicons name={tab === 'profile' ? 'person-circle' : 'person-circle-outline'} size={22} color={tab === 'profile' ? colors.accent : colors.muted} /><Text style={[styles.tabLabel, tab === 'profile' && styles.tabSelected]}>Profile</Text></Pressable>
    </View>
  </SafeAreaView>;
}

function Brand() { return <View style={styles.brandLockup}><Image source={require('../../assets/images/brand-mark.png')} style={styles.brandMark} contentFit="contain" accessibilityLabel="Decio logo" /><Text style={styles.brand}>decio</Text></View>; }
function CenteredLoading() { return <View style={styles.centered}><ActivityIndicator color={colors.accent} size="large" /></View>; }
function CountBadge({ count }: { count: number }) { return count > 0 ? <View style={styles.tabBadge}><Text style={styles.tabBadgeText}>{count > 99 ? '99+' : count}</Text></View> : null; }

function WelcomeScreen({ onContinue }: { onContinue: () => void }) {
  return <SafeAreaView style={styles.app}>
    <View style={styles.welcomeTop}><Brand /></View>
    <View style={styles.welcomeHero}><View style={styles.welcomeOrbitOne} /><View style={styles.welcomeOrbitTwo} /><Image source={require('../../assets/images/brand-mark.png')} style={styles.welcomeMark} contentFit="contain" /><Text style={styles.welcomeHeroText}>A city feels smaller when you know someone.</Text></View>
    <View style={styles.welcomeContent}><Text style={styles.welcomeTitle}>Start with hello.</Text><Text style={styles.welcomeDescription}>Meet people nearby, share what is happening, and keep the conversation going.</Text></View>
    <View style={styles.welcomeActions}><Pressable style={styles.primaryButton} onPress={onContinue}><Text style={styles.primaryButtonText}>Get started</Text><Ionicons name="arrow-forward" color={colors.white} size={20} /></Pressable><Pressable style={styles.signInButton} onPress={onContinue}><Text style={styles.signInText}>Already here? <Text style={styles.signInEmphasis}>Sign in</Text></Text></Pressable></View>
  </SafeAreaView>;
}

function ProfileScreen({ profile, name, email, onEdit, onSignOut }: { profile: Profile | null; name: string; email: string; onEdit: () => void; onSignOut: () => void }) {
  return <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
    <View style={styles.pageIntro}><Text style={styles.pageTitle}>Your profile</Text><Text style={styles.introCopy}>Let people know who they are meeting.</Text></View>
    <View style={styles.profileCard}><View style={styles.avatar}><Text style={styles.avatarText}>{name.charAt(0).toUpperCase()}</Text></View><Text style={styles.profileName}>{name}</Text><Text style={styles.profileEmail}>{email}</Text><View style={styles.profileRule} /><View style={styles.detailRow}><Text style={styles.detailLabel}>City</Text><Text style={styles.detailValue}>{profile?.city || 'Not set yet'}</Text></View><View style={styles.detailRow}><Text style={styles.detailLabel}>About</Text><Text style={styles.detailValue}>{profile?.headline || 'Add a headline'}</Text></View>{!!profile?.bio && <Text style={styles.profileBio}>{profile.bio}</Text>}{!!profile?.interests.length && <View style={styles.profileInterests}>{profile.interests.map((interest) => <Text key={interest} style={styles.profileInterest}>{interest}</Text>)}</View>}</View>
    <Pressable style={styles.editButton} accessibilityRole="button" onPress={onEdit}><Text style={styles.editButtonText}>{profile?.displayName ? 'Edit profile' : 'Complete your profile'}</Text><Ionicons name="arrow-forward" color={colors.white} size={18} /></Pressable>
    <Pressable style={styles.secondaryButton} onPress={onSignOut}><Ionicons name="log-out-outline" color={colors.ink} size={18} /><Text style={styles.secondaryButtonText}>Sign out</Text></Pressable>
  </ScrollView>;
}

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: colors.paper }, centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 28, backgroundColor: colors.paper },
  topbar: { height: 66, paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.paper },
  brandLockup: { flexDirection: 'row', alignItems: 'center', gap: 8 }, brandMark: { width: 35, height: 35 }, brand: { color: colors.ink, fontFamily: fonts.display, fontSize: 25, letterSpacing: -1.5 },
  cityPill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.blush, borderRadius: 18, paddingHorizontal: 10, paddingVertical: 7, maxWidth: 155 }, cityPillText: { color: colors.ink, fontFamily: fonts.medium, fontSize: 12, flexShrink: 1 },
  welcomeTop: { height: 76, justifyContent: 'center', paddingHorizontal: 24 },
  welcomeHero: { flex: 1, minHeight: 280, marginHorizontal: 18, borderRadius: 30, overflow: 'hidden', justifyContent: 'space-between', padding: 28, backgroundColor: colors.plum },
  welcomeOrbitOne: { position: 'absolute', width: 240, height: 240, borderRadius: 120, backgroundColor: '#5B4868', right: -60, top: -52 },
  welcomeOrbitTwo: { position: 'absolute', width: 210, height: 210, borderRadius: 105, backgroundColor: colors.coral, right: -110, top: 70 },
  welcomeMark: { width: 66, height: 66 },
  welcomeHeroText: { color: colors.white, fontFamily: fonts.display, fontSize: 35, lineHeight: 39, letterSpacing: -0.8, maxWidth: 300 },
  welcomeContent: { paddingHorizontal: 28, paddingTop: 25, paddingBottom: 18 }, welcomeTitle: { fontFamily: fonts.display, color: colors.ink, fontSize: 33, lineHeight: 38, letterSpacing: -1 }, welcomeDescription: { fontFamily: fonts.body, color: colors.muted, fontSize: 15, lineHeight: 23, marginTop: 7, maxWidth: 350 },
  welcomeActions: { paddingHorizontal: 28, paddingBottom: 20, gap: 10 }, primaryButton: { minHeight: 56, backgroundColor: colors.accent, borderRadius: 14, paddingHorizontal: 19, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, primaryButtonText: { color: colors.white, fontFamily: fonts.medium, fontSize: 16 }, signInButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' }, signInText: { fontFamily: fonts.body, color: colors.muted, fontSize: 14 }, signInEmphasis: { fontFamily: fonts.medium, color: colors.accent }, inlineError: { fontFamily: fonts.body, color: '#B42318', textAlign: 'center' },
  scrollContent: { paddingBottom: 34 }, pageIntro: { paddingHorizontal: 24, paddingTop: 26, paddingBottom: 24 }, pageTitle: { fontFamily: fonts.display, color: colors.ink, fontSize: 37, letterSpacing: -1.2 }, introCopy: { fontFamily: fonts.body, color: colors.muted, fontSize: 15, marginTop: 5 },
  tabbar: { borderTopWidth: 1, borderColor: colors.line, backgroundColor: colors.white, flexDirection: 'row', minHeight: 68, paddingHorizontal: 12 }, tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 }, tabLabel: { fontFamily: fonts.medium, color: colors.muted, fontSize: 11 }, tabSelected: { color: colors.accent },
  tabBadge: { position: 'absolute', top: -7, left: 15, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 3, backgroundColor: colors.plum, alignItems: 'center', justifyContent: 'center' }, tabBadgeText: { color: colors.white, fontFamily: fonts.medium, fontSize: 10 },
  profileCard: { marginHorizontal: 18, borderRadius: 24, padding: 24, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line }, avatar: { width: 72, height: 72, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.blush, marginBottom: 18 }, avatarText: { fontFamily: fonts.display, fontSize: 32, color: colors.accent }, profileName: { fontFamily: fonts.display, color: colors.ink, fontSize: 28 }, profileEmail: { fontFamily: fonts.body, color: colors.muted, fontSize: 14, marginTop: 4 }, profileRule: { height: 1, backgroundColor: colors.line, marginVertical: 22 }, detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, gap: 15 }, detailLabel: { fontFamily: fonts.medium, color: colors.muted, fontSize: 13, marginTop: 2 }, detailValue: { fontFamily: fonts.medium, color: colors.ink, fontSize: 14, textAlign: 'right', flexShrink: 1 }, secondaryButton: { minHeight: 49, marginHorizontal: 18, marginTop: 25, borderRadius: 13, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, secondaryButtonText: { fontFamily: fonts.medium, color: colors.ink, fontSize: 14 }, errorTitle: { fontFamily: fonts.display, color: colors.ink, fontSize: 23 }, bodyMuted: { fontFamily: fonts.body, color: colors.muted, fontSize: 14, textAlign: 'center' },
  profileBio: { color: colors.ink, fontFamily: fonts.body, fontSize: 14, lineHeight: 21 }, profileInterests: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 15 }, profileInterest: { color: colors.accent, backgroundColor: colors.lilac, borderRadius: 100, paddingHorizontal: 11, paddingVertical: 7, fontFamily: fonts.medium, fontSize: 11 }, editButton: { minHeight: 52, marginHorizontal: 16, marginTop: 20, paddingHorizontal: 17, borderRadius: 14, backgroundColor: colors.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, editButtonText: { color: colors.white, fontFamily: fonts.medium, fontSize: 15 },
});

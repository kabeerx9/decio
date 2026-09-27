import { ClerkProvider, useAuth } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { Archivo_400Regular, Archivo_500Medium, Archivo_700Bold, Archivo_800ExtraBold } from '@expo-google-fonts/archivo';
import { focusManager, QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router/stack';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useMemo, useRef } from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';
import { KeyboardProvider } from 'react-native-keyboard-controller';

import { EmptyState } from '@/components/empty-state';
import { Pill } from '@/components/pill';
import { Screen } from '@/components/screen';
import { fetchMyProfile, Profile, SessionExpiredError } from '@/lib/profile-api';
import { retryUnlessExpired } from '@/lib/selectors';
import { profileGate, signOutOnce } from '@/lib/session-gate';
import { Session, SessionProvider } from '@/lib/session';
import { useUserEvents } from '@/lib/use-user-events';
import { colors } from '@/theme';

void SplashScreen.preventAutoHideAsync();
void SystemUI.setBackgroundColorAsync(colors.bg);
const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
const apiUrl = process.env.EXPO_PUBLIC_API_URL;
const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } });

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    'ArchivoExtraCondensed-Black': require('../../assets/fonts/ArchivoExtraCondensed-Black.ttf'),
    Archivo_400Regular, Archivo_500Medium, Archivo_700Bold, Archivo_800ExtraBold,
  });
  useEffect(() => { if (fontsLoaded) void SplashScreen.hideAsync(); }, [fontsLoaded]);
  useEffect(() => {
    const listener = AppState.addEventListener('change', (state) => {
      focusManager.setFocused(state === 'active');
      if (state === 'active') {
        void queryClient.invalidateQueries({ queryKey: ['connections'] });
        void queryClient.invalidateQueries({ queryKey: ['messages'] });
      }
    });
    return () => listener.remove();
  }, []);
  if (!fontsLoaded) return <Loading />;
  if (!publishableKey) throw new Error('Set EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY in apps/mobile/.env.local');
  return <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
    <QueryClientProvider client={queryClient}>
      <KeyboardProvider>
        <StatusBar style="light" />
        <Gate />
      </KeyboardProvider>
    </QueryClientProvider>
  </ClerkProvider>;
}

function Gate() {
  const { isLoaded, isSignedIn, userId, getToken, signOut } = useAuth();
  const client = useQueryClient();
  const signedIn = isLoaded && !!isSignedIn && !!userId;
  const signOutRef = useRef(signOut);
  signOutRef.current = signOut;
  useUserEvents(signedIn ? apiUrl : undefined, userId, getToken);
  const profile = useQuery<Profile, Error>({
    queryKey: ['profile', userId],
    queryFn: () => fetchMyProfile(apiUrl!, getToken),
    enabled: signedIn && !!apiUrl,
    retry: retryUnlessExpired,
  });

  // Clear the cache only after Clerk confirms, so a still-mounted profile query can't refetch into an error screen.
  const signOutLocal = useMemo(() => signOutOnce(async () => {
    await signOutRef.current();
    client.clear();
  }), [client]);
  useEffect(() => { if (signedIn) signOutLocal.reset(); }, [signedIn, signOutLocal]);
  useEffect(() => { if (profile.error instanceof SessionExpiredError) signOutLocal(); }, [profile.error, signOutLocal]);
  useEffect(() => { if (isLoaded && !isSignedIn) client.clear(); }, [isLoaded, isSignedIn, client]);

  const session = useMemo<Session | null>(() => signedIn && apiUrl && profile.data
    ? { apiUrl, userId: userId!, getToken, profile: profile.data, signOutLocal }
    : null, [signedIn, userId, getToken, profile.data, signOutLocal]);

  const gate = profileGate({ signedIn, hasApiUrl: !!apiUrl, error: profile.error, hasData: !!profile.data });
  if (!isLoaded) return <Loading />;
  if (gate === 'error') return <Screen edges={['top', 'bottom']} style={{ justifyContent: 'center' }}>
    <EmptyState emoji="📡" title="profile unavailable" body={profile.error?.message ?? 'Set EXPO_PUBLIC_API_URL in apps/mobile/.env.local'}
      action={<View style={{ flexDirection: 'row', gap: 8 }}><Pill label="try again" onPress={() => void profile.refetch()} /><Pill label="sign out" onPress={signOutLocal} /></View>} />
  </Screen>;
  if (gate === 'loading' || (gate === 'ready' && !session)) return <Loading />;

  const onboarded = !!session?.profile.onboardingComplete;
  return <SessionProvider value={session}>
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Protected guard={!signedIn}><Stack.Screen name="(auth)" /></Stack.Protected>
      <Stack.Protected guard={signedIn && !onboarded}><Stack.Screen name="onboarding" /></Stack.Protected>
      <Stack.Protected guard={signedIn && onboarded}><Stack.Screen name="(app)" /></Stack.Protected>
    </Stack>
  </SessionProvider>;
}

function Loading() {
  return <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }}><ActivityIndicator color={colors.ink} /></View>;
}

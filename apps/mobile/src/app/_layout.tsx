import { ClerkProvider } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { BricolageGrotesque_700Bold } from '@expo-google-fonts/bricolage-grotesque';
import { DMSans_400Regular, DMSans_600SemiBold } from '@expo-google-fonts/dm-sans';
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Slot } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';
import { KeyboardProvider } from 'react-native-keyboard-controller';

import { colors } from '@/theme';

void SplashScreen.preventAutoHideAsync();
const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } });

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ BricolageGrotesque_700Bold, DMSans_400Regular, DMSans_600SemiBold });
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
  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: colors.paper, justifyContent: 'center' }}><ActivityIndicator color={colors.accent} /></View>;
  if (!publishableKey) throw new Error('Set EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY in apps/mobile/.env.local');
  return <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}><QueryClientProvider client={queryClient}><KeyboardProvider><Slot /></KeyboardProvider></QueryClientProvider></ClerkProvider>;
}

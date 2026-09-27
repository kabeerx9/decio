import { Stack } from 'expo-router/stack';

import { colors } from '@/theme';

export const unstable_settings = { initialRouteName: '(tabs)' };

export default function AppLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'slide_from_right' }}>
    <Stack.Screen name="(tabs)" />
    <Stack.Screen name="compose" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
  </Stack>;
}

import { Tabs } from 'expo-router/js-tabs';

import { TabBar } from '@/components/tab-bar';
import { useConnections } from '@/lib/queries';
import { connectionBadges } from '@/lib/selectors';
import { colors } from '@/theme';

export default function TabsLayout() {
  const connections = useConnections();
  const { requests, unread } = connectionBadges(connections.data);
  return <Tabs screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}
    tabBar={(props) => <TabBar {...props} badges={{ index: requests, chats: unread }} />}>
    <Tabs.Screen name="index" />
    <Tabs.Screen name="city" />
    <Tabs.Screen name="chats" />
    <Tabs.Screen name="you" />
  </Tabs>;
}

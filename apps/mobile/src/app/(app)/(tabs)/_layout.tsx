import { Tabs } from 'expo-router/js-tabs';
import { useEffect, useRef } from 'react';

import { TabBar } from '@/components/tab-bar';
import { useConnections } from '@/lib/queries';
import { incoming } from '@/lib/haptics';
import { connectionBadges, unreadIncreased } from '@/lib/selectors';
import { colors } from '@/theme';

export default function TabsLayout() {
  const connections = useConnections();
  const { requests, unread } = connectionBadges(connections.data);
  // The tabs stay mounted under every stack screen, so this one watcher covers the whole app.
  const lastUnread = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!connections.data) return;
    if (unreadIncreased(lastUnread.current, unread)) incoming();
    lastUnread.current = unread;
  }, [connections.data, unread]);
  return <Tabs screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}
    tabBar={(props) => <TabBar {...props} badges={{ index: requests, chats: unread }} />}>
    <Tabs.Screen name="index" />
    <Tabs.Screen name="city" />
    <Tabs.Screen name="chats" />
    <Tabs.Screen name="you" />
  </Tabs>;
}

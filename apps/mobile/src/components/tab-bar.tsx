import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { accent, colors, fonts, radius } from '@/theme';

const tabs = {
  index: { label: 'People', icon: 'people', color: accent.people },
  city: { label: 'City', icon: 'images', color: accent.city },
  chats: { label: 'Chats', icon: 'chatbubble', color: accent.chats },
  you: { label: 'You', icon: 'person', color: accent.you },
} as const;

type Props = BottomTabBarProps & { badges: Partial<Record<string, number>> };

export function TabBar({ state, navigation, badges }: Props) {
  const insets = useSafeAreaInsets();
  return <View style={[styles.wrap, { paddingBottom: insets.bottom + 6 }]}>
    <View style={styles.bar} accessibilityRole="tablist">
      {state.routes.map((route, index) => {
        const tab = tabs[route.name as keyof typeof tabs];
        if (!tab) return null;
        const focused = state.index === index;
        const count = badges[route.name] ?? 0;
        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
        };
        const icon = (focused ? tab.icon : `${tab.icon}-outline`) as keyof typeof Ionicons.glyphMap;
        return <Pressable key={route.key} accessibilityRole="tab" accessibilityState={{ selected: focused }}
          accessibilityLabel={count ? `${tab.label}, ${count} new` : tab.label} onPress={onPress}
          style={[styles.tab, focused && { backgroundColor: tab.color, paddingHorizontal: 16 }]}>
          <View>
            <Ionicons name={icon} size={22} color={focused ? colors.onAccent : colors.mute} />
            {count > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text></View>}
          </View>
          {focused && <Text style={styles.label}>{tab.label}</Text>}
        </Pressable>;
      })}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: colors.bg, paddingHorizontal: 14, paddingTop: 6 },
  bar: { height: 66, borderRadius: radius.pill, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 8 },
  tab: { height: 50, minWidth: 50, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  label: { fontFamily: fonts.heavy, fontSize: 14, color: colors.onAccent },
  badge: { position: 'absolute', top: -6, right: -10, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.surface },
  badgeText: { fontFamily: fonts.heavy, fontSize: 10, color: colors.bg },
});

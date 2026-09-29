import { useLocalSearchParams } from 'expo-router';

import { ConnectionsScreen } from '@/screens/connections';

export default function ConnectionsRoute() {
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  return <ConnectionsScreen initialTab={tab === 'pending' ? 'pending' : 'connected'} />;
}

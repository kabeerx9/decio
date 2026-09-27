import { useLocalSearchParams } from 'expo-router';

import { PersonScreen } from '@/screens/person';

export default function PersonRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PersonScreen key={id} id={id} />;
}

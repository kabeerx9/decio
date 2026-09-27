import { useLocalSearchParams } from 'expo-router';

import { Conversation } from '@/screens/conversation';

export default function ChatRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Conversation key={id} id={id} />;
}

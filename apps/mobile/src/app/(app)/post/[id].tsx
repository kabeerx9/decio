import { useLocalSearchParams } from 'expo-router';

import { PostReplies } from '@/screens/post-replies';

export default function PostRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PostReplies key={id} id={id} />;
}

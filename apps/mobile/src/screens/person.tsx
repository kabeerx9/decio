import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BackHeader, goBack } from '@/components/back-header';
import { Chip } from '@/components/chip';
import { Cover } from '@/components/cover';
import { EmptyState } from '@/components/empty-state';
import { Pill } from '@/components/pill';
import { Screen } from '@/components/screen';
import { acceptConnection, requestConnection } from '@/lib/connections-api';
import { success } from '@/lib/haptics';
import { fetchPublicProfile } from '@/lib/people-api';
import { useConnections } from '@/lib/queries';
import { retryUnlessExpired } from '@/lib/selectors';
import { useSession, useSignOutOnExpiry } from '@/lib/session';
import { accent, colors, fonts } from '@/theme';

const tint = accent.people;

export function PersonScreen({ id }: { id: string }) {
  const { apiUrl, userId, getToken } = useSession();
  const queryClient = useQueryClient();
  const person = useQuery({ queryKey: ['publicProfile', userId, id], queryFn: () => fetchPublicProfile(apiUrl, getToken, id), retry: retryUnlessExpired });
  const connections = useConnections();
  const connect = useMutation({
    mutationFn: (kind: 'request' | 'accept') => kind === 'request' ? requestConnection(apiUrl, getToken, id) : acceptConnection(apiUrl, getToken, id),
    onSuccess: () => { success(); return queryClient.invalidateQueries({ queryKey: ['connections', userId] }); },
  });
  useSignOutOnExpiry(person.error, connect.error);

  if (!person.data) return <Screen edges={['top', 'bottom']}>
    <BackHeader title="" />
    {person.isPending ? <ActivityIndicator color={tint} style={styles.loading} /> :
      <EmptyState emoji="🫥" title="not found" body={person.error?.message} action={<Pill label="try again" onPress={() => void person.refetch()} />} />}
  </Screen>;

  const profile = person.data;
  const status = connections.data?.find((item) => item.other.id === id)?.status;
  const action = connections.isPending ? <ActivityIndicator color={tint} /> :
    connections.error ? <Pill label="retry status" onPress={() => void connections.refetch()} /> :
      status === 'accepted' ? <Pill label="message" icon="chatbubble" color={tint} onPress={() => router.push(`/chat/${id}`)} /> :
        status === 'sent' ? <Pill label="request sent" disabled /> :
          <Pill label={status === 'incoming' ? 'accept' : 'connect'} color={tint} busy={connect.isPending}
            onPress={() => connect.mutate(status === 'incoming' ? 'accept' : 'request')} />;

  return <Screen edges={['bottom']}>
    <ScrollView contentContainerStyle={styles.content}>
      <Cover name={profile.displayName} imageUrl={profile.imageUrl} subtitle={profile.headline} onBack={goBack} />
      <View style={styles.actions}>{action}{!!profile.city && <Chip label={`📍 ${profile.city}`} />}</View>
      {!!connect.error && <Text accessibilityRole="alert" style={styles.error}>{connect.error.message}</Text>}
      {!!profile.bio && <Text style={styles.bio}>{profile.bio}</Text>}
      {!!profile.interests.length && <View style={styles.chips}>{profile.interests.map((interest) => <Chip key={interest} label={interest} />)}</View>}
    </ScrollView>
  </Screen>;
}

const styles = StyleSheet.create({
  content: { paddingBottom: 32 },
  loading: { marginTop: 60 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  error: { color: colors.danger, fontFamily: fonts.body, fontSize: 13, paddingHorizontal: 16, paddingTop: 10 },
  bio: { color: colors.ink, fontFamily: fonts.body, fontSize: 16, lineHeight: 23, paddingHorizontal: 16, paddingTop: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 16, paddingTop: 14 },
});

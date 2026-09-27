import { Ionicons } from '@expo/vector-icons';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { File } from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { CityPost, createCityPost, fetchCityPosts, PickedPhoto, postPhotoURL } from '@/lib/posts-api';
import { SessionExpiredError } from '@/lib/profile-api';
import { Avatar } from '@/components/avatar';
import { PostReplies } from '@/screens/post-replies';
import { colors, fonts } from '@/theme';

type Props = {
  apiUrl: string; userId: string; city: string; getToken: () => Promise<string | null>;
  onMyProfile: () => void; onSessionExpired: () => void;
};

export function CityFeed({ apiUrl, userId, city, getToken, onMyProfile, onSessionExpired }: Props) {
  const [draft, setDraft] = useState('');
  const [composing, setComposing] = useState(false);
  const [selectedPost, setSelectedPost] = useState<CityPost | null>(null);
  const [photo, setPhoto] = useState<PickedPhoto | undefined>();
  const [pickerError, setPickerError] = useState('');
  const [imageToken, setImageToken] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const feed = useInfiniteQuery({
    queryKey: ['posts', userId, city], initialPageParam: '',
    queryFn: ({ pageParam }) => fetchCityPosts(apiUrl, getToken, pageParam),
    getNextPageParam: (lastPage) => lastPage.nextCursor || undefined,
    retry: (failures, failure) => !(failure instanceof SessionExpiredError) && failures < 1,
  });
  const publish = useMutation({
    mutationFn: () => createCityPost(apiUrl, getToken, draft, photo),
    onSuccess: async () => {
      setDraft(''); setPhoto(undefined); setPickerError(''); setComposing(false);
      await queryClient.invalidateQueries({ queryKey: ['posts', userId] });
    },
  });

  useEffect(() => {
    let active = true;
    void getToken().then((token) => { if (active) setImageToken(token); }).catch(() => { if (active) setImageToken(null); });
    return () => { active = false; };
  }, [getToken, userId]);
  useEffect(() => {
    if (feed.error instanceof SessionExpiredError || publish.error instanceof SessionExpiredError) onSessionExpired();
  }, [feed.error, publish.error, onSessionExpired]);

  const pickPhoto = async () => {
    setPickerError('');
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
      if (result.canceled) return;
      const asset = result.assets[0];
      const context = ImageManipulator.ImageManipulator.manipulate(asset.uri);
      if (asset.width > 1600 || asset.height > 1600) context.resize(asset.width >= asset.height ? { width: 1600, height: null } : { width: null, height: 1600 });
      const rendered = await context.renderAsync();
      const saved = await rendered.saveAsync({ format: ImageManipulator.SaveFormat.JPEG, compress: 0.75 });
      const file = Platform.OS === 'web' ? await (await fetch(saved.uri)).blob() : new File(saved.uri);
      setPhoto({ uri: saved.uri, file, fileName: 'city-photo.jpg', fileSize: file.size });
    } catch {
      setPickerError('Could not prepare that photo. Choose another one.');
    }
  };
  const posts = feed.data?.pages.flatMap((page) => page.posts) ?? [];
  if (selectedPost) return <PostReplies apiUrl={apiUrl} userId={userId} post={selectedPost} imageToken={imageToken} getToken={getToken} onBack={() => setSelectedPost(null)} onSessionExpired={onSessionExpired} />;
  return <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <View style={styles.intro}><Text style={styles.title}>{city || 'Your city'} today</Text><Text style={styles.subtitle}>Notes and moments from people nearby.</Text></View>
    {!city ? <View style={styles.empty}><Text style={styles.emptyTitle}>Add your city first</Text><Text style={styles.muted}>Your feed follows the city on your profile.</Text><Pressable accessibilityRole="button" onPress={onMyProfile} style={styles.button}><Text style={styles.buttonText}>Go to profile</Text></Pressable></View> : <>
      {!composing ? <Pressable accessibilityRole="button" accessibilityLabel="Create a city post" onPress={() => setComposing(true)} style={styles.composerPrompt}><View style={styles.promptIcon}><Ionicons name="create-outline" size={21} color={colors.accent} /></View><Text style={styles.promptText}>Share something with {city}</Text><Ionicons name="add" size={21} color={colors.accent} /></Pressable> :
        <View style={styles.composer}>
          <View style={styles.composeHeading}><Text style={styles.sectionTitle}>New post</Text><Pressable accessibilityRole="button" accessibilityLabel="Close post composer" onPress={() => { setComposing(false); publish.reset(); }}><Ionicons name="close" size={23} color={colors.muted} /></Pressable></View>
          <TextInput accessibilityLabel="Post text" placeholder={`What's happening in ${city}?`} placeholderTextColor={colors.muted} value={draft} onChangeText={setDraft} multiline maxLength={1000} style={styles.input} />
          {!!photo && <View style={styles.preview}><Image source={{ uri: photo.uri }} style={styles.previewImage} contentFit="cover" /><Pressable accessibilityRole="button" accessibilityLabel="Remove photo" onPress={() => setPhoto(undefined)} style={styles.remove}><Ionicons name="close" size={18} color={colors.white} /></Pressable></View>}
          <View style={styles.composeActions}><Pressable accessibilityRole="button" onPress={() => void pickPhoto()} style={styles.photoButton}><Ionicons name="image-outline" size={20} color={colors.accent} /><Text style={styles.photoText}>{photo ? 'Change photo' : 'Add photo'}</Text></Pressable><Pressable accessibilityRole="button" disabled={!draft.trim() || publish.isPending} onPress={() => publish.mutate()} style={[styles.button, (!draft.trim() || publish.isPending) && styles.disabled]}><Text style={styles.buttonText}>{publish.isPending ? 'Posting…' : 'Post'}</Text></Pressable></View>
          {!!pickerError && <Text accessibilityRole="alert" style={styles.error}>{pickerError}</Text>}
          {!!publish.error && <Text accessibilityRole="alert" style={styles.error}>{publish.error.message}</Text>}
        </View>}
      <View style={styles.feedHeading}><Text style={styles.sectionTitle}>Latest in {city}</Text><Pressable accessibilityRole="button" accessibilityLabel="Refresh posts" onPress={() => void feed.refetch()}><Ionicons name="refresh" size={20} color={colors.accent} /></Pressable></View>
      {feed.isPending ? <ActivityIndicator color={colors.accent} style={styles.loading} /> : feed.error ? <View style={styles.empty}><Text style={styles.error}>{feed.error.message}</Text><Pressable accessibilityRole="button" onPress={() => void feed.refetch()}><Text style={styles.retry}>Try again</Text></Pressable></View> : !posts.length ? <View style={styles.empty}><Text style={styles.emptyTitle}>No posts yet</Text><Text style={styles.muted}>Start the conversation in {city}.</Text></View> : posts.map((post) => <View key={post.id} style={styles.card}>
        <View style={styles.authorRow}><Avatar name={post.authorName} imageUrl={post.authorImageUrl} size={40} radius={14} /><View style={styles.authorDetails}><Text style={styles.author}>{post.authorName}</Text><Text style={styles.meta}>{new Date(post.createdAt).toLocaleDateString()} · {post.city}</Text></View></View>
        <Text style={styles.body}>{post.body}</Text>
        {post.hasPhoto && imageToken && <Image source={{ uri: postPhotoURL(apiUrl, post.id), headers: { Authorization: `Bearer ${imageToken}` } }} style={styles.postImage} contentFit="cover" accessibilityLabel={`Photo by ${post.authorName}`} />}
        <Pressable accessibilityRole="button" accessibilityLabel={`View replies to ${post.authorName}'s post`} onPress={() => setSelectedPost(post)} style={styles.replyAction}><Ionicons name="chatbubble-outline" size={18} color={colors.accent} /><Text style={styles.replyActionText}>Reply</Text></Pressable>
      </View>)}
      {feed.hasNextPage && <Pressable accessibilityRole="button" disabled={feed.isFetchingNextPage} onPress={() => void feed.fetchNextPage()} style={styles.more}><Text style={styles.retry}>{feed.isFetchingNextPage ? 'Loading…' : 'Load more'}</Text></Pressable>}
    </>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 22, paddingBottom: 40 }, intro: { paddingTop: 26, paddingBottom: 23 }, title: { fontFamily: fonts.display, fontSize: 37, color: colors.ink, letterSpacing: -1.2 }, subtitle: { fontFamily: fonts.body, fontSize: 15, color: colors.muted, marginTop: 5 },
  composerPrompt: { minHeight: 76, borderRadius: 19, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 17, flexDirection: 'row', alignItems: 'center', gap: 12 }, promptIcon: { width: 40, height: 40, borderRadius: 14, backgroundColor: colors.blush, justifyContent: 'center', alignItems: 'center' }, promptText: { flex: 1, color: colors.ink, fontFamily: fonts.medium, fontSize: 14 },
  composer: { padding: 18, borderRadius: 19, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line }, composeHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, sectionTitle: { fontFamily: fonts.display, fontSize: 21, color: colors.ink }, input: { minHeight: 106, color: colors.ink, fontFamily: fonts.body, fontSize: 15, textAlignVertical: 'top', marginTop: 15 }, composeActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }, photoButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10 }, photoText: { color: colors.accent, fontFamily: fonts.medium, fontSize: 13 }, button: { backgroundColor: colors.accent, borderRadius: 12, minHeight: 42, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' }, disabled: { opacity: 0.5 }, buttonText: { color: colors.white, fontFamily: fonts.medium, fontSize: 14 }, preview: { width: 100, height: 100, marginTop: 10 }, previewImage: { width: 100, height: 100, borderRadius: 9 }, remove: { position: 'absolute', right: 4, top: 4, backgroundColor: colors.ink, borderRadius: 20, padding: 3 },
  feedHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 30, marginBottom: 15 }, card: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 18, padding: 17, marginBottom: 12 }, authorRow: { flexDirection: 'row', alignItems: 'center', gap: 10 }, avatar: { width: 40, height: 40, borderRadius: 14, backgroundColor: colors.lilac, alignItems: 'center', justifyContent: 'center' }, avatarText: { fontFamily: fonts.medium, fontSize: 17, color: colors.ink }, authorDetails: { flex: 1 }, author: { fontFamily: fonts.medium, color: colors.ink, fontSize: 14 }, meta: { fontFamily: fonts.body, color: colors.muted, fontSize: 11, marginTop: 2 }, body: { fontFamily: fonts.body, color: colors.ink, fontSize: 15, lineHeight: 22, marginTop: 15 }, postImage: { width: '100%', height: 220, borderRadius: 12, marginTop: 14 },
  empty: { padding: 24, backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.line, alignItems: 'flex-start', gap: 8 }, emptyTitle: { fontFamily: fonts.display, fontSize: 19, color: colors.ink }, muted: { fontFamily: fonts.body, fontSize: 13, color: colors.muted }, error: { fontFamily: fonts.body, fontSize: 13, color: '#B42318', marginTop: 10 }, retry: { fontFamily: fonts.medium, color: colors.accent, fontSize: 14 }, loading: { marginTop: 30 }, more: { alignItems: 'center', padding: 18 },
  replyAction: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 38, marginTop: 12 }, replyActionText: { color: colors.accent, fontFamily: fonts.medium, fontSize: 13 },
});

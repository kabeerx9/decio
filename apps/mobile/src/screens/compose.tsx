import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { File } from 'expo-file-system';
import { Image } from 'expo-image';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';

import { BackHeader, goBack } from '@/components/back-header';
import { Pill } from '@/components/pill';
import { Screen } from '@/components/screen';
import { success } from '@/lib/haptics';
import { createCityPost, PickedPhoto } from '@/lib/posts-api';
import { useSession, useSignOutOnExpiry } from '@/lib/session';
import { accent, colors, fonts, radius } from '@/theme';

const tint = accent.city;

export function Compose() {
  const { apiUrl, userId, getToken, profile } = useSession();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const [photo, setPhoto] = useState<PickedPhoto | undefined>();
  const [pickerError, setPickerError] = useState('');
  const publish = useMutation({
    mutationFn: () => createCityPost(apiUrl, getToken, draft, photo),
    onSuccess: async () => {
      success();
      await queryClient.invalidateQueries({ queryKey: ['posts', userId] });
    },
  });
  useSignOutOnExpiry(publish.error);

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

  return <Screen edges={['top', 'bottom']}>
    <KeyboardAvoidingView behavior="padding" style={styles.flex}>
      <BackHeader title="new post" right={<Pill label="post" color={tint} busy={publish.isPending} disabled={!draft.trim()} onPress={() => publish.mutate(undefined, { onSuccess: goBack })} />} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <TextInput autoFocus accessibilityLabel="Post text" placeholder={`what's happening in ${profile.city}?`} placeholderTextColor={colors.mute}
          value={draft} onChangeText={setDraft} multiline maxLength={1000} style={styles.input} />
        {!!photo && <View style={styles.preview}>
          <Image source={{ uri: photo.uri }} style={styles.previewImage} contentFit="cover" />
          <Pressable accessibilityRole="button" accessibilityLabel="Remove photo" hitSlop={8} onPress={() => setPhoto(undefined)} style={styles.remove}>
            <Ionicons name="close" size={18} color={colors.ink} />
          </Pressable>
        </View>}
        {!!pickerError && <Text accessibilityRole="alert" style={styles.error}>{pickerError}</Text>}
        {!!publish.error && <Text accessibilityRole="alert" style={styles.error}>{publish.error.message}</Text>}
      </ScrollView>
      <View style={styles.toolbar}>
        <Pill label={photo ? 'change photo' : 'photo'} icon="image" onPress={() => void pickPhoto()} />
        <Text style={styles.count}>{[...draft].length}/1000</Text>
      </View>
    </KeyboardAvoidingView>
  </Screen>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 24 },
  input: { minHeight: 160, color: colors.ink, fontFamily: fonts.medium, fontSize: 20, lineHeight: 27, textAlignVertical: 'top', paddingTop: 8 },
  preview: { marginTop: 12, alignSelf: 'flex-start' },
  previewImage: { width: 160, height: 160, borderRadius: radius.md },
  remove: { position: 'absolute', top: 8, right: 8, width: 30, height: 30, borderRadius: 15, backgroundColor: colors.scrim, alignItems: 'center', justifyContent: 'center' },
  error: { color: colors.danger, fontFamily: fonts.body, fontSize: 13, marginTop: 12 },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 },
  count: { color: colors.mute, fontFamily: fonts.body, fontSize: 12 },
});

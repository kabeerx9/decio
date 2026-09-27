import { useUser } from '@clerk/expo';
import { Ionicons } from '@expo/vector-icons';
import { File } from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CityPicker } from '@/components/city-picker';
import { Avatar } from '@/components/avatar';
import { normalizeProfileInput, Profile, ProfileInput, validateProfileInput } from '@/lib/profile-api';
import { colors, fonts } from '@/theme';

export function ProfileEditor({ profile, onBack, onSave, onImageChanged }: { profile: Profile; onBack: () => void; onSave: (input: ProfileInput) => Promise<void>; onImageChanged: () => Promise<void> }) {
  const { user } = useUser();
  const [draft, setDraft] = useState<ProfileInput>({ displayName: profile.displayName, city: profile.city, bio: profile.bio, headline: profile.headline, interests: profile.interests });
  const [interest, setInterest] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState('');
  const [needsSync, setNeedsSync] = useState(user ? (user.hasImage ? profile.imageUrl !== user.imageUrl : !!profile.imageUrl) : false);
  const update = <K extends keyof ProfileInput>(key: K, value: ProfileInput[K]) => setDraft((current) => ({ ...current, [key]: value }));

  const addInterest = () => {
    const value = interest.trim();
    if (!value) return;
    if ([...value].length < 2 || [...value].length > 24) { setError('Each interest needs 2–24 characters.'); return; }
    if (draft.interests.length >= 3) { setError('Choose up to three interests.'); return; }
    if (draft.interests.some((item) => item.toLowerCase() === value.toLowerCase())) { setError('Choose different interests.'); return; }
    update('interests', [...draft.interests, value]);
    setInterest('');
    setError('');
  };

  const save = async () => {
    const normalized = normalizeProfileInput(draft);
    const message = validateProfileInput(normalized);
    if (message) { setError(message); return; }
    setSaving(true);
    setError('');
    try { await onSave(normalized); } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not save your profile.'); } finally { setSaving(false); }
  };

  const syncImage = async () => {
    await onImageChanged();
    setNeedsSync(false);
    setImageError('');
  };

  const changeImage = async (remove: boolean) => {
    if (!user || imageBusy) return;
    setImageError('');
    try {
      let file: Blob | null = null;
      if (!remove) {
        const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
        if (picked.canceled) return;
        const asset = picked.assets[0];
        const context = ImageManipulator.ImageManipulator.manipulate(asset.uri);
        if (asset.width > 800 || asset.height > 800) context.resize(asset.width >= asset.height ? { width: 800, height: null } : { width: null, height: 800 });
        const rendered = await context.renderAsync();
        const saved = await rendered.saveAsync({ format: ImageManipulator.SaveFormat.JPEG, compress: 0.82 });
        file = Platform.OS === 'web' ? await (await fetch(saved.uri)).blob() : new File(saved.uri);
        if (file.size > 4 * 1024 * 1024) throw new Error('Choose a smaller photo.');
      }
      setImageBusy(true);
      await user.setProfileImage({ file });
      setNeedsSync(true);
      await user.reload();
      await syncImage();
    } catch (failure) {
      setImageError(failure instanceof Error ? failure.message : 'Could not update your photo. Try again.');
    } finally { setImageBusy(false); }
  };

  const retrySync = async () => {
    setImageBusy(true);
    try { await syncImage(); } catch (failure) { setImageError(failure instanceof Error ? failure.message : 'Could not sync your photo. Try again.'); } finally { setImageBusy(false); }
  };

  return <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
    <View style={styles.topbar}><Pressable accessibilityRole="button" accessibilityLabel="Cancel profile editing" disabled={imageBusy} onPress={onBack} style={styles.back}><Ionicons name="arrow-back" size={21} color={colors.ink} /></Pressable><Text style={styles.topbarTitle}>Edit profile</Text><View style={styles.topbarSpace} /></View>
    <KeyboardAwareScrollView keyboardShouldPersistTaps="handled" bottomOffset={24} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.heading}><Text style={styles.title}>Tell people about you.</Text><Text style={styles.intro}>A few details make it easier to start a conversation.</Text></View>
      <View style={styles.photoSection}><Avatar name={draft.displayName || 'You'} imageUrl={user?.hasImage ? user.imageUrl : ''} size={76} radius={24} /><View style={styles.photoActions}><Text style={styles.label}>Profile photo</Text><Pressable accessibilityRole="button" disabled={imageBusy || !user} onPress={() => void changeImage(false)}><Text style={styles.photoLink}>{user?.hasImage ? 'Change photo' : 'Add photo'}</Text></Pressable>{user?.hasImage && <Pressable accessibilityRole="button" disabled={imageBusy} onPress={() => void changeImage(true)}><Text style={styles.removePhoto}>Remove photo</Text></Pressable>}</View>{imageBusy && <ActivityIndicator color={colors.accent} />}</View>
      {needsSync && !imageBusy && <Pressable accessibilityRole="button" onPress={() => void retrySync()}><Text style={styles.photoLink}>Sync photo with Decio</Text></Pressable>}
      {!!imageError && <Text accessibilityRole="alert" style={styles.imageError}>{imageError}</Text>}
      <View style={styles.field}><Text style={styles.label}>Display name <Text style={styles.required}>*</Text></Text><TextInput accessibilityLabel="Display name" style={styles.input} value={draft.displayName} onChangeText={(value) => update('displayName', value)} maxLength={60} placeholder="What should people call you?" placeholderTextColor={colors.muted} autoCapitalize="words" /></View>
      <View style={styles.field}><Text style={styles.label}>City <Text style={styles.required}>*</Text></Text><CityPicker value={draft.city} onChange={(city) => update('city', city)} /></View>
      <View style={styles.field}><Text style={styles.label}>Headline</Text><TextInput accessibilityLabel="Work or study headline" style={styles.input} value={draft.headline} onChangeText={(value) => update('headline', value)} maxLength={80} placeholder="Designer, student, building something…" placeholderTextColor={colors.muted} /></View>
      <View style={styles.field}><View style={styles.fieldHeader}><Text style={styles.label}>Short bio</Text><Text style={styles.counter}>{[...draft.bio].length}/280</Text></View><TextInput accessibilityLabel="Short bio" style={[styles.input, styles.bio]} value={draft.bio} onChangeText={(value) => update('bio', value)} maxLength={280} multiline textAlignVertical="top" placeholder="What brings you here?" placeholderTextColor={colors.muted} /></View>
      <View style={styles.field}><Text style={styles.label}>Interests <Text style={styles.optional}>up to 3</Text></Text><Text style={styles.helper}>Give people a reason to say hello.</Text><View style={styles.interestEntry}><TextInput accessibilityLabel="Add an interest" style={[styles.input, styles.interestInput]} value={interest} onChangeText={setInterest} maxLength={24} placeholder="e.g. photography" placeholderTextColor={colors.muted} returnKeyType="done" onSubmitEditing={addInterest} /><Pressable accessibilityRole="button" accessibilityLabel="Add interest" onPress={addInterest} style={styles.add}><Ionicons name="add" size={22} color={colors.white} /></Pressable></View><View style={styles.chips}>{draft.interests.map((item) => <Pressable key={item} accessibilityRole="button" accessibilityLabel={`Remove ${item} interest`} onPress={() => update('interests', draft.interests.filter((value) => value !== item))} style={styles.chip}><Text style={styles.chipText}>{item}</Text><Ionicons name="close" size={14} color={colors.accent} /></Pressable>)}</View></View>
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      <Pressable accessibilityRole="button" disabled={saving || imageBusy} style={[styles.save, (saving || imageBusy) && styles.disabled]} onPress={() => void save()}><Text style={styles.saveText}>{saving ? 'Saving…' : 'Save profile'}</Text><Ionicons name="arrow-forward" size={19} color={colors.white} /></Pressable>
    </KeyboardAwareScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper }, topbar: { height: 64, paddingHorizontal: 19, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: colors.line },
  back: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line, borderRadius: 13, backgroundColor: colors.white }, topbarTitle: { color: colors.ink, fontFamily: fonts.medium, fontSize: 16 }, topbarSpace: { width: 42 },
  content: { paddingHorizontal: 24, paddingBottom: 35 }, heading: { paddingTop: 30, paddingBottom: 18 }, title: { color: colors.ink, fontFamily: fonts.display, fontSize: 34, lineHeight: 39, letterSpacing: -1 }, intro: { color: colors.muted, fontFamily: fonts.body, fontSize: 15, marginTop: 9, lineHeight: 22 },
  photoSection: { flexDirection: 'row', alignItems: 'center', gap: 18, paddingVertical: 13 }, photoActions: { flex: 1, gap: 5 }, photoLink: { color: colors.accent, fontFamily: fonts.medium, fontSize: 14 }, removePhoto: { color: colors.muted, fontFamily: fonts.body, fontSize: 12 }, imageError: { color: '#B42318', fontFamily: fonts.body, fontSize: 13, marginTop: 7 },
  field: { marginTop: 24 }, fieldHeader: { flexDirection: 'row', justifyContent: 'space-between' }, label: { color: colors.ink, fontFamily: fonts.medium, fontSize: 14, marginBottom: 11 }, required: { color: colors.accent }, optional: { color: colors.muted, fontFamily: fonts.body, fontSize: 12 }, helper: { color: colors.muted, fontFamily: fonts.body, fontSize: 13, marginTop: -4, marginBottom: 12 },
  input: { minHeight: 56, backgroundColor: colors.white, color: colors.ink, borderWidth: 1, borderColor: colors.line, borderRadius: 14, paddingHorizontal: 16, fontFamily: fonts.body, fontSize: 15 }, bio: { height: 116, paddingTop: 15, lineHeight: 22 }, counter: { color: colors.muted, fontFamily: fonts.body, fontSize: 11 },
  interestEntry: { flexDirection: 'row', gap: 9 }, interestInput: { flex: 1 }, add: { width: 56, height: 56, borderRadius: 14, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }, chip: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: colors.lilac, borderRadius: 100, paddingHorizontal: 12, paddingVertical: 8 }, chipText: { color: colors.accent, fontFamily: fonts.medium, fontSize: 12 },
  error: { color: '#B42318', fontFamily: fonts.body, fontSize: 13, marginTop: 24 }, save: { backgroundColor: colors.accent, borderRadius: 14, minHeight: 56, marginTop: 30, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, disabled: { opacity: 0.6 }, saveText: { color: colors.white, fontFamily: fonts.medium, fontSize: 16 },
});

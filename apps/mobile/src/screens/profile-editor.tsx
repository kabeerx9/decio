import { useUser } from '@clerk/expo';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { Avatar } from '@/components/avatar';
import { BackHeader, goBack } from '@/components/back-header';
import { Chip } from '@/components/chip';
import { CityPicker } from '@/components/city-picker';
import { Field, inputStyle } from '@/components/field';
import { Pill } from '@/components/pill';
import { Screen } from '@/components/screen';
import { normalizeProfileInput, ProfileInput, validateProfileInput } from '@/lib/profile-api';
import { uploadProfilePhoto } from '@/lib/profile-photo';
import { useProfileActions } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { accent, colors, fonts } from '@/theme';

const tint = accent.you;

export function ProfileEditor() {
  const { profile } = useSession();
  const actions = useProfileActions();
  const { user } = useUser();
  const [draft, setDraft] = useState<ProfileInput>({ displayName: profile.displayName, city: profile.city, bio: profile.bio, headline: profile.headline, interests: profile.interests });
  const [interest, setInterest] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState('');
  const [needsSync, setNeedsSync] = useState(user ? (user.hasImage ? profile.imageUrl !== user.imageUrl : !!profile.imageUrl) : false);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);
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
    try { await actions.saveProfile(normalized); if (mounted.current) goBack(); } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not save your profile.'); } finally { setSaving(false); }
  };

  const syncImage = async () => {
    await actions.syncImage();
    setNeedsSync(false);
    setImageError('');
  };

  const changeImage = async (remove: boolean) => {
    if (!user || imageBusy) return;
    setImageError('');
    try {
      setImageBusy(true);
      if (!remove) {
        if (!await uploadProfilePhoto(user)) return;
      } else {
        await user.setProfileImage({ file: null });
        await user.reload();
      }
      setNeedsSync(true);
      await syncImage();
    } catch (failure) {
      setImageError(failure instanceof Error ? failure.message : 'Could not update your photo. Try again.');
    } finally { setImageBusy(false); }
  };

  const retrySync = async () => {
    setImageBusy(true);
    try { await syncImage(); } catch (failure) { setImageError(failure instanceof Error ? failure.message : 'Could not sync your photo. Try again.'); } finally { setImageBusy(false); }
  };

  return <Screen edges={['top', 'bottom']}>
    <BackHeader title="edit profile" />
    <KeyboardAwareScrollView keyboardShouldPersistTaps="handled" bottomOffset={24} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.photoRow}>
        <Avatar name={draft.displayName || 'You'} imageUrl={user?.hasImage ? user.imageUrl : ''} size={84} ring={tint} />
        <View style={styles.photoActions}>
          <Pill label={user?.hasImage ? 'change photo' : 'add photo'} icon="image" busy={imageBusy} disabled={!user} onPress={() => void changeImage(false)} />
          {user?.hasImage && !imageBusy && <Pressable accessibilityRole="button" hitSlop={8} onPress={() => void changeImage(true)}><Text style={styles.remove}>remove photo</Text></Pressable>}
        </View>
      </View>
      {needsSync && !imageBusy && <Pill label="sync photo" icon="refresh" onPress={() => void retrySync()} style={styles.sync} />}
      {!!imageError && <Text accessibilityRole="alert" style={styles.error}>{imageError}</Text>}
      <Field label="name *"><TextInput accessibilityLabel="Display name" style={inputStyle} value={draft.displayName} onChangeText={(value) => update('displayName', value)} maxLength={60} placeholder="what should people call you?" placeholderTextColor={colors.mute} autoCapitalize="words" /></Field>
      <Field label="city *"><CityPicker value={draft.city} onChange={(city) => update('city', city)} tint={tint} /></Field>
      <Field label="headline"><TextInput accessibilityLabel="Work or study headline" style={inputStyle} value={draft.headline} onChangeText={(value) => update('headline', value)} maxLength={80} placeholder="designer, student, building something…" placeholderTextColor={colors.mute} /></Field>
      <Field label="bio" hint={`${[...draft.bio].length}/280`}><TextInput accessibilityLabel="Short bio" style={[inputStyle, styles.bio]} value={draft.bio} onChangeText={(value) => update('bio', value)} maxLength={280} multiline textAlignVertical="top" placeholder="what brings you here?" placeholderTextColor={colors.mute} /></Field>
      <Field label="interests" hint="up to 3 · emoji welcome">
        <View style={styles.interestEntry}>
          <TextInput accessibilityLabel="Add an interest" style={[inputStyle, styles.flex]} value={interest} onChangeText={setInterest} maxLength={24} placeholder="e.g. 🎧 techno" placeholderTextColor={colors.mute} returnKeyType="done" onSubmitEditing={addInterest} />
          <Pressable accessibilityRole="button" accessibilityLabel="Add interest" onPress={addInterest} style={styles.add}><Ionicons name="add" size={24} color={colors.onAccent} /></Pressable>
        </View>
        {!!draft.interests.length && <View style={styles.chips}>{draft.interests.map((item) => <Chip key={item} label={item} onRemove={() => update('interests', draft.interests.filter((value) => value !== item))} />)}</View>}
      </Field>
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      <Pill size="lg" label="save" color={tint} busy={saving} disabled={imageBusy} onPress={() => void save()} style={styles.cta} />
    </KeyboardAwareScrollView>
  </Screen>;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingBottom: 32 },
  flex: { flex: 1 },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingTop: 8 },
  photoActions: { flex: 1, alignItems: 'flex-start', gap: 10 },
  remove: { color: colors.mute, fontFamily: fonts.medium, fontSize: 13 },
  sync: { alignSelf: 'flex-start', marginTop: 12 },
  bio: { height: 116, paddingTop: 14, lineHeight: 22 },
  interestEntry: { flexDirection: 'row', gap: 8 },
  add: { width: 54, height: 54, borderRadius: 27, backgroundColor: tint, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  error: { color: colors.danger, fontFamily: fonts.body, fontSize: 13, marginTop: 16 },
  cta: { marginTop: 28, alignSelf: 'stretch' },
});

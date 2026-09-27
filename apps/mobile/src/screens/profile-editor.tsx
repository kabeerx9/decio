import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CityPicker } from '@/components/city-picker';
import { normalizeProfileInput, Profile, ProfileInput, validateProfileInput } from '@/lib/profile-api';
import { colors, fonts } from '@/theme';

export function ProfileEditor({ profile, onBack, onSave }: { profile: Profile; onBack: () => void; onSave: (input: ProfileInput) => Promise<void> }) {
  const [draft, setDraft] = useState<ProfileInput>({ displayName: profile.displayName, city: profile.city, bio: profile.bio, headline: profile.headline, interests: profile.interests });
  const [interest, setInterest] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
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

  return <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
    <View style={styles.topbar}><Pressable accessibilityRole="button" accessibilityLabel="Cancel profile editing" onPress={onBack} style={styles.back}><Ionicons name="arrow-back" size={21} color={colors.ink} /></Pressable><Text style={styles.topbarTitle}>Edit profile</Text><View style={styles.topbarSpace} /></View>
    <KeyboardAwareScrollView keyboardShouldPersistTaps="handled" bottomOffset={24} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.heading}><Text style={styles.title}>Tell people about you.</Text><Text style={styles.intro}>A few details make it easier to start a conversation.</Text></View>
      <View style={styles.field}><Text style={styles.label}>Display name <Text style={styles.required}>*</Text></Text><TextInput accessibilityLabel="Display name" style={styles.input} value={draft.displayName} onChangeText={(value) => update('displayName', value)} maxLength={60} placeholder="What should people call you?" placeholderTextColor={colors.muted} autoCapitalize="words" /></View>
      <View style={styles.field}><Text style={styles.label}>City <Text style={styles.required}>*</Text></Text><CityPicker value={draft.city} onChange={(city) => update('city', city)} /></View>
      <View style={styles.field}><Text style={styles.label}>Headline</Text><TextInput accessibilityLabel="Work or study headline" style={styles.input} value={draft.headline} onChangeText={(value) => update('headline', value)} maxLength={80} placeholder="Designer, student, building something…" placeholderTextColor={colors.muted} /></View>
      <View style={styles.field}><View style={styles.fieldHeader}><Text style={styles.label}>Short bio</Text><Text style={styles.counter}>{[...draft.bio].length}/280</Text></View><TextInput accessibilityLabel="Short bio" style={[styles.input, styles.bio]} value={draft.bio} onChangeText={(value) => update('bio', value)} maxLength={280} multiline textAlignVertical="top" placeholder="What brings you here?" placeholderTextColor={colors.muted} /></View>
      <View style={styles.field}><Text style={styles.label}>Interests <Text style={styles.optional}>up to 3</Text></Text><Text style={styles.helper}>Give people a reason to say hello.</Text><View style={styles.interestEntry}><TextInput accessibilityLabel="Add an interest" style={[styles.input, styles.interestInput]} value={interest} onChangeText={setInterest} maxLength={24} placeholder="e.g. photography" placeholderTextColor={colors.muted} returnKeyType="done" onSubmitEditing={addInterest} /><Pressable accessibilityRole="button" accessibilityLabel="Add interest" onPress={addInterest} style={styles.add}><Ionicons name="add" size={22} color={colors.white} /></Pressable></View><View style={styles.chips}>{draft.interests.map((item) => <Pressable key={item} accessibilityRole="button" accessibilityLabel={`Remove ${item} interest`} onPress={() => update('interests', draft.interests.filter((value) => value !== item))} style={styles.chip}><Text style={styles.chipText}>{item}</Text><Ionicons name="close" size={14} color={colors.accent} /></Pressable>)}</View></View>
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      <Pressable accessibilityRole="button" disabled={saving} style={[styles.save, saving && styles.disabled]} onPress={() => void save()}><Text style={styles.saveText}>{saving ? 'Saving…' : 'Save profile'}</Text><Ionicons name="arrow-forward" size={19} color={colors.white} /></Pressable>
    </KeyboardAwareScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper }, topbar: { height: 64, paddingHorizontal: 19, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: colors.line },
  back: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line, borderRadius: 13, backgroundColor: colors.white }, topbarTitle: { color: colors.ink, fontFamily: fonts.medium, fontSize: 16 }, topbarSpace: { width: 42 },
  content: { paddingHorizontal: 24, paddingBottom: 35 }, heading: { paddingTop: 30, paddingBottom: 18 }, title: { color: colors.ink, fontFamily: fonts.display, fontSize: 34, lineHeight: 39, letterSpacing: -1 }, intro: { color: colors.muted, fontFamily: fonts.body, fontSize: 15, marginTop: 9, lineHeight: 22 },
  field: { marginTop: 24 }, fieldHeader: { flexDirection: 'row', justifyContent: 'space-between' }, label: { color: colors.ink, fontFamily: fonts.medium, fontSize: 14, marginBottom: 11 }, required: { color: colors.accent }, optional: { color: colors.muted, fontFamily: fonts.body, fontSize: 12 }, helper: { color: colors.muted, fontFamily: fonts.body, fontSize: 13, marginTop: -4, marginBottom: 12 },
  input: { minHeight: 56, backgroundColor: colors.white, color: colors.ink, borderWidth: 1, borderColor: colors.line, borderRadius: 14, paddingHorizontal: 16, fontFamily: fonts.body, fontSize: 15 }, bio: { height: 116, paddingTop: 15, lineHeight: 22 }, counter: { color: colors.muted, fontFamily: fonts.body, fontSize: 11 },
  interestEntry: { flexDirection: 'row', gap: 9 }, interestInput: { flex: 1 }, add: { width: 56, height: 56, borderRadius: 14, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }, chip: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: colors.lilac, borderRadius: 100, paddingHorizontal: 12, paddingVertical: 8 }, chipText: { color: colors.accent, fontFamily: fonts.medium, fontSize: 12 },
  error: { color: '#B42318', fontFamily: fonts.body, fontSize: 13, marginTop: 24 }, save: { backgroundColor: colors.accent, borderRadius: 14, minHeight: 56, marginTop: 30, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, disabled: { opacity: 0.6 }, saveText: { color: colors.white, fontFamily: fonts.medium, fontSize: 16 },
});

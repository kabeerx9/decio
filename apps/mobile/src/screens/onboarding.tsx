import { useUser } from '@clerk/expo';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';
import LottieView from 'lottie-react-native';

import { Avatar } from '@/components/avatar';
import { CityPicker } from '@/components/city-picker';
import { Profile, ProfileInput, validateProfileInput } from '@/lib/profile-api';
import { uploadProfilePhoto } from '@/lib/profile-photo';
import { colors, fonts } from '@/theme';

type Props = {
  profile: Profile;
  onSave: (input: ProfileInput) => Promise<void>;
  onSyncImage: () => Promise<void>;
  onComplete: () => Promise<void>;
  onSignOut: () => void;
};

type Step = 'welcome' | 'details' | 'photo';

export function Onboarding({ profile, onSave, onSyncImage, onComplete, onSignOut }: Props) {
  const { user } = useUser();
  const [step, setStep] = useState<Step>(profile.displayName && profile.city ? 'photo' : 'welcome');
  const [name, setName] = useState(profile.displayName);
  const [city, setCity] = useState(profile.city);
  const [headline, setHeadline] = useState(profile.headline);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [needsSync, setNeedsSync] = useState(user ? user.hasImage && !profile.imageUrl : false);

  const saveDetails = async () => {
    const input: ProfileInput = { displayName: name.trim(), city: city.trim(), headline: headline.trim(), bio: profile.bio, interests: profile.interests };
    const problem = validateProfileInput(input);
    if (problem) { setError(problem); return; }
    setBusy(true); setError('');
    try { await onSave(input); setStep('photo'); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not save your details.'); }
    finally { setBusy(false); }
  };

  const addPhoto = async () => {
    if (!user) return;
    setBusy(true); setError('');
    try {
      if (!await uploadProfilePhoto(user)) return;
      setNeedsSync(true);
      await onSyncImage();
      setNeedsSync(false);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not add your photo.'); }
    finally { setBusy(false); }
  };

  const finish = async () => {
    setBusy(true); setError('');
    try {
      if (needsSync || (user?.hasImage && !profile.imageUrl)) {
        await onSyncImage();
        setNeedsSync(false);
      }
      await onComplete();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not finish onboarding.'); }
    finally { setBusy(false); }
  };

  return <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
    <View style={styles.top}><Text style={styles.brand}>decio<Text style={styles.brandDot}>.</Text></Text><Pressable accessibilityRole="button" onPress={onSignOut}><Text style={styles.signOut}>Sign out</Text></Pressable></View>
    <View style={styles.progress}><View style={styles.progressTrack}><View style={[styles.progressFill, { width: step === 'welcome' ? '33%' : step === 'details' ? '66%' : '100%' }]} /></View><Text style={styles.progressText}>{step === 'welcome' ? '01' : step === 'details' ? '02' : '03'} / 03</Text></View>
    {step === 'welcome' ? <View style={styles.welcome}>
      <View style={styles.art}><LottieView source={require('../../assets/animations/meet.json')} autoPlay loop style={styles.lottie} /><View style={styles.artCaption}><Ionicons name="sparkles" size={16} color={colors.accent} /><Text style={styles.artCaptionText}>Good people, nearby.</Text></View></View>
      <View><Text style={styles.eyebrow}>YOUR CITY, YOUR PEOPLE</Text><Text style={styles.title}>Find your people around the corner.</Text><Text style={styles.copy}>Share what’s happening, meet people nearby, and turn a hello into a connection.</Text></View>
      <Pressable accessibilityRole="button" style={styles.button} onPress={() => setStep('details')}><Text style={styles.buttonText}>Let’s get started</Text><Ionicons name="arrow-forward" size={20} color={colors.white} /></Pressable>
    </View> : step === 'details' ? <KeyboardAwareScrollView keyboardShouldPersistTaps="handled" bottomOffset={24} contentContainerStyle={styles.form}>
      <Text style={styles.eyebrow}>FIRST, THE BASICS</Text><Text style={styles.title}>Make yourself at home.</Text><Text style={styles.copy}>People will see your name and city. Add a little context if you like.</Text>
      <Text style={styles.label}>Your name</Text><TextInput accessibilityLabel="Your name" value={name} onChangeText={setName} maxLength={60} autoCapitalize="words" placeholder="What should people call you?" placeholderTextColor={colors.muted} style={styles.input} />
      <Text style={styles.label}>Your city</Text><CityPicker value={city} onChange={setCity} />
      <Text style={styles.label}>A little about you <Text style={styles.optional}>optional</Text></Text><TextInput accessibilityLabel="A little about you" value={headline} onChangeText={setHeadline} maxLength={80} placeholder="Designer, student, building something…" placeholderTextColor={colors.muted} style={styles.input} />
      <Text style={styles.hint}>You can always edit this later.</Text>
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      <Pressable accessibilityRole="button" disabled={busy} style={[styles.button, busy && styles.disabled]} onPress={() => void saveDetails()}><Text style={styles.buttonText}>{busy ? 'Saving…' : 'Continue'}</Text>{busy ? <ActivityIndicator color={colors.white} /> : <Ionicons name="arrow-forward" size={20} color={colors.white} />}</Pressable>
    </KeyboardAwareScrollView> : <View style={styles.photoStep}>
      <View><Text style={styles.eyebrow}>ONE LAST THING</Text><Text style={styles.title}>Put a face to the name.</Text><Text style={styles.copy}>A photo helps people recognize you when a chat becomes a real connection.</Text></View>
      <View style={styles.avatarWrap}><View style={styles.avatarHalo}><Avatar name={name || profile.displayName} imageUrl={user?.hasImage ? user.imageUrl : profile.imageUrl} size={150} radius={50} /></View><Text style={styles.avatarHint}>Just you, as you are.</Text></View>
      <View><Pressable accessibilityRole="button" disabled={busy || !user} style={styles.photoButton} onPress={() => void addPhoto()}><Ionicons name="image-outline" size={20} color={colors.accent} /><Text style={styles.photoButtonText}>{user?.hasImage ? 'Change photo' : 'Choose a photo'}</Text></Pressable>
        {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        <Pressable accessibilityRole="button" disabled={busy || (!user?.hasImage && !profile.imageUrl)} style={[styles.button, (busy || (!user?.hasImage && !profile.imageUrl)) && styles.disabled]} onPress={() => void finish()}><Text style={styles.buttonText}>{busy ? 'Finishing…' : 'Enter Decio'}</Text>{busy ? <ActivityIndicator color={colors.white} /> : <Ionicons name="arrow-forward" size={20} color={colors.white} />}</Pressable>
        <Pressable accessibilityRole="button" onPress={() => setStep('details')} style={styles.back}><Text style={styles.backText}>Edit my details</Text></Pressable></View>
    </View>}
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper }, top: { height: 62, paddingHorizontal: 25, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, brand: { fontFamily: fonts.display, fontSize: 29, color: colors.plum, letterSpacing: -1.5 }, brandDot: { color: colors.accent }, signOut: { fontFamily: fonts.medium, color: colors.muted, fontSize: 13 },
  progress: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 25, paddingTop: 8 }, progressTrack: { height: 5, flex: 1, borderRadius: 4, backgroundColor: colors.line }, progressFill: { height: 5, borderRadius: 4, backgroundColor: colors.accent }, progressText: { fontFamily: fonts.medium, color: colors.muted, fontSize: 11, letterSpacing: 1 },
  welcome: { flex: 1, justifyContent: 'space-between', paddingHorizontal: 25, paddingBottom: 25, paddingTop: 20 }, art: { height: '47%', minHeight: 230, maxHeight: 390, borderRadius: 32, backgroundColor: colors.lilac, alignItems: 'center', justifyContent: 'center' }, lottie: { width: '100%', height: '90%' }, artCaption: { position: 'absolute', bottom: 23, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 99, backgroundColor: colors.white }, artCaptionText: { color: colors.ink, fontFamily: fonts.medium, fontSize: 12 },
  eyebrow: { color: colors.accent, fontFamily: fonts.medium, fontSize: 11, letterSpacing: 1.6, marginBottom: 13 }, title: { color: colors.ink, fontFamily: fonts.display, fontSize: 40, lineHeight: 43, letterSpacing: -1.5 }, copy: { color: colors.muted, fontFamily: fonts.body, fontSize: 16, lineHeight: 24, marginTop: 15 },
  button: { minHeight: 58, backgroundColor: colors.accent, borderRadius: 17, paddingHorizontal: 21, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 24 }, buttonText: { color: colors.white, fontFamily: fonts.medium, fontSize: 16 }, disabled: { opacity: 0.5 },
  form: { paddingHorizontal: 25, paddingTop: 43, paddingBottom: 35 }, label: { color: colors.ink, fontFamily: fonts.medium, fontSize: 14, marginTop: 29, marginBottom: 11 }, optional: { color: colors.muted, fontFamily: fonts.body, fontSize: 12 }, input: { minHeight: 56, backgroundColor: colors.white, borderColor: colors.line, borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, color: colors.ink, fontFamily: fonts.body, fontSize: 15 }, hint: { color: colors.muted, fontFamily: fonts.body, fontSize: 12, marginTop: 18 }, error: { color: '#B42318', fontFamily: fonts.body, fontSize: 13, marginTop: 20 },
  photoStep: { flex: 1, justifyContent: 'space-between', paddingHorizontal: 25, paddingTop: 43, paddingBottom: 23 }, avatarWrap: { alignItems: 'center' }, avatarHalo: { width: 218, height: 218, borderRadius: 109, backgroundColor: colors.lilac, alignItems: 'center', justifyContent: 'center' }, avatarHint: { color: colors.muted, fontFamily: fonts.body, fontSize: 13, marginTop: 16 }, photoButton: { minHeight: 55, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, borderRadius: 15, flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center' }, photoButtonText: { color: colors.accent, fontFamily: fonts.medium, fontSize: 15 }, back: { alignItems: 'center', paddingTop: 18 }, backText: { color: colors.muted, fontFamily: fonts.medium, fontSize: 13 },
});

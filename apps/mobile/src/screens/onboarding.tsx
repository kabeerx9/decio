import { useUser } from '@clerk/expo';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { BackHandler, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Animated, { FadeInDown, FadeInRight, FadeOutLeft, FadeOutUp, LayoutAnimationConfig, ZoomIn } from 'react-native-reanimated';

import { CityPicker } from '@/components/city-picker';
import { inputStyle } from '@/components/field';
import { PersonCard } from '@/components/person-card';
import { Pill } from '@/components/pill';
import { Screen } from '@/components/screen';
import { Title } from '@/components/title';
import { success, tick } from '@/lib/haptics';
import { ProfileInput, validateProfileInput } from '@/lib/profile-api';
import { uploadProfilePhoto } from '@/lib/profile-photo';
import { useProfileActions } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { accent, colors, fonts, radius } from '@/theme';

const tint = accent.people;
type Step = 'hello' | 'name' | 'city' | 'vibe' | 'line' | 'photo';
const steps: Step[] = ['hello', 'name', 'city', 'vibe', 'line', 'photo'];
const hooks = ['coffee', 'sunday football', 'gigs', 'late-night food', 'climbing', 'flea markets', 'long runs'];
const popularCities = ['Bengaluru', 'Mumbai', 'Delhi', 'Pune', 'Hyderabad', 'Chennai', 'Kolkata', 'Ahmedabad'];
const vibes = ['☕ coffee', '⚽ football', '🎧 gigs', '🎨 art', '🏃 running', '🎮 gaming', '📚 books', '🍜 food', '🧗 climbing', '🎬 films', '🐶 dogs', '💻 tech', '📸 photos', '🧘 yoga', '🍻 nights out'];

export function Onboarding() {
  const { profile, signOutLocal } = useSession();
  const actions = useProfileActions();
  const { user } = useUser();
  const [step, setStep] = useState<Step>(profile.displayName && profile.city ? 'photo' : 'hello');
  const [name, setName] = useState(profile.displayName);
  const [city, setCity] = useState(profile.city);
  const [interests, setInterests] = useState<string[]>(profile.interests);
  const [headline, setHeadline] = useState(profile.headline);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [needsSync, setNeedsSync] = useState(user ? user.hasImage && !profile.imageUrl : false);

  const index = steps.indexOf(step);
  const go = (next: Step) => { setError(''); setStep(next); };
  const back = () => { if (index > 0) go(steps[index - 1]); };

  // Android back walks the steps instead of leaving the app mid-onboarding.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (index === 0) return false;
      go(steps[index - 1]);
      return true;
    });
    return () => subscription.remove();
  }, [index]);

  const input = (): ProfileInput => ({ displayName: name.trim(), city: city.trim(), headline: headline.trim(), bio: profile.bio, interests });

  const submitName = () => {
    // Same name rule as validateProfileInput; the input's maxLength already caps it at 60.
    if ([...name.trim()].length < 2) { setError('Use at least 2 characters.'); return; }
    go('city');
  };

  const chooseCity = (value: string) => {
    tick();
    setCity(value);
    setTimeout(() => go('vibe'), 220);
  };

  const toggleVibe = (vibe: string) => {
    tick();
    setInterests((current) => current.includes(vibe) ? current.filter((item) => item !== vibe) : current.length >= 3 ? current : [...current, vibe]);
  };

  const saveDetails = async () => {
    const details = input();
    const problem = validateProfileInput(details);
    if (problem) { setError(problem); return; }
    setBusy(true); setError('');
    try { await actions.saveProfile(details); go('photo'); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not save your details.'); }
    finally { setBusy(false); }
  };

  const addPhoto = async () => {
    if (!user || busy) return;
    setBusy(true); setError('');
    try {
      if (!await uploadProfilePhoto(user)) return;
      setNeedsSync(true);
      await actions.syncImage();
      setNeedsSync(false);
      success();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not add your photo.'); }
    finally { setBusy(false); }
  };

  const finish = async () => {
    setBusy(true); setError('');
    try {
      if (needsSync || (user?.hasImage && !profile.imageUrl)) {
        await actions.syncImage();
        setNeedsSync(false);
      }
      success();
      await actions.finishOnboarding();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not finish onboarding.'); }
    finally { setBusy(false); }
  };

  const photoUrl = user?.hasImage ? user.imageUrl : profile.imageUrl;
  const errorText = !!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>;

  return <Screen edges={['top', 'bottom']}>
    <View style={styles.top}>
      {index > 0
        ? <Pressable accessibilityRole="button" accessibilityLabel="Previous step" hitSlop={8} onPress={back} style={styles.back}><Ionicons name="arrow-back" size={22} color={colors.ink} /></Pressable>
        : <View style={styles.back} />}
      <View style={styles.progress}>{steps.slice(1).map((item, position) => <View key={item} style={[styles.segment, position < index && { backgroundColor: tint }]} />)}</View>
      <Pressable accessibilityRole="button" hitSlop={10} onPress={signOutLocal}><Text style={styles.signOut}>sign out</Text></Pressable>
    </View>
    <KeyboardAvoidingView behavior="padding" style={styles.flex}>
      {/* The first step mounts with the screen; its entering animation froze on frame one on Android, so only step changes animate. */}
      <LayoutAnimationConfig skipEntering>
      <Animated.View key={step} entering={FadeInRight.duration(280)} exiting={FadeOutLeft.duration(160)} style={styles.flex}>
        {step === 'hello' ? <View style={styles.page}>
          <View>
            <Text style={styles.hero}>FIND{'\n'}PEOPLE FOR</Text>
            <RotatingWord />
            <Text style={styles.copy}>your city, but smaller. meet people nearby and turn a hello into plans.</Text>
          </View>
          <Pill size="lg" label="let's go" color={tint} trailingIcon="arrow-forward" onPress={() => go('name')} style={styles.cta} />
        </View> : step === 'name' ? <View style={styles.page}>
          <View>
            <Title size={52}>{'what do people\ncall you?'}</Title>
            <TextInput autoFocus accessibilityLabel="Your name" value={name} onChangeText={setName} maxLength={60} autoCapitalize="words" autoCorrect={false}
              placeholder="your name" placeholderTextColor={colors.mute} returnKeyType="next" onSubmitEditing={submitName} style={[styles.bigInput, { fontSize: nameSize(name) }]} />
            {errorText}
          </View>
          <Pill size="lg" label="next" color={tint} trailingIcon="arrow-forward" disabled={!name.trim()} onPress={submitName} style={styles.cta} />
        </View> : step === 'city' ? <ScrollView contentContainerStyle={styles.scrollPage} keyboardShouldPersistTaps="handled">
          <Title size={52}>{"where's home\nright now?"}</Title>
          <Text style={styles.copy}>your feed and the people you meet follow this.</Text>
          <View style={styles.tiles}>{popularCities.map((option) => {
            const selected = city === option;
            return <Pressable key={option} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => chooseCity(option)}
              style={({ pressed }) => [styles.tile, selected && { backgroundColor: tint }, pressed && styles.pressed]}>
              <Text style={[styles.tileText, selected && { color: colors.onAccent }]}>{option.toUpperCase()}</Text>
            </Pressable>;
          })}</View>
          <Text style={styles.label}>somewhere else</Text>
          <CityPicker value={popularCities.includes(city) ? '' : city} onChange={chooseCity} tint={tint} />
        </ScrollView> : step === 'vibe' ? <View style={styles.page}>
          <ScrollView contentContainerStyle={styles.vibeScroll}>
            <Title size={52}>{'pick your\nvibe'}</Title>
            <Text style={styles.copy}>up to 3. it's how people find you.</Text>
            <View style={styles.vibes}>{vibes.map((vibe) => {
              const selected = interests.includes(vibe);
              return <Pressable key={vibe} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => toggleVibe(vibe)}
                style={({ pressed }) => [styles.vibe, selected && { backgroundColor: tint }, pressed && styles.pressed]}>
                <Text style={[styles.vibeText, selected && { color: colors.onAccent }]}>{vibe}</Text>
              </Pressable>;
            })}</View>
          </ScrollView>
          <Pill size="lg" label={interests.length ? `next · ${interests.length}/3` : 'skip'} color={interests.length ? tint : undefined} trailingIcon="arrow-forward" onPress={() => go('line')} style={styles.cta} />
        </View> : step === 'line' ? <View style={styles.page}>
          <View>
            <Title size={52}>{'one line\nabout you'}</Title>
            <Text style={styles.copy}>optional. what are you up to?</Text>
            <TextInput autoFocus accessibilityLabel="A line about you" value={headline} onChangeText={setHeadline} maxLength={80}
              placeholder="designer, learning guitar, new in town" placeholderTextColor={colors.mute} style={[inputStyle, styles.lineInput]} />
            {errorText}
          </View>
          <Pill size="lg" label={headline.trim() ? 'next' : 'skip'} color={tint} trailingIcon="arrow-forward" busy={busy} onPress={() => void saveDetails()} style={styles.cta} />
        </View> : <View style={styles.page}>
          <View>
            <Title size={52}>{photoUrl ? "you're in" : 'show your\nface'}</Title>
            <Text style={styles.copy}>{photoUrl ? 'this is how people see you on decio.' : 'a photo helps people recognise you irl.'}</Text>
          </View>
          <View style={styles.center}>
            {photoUrl
              ? <Animated.View entering={ZoomIn.springify().damping(14)}>
                <PersonCard person={{ ...profile, displayName: name || profile.displayName, headline, interests, imageUrl: photoUrl }} width={220} onPress={() => void addPhoto()} />
              </Animated.View>
              : <Pressable accessibilityRole="button" accessibilityLabel="Choose a photo" disabled={busy || !user} onPress={() => void addPhoto()} style={({ pressed }) => [styles.photoTarget, pressed && styles.pressed]}>
                <Ionicons name="camera" size={40} color={tint} />
                <Text style={styles.photoHint}>{busy ? 'uploading…' : 'tap to add'}</Text>
              </Pressable>}
          </View>
          <View style={styles.actions}>
            {errorText}
            {!!photoUrl && <Pressable accessibilityRole="button" disabled={busy} onPress={() => void addPhoto()} style={styles.link}><Text style={styles.linkText}>change photo</Text></Pressable>}
            <Pill size="lg" label="enter decio" color={tint} trailingIcon="arrow-forward" busy={busy} disabled={!photoUrl} onPress={() => void finish()} style={styles.cta} />
          </View>
        </View>}
      </Animated.View>
      </LayoutAnimationConfig>
    </KeyboardAvoidingView>
  </Screen>;
}

// Shrink the display-size name as it grows so it stays on one visible line instead of scrolling sideways.
function nameSize(value: string) {
  return Math.max(32, Math.min(56, 56 - ([...value].length - 10) * 2.4));
}

function RotatingWord() {
  const [position, setPosition] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setPosition((current) => (current + 1) % hooks.length), 1600);
    return () => clearInterval(timer);
  }, []);
  return <View style={styles.rotator}>
    <Animated.Text key={position} entering={FadeInDown.duration(320)} exiting={FadeOutUp.duration(220)} style={[styles.hero, { color: tint }]} numberOfLines={1} adjustsFontSizeToFit>
      {hooks[position].toUpperCase()}.
    </Animated.Text>
  </View>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 8 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  progress: { flex: 1, flexDirection: 'row', gap: 5 },
  segment: { flex: 1, height: 5, borderRadius: radius.pill, backgroundColor: colors.surface2 },
  signOut: { color: colors.mute, fontFamily: fonts.medium, fontSize: 13, paddingRight: 8 },
  page: { flex: 1, justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12 },
  scrollPage: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 32 },
  hero: { fontFamily: fonts.display, fontSize: 76, lineHeight: 76, color: colors.ink, includeFontPadding: false },
  rotator: { height: 80, justifyContent: 'center', overflow: 'hidden' },
  copy: { color: colors.mute, fontFamily: fonts.medium, fontSize: 16, lineHeight: 23, marginTop: 12 },
  cta: { alignSelf: 'stretch' },
  bigInput: { marginTop: 28, color: tint, fontFamily: fonts.display, paddingVertical: 4, includeFontPadding: false },
  error: { color: colors.danger, fontFamily: fonts.body, fontSize: 13, marginTop: 12 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 24 },
  tile: { width: '48.5%', height: 68, borderRadius: radius.md, backgroundColor: colors.surface, justifyContent: 'flex-end', padding: 12 },
  tileText: { fontFamily: fonts.display, fontSize: 26, lineHeight: 28, color: colors.ink },
  pressed: { transform: [{ scale: 0.97 }] },
  label: { color: colors.mute, fontFamily: fonts.bold, fontSize: 13, marginTop: 24, marginBottom: 8 },
  vibeScroll: { paddingBottom: 16 },
  vibes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 24 },
  vibe: { height: 46, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: colors.surface, justifyContent: 'center' },
  vibeText: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  lineInput: { marginTop: 24, fontSize: 17 },
  center: { alignItems: 'center' },
  photoTarget: { width: 220, height: 220, borderRadius: 110, borderWidth: 2, borderStyle: 'dashed', borderColor: tint, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.surface },
  photoHint: { color: colors.ink, fontFamily: fonts.bold, fontSize: 15 },
  actions: { gap: 6 },
  link: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  linkText: { color: colors.mute, fontFamily: fonts.bold, fontSize: 14 },
});

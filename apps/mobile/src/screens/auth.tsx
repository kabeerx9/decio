import { isClerkAPIResponseError, useSignIn, useSignUp } from '@clerk/expo';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { goBack } from '@/components/back-header';
import { inputStyle } from '@/components/field';
import { Pill } from '@/components/pill';
import { Screen } from '@/components/screen';
import { Title } from '@/components/title';
import { accent, colors, fonts } from '@/theme';

const tint = accent.people;
type Step = 'email' | 'code' | 'trust';

export function AuthScreen() {
  const { signIn, fetchStatus } = useSignIn();
  const { signUp } = useSignUp();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const busy = fetchStatus === 'fetching';
  const showError = (failure: unknown) => {
    if (isClerkAPIResponseError(failure)) {
      setError(failure.errors[0]?.longMessage || failure.errors[0]?.message || 'Authentication failed. Please try again.');
    } else {
      setError('Authentication failed. Please try again.');
    }
  };

  // The root layout's Stack.Protected guards move to the app once Clerk reports a session,
  // so finishing auth only has to surface tasks we can't complete in-app.
  const afterAuth = ({ session }: { session: { currentTask?: unknown } | null | undefined; decorateUrl: (url: string) => string }) => {
    if (session?.currentTask) setError('Your account needs one more security step. Please contact support to continue.');
  };

  const sendCode = async () => {
    setError('');
    const identifier = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(identifier)) { setError('Enter a valid email address.'); return; }
    try {
      const { error: createError } = await signIn.create({ identifier, signUpIfMissing: true } as Parameters<typeof signIn.create>[0]);
      if (createError) { showError(createError); return; }
      const { error: sendError } = await signIn.emailCode.sendCode();
      if (sendError) { showError(sendError); return; }
      setEmail(identifier);
      setStep('code');
      setCooldown(30);
    } catch (failure) { showError(failure); }
  };

  const verify = async () => {
    setError('');
    if (!code.trim()) { setError('Enter the code from your email.'); return; }
    try {
      const result = step === 'trust'
        ? await signIn.mfa.verifyEmailCode({ code: code.trim() })
        : await signIn.emailCode.verifyCode({ code: code.trim() });
      if (result.error) {
        if (isClerkAPIResponseError(result.error) && result.error.errors[0]?.code === 'sign_up_if_missing_transfer') {
          const transfer = await signUp.create({ transfer: true });
          if (transfer.error) { showError(transfer.error); return; }
          if (signUp.status === 'complete') {
            await signUp.finalize({ navigate: afterAuth });
          } else {
            setError('Your account needs more details before it can be created. Please contact support.');
          }
          return;
        }
        showError(result.error);
        return;
      }
      if (signIn.status === 'complete') {
        await signIn.finalize({ navigate: afterAuth });
      } else if (signIn.status === 'needs_client_trust') {
        const extra = await signIn.mfa.sendEmailCode();
        if (extra.error) { showError(extra.error); return; }
        setCode('');
        setStep('trust');
        setCooldown(30);
      } else {
        setError('One more verification step is required. Please contact support.');
      }
    } catch (failure) { showError(failure); }
  };

  const resend = async () => {
    if (cooldown > 0 || busy) return;
    setError('');
    try {
      const result = step === 'trust' ? await signIn.mfa.sendEmailCode() : await signIn.emailCode.sendCode();
      if (result.error) { showError(result.error); return; }
      setCooldown(30);
    } catch (failure) { showError(failure); }
  };

  const startOver = () => {
    signIn.reset();
    setCode('');
    setError('');
    setStep('email');
  };

  return <Screen edges={['top', 'bottom']}>
    <KeyboardAwareScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Pressable accessibilityRole="button" accessibilityLabel="Go back" hitSlop={8} style={styles.back} onPress={step === 'email' ? goBack : startOver}>
        <Ionicons name="arrow-back" color={colors.ink} size={22} />
      </Pressable>
      <Title size={64} dot={tint} style={styles.title}>{step === 'email' ? 'come on in' : step === 'trust' ? 'one more check' : 'check your email'}</Title>
      <Text style={styles.description}>{step === 'email' ? 'just your email. new here? same button.' : `we sent a code to ${email}`}</Text>
      <View style={styles.form}>
        {step === 'email'
          ? <TextInput accessibilityLabel="Email address" style={inputStyle} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" placeholder="you@example.com" placeholderTextColor={colors.mute} returnKeyType="go" onSubmitEditing={() => void sendCode()} />
          : <TextInput accessibilityLabel="Verification code" style={[inputStyle, styles.code]} value={code} onChangeText={setCode} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={8} placeholder="000000" placeholderTextColor={colors.mute} />}
        {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        <Pill size="lg" label={step === 'email' ? 'continue' : 'verify'} color={tint} trailingIcon="arrow-forward" busy={busy}
          onPress={() => void (step === 'email' ? sendCode() : verify())} style={styles.cta} />
        {step !== 'email' && <Pressable accessibilityRole="button" style={styles.resend} disabled={cooldown > 0 || busy} onPress={() => void resend()}>
          <Text style={[styles.resendText, cooldown > 0 && styles.resendDisabled]}>{cooldown > 0 ? `resend code in ${cooldown}s` : 'resend code'}</Text>
        </Pressable>}
        <View nativeID="clerk-captcha" />
      </View>
    </KeyboardAwareScrollView>
  </Screen>;
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, paddingHorizontal: 20, paddingBottom: 30 },
  back: { width: 44, height: 44, marginTop: 8, marginLeft: -10, alignItems: 'center', justifyContent: 'center' },
  title: { marginTop: 48 },
  description: { color: colors.mute, fontFamily: fonts.medium, fontSize: 16, lineHeight: 23, marginTop: 10 },
  form: { marginTop: 36 },
  code: { fontFamily: fonts.heavy, fontSize: 24, letterSpacing: 6 },
  error: { color: colors.danger, fontFamily: fonts.body, fontSize: 13, marginTop: 10 },
  cta: { marginTop: 18, alignSelf: 'stretch' },
  resend: { minHeight: 48, alignSelf: 'center', justifyContent: 'center', marginTop: 8 },
  resendText: { color: tint, fontFamily: fonts.bold, fontSize: 14 },
  resendDisabled: { color: colors.mute },
});

import { isClerkAPIResponseError, useSignIn, useSignUp } from '@clerk/expo';
import { Ionicons } from '@expo/vector-icons';
import { type Href, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fonts } from '@/theme';

type Step = 'email' | 'code' | 'trust';

export function AuthScreen({ onBack }: { onBack: () => void }) {
  const { signIn, fetchStatus } = useSignIn();
  const { signUp } = useSignUp();
  const router = useRouter();
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

  const afterAuth = ({ session, decorateUrl }: { session: { currentTask?: unknown } | null | undefined; decorateUrl: (url: string) => string }) => {
    if (session?.currentTask) {
      setError('Your account needs one more security step. Please contact support to continue.');
      return;
    }
    router.replace(decorateUrl('/') as Href);
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

  return <SafeAreaView style={styles.root}>
    <KeyboardAwareScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Pressable accessibilityRole="button" accessibilityLabel="Go back" style={styles.back} onPress={step === 'email' ? onBack : startOver}><Ionicons name="arrow-back" color={colors.ink} size={22} /></Pressable>
      <View style={styles.stage}><Text style={styles.stageText}>{step === 'email' ? '01 / START HERE' : '02 / CHECK YOUR INBOX'}</Text><View style={styles.stageLine} /></View>
      <Text style={styles.title}>{step === 'email' ? 'Meet your\ncity.' : step === 'trust' ? 'One more\ncheck.' : 'Check your\nemail.'}</Text>
      <Text style={styles.description}>{step === 'email' ? 'One email, one code. A simpler way into Decio.' : `We sent a six-digit code to ${email}. Enter it below to continue.`}</Text>
      <View style={styles.form}>
        <Text style={styles.label}>{step === 'email' ? 'EMAIL ADDRESS' : 'VERIFICATION CODE'}</Text>
        {step === 'email' ? <TextInput style={styles.input} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" placeholder="you@example.com" placeholderTextColor={colors.muted} returnKeyType="go" onSubmitEditing={() => void sendCode()} /> : <TextInput style={[styles.input, styles.codeInput]} value={code} onChangeText={setCode} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={8} placeholder="000000" placeholderTextColor={colors.muted} />}
        {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        <Pressable style={[styles.button, busy && styles.buttonDisabled]} disabled={busy} onPress={() => void (step === 'email' ? sendCode() : verify())}><Text style={styles.buttonText}>{busy ? 'Please wait…' : step === 'email' ? 'Continue with email' : 'Verify and continue'}</Text><Ionicons name="arrow-forward" color={colors.white} size={19} /></Pressable>
        {step !== 'email' && <Pressable style={styles.resend} disabled={cooldown > 0 || busy} onPress={() => void resend()}><Text style={[styles.resendText, cooldown > 0 && styles.resendDisabled]}>{cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}</Text></Pressable>}
        <View nativeID="clerk-captcha" />
      </View>
      <View style={styles.footer}><View style={styles.footerDot} /><Text style={styles.footerText}>MADE FOR CONNECTIONS THAT GO SOMEWHERE</Text></View>
    </KeyboardAwareScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper }, content: { flexGrow: 1, paddingHorizontal: 28, paddingBottom: 30 },
  back: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line, borderRadius: 15, backgroundColor: colors.white, marginTop: 18 },
  stage: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 75 }, stageText: { fontFamily: fonts.medium, color: colors.blue, fontSize: 10, letterSpacing: 1.4 }, stageLine: { width: 45, height: 1, backgroundColor: colors.blue },
  title: { fontFamily: fonts.display, color: colors.ink, fontSize: 52, lineHeight: 54, letterSpacing: -2.3, marginTop: 17 }, description: { fontFamily: fonts.body, color: colors.muted, fontSize: 16, lineHeight: 24, maxWidth: 310, marginTop: 16 },
  form: { marginTop: 52 }, label: { fontFamily: fonts.medium, color: colors.ink, fontSize: 11, letterSpacing: 1.25, marginBottom: 11 }, input: { backgroundColor: colors.white, color: colors.ink, borderWidth: 1, borderColor: colors.line, borderRadius: 14, height: 58, paddingHorizontal: 17, fontFamily: fonts.body, fontSize: 16 }, codeInput: { fontFamily: fonts.medium, fontSize: 23, letterSpacing: 6 },
  button: { backgroundColor: colors.blue, borderRadius: 14, minHeight: 56, paddingHorizontal: 18, marginTop: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, buttonDisabled: { opacity: 0.6 }, buttonText: { fontFamily: fonts.medium, color: colors.white, fontSize: 16 },
  error: { color: '#B42318', fontFamily: fonts.body, fontSize: 13, marginTop: 10 }, resend: { paddingVertical: 18, alignSelf: 'center' }, resendText: { color: colors.blue, fontFamily: fonts.medium, fontSize: 14 }, resendDisabled: { color: colors.muted },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 'auto', paddingTop: 30 }, footerDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.yellow }, footerText: { color: colors.muted, fontFamily: fonts.medium, fontSize: 9, letterSpacing: 1 },
});

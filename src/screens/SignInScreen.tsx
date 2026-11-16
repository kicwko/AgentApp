import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { KweeckoLogo } from '../components/KweeckoLogo';
import {
  confirmPhoneOtp,
  sendPhoneOtp,
  signInWithGoogleIdToken,
  type ConfirmationResult,
} from '../services/firebaseAuth';
import { signInWithGoogle } from '../services/googleAuth';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

type Props = {
  onBack: () => void;
  onGoToRegister?: () => void;
};

type PhoneStep = 'phone' | 'otp';

export function SignInScreen({ onBack }: Props) {
  const [countryCode, setCountryCode] = useState('+91');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [step, setStep] = useState<PhoneStep>('phone');
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null);

  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Resend cooldown timer in seconds
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) {
      return;
    }
    const timer = setInterval(() => {
      setResendCooldown(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const getFullPhoneNumber = (): string => {
    const rawNumber = phoneNumber.replace(/[\s\-()]/g, '');
    if (rawNumber.startsWith('+')) {
      return rawNumber;
    }
    const code = countryCode.trim().startsWith('+')
      ? countryCode.trim()
      : `+${countryCode.trim()}`;
    const localNumber = rawNumber.replace(/^0+/, '');
    return `${code}${localNumber}`;
  };

  const handleSendOtp = async () => {
    setError(null);
    const cleanedNumber = phoneNumber.replace(/[\s\-()]/g, '');
    if (!cleanedNumber || cleanedNumber.length < 7) {
      setError('Please enter a valid mobile number.');
      return;
    }

    const fullPhone = getFullPhoneNumber();
    setSendingOtp(true);
    try {
      // 15-second safety timeout so the UI never hangs indefinitely if Play Integrity/SMS delays
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject({
            code: 'auth/timeout',
            message:
              'Verification request timed out. Please check that Phone auth & SHA-256 are configured in Firebase, or use a Firebase Test Phone Number.',
          });
        }, 15000);
      });

      const confirmResult = await Promise.race([
        sendPhoneOtp(fullPhone),
        timeoutPromise,
      ]);
      setConfirmation(confirmResult);
      setStep('otp');
      setResendCooldown(30);
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setSendingOtp(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!confirmation) {
      setError('Session expired. Please request a new OTP.');
      setStep('phone');
      return;
    }

    const cleanOtp = otpCode.trim();
    if (!cleanOtp || cleanOtp.length < 6) {
      setError('Please enter the 6-digit OTP code.');
      return;
    }

    setError(null);
    setVerifyingOtp(true);
    try {
      await confirmPhoneOtp(confirmation, cleanOtp);
      // Auth state listener in App.tsx automatically navigates on successful sign-in
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setVerifyingOtp(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0) {
      return;
    }
    await handleSendOtp();
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setGoogleSubmitting(true);
    try {
      const outcome = await signInWithGoogle();
      if (outcome.status === 'cancelled') {
        return;
      }
      await signInWithGoogleIdToken(outcome.idToken);
      // Auth state listener in App.tsx handles navigation on success.
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setGoogleSubmitting(false);
    }
  };

  const handleChangeNumber = () => {
    setError(null);
    setOtpCode('');
    setStep('phone');
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>{'\u2190'} Back</Text>
        </TouchableOpacity>

        <KweeckoLogo compact />

        <Text style={styles.heading}>Sign In</Text>
        <Text style={styles.subtext}>
          Sign in with your mobile number or Google account to access your tasks.
        </Text>

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Phone Number / OTP Section */}
        {step === 'phone' ? (
          <View style={styles.phoneSection}>
            <Text style={styles.label}>Mobile Number</Text>
            <View style={styles.phoneInputRow}>
              <TextInput
                style={styles.countryCodeInput}
                value={countryCode}
                onChangeText={setCountryCode}
                keyboardType="phone-pad"
                maxLength={5}
                placeholder="+91"
                placeholderTextColor={colors.textMuted}
              />
              <TextInput
                style={styles.phoneInput}
                placeholder="10-digit mobile number"
                placeholderTextColor={colors.textMuted}
                keyboardType="phone-pad"
                value={phoneNumber}
                onChangeText={setPhoneNumber}
                autoFocus
              />
            </View>

            <TouchableOpacity
              style={styles.primaryButton}
              onPress={handleSendOtp}
              disabled={sendingOtp}
              activeOpacity={0.85}>
              {sendingOtp ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.primaryButtonText}>Send OTP</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.otpSection}>
            <View style={styles.otpHeaderRow}>
              <Text style={styles.label}>
                OTP sent to <Text style={styles.phoneHighlight}>{getFullPhoneNumber()}</Text>
              </Text>
              <TouchableOpacity onPress={handleChangeNumber}>
                <Text style={styles.changeNumberText}>Edit</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.otpInput}
              placeholder="000000"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              maxLength={6}
              value={otpCode}
              onChangeText={setOtpCode}
              autoFocus
            />

            <TouchableOpacity
              style={styles.primaryButton}
              onPress={handleVerifyOtp}
              disabled={verifyingOtp}
              activeOpacity={0.85}>
              {verifyingOtp ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.primaryButtonText}>Verify & Sign In</Text>
              )}
            </TouchableOpacity>

            <View style={styles.resendRow}>
              <Text style={styles.resendHint}>Didn't receive the code?</Text>
              <TouchableOpacity
                onPress={handleResendOtp}
                disabled={resendCooldown > 0 || sendingOtp}>
                <Text
                  style={[
                    styles.resendButtonText,
                    resendCooldown > 0 && styles.resendDisabled,
                  ]}>
                  {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend OTP'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>OR</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Google Sign-In */}
        <TouchableOpacity
          style={styles.googleButton}
          onPress={handleGoogleSignIn}
          disabled={googleSubmitting}
          activeOpacity={0.85}>
          {googleSubmitting ? (
            <ActivityIndicator color={colors.textDark} />
          ) : (
            <View style={styles.googleButtonContent}>
              <Text style={styles.googleIcon}>G</Text>
              <Text style={styles.googleButtonText}>Continue with Google</Text>
            </View>
          )}
        </TouchableOpacity>

        <Text style={styles.termsText}>
          By signing in, you agree to Kweecko's Partner Terms of Service and Privacy Policy.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** Maps Firebase Auth errors to clear, actionable messages */
function mapAuthError(err: unknown): string {
  const code = (err as { code?: string } | null)?.code ?? '';
  switch (code) {
    case 'auth/timeout':
      return 'Verification timed out. For Android emulators, ensure the SHA-256 fingerprint is registered in Firebase, or add your number as a "Phone number for testing" in Firebase Console.';
    case 'auth/app-not-authorized':
      return 'App not authorized. Add your SHA-256 fingerprint in Firebase Console → Project Settings.';
    case 'auth/invalid-phone-number':
      return 'The mobile number entered is invalid. Please check the number and country code.';
    case 'auth/missing-phone-number':
      return 'Please enter your mobile number.';
    case 'auth/invalid-verification-code':
      return 'Incorrect 6-digit OTP code. Please check and try again.';
    case 'auth/session-expired':
    case 'auth/code-expired':
      return 'The verification code has expired. Please tap Resend OTP.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a few moments before trying again.';
    case 'auth/quota-exceeded':
      return 'SMS quota exceeded for this project. Please contact support or use Google Sign-In.';
    case 'auth/operation-not-allowed':
      return 'Phone authentication is not enabled in Firebase Console. Please enable the Phone provider in Firebase Console → Authentication → Sign-in method.';
    case 'auth/network-request-failed':
      return 'Network error. Please check your internet connection and try again.';
    case 'auth/user-disabled':
      return 'This agent account has been disabled.';
    default:
      return (
        (err as { message?: string } | null)?.message ??
        'An error occurred. Please check your details and try again.'
      );
  }
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.backgroundPeach,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 48,
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: 16,
  },
  backButtonText: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
    color: colors.textMuted,
  },
  heading: {
    fontFamily: typography.fontFamily,
    fontWeight: typography.weightBold,
    fontSize: 28,
    color: colors.textDark,
    marginTop: 20,
  },
  subtext: {
    fontFamily: typography.fontFamily,
    fontSize: 15,
    lineHeight: 22,
    color: colors.textMuted,
    marginTop: 8,
    marginBottom: 24,
  },
  errorBox: {
    backgroundColor: '#FFEAEA',
    borderColor: colors.coral,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
    color: colors.coral,
    lineHeight: 20,
  },
  phoneSection: {
    marginBottom: 8,
  },
  label: {
    fontFamily: typography.fontFamily,
    fontWeight: typography.weightSemibold,
    fontSize: 14,
    color: colors.textDark,
    marginBottom: 8,
  },
  phoneInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  countryCodeInput: {
    width: 72,
    backgroundColor: colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 14,
    fontSize: 16,
    fontWeight: '600',
    color: colors.textDark,
    textAlign: 'center',
    marginRight: 10,
  },
  phoneInput: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.textDark,
  },
  otpSection: {
    marginBottom: 8,
  },
  otpHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  phoneHighlight: {
    fontWeight: typography.weightBold,
    color: colors.coral,
  },
  changeNumberText: {
    fontFamily: typography.fontFamily,
    fontWeight: typography.weightSemibold,
    fontSize: 14,
    color: colors.coral,
  },
  otpInput: {
    backgroundColor: colors.white,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.coral,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 10,
    textAlign: 'center',
    color: colors.textDark,
    marginBottom: 16,
  },
  resendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
  },
  resendHint: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
    color: colors.textMuted,
    marginRight: 6,
  },
  resendButtonText: {
    fontFamily: typography.fontFamily,
    fontWeight: typography.weightBold,
    fontSize: 14,
    color: colors.coral,
  },
  resendDisabled: {
    color: colors.textMuted,
    opacity: 0.6,
  },
  primaryButton: {
    backgroundColor: colors.coral,
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontFamily: typography.fontFamily,
    fontWeight: typography.weightSemibold,
    fontSize: 16,
    color: colors.white,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    color: colors.textMuted,
    marginHorizontal: 12,
    fontWeight: '600',
  },
  googleButton: {
    backgroundColor: colors.white,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingVertical: 16,
    alignItems: 'center',
  },
  googleButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleIcon: {
    fontWeight: '900',
    fontSize: 17,
    color: '#4285F4',
    marginRight: 10,
  },
  googleButtonText: {
    fontFamily: typography.fontFamily,
    fontWeight: typography.weightSemibold,
    fontSize: 16,
    color: colors.textDark,
  },
  termsText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 32,
  },
});

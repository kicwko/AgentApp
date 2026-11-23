import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { GradientButton } from '../components/GradientButton';
import {
  confirmPhoneOtp,
  sendPhoneOtp,
  signInWithGoogleIdToken,
  signOutUser,
  type ConfirmationResult,
} from '../services/firebaseAuth';
import { signInWithGoogle } from '../services/googleAuth';
import { userService } from '../services/userService';
import { sessionService } from '../services/sessionService';
import type { AccountStatusData } from './AccountStatusScreen';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

type Props = {
  onBack: () => void;
  onGoToRegister?: () => void;
  onGoToSignIn?: () => void;
  onAccountStatus?: (data: AccountStatusData) => void;
  onLoginSuccess?: (user: any) => void;
  isRegister?: boolean;
};

type PhoneStep = 'phone' | 'otp';

export function SignInScreen({
  onBack,
  onGoToRegister,
  onGoToSignIn,
  onAccountStatus,
  onLoginSuccess,
  isRegister = false,
}: Props) {
  const [countryCode, setCountryCode] = useState('+91');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [step, setStep] = useState<PhoneStep>('phone');
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null);

  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSignupLink, setShowSignupLink] = useState(false);

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
    setShowSignupLink(false);
    const cleanedNumber = phoneNumber.replace(/[\s\-()]/g, '');
    if (!cleanedNumber || cleanedNumber.length < 7) {
      setError('Please enter a valid mobile number.');
      return;
    }

    const last10 = cleanedNumber.slice(-10);
    const fullPhone = getFullPhoneNumber();
    setSendingOtp(true);
    try {
      // 1. Check with backend loginSendOtp (detects if user is Blocked or Not Onboarded)
      try {
        const checkRes = await userService.loginSendOtp(last10);
        if (checkRes) {
          const rawStatus = (checkRes.status || checkRes.data?.status || '').trim();
          const isBlocked = checkRes.isBlocked || rawStatus.toLowerCase() === 'blocked';
          if (isBlocked) {
            if (onAccountStatus) {
              onAccountStatus({
                status: 'Blocked',
                reason: checkRes.reason || checkRes.message,
                phone: last10,
                userName: checkRes.data?.userName || checkRes.data?.fullName,
                fullName: checkRes.data?.fullName,
                userId: checkRes.data?.id || checkRes.data?._id,
              });
              return;
            }
          }
        }
      } catch (checkErr: any) {
        if (checkErr?.isBlocked || checkErr?.status === 'Blocked') {
          if (onAccountStatus) {
            onAccountStatus({
              status: 'Blocked',
              reason: checkErr.reason || checkErr.message,
              phone: last10,
            });
            return;
          }
        }
        const errMsg = String(checkErr?.message || checkErr?.error || '').toLowerCase();
        if (
          checkErr?.status === 404 ||
          checkErr?.status === '404' ||
          errMsg.includes('not found') ||
          errMsg.includes('not registered') ||
          errMsg.includes('not onboarded')
        ) {
          const friendlyMsg = "Ohh! Account not found. Looks like you're not onboarded yet.";
          setError(friendlyMsg);
          setShowSignupLink(true);
          Alert.alert(
            'Not Onboarded Yet',
            `Ohh! Account not found for +91 ${last10}.\n\nLooks like you're not onboarded yet. Please register to create your agent partner account.`,
            [
              {
                text: 'Register / Sign Up',
                onPress: () => {
                  if (onGoToRegister) {
                    onGoToRegister();
                  }
                },
              },
              { text: 'Cancel', style: 'cancel' },
            ]
          );
          return;
        }
      }

      // 2. Dispatch Firebase Phone OTP
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject({
            code: 'auth/timeout',
            message:
              'Verification request timed out. Please check that Phone auth & SHA-256 are configured in Firebase, or use a Firebase Test Phone Number.',
          });
        }, 12000);
      });

      try {
        const confirmResult = await Promise.race([
          sendPhoneOtp(fullPhone),
          timeoutPromise,
        ]);
        setConfirmation(confirmResult);
      } catch (fbErr) {
        console.warn('[SignIn] Firebase phone auth notice:', fbErr);
      }

      setStep('otp');
      setResendCooldown(30);
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setSendingOtp(false);
    }
  };

  const handleVerifyOtp = async () => {
    const cleanOtp = otpCode.replace(/\D/g, '').slice(0, 6);
    if (!cleanOtp || cleanOtp.length !== 6) {
      setError('Please enter a valid 6-digit OTP code.');
      return;
    }

    const cleanedNumber = phoneNumber.replace(/[\s\-()]/g, '');
    const last10 = cleanedNumber.slice(-10);

    setError(null);
    setVerifyingOtp(true);
    try {
      let firebaseConfirmed = false;
      if (confirmation) {
        try {
          const fbTimeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Firebase confirm timeout')), 2500)
          );
          await Promise.race([
            confirmPhoneOtp(confirmation, cleanOtp),
            fbTimeoutPromise,
          ]);
          firebaseConfirmed = true;
        } catch (fbErr) {
          console.warn('[SignIn] Firebase confirm notice:', fbErr);
        }
      }

      // Verify OTP with backend to inspect user account status (Blocked, Pending, Active)
      try {
        const verifyRes = await userService.loginVerifyOtp(last10, cleanOtp);
        if (verifyRes) {
          const rawStatus = (verifyRes.status || verifyRes.data?.status || 'Active').trim();
          const isBlocked = verifyRes.isBlocked || rawStatus.toLowerCase() === 'blocked';
          const isPending = verifyRes.isPending || rawStatus.toLowerCase() === 'pending';

          if (isBlocked || isPending || rawStatus !== 'Active') {
            if (onAccountStatus) {
              onAccountStatus({
                status: isBlocked ? 'Blocked' : 'Pending',
                reason:
                  (verifyRes as any)?.pendingReason ||
                  (verifyRes.data as any)?.pendingReason ||
                  verifyRes.reason ||
                  verifyRes.message ||
                  (verifyRes.data as any)?.reason,
                pendingReason:
                  (verifyRes as any)?.pendingReason ||
                  (verifyRes.data as any)?.pendingReason ||
                  verifyRes.reason ||
                  verifyRes.message,
                blockReason: (verifyRes.data as any)?.blockReason,
                userName:
                  (verifyRes.data as any)?.userName ||
                  (verifyRes.data as any)?.fullName ||
                  (verifyRes.data as any)?.user?.fullName,
                fullName:
                  (verifyRes.data as any)?.fullName ||
                  (verifyRes.data as any)?.user?.fullName,
                phone: last10,
                userId:
                  (verifyRes.data as any)?.id ||
                  (verifyRes.data as any)?._id ||
                  (verifyRes.data as any)?.user?._id,
                token:
                  (verifyRes.data as any)?.token ||
                  (verifyRes as any)?.token ||
                  last10,
                applicationId: (verifyRes.data as any)?.user?.applicationId,
                checklist:
                  (verifyRes.data as any)?.statusDetails?.checklist ||
                  (verifyRes as any)?.checklist,
              });
              return;
            }
          } else {
            // User account is Active!
            if (onLoginSuccess) {
              const activeUser: any = {
                uid:
                  (verifyRes.data as any)?.id ||
                  (verifyRes.data as any)?._id ||
                  (verifyRes.data as any)?.user?._id ||
                  `agent_${last10}`,
                displayName:
                  (verifyRes.data as any)?.userName ||
                  (verifyRes.data as any)?.fullName ||
                  (verifyRes.data as any)?.user?.fullName ||
                  'Partner',
                phoneNumber: last10,
                email: (verifyRes.data as any)?.email || (verifyRes.data as any)?.user?.email || '',
              };
              onLoginSuccess(activeUser);
              return;
            }
          }
        }
      } catch (backendErr: any) {
        if (
          backendErr?.isBlocked ||
          backendErr?.status === 'Blocked' ||
          backendErr?.isPending ||
          backendErr?.status === 'Pending'
        ) {
          if (onAccountStatus) {
            onAccountStatus({
              status:
                backendErr.isBlocked || backendErr.status === 'Blocked'
                  ? 'Blocked'
                  : 'Pending',
              reason: backendErr.reason || backendErr.message,
              phone: last10,
            });
            return;
          }
        }
        const errMsg = String(backendErr?.message || backendErr?.error || '').toLowerCase();
        if (
          backendErr?.status === 404 ||
          backendErr?.status === '404' ||
          errMsg.includes('not found') ||
          errMsg.includes('not registered') ||
          errMsg.includes('not onboarded')
        ) {
          const friendlyMsg = "Ohh! Account not found. Looks like you're not onboarded yet.";
          setError(friendlyMsg);
          setShowSignupLink(true);
          Alert.alert(
            'Not Onboarded Yet',
            `Ohh! Account not found for +91 ${last10}.\n\nLooks like you're not onboarded yet. Please register to create your agent partner account.`,
            [
              {
                text: 'Register / Sign Up',
                onPress: () => {
                  if (onGoToRegister) {
                    onGoToRegister();
                  } else {
                    setStep('phone');
                  }
                },
              },
              { text: 'Cancel', style: 'cancel' },
            ]
          );
          return;
        }
        if (!firebaseConfirmed) {
          throw backendErr;
        }
      }
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
      const userCred = await signInWithGoogleIdToken(outcome.idToken);
      const googleUser = userCred.user;
      const cleanEmail = (googleUser.email || '').trim().toLowerCase();

      // 1. Verify whether this user is registered in the database with that email
      let isRegisteredInDb = false;
      try {
        if (cleanEmail) {
          const checkRes = await userService.checkUserExists({ email: cleanEmail });
          if (checkRes && checkRes.exists) {
            isRegisteredInDb = true;
          }
        }
      } catch (checkErr) {
        console.warn('[SignIn] Error checking email in database:', checkErr);
      }

      if (!isRegisteredInDb) {
        // User is NOT in the database with that Gmail!
        // Do NOT allow him to login and do NOT auto-register him!
        console.log('[SignIn] Google user not found in database:', cleanEmail);
        try {
          await signOutUser();
          await sessionService.clearSession();
        } catch {}

        const friendlyMsg = "Ohh! Account not found. Looks like you're not onboarded yet.";
        setError(friendlyMsg);
        setShowSignupLink(true);
        Alert.alert(
          'Not Onboarded Yet',
          `Ohh! Account not found for "${cleanEmail}".\n\nLooks like you're not onboarded yet. Please register to create your agent partner account.`,
          [
            {
              text: 'Register / Sign Up',
              onPress: () => {
                if (onGoToRegister) {
                  onGoToRegister();
                } else {
                  setStep('phone');
                }
              },
            },
            { text: 'Cancel', style: 'cancel' },
          ]
        );
        return;
      }

      // 2. User exists in DB! Sync with backend & check account status
      try {
        const syncRes = await userService.syncFirebaseUser({
          email: cleanEmail,
          displayName: googleUser.displayName,
          photoURL: googleUser.photoURL,
          uid: googleUser.uid,
          phone: googleUser.phoneNumber,
        });

        const rawStatus = (syncRes?.status || syncRes?.data?.status || 'Active').trim();
        const isBlocked = syncRes?.isBlocked || rawStatus.toLowerCase() === 'blocked';
        const isPending = syncRes?.isPending || rawStatus.toLowerCase() === 'pending';

        if (isBlocked || isPending || rawStatus !== 'Active') {
          if (onAccountStatus) {
            onAccountStatus({
              status: isBlocked ? 'Blocked' : 'Pending',
              reason:
                (syncRes as any)?.pendingReason ||
                (syncRes?.data as any)?.pendingReason ||
                syncRes?.reason ||
                syncRes?.data?.reason ||
                syncRes?.message ||
                '',
              pendingReason:
                (syncRes as any)?.pendingReason ||
                (syncRes?.data as any)?.pendingReason ||
                syncRes?.reason ||
                syncRes?.message,
              blockReason: (syncRes?.data as any)?.blockReason,
              userName:
                syncRes?.data?.userName ||
                syncRes?.data?.fullName ||
                googleUser.displayName ||
                '',
              fullName: syncRes?.data?.fullName || googleUser.displayName || '',
              email: syncRes?.data?.email || googleUser.email || '',
              phone: syncRes?.data?.phone || googleUser.phoneNumber || '',
              userId: syncRes?.data?._id || syncRes?.data?.id || googleUser.uid,
              token:
                (syncRes as any)?.token ||
                (syncRes?.data as any)?.token ||
                googleUser.uid,
              checklist:
                (syncRes?.data as any)?.statusDetails?.checklist ||
                (syncRes as any)?.checklist,
            });
            return;
          }
        } else {
          // Google user is Active!
          if (onLoginSuccess) {
            const activeUser: any = {
              uid: syncRes?.data?._id || syncRes?.data?.id || googleUser.uid,
              displayName: syncRes?.data?.fullName || googleUser.displayName || 'Partner',
              phoneNumber: syncRes?.data?.phone || googleUser.phoneNumber || '',
              email: syncRes?.data?.email || googleUser.email || '',
            };
            onLoginSuccess(activeUser);
            return;
          }
        }
      } catch (syncErr: any) {
        if (
          syncErr?.isBlocked ||
          syncErr?.status === 'Blocked' ||
          syncErr?.isPending ||
          syncErr?.status === 'Pending'
        ) {
          if (onAccountStatus) {
            onAccountStatus({
              status:
                syncErr.isBlocked || syncErr.status === 'Blocked'
                  ? 'Blocked'
                  : 'Pending',
              reason: syncErr.reason || syncErr.message,
              email: googleUser.email || '',
              userId: googleUser.uid,
              token: googleUser.uid,
            });
            return;
          }
        }
      }
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setGoogleSubmitting(false);
    }
  };

  const handleChangeNumber = () => {
    setError(null);
    setShowSignupLink(false);
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
            {showSignupLink && (
              <TouchableOpacity
                style={styles.errorSignupCta}
                onPress={() => {
                  setError(null);
                  setShowSignupLink(false);
                  if (onGoToRegister) {
                    onGoToRegister();
                  } else {
                    setStep('phone');
                  }
                }}
                activeOpacity={0.85}>
                <Text style={styles.errorSignupCtaText}>
                  👉 Register / Onboard as Partner
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Phone Number / OTP Section */}
        {step === 'phone' ? (
          <View style={styles.phoneSection}>
            <Text style={styles.label}>Mobile Number</Text>
            <View style={styles.phoneInputRow}>
              <TextInput
                style={[styles.phoneInput, sendingOtp && styles.phoneInputDisabled]}
                placeholder="10-digit mobile number"
                placeholderTextColor={colors.textMuted}
                keyboardType="phone-pad"
                maxLength={10}
                value={phoneNumber}
                onChangeText={text => setPhoneNumber(text.replace(/\D/g, '').slice(0, 10))}
                editable={!sendingOtp}
                autoFocus
              />
            </View>

            <GradientButton
              title="Send OTP"
              onPress={handleSendOtp}
              disabled={sendingOtp || phoneNumber.length < 10}
              loading={sendingOtp}
              loadingText="Sending OTP..."
              style={styles.primaryButton}
              textStyle={styles.primaryButtonText}
            />
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
              placeholderTextColor="#CBD5E1"
              keyboardType="number-pad"
              maxLength={6}
              value={otpCode}
              onChangeText={text => setOtpCode(text.replace(/\D/g, '').slice(0, 6))}
              autoFocus
            />

            <GradientButton
              title="Verify & Sign In"
              onPress={handleVerifyOtp}
              disabled={verifyingOtp || otpCode.replace(/\D/g, '').length !== 6}
              loading={verifyingOtp}
              loadingText="Verifying..."
              style={styles.primaryButton}
              textStyle={styles.primaryButtonText}
            />

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

        {/* Switch to Register via Web Onboarding */}
        <View style={styles.switchAuthRow}>
          <Text style={styles.switchAuthPrompt}>
            Don't have a partner account?
          </Text>
          <TouchableOpacity
            onPress={onGoToRegister}
            activeOpacity={0.8}>
            <Text style={styles.switchAuthLink}>
              {' Register / Sign Up'}
            </Text>
          </TouchableOpacity>
        </View>

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
    default: {
      const rawMsg = String((err as { message?: string } | null)?.message ?? '');
      const lower = rawMsg.toLowerCase();
      if (
        lower.includes('not found') ||
        lower.includes('not registered') ||
        lower.includes('not onboarded') ||
        lower.includes('no account')
      ) {
        return "Ohh! Account not found. Looks like you're not onboarded yet.";
      }
      return rawMsg || 'An error occurred. Please check your details and try again.';
    }
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
    backgroundColor: colors.colorErrorContainer,
    borderColor: colors.colorError,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
    color: colors.colorOnErrorContainer,
    lineHeight: 20,
  },
  errorSignupCta: {
    marginTop: 10,
    backgroundColor: '#FFE4E6',
    borderWidth: 1,
    borderColor: '#FDA4AF',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
  },
  errorSignupCtaText: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '700',
    color: '#BE123C',
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
    borderColor: colors.borderLight,
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
    borderColor: colors.borderLight,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.textDark,
  },
  phoneInputDisabled: {
    backgroundColor: '#EAEDFF',
    color: '#777587',
    opacity: 0.7,
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
    color: colors.primary,
  },
  changeNumberText: {
    fontFamily: typography.fontFamily,
    fontWeight: typography.weightSemibold,
    fontSize: 14,
    color: colors.primary,
  },
  otpInput: {
    backgroundColor: colors.white,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.primary,
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
    color: colors.primary,
  },
  resendDisabled: {
    color: colors.textMuted,
    opacity: 0.6,
  },
  primaryButton: {
    backgroundColor: colors.buttonPrimary,
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
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
    backgroundColor: colors.borderSubtle,
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
    borderColor: colors.borderLight,
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
  switchAuthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  switchAuthPrompt: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    color: colors.textMuted,
  },
  switchAuthLink: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(19, 27, 46, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    elevation: 20,
    paddingHorizontal: 24,
  },
  loadingOverlayCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: colors.white,
    borderRadius: 20,
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
  loadingOverlayTitle: {
    fontFamily: typography.fontFamily,
    fontWeight: typography.weightBold,
    fontSize: 16,
    color: colors.textDark,
    marginTop: 14,
    textAlign: 'center',
  },
  loadingOverlaySubtitle: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 6,
    textAlign: 'center',
    lineHeight: 17,
  },
});

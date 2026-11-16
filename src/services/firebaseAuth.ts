import {
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithCredential,
  signInWithEmailAndPassword,
  signInWithPhoneNumber,
  signOut,
  type ConfirmationResult,
  type User,
} from '@react-native-firebase/auth';

const auth = getAuth();

export type { User, ConfirmationResult };

/** Sends an SMS OTP to the provided E.164 phone number. */
export function sendPhoneOtp(phoneNumber: string): Promise<ConfirmationResult> {
  return signInWithPhoneNumber(auth, phoneNumber);
}

/** Confirms the SMS OTP verification code with the confirmation result. */
export function confirmPhoneOtp(
  confirmation: ConfirmationResult,
  code: string,
) {
  return confirmation.confirm(code.trim());
}

/** Signs in an existing agent with email + password (legacy). */
export function signInWithEmail(email: string, password: string) {
  return signInWithEmailAndPassword(auth, email.trim(), password);
}

/** Creates a new agent account with email + password (legacy). */
export function registerWithEmail(email: string, password: string) {
  return createUserWithEmailAndPassword(auth, email.trim(), password);
}

/** Exchanges a Google ID token for a Firebase credential and signs in. */
export function signInWithGoogleIdToken(idToken: string) {
  const credential = GoogleAuthProvider.credential(idToken);
  return signInWithCredential(auth, credential);
}

/** Signs the current user out. */
export function signOutUser() {
  return signOut(auth);
}

/** Subscribes to auth state changes. Returns an unsubscribe function. */
export function subscribeToAuthState(
  callback: (user: User | null) => void,
) {
  return onAuthStateChanged(auth, callback);
}

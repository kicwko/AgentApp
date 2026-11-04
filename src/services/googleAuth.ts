import {
  GoogleSignin,
  isSuccessResponse,
  statusCodes,
  isErrorWithCode,
} from '@react-native-google-signin/google-signin';

// Web client ID (OAuth client type 3) from google-services.json. This is the
// client ID Firebase uses to verify Google ID tokens server-side — it is NOT
// the Android client ID, and it's safe to embed in app code (not a secret).
const WEB_CLIENT_ID =
  '1008376939186-dt4kd37vseg6r3kq217jdhl2nkad6751.apps.googleusercontent.com';

let configured = false;

/** Configures the Google Sign-In SDK. Safe to call multiple times. */
export function configureGoogleSignIn() {
  if (configured) {
    return;
  }
  GoogleSignin.configure({
    webClientId: WEB_CLIENT_ID,
  });
  configured = true;
}

export type GoogleSignInOutcome =
  | { status: 'success'; idToken: string }
  | { status: 'cancelled' };

/**
 * Runs the native Google Sign-In flow and returns the ID token needed to
 * authenticate with Firebase, or `{ status: 'cancelled' }` if the user backed
 * out of the flow.
 */
export async function signInWithGoogle(): Promise<GoogleSignInOutcome> {
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const response = await GoogleSignin.signIn();

  if (!isSuccessResponse(response)) {
    return { status: 'cancelled' };
  }

  const { idToken } = response.data;
  if (!idToken) {
    throw new Error('Google Sign-In did not return an ID token.');
  }

  return { status: 'success', idToken };
}

/** True if `error` came from the Google Sign-In SDK with the given status code. */
export function isGoogleSignInError(
  error: unknown,
  code: keyof typeof statusCodes,
): boolean {
  return isErrorWithCode(error) && error.code === statusCodes[code];
}

export { statusCodes as googleSignInStatusCodes };

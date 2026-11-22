import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { SignInScreen } from '../src/screens/SignInScreen';
import { signInWithGoogle } from '../src/services/googleAuth';
import { signInWithGoogleIdToken, signOutUser } from '../src/services/firebaseAuth';
import { userService } from '../src/services/userService';

jest.mock('../src/services/googleAuth', () => ({
  signInWithGoogle: jest.fn(),
  configureGoogleSignIn: jest.fn(),
}));

jest.mock('../src/services/firebaseAuth', () => ({
  signInWithGoogleIdToken: jest.fn(),
  signOutUser: jest.fn().mockResolvedValue(undefined),
  sendPhoneOtp: jest.fn(),
  confirmPhoneOtp: jest.fn(),
  subscribeToAuthState: jest.fn(),
}));

jest.mock('../src/services/userService', () => ({
  userService: {
    checkUserExists: jest.fn(),
    syncFirebaseUser: jest.fn(),
    loginVerifyOtp: jest.fn(),
    loginSendOtp: jest.fn(),
  },
}));

describe('Google / Gmail Authentication Database Registration Check', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects login and signs out if user email is NOT found in database', async () => {
    (signInWithGoogle as jest.Mock).mockResolvedValue({
      status: 'success',
      idToken: 'mock-google-id-token',
    });

    (signInWithGoogleIdToken as jest.Mock).mockResolvedValue({
      user: {
        email: 'unregistered.user@gmail.com',
        displayName: 'Unregistered User',
        uid: 'google-uid-12345',
        phoneNumber: null,
      },
    });

    // Mock checkUserExists returning exists: false
    (userService.checkUserExists as jest.Mock).mockResolvedValue({
      success: true,
      exists: false,
      message: 'No existing user found.',
    });

    const onLoginSuccess = jest.fn();
    const onAccountStatus = jest.fn();

    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <SignInScreen
          onBack={jest.fn()}
          onLoginSuccess={onLoginSuccess}
          onAccountStatus={onAccountStatus}
        />
      );
    });

    const root = renderer!.root;
    // Find the Continue with Google touchable button
    const googleText = root.findAllByProps({ children: 'Continue with Google' })[0];
    let googleButton = googleText.parent;
    while (googleButton && !googleButton.props.onPress) {
      googleButton = googleButton.parent;
    }

    await ReactTestRenderer.act(async () => {
      await googleButton!.props.onPress();
    });

    // 1. checkUserExists was called with the gmail address
    expect(userService.checkUserExists).toHaveBeenCalledWith({
      email: 'unregistered.user@gmail.com',
    });

    // 2. User is signed out of Firebase immediately
    expect(signOutUser).toHaveBeenCalled();

    // 3. User is NOT logged in
    expect(onLoginSuccess).not.toHaveBeenCalled();
    expect(onAccountStatus).not.toHaveBeenCalled();

    // 4. syncFirebaseUser was NOT called to create an account
    expect(userService.syncFirebaseUser).not.toHaveBeenCalled();
  });

  it('allows login if user email IS registered in database', async () => {
    (signInWithGoogle as jest.Mock).mockResolvedValue({
      status: 'success',
      idToken: 'mock-google-id-token',
    });

    (signInWithGoogleIdToken as jest.Mock).mockResolvedValue({
      user: {
        email: 'registered.partner@gmail.com',
        displayName: 'Registered Partner',
        uid: 'google-uid-67890',
        phoneNumber: '9876543210',
      },
    });

    // Mock checkUserExists returning exists: true
    (userService.checkUserExists as jest.Mock).mockResolvedValue({
      success: true,
      exists: true,
      message: 'User found',
    });

    (userService.syncFirebaseUser as jest.Mock).mockResolvedValue({
      status: 'Active',
      data: {
        _id: 'db-user-id-123',
        fullName: 'Registered Partner',
        email: 'registered.partner@gmail.com',
        phone: '9876543210',
        status: 'Active',
      },
    });

    const onLoginSuccess = jest.fn();
    const onAccountStatus = jest.fn();

    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <SignInScreen
          onBack={jest.fn()}
          onLoginSuccess={onLoginSuccess}
          onAccountStatus={onAccountStatus}
        />
      );
    });

    const root = renderer!.root;
    const googleText = root.findAllByProps({ children: 'Continue with Google' })[0];
    let googleButton = googleText.parent;
    while (googleButton && !googleButton.props.onPress) {
      googleButton = googleButton.parent;
    }

    await ReactTestRenderer.act(async () => {
      await googleButton!.props.onPress();
    });

    // 1. checkUserExists was called with the gmail address
    expect(userService.checkUserExists).toHaveBeenCalledWith({
      email: 'registered.partner@gmail.com',
    });

    // 2. syncFirebaseUser was called to retrieve registered partner profile
    expect(userService.syncFirebaseUser).toHaveBeenCalled();

    // 3. onLoginSuccess was called with active user data
    expect(onLoginSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'registered.partner@gmail.com',
        displayName: 'Registered Partner',
      })
    );

    // 4. signOutUser was NOT called
    expect(signOutUser).not.toHaveBeenCalled();
  });

  it('shows friendly not onboarded error and signup CTA when mobile number is not found', async () => {
    (userService.loginSendOtp as jest.Mock).mockRejectedValue({
      status: 404,
      message: 'User account not found',
    });

    const onGoToRegister = jest.fn();

    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <SignInScreen
          onBack={jest.fn()}
          onGoToRegister={onGoToRegister}
        />
      );
    });

    const root = renderer!.root;
    // Enter mobile number
    const textInput = root.findByProps({ placeholder: '10-digit mobile number' });
    ReactTestRenderer.act(() => {
      textInput.props.onChangeText('9999988888');
    });

    // Press Send OTP
    const sendOtpText = root.findAllByProps({ children: 'Send OTP' })[0];
    let sendOtpBtn = sendOtpText.parent;
    while (sendOtpBtn && !sendOtpBtn.props.onPress) {
      sendOtpBtn = sendOtpBtn.parent;
    }

    await ReactTestRenderer.act(async () => {
      await sendOtpBtn!.props.onPress();
    });

    // Check that friendly error is rendered
    const textNodes = root.findAllByType('Text' as any);
    const renderedTexts = textNodes.map((n: any) => n.props.children);

    expect(
      renderedTexts.some(
        (t: any) =>
          typeof t === 'string' &&
          t.includes("Ohh! Account not found. Looks like you're not onboarded yet.")
      )
    ).toBe(true);

    // Check that the signup CTA button is rendered
    expect(
      renderedTexts.some(
        (t: any) =>
          typeof t === 'string' && t.includes('Register / Onboard as Partner')
      )
    ).toBe(true);
  });
});

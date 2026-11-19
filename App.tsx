/**
 * Kweecko Agent App
 * Native app for agents to receive and manage tasks.
 *
 * @format
 */

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, LogBox, StatusBar, StyleSheet, View } from 'react-native';

LogBox.ignoreAllLogs();
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AccountStatusScreen, type AccountStatusData } from './src/screens/AccountStatusScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { SignInScreen } from './src/screens/SignInScreen';
import { WelcomeScreen } from './src/screens/WelcomeScreen';
import { configureGoogleSignIn } from './src/services/googleAuth';
import { signOutUser, subscribeToAuthState, type User } from './src/services/firebaseAuth';
import { sessionService } from './src/services/sessionService';
import { userService } from './src/services/userService';
import { colors } from './src/theme/colors';

type AuthScreen = 'welcome' | 'signin' | 'register';

function App() {
  const [authScreen, setAuthScreen] = useState<AuthScreen>('welcome');
  const [user, setUser] = useState<User | null>(null);
  const [accountStatus, setAccountStatus] = useState<AccountStatusData | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const saveAndSetUser = (nextUser: User | null) => {
    setUser(nextUser);
    sessionService.saveUser(nextUser);
  };

  const saveAndSetAccountStatus = (
    nextStatus:
      | AccountStatusData
      | null
      | ((prev: AccountStatusData | null) => AccountStatusData | null)
  ) => {
    setAccountStatus(prev => {
      const resolved =
        typeof nextStatus === 'function' ? nextStatus(prev) : nextStatus;
      sessionService.saveAccountStatus(resolved);
      return resolved;
    });
  };

  useEffect(() => {
    configureGoogleSignIn();

    let isMounted = true;
    // 1. Restore persisted partner session from AsyncStorage (survives app kill / recent swipe)
    (async () => {
      try {
        const stored = await sessionService.loadSession();
        if (isMounted) {
          if (stored.user) {
            setUser(stored.user);
          }
          if (stored.accountStatus) {
            setAccountStatus(stored.accountStatus);
          }
        }
      } catch (err) {
        console.warn('[App] Session load notice:', err);
      } finally {
        if (isMounted) {
          setCheckingAuth(false);
        }
      }
    })();

    // 2. Listen to Firebase auth changes (for Google Sign In)
    const unsubscribe = subscribeToAuthState(async nextUser => {
      if (!nextUser) {
        // If there is an active local/OTP partner session saved, do not wipe it
        const stored = await sessionService.loadSession();
        if (!stored.user && !stored.accountStatus && isMounted) {
          setUser(null);
          setAccountStatus(null);
          setCheckingAuth(false);
        }
        return;
      }

      saveAndSetUser(nextUser);
      try {
        const profileRes = await userService.fetchPartnerProfile({
          uid: nextUser.uid,
          email: nextUser.email,
          phone: nextUser.phoneNumber,
        });

        const rawStatus = (profileRes?.status || profileRes?.data?.status || 'Active').trim();
        const isBlocked = profileRes?.isBlocked || rawStatus.toLowerCase() === 'blocked';
        const isPending = profileRes?.isPending || rawStatus.toLowerCase() === 'pending';

        if (isBlocked || isPending || rawStatus !== 'Active') {
          saveAndSetAccountStatus({
            status: isBlocked ? 'Blocked' : 'Pending',
            reason:
              profileRes?.reason ||
              profileRes?.data?.reason ||
              profileRes?.message ||
              (isBlocked
                ? 'Account suspended by administration. Policy compliance violation or committee review required.'
                : 'Your uploaded documents (Aadhaar / KYC) are pending verification and approval by the society administrator.'),
            pendingReason: profileRes?.data?.pendingReason,
            blockReason: profileRes?.data?.blockReason,
            userName:
              profileRes?.data?.userName ||
              profileRes?.data?.fullName ||
              nextUser.displayName ||
              '',
            fullName: profileRes?.data?.fullName || nextUser.displayName || '',
            phone: profileRes?.data?.phone || nextUser.phoneNumber || '',
            email: profileRes?.data?.email || nextUser.email || '',
            userId: profileRes?.data?._id || profileRes?.data?.id || nextUser.uid,
            token:
              (profileRes as any)?.token ||
              (profileRes?.data as any)?.token ||
              nextUser.uid,
            applicationId: profileRes?.data?.applicationId,
            checklist:
              (profileRes?.data as any)?.statusDetails?.checklist ||
              (profileRes as any)?.checklist,
          });
        } else {
          saveAndSetAccountStatus(null);
        }
      } catch (err: any) {
        console.warn('[App] Backend partner sync notice:', err?.message);
        if (
          err?.isBlocked ||
          err?.status === 'Blocked' ||
          err?.isPending ||
          err?.status === 'Pending'
        ) {
          saveAndSetAccountStatus({
            status:
              err.isBlocked || err.status === 'Blocked' ? 'Blocked' : 'Pending',
            reason: err.reason || err.message,
            userId: nextUser.uid,
            token: nextUser.uid,
          });
        }
      } finally {
        if (isMounted) {
          setCheckingAuth(false);
        }
      }
    });
    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const handleSignOut = async () => {
    try {
      await signOutUser();
    } catch (e) {
      console.warn('[App] SignOut notice:', e);
    }
    await sessionService.clearSession();
    setUser(null);
    setAccountStatus(null);
    setAuthScreen('welcome');
  };

  const handleRefreshStatus = async () => {
    const phone = accountStatus?.phone || user?.phoneNumber || '';
    const email = accountStatus?.email || user?.email || '';
    const uid = accountStatus?.userId || accountStatus?.token || user?.uid || '';
    if (!phone && !email && !uid) {
      return null;
    }
    try {
      const profileRes = await userService.fetchPartnerProfile({
        uid,
        email,
        phone,
      });

      const rawStatus = (profileRes?.status || profileRes?.data?.status || 'Active').trim();
      const isBlocked = profileRes?.isBlocked || rawStatus.toLowerCase() === 'blocked';
      const isPending = profileRes?.isPending || rawStatus.toLowerCase() === 'pending';

      if (!isBlocked && !isPending && rawStatus.toLowerCase() === 'active') {
        const activeUser: any = {
          uid: profileRes?.data?._id || profileRes?.data?.id || uid || `partner_${phone}`,
          displayName:
            profileRes?.data?.fullName ||
            profileRes?.data?.userName ||
            accountStatus?.fullName ||
            accountStatus?.userName ||
            'Partner',
          phoneNumber: profileRes?.data?.phone || phone,
          email: profileRes?.data?.email || email,
        };
        saveAndSetUser(activeUser);
        saveAndSetAccountStatus(null);
        return { status: 'Active' };
      } else {
        const nextState = {
          status: (isBlocked ? 'Blocked' : 'Pending') as 'Blocked' | 'Pending',
          reason:
            (profileRes as any)?.pendingReason ||
            profileRes?.data?.pendingReason ||
            profileRes?.reason ||
            profileRes?.data?.reason ||
            profileRes?.message ||
            accountStatus?.reason ||
            '',
          pendingReason:
            (profileRes as any)?.pendingReason ||
            profileRes?.data?.pendingReason ||
            accountStatus?.pendingReason,
          blockReason: profileRes?.data?.blockReason || accountStatus?.blockReason,
          userName:
            profileRes?.data?.userName ||
            profileRes?.data?.fullName ||
            accountStatus?.userName,
          fullName:
            profileRes?.data?.fullName ||
            accountStatus?.fullName,
          phone: profileRes?.data?.phone || accountStatus?.phone || phone,
          email: profileRes?.data?.email || accountStatus?.email || email,
          userId: profileRes?.data?._id || profileRes?.data?.id || accountStatus?.userId,
          token: (profileRes as any)?.token || accountStatus?.token || uid,
          applicationId: profileRes?.data?.applicationId || accountStatus?.applicationId,
          checklist:
            (profileRes?.data as any)?.statusDetails?.checklist ||
            (profileRes as any)?.checklist ||
            accountStatus?.checklist,
        };
        saveAndSetAccountStatus(nextState);
        return nextState;
      }
    } catch (err: any) {
      console.warn('[App] Refresh status notice:', err);
      if (
        err?.isBlocked ||
        err?.status === 'Blocked' ||
        err?.isPending ||
        err?.status === 'Pending'
      ) {
        const nextState = {
          status: (err.isBlocked || err.status === 'Blocked' ? 'Blocked' : 'Pending') as 'Blocked' | 'Pending',
          reason: err.reason || err.message || accountStatus?.reason || '',
          pendingReason: err.data?.pendingReason || accountStatus?.pendingReason,
          checklist:
            err.data?.statusDetails?.checklist ||
            err.data?.checklist ||
            err.checklist ||
            accountStatus?.checklist,
          phone: accountStatus?.phone || phone,
          userId: accountStatus?.userId || uid,
        };
        saveAndSetAccountStatus(prev => ({ ...(prev || {}), ...nextState }));
        return nextState;
      }
      return null;
    }
  };

  const handleDocumentsSubmitted = (updatedData: any) => {
    const rawStatus = (
      updatedData?.status ||
      updatedData?.data?.status ||
      updatedData?.user?.status ||
      ''
    ).trim();

    if (rawStatus.toLowerCase() === 'active') {
      const activeUser: any = {
        uid:
          updatedData?.userId ||
          updatedData?.data?.id ||
          updatedData?.data?._id ||
          accountStatus?.userId ||
          `partner_${accountStatus?.phone || 'active'}`,
        displayName:
          updatedData?.fullName ||
          updatedData?.userName ||
          updatedData?.data?.fullName ||
          accountStatus?.fullName ||
          accountStatus?.userName ||
          'Partner',
        phoneNumber: updatedData?.phone || updatedData?.data?.phone || accountStatus?.phone || '',
        email: updatedData?.email || updatedData?.data?.email || accountStatus?.email || '',
      };
      saveAndSetUser(activeUser);
      saveAndSetAccountStatus(null);
      return;
    }

    saveAndSetAccountStatus(prev => ({
      ...(prev || {}),
      status: (rawStatus as any) || 'Pending',
      reason:
        updatedData?.pendingReason ||
        updatedData?.data?.pendingReason ||
        updatedData?.message ||
        'All 3 mandatory verification documents submitted. Pending final administrator KYC verification.',
      pendingReason: updatedData?.pendingReason || updatedData?.data?.pendingReason,
      checklist: updatedData?.checklist || prev?.checklist,
    }));
  };

  let content;
  if (checkingAuth) {
    content = (
      <View style={styles.loadingScreen}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  } else if (accountStatus && accountStatus.status !== 'Active') {
    content = (
      <AccountStatusScreen
        accountData={accountStatus}
        onSignOut={handleSignOut}
        onRefreshStatus={handleRefreshStatus}
        onDocumentsSubmitted={handleDocumentsSubmitted}
      />
    );
  } else if (user) {
    content = <HomeScreen user={user} onSignOut={handleSignOut} />;
  } else if (authScreen === 'signin' || authScreen === 'register') {
    content = (
      <SignInScreen
        onBack={() => setAuthScreen('welcome')}
        onAccountStatus={saveAndSetAccountStatus}
        onLoginSuccess={activeUser => {
          saveAndSetUser(activeUser);
          saveAndSetAccountStatus(null);
        }}
      />
    );
  } else {
    content = (
      <WelcomeScreen
        onSignIn={() => setAuthScreen('signin')}
        onRegister={() => setAuthScreen('register')}
      />
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar
        barStyle={
          accountStatus && accountStatus.status !== 'Active'
            ? 'light-content'
            : 'dark-content'
        }
      />
      <View style={styles.container}>{content}</View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingScreen: {
    flex: 1,
    backgroundColor: colors.backgroundPeach,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default App;

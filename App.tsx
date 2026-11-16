/**
 * Kweecko Agent App
 * Native app for agents to receive and manage tasks.
 *
 * @format
 */

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { HomeScreen } from './src/screens/HomeScreen';
import { SignInScreen } from './src/screens/SignInScreen';
import { WelcomeScreen } from './src/screens/WelcomeScreen';
import { configureGoogleSignIn } from './src/services/googleAuth';
import { subscribeToAuthState, type User } from './src/services/firebaseAuth';
import { userService } from './src/services/userService';
import { colors } from './src/theme/colors';

type AuthScreen = 'welcome' | 'signin' | 'register';

function App() {
  const [authScreen, setAuthScreen] = useState<AuthScreen>('welcome');
  const [user, setUser] = useState<User | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    configureGoogleSignIn();
    const unsubscribe = subscribeToAuthState(nextUser => {
      setUser(nextUser);
      setCheckingAuth(false);
      if (nextUser) {
        userService
          .fetchPartnerProfile({
            uid: nextUser.uid,
            email: nextUser.email,
            phone: nextUser.phoneNumber,
          })
          .catch(err => {
            console.warn('[App] Backend partner sync notice:', err?.message);
          });
      }
    });
    return unsubscribe;
  }, []);

  let content;
  if (checkingAuth) {
    content = (
      <View style={styles.loadingScreen}>
        <ActivityIndicator color={colors.coral} size="large" />
      </View>
    );
  } else if (user) {
    content = <HomeScreen user={user} />;
  } else if (authScreen === 'signin' || authScreen === 'register') {
    content = (
      <SignInScreen
        onBack={() => setAuthScreen('welcome')}
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
      <StatusBar barStyle="dark-content" />
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
